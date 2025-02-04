// src/firebase/waiverProcessor.ts

import { doc, updateDoc, collection, getDocs } from "firebase/firestore";
import { db } from "./config";
import type { League, PendingBid, Transaction, Team } from "../types";
import { getTotalRosterLimit } from "../utils/rosterUtils";

interface ProcessedBid {
  bid: PendingBid;
  teamId: string;
  success: boolean;
  reason?: string;
}

interface WaiverResult {
  processedBids: ProcessedBid[];
  transactions: Transaction[];
}

const generateTransactionId = () => `transaction_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

const getTeamPoints = (team: Team): number => {
  let totalPoints = 0;
  for (const playerId of team.roster) {
    const cupScores = (team.cupLineups?.cup1?.playerScores?.[playerId] || 0) +
      (team.cupLineups?.cup2?.playerScores?.[playerId] || 0) +
      (team.cupLineups?.cup3?.playerScores?.[playerId] || 0);
    totalPoints += cupScores;
  }
  return totalPoints;
};

export const processWaiverClaims = async (league: League): Promise<WaiverResult> => {
  // Get players collection for names
  const playersRef = collection(db, "players");
  const playersSnapshot = await getDocs(playersRef);
  const players = Object.fromEntries(
    playersSnapshot.docs.map(doc => [doc.id, doc.data()])
  );

  // Get all teams with pending bids
  const teamsWithBids = Object.values(league.teams).filter(team =>
    team.pendingBids && team.pendingBids.length > 0
  );

  // Sort all bids across all teams by:
  // 1. Bid amount (highest to lowest)
  // 2. Team points (lower points get priority)
  // 3. Processing order (earlier bids get priority)
  const allBids = teamsWithBids.flatMap(team =>
    team.pendingBids.map(bid => ({
      bid,
      teamId: team.teamId,
      teamPoints: getTeamPoints(team)
    }))
  ).sort((a, b) => {
    // First sort by bid amount (highest first)
    const amountDiff = b.bid.amount - a.bid.amount;
    if (amountDiff !== 0) {
      return amountDiff;
    }

    // If bids are from the same team, use processing order
    if (a.teamId === b.teamId) {
      return a.bid.processingOrder - b.bid.processingOrder;
    }

    // If bid amounts are equal and from different teams, sort by team points
    return a.teamPoints - b.teamPoints;
  });

  // Track which players have been claimed and FAAB spent
  const claimedPlayers = new Set<string>();
  const teamFaabSpent: Record<string, number> = {};

  // Process bids in order
  const processedBids: ProcessedBid[] = [];
  const transactions: Transaction[] = [];

  for (const { bid, teamId } of allBids) {
    const team = league.teams[teamId];
    let success = false;
    let reason = "";

    // Get remaining FAAB after previous successful bids
    const previousFaabSpent = teamFaabSpent[teamId] || 0;
    const remainingFaab = team.faabBudget - previousFaabSpent;

    // Skip if player already claimed
    if (claimedPlayers.has(bid.playerId)) {
      reason = "Player already claimed";
    }
    // Verify remaining FAAB
    else if (bid.amount > remainingFaab) {
      reason = "Insufficient remaining FAAB";
    }
    // Process the claim
    else {
      // Calculate roster size after potential move
      const currentRoster = new Set(team.roster);
      let rosterSize = currentRoster.size;

      // Adjust for previous successful claims in this processing
      const previousClaims = processedBids
        .filter(pb => pb.teamId === teamId && pb.success);

      for (const claim of previousClaims) {
        if (!currentRoster.has(claim.bid.playerId)) rosterSize++;
        if (claim.bid.dropPlayerId) rosterSize--;
      }

      // Check if this move would be valid
      if (bid.dropPlayerId) {
        // With a drop, roster size stays the same
        if (!team.roster.includes(bid.dropPlayerId)) {
          reason = "Drop player not on roster";
        } else {
          success = true;
        }
      } else {
        // Without a drop, verify roster limit
        if (rosterSize >= getTotalRosterLimit(league.settings)) {
          reason = "Roster would exceed limit";
        } else {
          success = true;
        }
      }

      if (success) {
        claimedPlayers.add(bid.playerId);
        teamFaabSpent[teamId] = (teamFaabSpent[teamId] || 0) + bid.amount;

        // Create transaction record
        const transaction: Transaction = {
          id: generateTransactionId(),
          type: 'waiver',
          timestamp: new Date().toISOString(),
          teamIds: [teamId],
          adds: { [teamId]: [bid.playerId] },
          drops: bid.dropPlayerId ? { [teamId]: [bid.dropPlayerId] } : {},
          metadata: {
            waiver: {
              bidAmount: bid.amount,
              success: true
            },
            faabSpent: { [teamId]: bid.amount },
            playerNames: {
              [bid.playerId]: {
                name: players[bid.playerId]?.name || "Unknown Player",
                region: players[bid.playerId]?.region || "Unknown Region"
              },
              ...(bid.dropPlayerId ? {
                [bid.dropPlayerId]: {
                  name: players[bid.dropPlayerId]?.name || "Unknown Player",
                  region: players[bid.dropPlayerId]?.region || "Unknown Region"
                }
              } : {})
            }
          }
        };

        transactions.push(transaction);
      } else {
        // Create failed transaction record
        const transaction: Transaction = {
          id: generateTransactionId(),
          type: 'waiver',
          timestamp: new Date().toISOString(),
          teamIds: [teamId],
          adds: {},
          drops: {},
          metadata: {
            waiver: {
              bidAmount: bid.amount,
              success: false,
              failureReason: reason
            },
            playerNames: {
              [bid.playerId]: {
                name: players[bid.playerId]?.name || "Unknown Player",
                region: players[bid.playerId]?.region || "Unknown Region"
              }
            }
          }
        };

        transactions.push(transaction);
      }
    }

    processedBids.push({
      bid: {
        ...bid,
        processed: true,
        status: success ? 'won' : 'lost'
      },
      teamId,
      success,
      reason: success ? undefined : reason
    });
  }

  // Update all teams with processed bids
  await Promise.all(teamsWithBids.map(async team => {
    const teamProcessedBids = processedBids.filter(pb => pb.teamId === team.teamId);
    const successfulBids = teamProcessedBids.filter(pb => pb.success);

    // Calculate new roster
    let newRoster = [...team.roster];
    let newFaabBudget = team.faabBudget;

    for (const { bid } of successfulBids) {
      // Remove dropped player if any
      if (bid.dropPlayerId) {
        newRoster = newRoster.filter(id => id !== bid.dropPlayerId);
      }
      // Add claimed player
      newRoster.push(bid.playerId);
      // Deduct FAAB
      newFaabBudget -= bid.amount;
    }

    // Update team in database
    await updateDoc(doc(db, "leagues", league.id.toString(), "teams", team.teamId), {
      roster: newRoster,
      faabBudget: newFaabBudget,
      pendingBids: [] // Clear all pending bids
    });
  }));

  // Add transactions to league
  if (transactions.length > 0) {
    await updateDoc(doc(db, "leagues", league.id.toString()), {
      transactions: [...(league.transactions || []), ...transactions]
    });
  }

  return { processedBids, transactions };
};
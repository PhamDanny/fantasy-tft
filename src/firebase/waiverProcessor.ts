// src/firebase/waiverProcessor.ts

import { doc, updateDoc } from "firebase/firestore";
import { db } from "./config";
import type { League, PendingBid, Transaction } from "../types";
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

export const processWaiverClaims = async (league: League): Promise<WaiverResult> => {
  // Get all teams with pending bids
  const teamsWithBids = Object.values(league.teams).filter(team => 
    team.pendingBids && team.pendingBids.length > 0
  );

  // Sort all bids across all teams by amount (highest to lowest)
  const allBids = teamsWithBids.flatMap(team => 
    team.pendingBids.map(bid => ({
      bid,
      teamId: team.teamId
    }))
  ).sort((a, b) => b.bid.amount - a.bid.amount);

  const processedBids: ProcessedBid[] = [];
  const transactions: Transaction[] = [];
  
  // Track which players have been claimed
  const claimedPlayers = new Set<string>();
  
  // Process each bid in order
  for (const { bid, teamId } of allBids) {
    const team = league.teams[teamId];
    let success = false;
    let reason = "";

    // Skip if player already claimed
    if (claimedPlayers.has(bid.playerId)) {
      reason = "Player already claimed";
    }
    // Verify FAAB budget
    else if (bid.amount > team.faabBudget) {
      reason = "Insufficient FAAB budget";
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
        
        // Create transaction record
        const transaction: Transaction = {
          id: generateTransactionId(),
          type: 'waiver',
          timestamp: new Date().toISOString(),
          teamIds: [teamId],
          adds: { [teamId]: [bid.playerId] },
          drops: bid.dropPlayerId ? { [teamId]: [bid.dropPlayerId] } : {},
          metadata: {
            faabSpent: { [teamId]: bid.amount }
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
import { db } from '../firebase/config';
import { doc, runTransaction, collection, getDocs } from 'firebase/firestore';
import type { League, Team, Transaction, Player, TeamLineup, LeagueSettings } from '../types/index';
import { getTotalRosterLimit } from './rosterUtils';

// Add these helper functions from StandingsTab
const getEmptyLineup = (settings: LeagueSettings): TeamLineup => ({
  captains: Array(settings.captainSlots).fill(null),
  naSlots: Array(settings.naSlots).fill(null),
  brLatamSlots: Array(settings.brLatamSlots).fill(null),
  flexSlots: Array(settings.flexSlots).fill(null),
  bench: [],
});

const getTeamLineup = (team: Team, cupNumber: number, settings: LeagueSettings): TeamLineup => {
  const cupKey = `cup${cupNumber}` as keyof typeof team.cupLineups;
  return team.cupLineups[cupKey] || getEmptyLineup(settings);
};

const getPlayerCupScore = (player: Player, cupNumber: number, isCaptain: boolean): number => {
  const cupKey = `cup${cupNumber}` as keyof typeof player.scores;
  const baseScore = player.scores[cupKey] ?? 0;
  return isCaptain ? baseScore * 1.5 : baseScore;
};

const calculateTeamCupScore = (team: Team, cupNumber: number, players: Record<string, Player>, settings: LeagueSettings): number => {
  const lineup = getTeamLineup(team, cupNumber, settings);
  let totalScore = 0;

  // Calculate captain scores
  lineup.captains.forEach((playerId) => {
    if (playerId && players[playerId]) {
      totalScore += getPlayerCupScore(players[playerId], cupNumber, true);
    }
  });

  // Calculate NA slot scores
  lineup.naSlots.forEach((playerId) => {
    if (playerId && players[playerId]) {
      totalScore += getPlayerCupScore(players[playerId], cupNumber, false);
    }
  });

  // Calculate BR/LATAM slot scores
  lineup.brLatamSlots.forEach((playerId) => {
    if (playerId && players[playerId]) {
      totalScore += getPlayerCupScore(players[playerId], cupNumber, false);
    }
  });

  // Calculate flex slot scores
  lineup.flexSlots.forEach((playerId) => {
    if (playerId && players[playerId]) {
      totalScore += getPlayerCupScore(players[playerId], cupNumber, false);
    }
  });

  return totalScore;
};

const calculateTeamTotal = (team: Team, players: Record<string, Player>, settings: LeagueSettings): number => {
  return [1, 2, 3].reduce(
    (total, cupNumber) => total + calculateTeamCupScore(team, cupNumber, players, settings),
    0
  );
};

export const processWaivers = async (leagueId: string) => {
  return runTransaction(db, async (transaction) => {
    // Get fresh league data
    const leagueRef = doc(db, "leagues", leagueId);
    const leagueDoc = await transaction.get(leagueRef);
    const freshLeague = leagueDoc.data() as League;

    // Get all teams with pending bids
    const teamsSnapshot = await getDocs(collection(db, "leagues", leagueId, "teams"));
    const teams: Record<string, Team> = {};
    teamsSnapshot.docs.forEach(doc => {
      const team = doc.data() as Team;
      if (team.pendingBids?.length > 0) {
        teams[doc.id] = team;
      }
    });

    // Get all relevant players
    const playerIds = new Set<string>();
    Object.values(teams).forEach(team => {
      team.pendingBids?.forEach(bid => {
        playerIds.add(bid.playerId);
        if (bid.dropPlayerId) playerIds.add(bid.dropPlayerId);
      });
    });

    const players: Record<string, Player> = {};
    const playersSnapshot = await Promise.all(
      Array.from(playerIds).map(id =>
        transaction.get(doc(db, "players", id))
      )
    );
    playersSnapshot.forEach(doc => {
      if (doc.exists()) {
        players[doc.id] = doc.data() as Player;
      }
    });

    // Gather all bids from all teams into one list
    const allBids = Object.entries(teams).flatMap(([teamId, team]) =>
      (team.pendingBids || []).map(bid => ({
        ...bid,
        teamId,
        teamScore: calculateTeamTotal(team, players, freshLeague.settings)
      }))
    );

    // Sort all bids by amount (highest first), then by team score (lowest first)
    const sortedBids = allBids.sort((a, b) => {
      if (b.amount !== a.amount) {
        return b.amount - a.amount;
      }
      return a.teamScore - b.teamScore;
    });

    // Track FAAB spent per team during this processing
    const teamFaabSpent: Record<string, number> = {};
    const processedPlayers = new Set<string>();
    const transactions: Transaction[] = [];

    // Track roster changes during processing
    const updatedRosters: Record<string, string[]> = {};

    // Process bids in sorted order
    for (const bid of sortedBids) {
      const team = teams[bid.teamId];
      const remainingFaab = (team.faabBudget || 0) - (teamFaabSpent[bid.teamId] || 0);

      // Get current roster state including any changes from previous successful bids
      const currentRoster = updatedRosters[bid.teamId] || [...team.roster];

      // Create transaction for failed bid if player already claimed
      if (processedPlayers.has(bid.playerId)) {
        transactions.push({
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          type: 'waiver',
          teamIds: [bid.teamId],
          adds: {},
          drops: {},
          metadata: {
            type: 'waiver',
            waiver: {
              bidAmount: bid.amount,
              success: false,
              failureReason: 'Player already claimed'
            },
            playerNames: {
              [bid.playerId]: {
                name: players[bid.playerId]?.name || 'Unknown Player',
                region: players[bid.playerId]?.region || 'Unknown Region'
              }
            }
          }
        });
        continue;
      }

      // Create transaction for failed bid if insufficient FAAB
      if (bid.amount > remainingFaab) {
        transactions.push({
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          type: 'waiver',
          teamIds: [bid.teamId],
          adds: {},
          drops: {},
          metadata: {
            type: 'waiver',
            waiver: {
              bidAmount: bid.amount,
              success: false,
              failureReason: 'Insufficient FAAB'
            },
            playerNames: {
              [bid.playerId]: {
                name: players[bid.playerId]?.name || 'Unknown Player',
                region: players[bid.playerId]?.region || 'Unknown Region'
              }
            }
          }
        });
        continue;
      }

      // Check roster limit considering previous successful claims
      const rosterLimit = getTotalRosterLimit(freshLeague.settings);
      const newRosterSize = bid.dropPlayerId ?
        currentRoster.length :
        currentRoster.length + 1;

      if (newRosterSize > rosterLimit) {
        transactions.push({
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          type: 'waiver',
          teamIds: [bid.teamId],
          adds: {},
          drops: {},
          metadata: {
            type: 'waiver',
            waiver: {
              bidAmount: bid.amount,
              success: false,
              failureReason: 'Roster full'
            },
            playerNames: {
              [bid.playerId]: {
                name: players[bid.playerId]?.name || 'Unknown Player',
                region: players[bid.playerId]?.region || 'Unknown Region'
              }
            }
          }
        });
        continue;
      }

      // Process successful claim
      const newRoster = [...currentRoster];
      if (bid.dropPlayerId) {
        const dropIndex = newRoster.indexOf(bid.dropPlayerId);
        if (dropIndex !== -1) {
          newRoster.splice(dropIndex, 1);
        }
      }
      newRoster.push(bid.playerId);

      // Update team with new roster and reduced FAAB
      const teamRef = doc(db, "leagues", leagueId, "teams", bid.teamId);
      transaction.update(teamRef, {
        roster: newRoster,
        faabBudget: remainingFaab - bid.amount,
        pendingBids: []
      });

      // Track FAAB spent, processed players, and roster changes
      teamFaabSpent[bid.teamId] = (teamFaabSpent[bid.teamId] || 0) + bid.amount;
      processedPlayers.add(bid.playerId);
      updatedRosters[bid.teamId] = newRoster;

      // Record successful transaction
      const losingBids = sortedBids
        .filter(b => b.playerId === bid.playerId && b.teamId !== bid.teamId)
        .map(b => ({
          teamId: b.teamId,
          teamName: teams[b.teamId]?.teamName || 'Unknown Team',
          bidAmount: b.amount
        }));

      transactions.push({
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        type: 'waiver',
        teamIds: [bid.teamId],
        adds: { [bid.teamId]: [bid.playerId] },
        drops: bid.dropPlayerId ? { [bid.teamId]: [bid.dropPlayerId] } : {},
        metadata: {
          type: 'waiver',
          waiver: {
            bidAmount: bid.amount,
            success: true,
            losingBids
          },
          playerNames: {
            [bid.playerId]: {
              name: players[bid.playerId]?.name || 'Unknown Player',
              region: players[bid.playerId]?.region || 'Unknown Region'
            },
            ...(bid.dropPlayerId ? {
              [bid.dropPlayerId]: {
                name: players[bid.dropPlayerId]?.name || 'Unknown Player',
                region: players[bid.dropPlayerId]?.region || 'Unknown Region'
              }
            } : {})
          }
        }
      });
    }

    // Clear pending bids for all teams
    for (const [teamId, team] of Object.entries(teams)) {
      if (team.pendingBids?.length > 0) {
        const teamRef = doc(db, "leagues", leagueId, "teams", teamId);
        transaction.update(teamRef, {
          pendingBids: []
        });
      }
    }

    // Update league transactions
    if (transactions.length > 0) {
      const newTransactions = [...(freshLeague.transactions || []), ...transactions];
      transaction.update(leagueRef, {
        transactions: newTransactions
      });
    }
  });
}; 
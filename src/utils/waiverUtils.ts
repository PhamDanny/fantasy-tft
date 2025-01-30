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

    const transactions: Transaction[] = [];
    const processedPlayers = new Set<string>();

    // Process bids in sorted order
    for (const bid of sortedBids) {
      const team = teams[bid.teamId];
      if (processedPlayers.has(bid.playerId)) {
        continue;
      }

      if (bid.amount > (team.faabBudget || 0)) {
        continue;
      }

      const rosterLimit = getTotalRosterLimit(freshLeague.settings);
      if (!bid.dropPlayerId && team.roster.length >= rosterLimit) {
        continue;
      }

      // Process successful claim
      const newRoster = [...team.roster];
      if (bid.dropPlayerId) {
        const dropIndex = newRoster.indexOf(bid.dropPlayerId);
        if (dropIndex !== -1) {
          newRoster.splice(dropIndex, 1);
        }
      }
      newRoster.push(bid.playerId);

      // Update team with new roster, reduced FAAB, and clear bids
      const teamRef = doc(db, "leagues", leagueId, "teams", bid.teamId);
      transaction.update(teamRef, {
        roster: newRoster,
        faabBudget: (team.faabBudget || 0) - bid.amount,
        pendingBids: []
      });

      // Mark player as processed
      processedPlayers.add(bid.playerId);

      // Record transaction with losing bids
      const losingBids = Object.entries(teams)
        .filter(([id, t]) => {
          if (!t || !t.pendingBids) return false;
          return id !== bid.teamId && t.pendingBids.some(b => b.playerId === bid.playerId);
        })
        .flatMap(([id, t]) => {
          if (!t || !t.pendingBids) return [];
          return t.pendingBids
            .filter(b => b.playerId === bid.playerId)
            .map(b => ({
              teamId: id,
              teamName: t.teamName,
              bidAmount: b.amount,
              failureReason: b.amount > (t.faabBudget || 0) ? 'Insufficient FAAB' :
                (!b.dropPlayerId && t.roster.length >= rosterLimit) ? 'Roster full' :
                  undefined
            }));
        });

      // Only create transaction if there are actual changes
      if (bid.playerId || bid.dropPlayerId) {
        const adds: Record<string, string[]> = bid.playerId ? { [bid.teamId]: [bid.playerId] } : {};
        const drops: Record<string, string[]> = bid.dropPlayerId ? { [bid.teamId]: [bid.dropPlayerId] } : {};

        transactions.push({
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          type: 'waiver',
          teamIds: [bid.teamId],
          adds,
          drops,
          metadata: {
            type: 'waiver',
            waiver: {
              bidAmount: bid.amount,
              losingBids: losingBids.map(b => ({
                teamId: b.teamId,
                teamName: b.teamName,
                bidAmount: b.bidAmount,
                failureReason: b.failureReason
              }))
            },
            playerNames: {
              ...(bid.playerId ? {
                [bid.playerId]: {
                  name: players[bid.playerId]?.name || 'Unknown Player',
                  region: players[bid.playerId]?.region || 'Unknown Region'
                }
              } : {}),
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

    // Update league transactions if we have new ones
    if (transactions.length > 0) {
      const newTransactions = Array.isArray(freshLeague.transactions)
        ? [...freshLeague.transactions, ...transactions]
        : transactions;

      // Validate and clean transactions
      const validTransactions = newTransactions.filter(t =>
        t &&
        typeof t.id === 'string' &&
        typeof t.timestamp === 'string' &&
        typeof t.type === 'string' &&
        Array.isArray(t.teamIds) &&
        typeof t.adds === 'object' &&
        typeof t.drops === 'object' &&
        typeof t.metadata === 'object'
      );

      // Deep clone to remove any undefined values
      const cleanTransactions = validTransactions.map(t => JSON.parse(JSON.stringify(t)));

      transaction.update(leagueRef, {
        transactions: cleanTransactions
      });
    }
  });
}; 
import { doc, getDoc, collection, getDocs, updateDoc, arrayUnion } from 'firebase/firestore';
import { db } from './config';
import type { League, Team, Player } from '../types';
import { onSnapshot } from 'firebase/firestore';

export const fetchLeague = async (leagueId: number): Promise<League> => {
  const leagueDoc = await getDoc(doc(db, 'leagues', leagueId.toString()));

  if (!leagueDoc.exists()) {
    throw new Error('League not found');
  }

  const leagueData = leagueDoc.data();
  const teamsSnapshot = await getDocs(collection(db, 'leagues', leagueId.toString(), 'teams'));

  const teams: Record<string, Team> = {};
  teamsSnapshot.forEach((teamDoc) => {
    teams[teamDoc.id] = teamDoc.data() as Team;
  });

  return {
    ...leagueData,
    id: leagueId,
    name: leagueData.name,
    creationDate: leagueData.creationDate,
    season: leagueData.season,
    type: leagueData.type,
    phase: leagueData.phase,
    commissioner: leagueData.commissioner,
    settings: leagueData.settings,
    invites: leagueData.invites || {},
    transactions: leagueData.transactions || []
  } as League;
};

// Helper function to get the players collection name based on season
export function getPlayersCollectionName(season: string): string {
  // Special case for Set 13 which uses the "players" collection
  if (season.toLowerCase() === "set 13") {
    return "players";
  }

  // For Set 14 and onwards, use players_setX format
  const setMatch = season.match(/Set (\d+)/i);
  if (setMatch) {
    return `players_set${setMatch[1]}`;
  }

  // If we reach here, something is wrong with the season format
  console.error(`Invalid season format: ${season}`);
  throw new Error(`Invalid season format: ${season}`);
}

export async function fetchPlayers(season: string): Promise<Record<string, Player>> {
  try {
    // Now requiring season parameter since we need to know which collection to use
    const collectionName = getPlayersCollectionName(season);

    const playersSnapshot = await getDocs(collection(db, collectionName));

    const players: Record<string, Player> = {};
    playersSnapshot.forEach((doc) => {
      const playerData = doc.data();
      players[doc.id] = {
        id: doc.id,
        fullName: playerData.fullName || playerData.name || '',
        name: playerData.name || playerData.fullName || '',
        tag: playerData.tag || '',
        region: playerData.region || '',
        ladderRegion: playerData.ladderRegion || '',
        set: playerData.set || parseInt(season.replace('Set ', '')),
        profileLink: playerData.profileLink || '',
        prevSetQP: playerData.prevSetQP || 0,
        scores: {
          cup1: playerData.cup1 || playerData.scores?.cup1 || 0,
          cup2: playerData.cup2 || playerData.scores?.cup2 || 0,
          cup3: playerData.cup3 || playerData.scores?.cup3 || 0,
        },
        regionals: {
          qualified: playerData.Regionals || playerData.regionals?.qualified || false,
          placement: playerData.RegionalsPlacement || playerData.regionals?.placement || 0
        }
      } as Player;
    });
    return players;
  } catch (error) {
    console.error("Error fetching players:", error);
    throw error;
  }
}

export const addUserToLeague = async (userId: string, leagueId: string) => {
  await updateDoc(doc(db, 'users', userId), {
    leagues: arrayUnion(leagueId)
  });
};

export const fetchUserLeagues = async (userId: string): Promise<League[]> => {
  const userDoc = await getDoc(doc(db, 'users', userId));
  if (!userDoc.exists()) return [];

  // For regular users, only fetch their leagues
  const leagueIds = userDoc.data().leagues || [];
  const leagues: League[] = [];

  for (const leagueId of leagueIds) {
    try {
      const league = await fetchLeague(parseInt(leagueId));
      leagues.push(league);
    } catch (error) {
      console.error(`Error fetching league ${leagueId}:`, error);
    }
  }

  return leagues;
};

export const subscribeToLeague = (
  leagueId: number,
  onUpdate: (league: League) => void,
  onError: (error: Error) => void
): (() => void) => {
  // Subscribe to the main league document
  const leagueUnsubscribe = onSnapshot(
    doc(db, 'leagues', leagueId.toString()),
    async (leagueDoc) => {
      if (!leagueDoc.exists()) {
        onError(new Error('League not found'));
        return;
      }

      try {
        // Get all teams
        const teamsSnapshot = await getDocs(collection(db, 'leagues', leagueId.toString(), 'teams'));
        const teams: Record<string, Team> = {};
        teamsSnapshot.forEach((teamDoc) => {
          teams[teamDoc.id] = teamDoc.data() as Team;
        });

        const leagueData = {
          ...leagueDoc.data(),
          id: leagueId,
          name: leagueDoc.data().name,
          creationDate: leagueDoc.data().creationDate,
          season: leagueDoc.data().season,
          type: leagueDoc.data().type,
          phase: leagueDoc.data().phase,
          commissioner: leagueDoc.data().commissioner,
          settings: leagueDoc.data().settings,
          invites: leagueDoc.data().invites || {},
          transactions: leagueDoc.data().transactions || []
        } as League;

        onUpdate(leagueData);
      } catch (error) {
        onError(error as Error);
      }
    },
    (error) => onError(error)
  );

  // Subscribe to the teams subcollection
  const teamsUnsubscribe = onSnapshot(
    collection(db, 'leagues', leagueId.toString(), 'teams'),
    async (teamsSnapshot) => {
      try {
        // Get the current league data first
        const leagueDoc = await getDoc(doc(db, 'leagues', leagueId.toString()));
        if (!leagueDoc.exists()) {
          onError(new Error('League not found'));
          return;
        }

        // Update teams data
        const teams: Record<string, Team> = {};
        teamsSnapshot.forEach((teamDoc) => {
          teams[teamDoc.id] = teamDoc.data() as Team;
        });

        const leagueData = {
          ...leagueDoc.data(),
          id: leagueId,
          name: leagueDoc.data().name,
          creationDate: leagueDoc.data().creationDate,
          season: leagueDoc.data().season,
          type: leagueDoc.data().type,
          phase: leagueDoc.data().phase,
          commissioner: leagueDoc.data().commissioner,
          settings: leagueDoc.data().settings,
          invites: leagueDoc.data().invites || {},
          transactions: leagueDoc.data().transactions || []
        } as League;

        onUpdate(leagueData);
      } catch (error) {
        onError(error as Error);
      }
    },
    (error) => onError(error)
  );

  return () => {
    leagueUnsubscribe();
    teamsUnsubscribe();
  };
};

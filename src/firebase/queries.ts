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
    teams
  } as League;
};

export const fetchPlayers = async (playerIds?: string[]): Promise<Record<string, Player>> => {
  const players: Record<string, Player> = {};

  try {

    if (playerIds) {
      // Fetch specific players if IDs are provided
      await Promise.all(
        playerIds.map(async (playerId) => {
          const playerDoc = await getDoc(doc(db, 'players', playerId));
          if (playerDoc.exists()) {
            players[playerId] = { id: playerId, ...playerDoc.data() } as Player;
          }
        })
      );
    } else {
      // Fetch all players if no IDs are provided
      const playersSnapshot = await getDocs(collection(db, 'players'));

      playersSnapshot.forEach((doc) => {
        const data = doc.data();
        players[doc.id] = { id: doc.id, ...data } as Player;
      });
    }

    return players;
  } catch (error) {
    console.error('Error in fetchPlayers:', error);
    throw error;
  }
};

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
          teams
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
          teams
        } as League;

        onUpdate(leagueData);
      } catch (error) {
        onError(error as Error);
      }
    },
    (error) => onError(error)
  );

  // Return a cleanup function that unsubscribes from both
  return () => {
    leagueUnsubscribe();
    teamsUnsubscribe();
  };
};

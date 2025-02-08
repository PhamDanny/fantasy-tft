import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, updateDoc, setDoc, arrayUnion, getDocs, collection } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../firebase/auth';
import type { League, LeagueInvite, Team } from '../types';
import { getLeagueType } from '../types';

interface LeagueDocWithId extends Omit<League, 'id'> {
  id: number;
}

const JoinLeague = () => {
  const { inviteCode, leagueId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [league, setLeague] = useState<LeagueDocWithId | null>(null);
  const [teamName, setTeamName] = useState('');
  const [user, setUser] = useState<any>(null);
  const [invite, setInvite] = useState<LeagueInvite | null>(null);

  useEffect(() => {
    const unsubscribe = useAuth((authUser) => {
      setUser(authUser);
      if (!authUser) {
        const path = inviteCode ? `/join/${inviteCode}` : `/leagues/join/${leagueId}`;
        navigate(`/login?redirect=${path}`);
      }
    });
    return () => unsubscribe();
  }, [leagueId, inviteCode, navigate]);

  useEffect(() => {
    const loadLeague = async () => {
      if (!inviteCode && !leagueId) return;
      
      try {
        let leagueDoc;
        let leagueIdToUse;

        if (inviteCode) {
          // Get all leagues and find the one containing this invite code
          const leaguesSnapshot = await getDocs(collection(db, 'leagues'));
          let foundLeague = null;
          let foundInvite = null;

          for (const doc of leaguesSnapshot.docs) {
            const leagueData = doc.data();
            if (leagueData.invites?.[inviteCode]) {
              foundLeague = doc;
              foundInvite = leagueData.invites[inviteCode];
              break;
            }
          }

          if (!foundLeague || !foundInvite) {
            setError('Invalid invite code');
            return;
          }

          if (foundInvite.status !== 'active') {
            setError('This invite has expired or been used');
            return;
          }

          setInvite(foundInvite);
          leagueIdToUse = foundLeague.id;
          leagueDoc = foundLeague;
        } else {
          leagueIdToUse = leagueId!;
        }

        // Get league document (we already have it if using invite code)
        leagueDoc = leagueDoc || await getDoc(doc(db, 'leagues', leagueIdToUse));

        if (!leagueDoc.exists()) {
          setError('League not found');
          return;
        }

        // Get teams from subcollection
        const teamsSnapshot = await getDocs(collection(db, 'leagues', leagueIdToUse, 'teams'));
        const teams: Record<string, Team> = {};
        teamsSnapshot.forEach(doc => {
          teams[doc.id] = doc.data() as Team;
        });

        const leagueData = leagueDoc.data() as League;
        setLeague({ 
          ...leagueData, 
          id: parseInt(leagueIdToUse),
          teams // Use teams from subcollection
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load league');
      } finally {
        setLoading(false);
      }
    };

    loadLeague();
  }, [inviteCode, leagueId]);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !league || !teamName.trim()) return;

    setLoading(true);
    setError(null);

    try {
      // Initialize teams if it doesn't exist
      const teams = league.teams || {};

      // Check if user already has a team
      const existingTeam = Object.values(teams).find(
        team => team.ownerID === user.uid || team.coOwners?.includes(user.uid)
      );

      if (existingTeam) {
        setError('You already have a team in this league');
        return;
      }

      // Check if league is full
      if (Object.keys(teams).length >= league.settings.teamsLimit) {
        setError('This league is full');
        return;
      }

      // Check if team name is taken
      if (Object.values(teams).some(team => team.teamName === teamName)) {
        setError('This team name is already taken');
        return;
      }

      const teamId = Date.now().toString();
      const teamData = {
        teamId,
        teamName,
        ownerID: user.uid,
        coOwners: [],
        roster: [],
        faabBudget: league.settings.faabBudget,
        pendingBids: [],
        // Initialize cup lineups with proper structure
        cupLineups: {
          cup1: {
            captains: Array(league.settings.captainSlots).fill(null),
            naSlots: Array(league.settings.naSlots).fill(null),
            brLatamSlots: Array(league.settings.brLatamSlots).fill(null),
            flexSlots: Array(league.settings.flexSlots).fill(null),
            bench: [],
            locked: false
          },
          cup2: {
            captains: Array(league.settings.captainSlots).fill(null),
            naSlots: Array(league.settings.naSlots).fill(null),
            brLatamSlots: Array(league.settings.brLatamSlots).fill(null),
            flexSlots: Array(league.settings.flexSlots).fill(null),
            bench: [],
            locked: false
          },
          cup3: {
            captains: Array(league.settings.captainSlots).fill(null),
            naSlots: Array(league.settings.naSlots).fill(null),
            brLatamSlots: Array(league.settings.brLatamSlots).fill(null),
            flexSlots: Array(league.settings.flexSlots).fill(null),
            bench: [],
            locked: false
          }
        },
        // Only initialize playoff fields if playoffs are enabled
        ...(league.settings.playoffs ? {
          playoffRoster: [],
          playoffLineup: {
            captains: Array(league.settings.playoffSettings?.captainSlots || 0).fill(null),
            naSlots: Array(league.settings.playoffSettings?.naSlots || 0).fill(null),
            brLatamSlots: Array(league.settings.playoffSettings?.brLatamSlots || 0).fill(null),
            flexSlots: Array(league.settings.playoffSettings?.flexSlots || 0).fill(null),
            bench: [],
            locked: false
          },
          playoffDollars: 100,
          playoffBids: {}
        } : {})
      };

      // Add team to league
      await updateDoc(doc(db, 'leagues', league.id.toString()), {
        teams: {
          ...teams,
          [teamId]: teamData
        }
      });

      // Add league to user's leagues
      await updateDoc(doc(db, 'users', user.uid), {
        leagues: arrayUnion(league.id.toString())
      });

      // Create team document in teams subcollection
      await setDoc(doc(db, 'leagues', league.id.toString(), 'teams', teamId), teamData);

      // If using invite code, mark it as used
      if (inviteCode && invite) {
        await updateDoc(doc(db, 'leagues', league.id.toString()), {
          invites: {
            ...league.invites,
            [inviteCode]: {
              ...invite,
              usedBy: arrayUnion(user.uid),
              usedCount: (invite.usedCount || 0) + 1
            }
          }
        });
      }

      // Redirect to league page
      navigate(`/leagues/${league.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join league');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="p-4">Loading...</div>;
  if (error) return <div className="alert alert-danger m-4">{error}</div>;
  if (!league) return <div className="alert alert-danger m-4">League not found</div>;

  return (
    <div className="container mt-4">
      <div className="row justify-content-center">
        <div className="col-md-6">
          <div className="card">
            <div className="card-header">
              <h4 className="mb-0">Join {league.name}</h4>
            </div>
            <div className="card-body">
              <form onSubmit={handleJoin}>
                <div className="mb-3">
                  <label className="form-label">Team Name</label>
                  <input
                    type="text"
                    className="form-control"
                    value={teamName}
                    onChange={(e) => setTeamName(e.target.value)}
                    required
                    minLength={3}
                    maxLength={30}
                    placeholder="Enter your team name"
                  />
                </div>

                <div className="alert alert-info">
                  <strong>League Info:</strong>
                  <ul className="mb-0">
                    <li>Type: {getLeagueType(league) === 'season-long' ? 'Full Season' : 'Single Tournament'}</li>
                    <li>Teams: {Object.keys(league.teams || {}).length + 1}/{league.settings.teamsLimit}</li>
                    <li>Season: {league.season}</li>
                    <li>Phase: {league.phase}</li>
                  </ul>
                </div>

                <button 
                  type="submit" 
                  className="btn btn-primary w-100"
                  disabled={loading || !teamName.trim()}
                >
                  {loading ? 'Joining...' : 'Join League'}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default JoinLeague;

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../firebase/auth';
import type { Draft, Team } from '../types';

const JoinDraft = () => {
  const { inviteCode } = useParams();
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [teamName, setTeamName] = useState('');
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    const unsubscribe = useAuth((authUser) => {
      setUser(authUser);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const loadDraft = async () => {
      if (!inviteCode) return;

      try {
        // Find draft with this invite code
        const draftsRef = collection(db, 'drafts');
        const q = query(draftsRef, where(`invites.${inviteCode}.status`, '==', 'active'));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
          throw new Error('Invalid or expired invite code');
        }

        const draftDoc = querySnapshot.docs[0];
        setDraft({ id: draftDoc.id, ...draftDoc.data() } as Draft);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load draft');
      } finally {
        setLoading(false);
      }
    };

    loadDraft();
  }, [inviteCode]);

  const handleJoin = async () => {
    if (!draft || !user || !teamName.trim()) return;
    if (teamName.length > 20) {
      setError("Team name must be 20 characters or less");
      return;
    }

    setJoining(true);
    setError(null);

    try {
      // First check if user already has a team in the league's teams subcollection
      const teamsRef = collection(db, 'leagues', draft.id.toString(), 'teams');
      const teamsQuery = query(teamsRef, 
        where('ownerID', '==', user.uid)
      );
      const coOwnerQuery = query(teamsRef,
        where('coOwners', 'array-contains', user.uid)
      );

      const [ownerSnapshot, coOwnerSnapshot] = await Promise.all([
        getDocs(teamsQuery),
        getDocs(coOwnerQuery)
      ]);

      if (!ownerSnapshot.empty || !coOwnerSnapshot.empty) {
        // User already has a team, redirect to league page
        navigate(`/leagues/${draft.id}`);
        return;
      }

      // Check if user already has a team in the draft
      const hasTeam = Object.values(draft.teams).some(
        team => team.ownerID === user.uid || team.coOwners.includes(user.uid)
      );
      if (hasTeam) {
        throw new Error('You already have a team in this draft');
      }

      // Check if draft is full
      if (Object.keys(draft.teams).length >= draft.settings.teamsLimit) {
        throw new Error('Draft is full');
      }

      // Generate team ID
      const teamId = `team_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Create the team
      const newTeam: Team = {
        teamId,
        ownerID: user.uid,
        coOwners: [],
        teamName: teamName.trim(),
        ownerDisplayName: user.displayName || "Anonymous",
        coOwnerDisplayNames: {},
        roster: [],
        faabBudget: 0,  // This will be set when converting to league
        pendingBids: [], // No bids in draft mode
        cupLineups: {
          cup1: {
            captains: Array(draft.settings.captainSlots).fill(null),
            naSlots: Array(draft.settings.naSlots).fill(null),
            brLatamSlots: Array(draft.settings.brLatamSlots).fill(null),
            flexSlots: Array(draft.settings.flexSlots).fill(null),
            bench: [],
            locked: false,
          },
          cup2: {
            captains: Array(draft.settings.captainSlots).fill(null),
            naSlots: Array(draft.settings.naSlots).fill(null),
            brLatamSlots: Array(draft.settings.brLatamSlots).fill(null),
            flexSlots: Array(draft.settings.flexSlots).fill(null),
            bench: [],
            locked: false,
          },
          cup3: {
            captains: Array(draft.settings.captainSlots).fill(null),
            naSlots: Array(draft.settings.naSlots).fill(null),
            brLatamSlots: Array(draft.settings.brLatamSlots).fill(null),
            flexSlots: Array(draft.settings.flexSlots).fill(null),
            bench: [],
            locked: false,
          },
        },
      };

      // Update draft with new team and increment invite usage
      const draftRef = doc(db, 'drafts', draft.id);
      await updateDoc(draftRef, {
        [`teams.${teamId}`]: newTeam,
        [`invites.${inviteCode!}.usedCount`]: (draft.invites?.[inviteCode!]?.usedCount || 0) + 1,
      });

      // Navigate to draft page
      navigate(`/drafts/${draft.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join draft');
    } finally {
      setJoining(false);
    }
  };

  if (loading) {
    return (
      <div className="container mt-4">
        <div className="text-center">
          <div className="spinner-border" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="container mt-4">
        <div className="alert alert-info">
          Please log in to join the draft.
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mt-4">
        <div className="alert alert-danger">
          {error}
        </div>
      </div>
    );
  }

  if (!draft) {
    return (
      <div className="container mt-4">
        <div className="alert alert-danger">
          Draft not found or invite code is invalid.
        </div>
      </div>
    );
  }

  return (
    <div className="container mt-4">
      <div className="row justify-content-center">
        <div className="col-md-6">
          <div className="card">
            <div className="card-header">
              <h5 className="card-title mb-0">Join Draft: {draft.name}</h5>
            </div>
            <div className="card-body">
              <p>
                <strong>Season:</strong> {draft.season}
              </p>
              <p>
                <strong>Teams:</strong> {Object.keys(draft.teams).length} / {draft.settings.teamsLimit}
              </p>

              <div className="mb-3">
                <label className="form-label">Team Name</label>
                <input
                  type="text"
                  className="form-control"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  placeholder="Enter your team name"
                  maxLength={20}
                />
              </div>

              <button
                className="btn btn-primary w-100"
                onClick={handleJoin}
                disabled={joining || !teamName.trim()}
              >
                {joining ? 'Joining...' : 'Join Draft'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default JoinDraft; 

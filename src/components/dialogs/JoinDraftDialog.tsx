import React, { useState } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import type { Draft, Team } from '../../types';

interface JoinDraftDialogProps {
  draft: Draft;
  userId: string;
  onJoined?: () => void;
}

const JoinDraftDialog: React.FC<JoinDraftDialogProps> = ({
  draft,
  userId,
  onJoined,
}) => {
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [teamName, setTeamName] = useState('');

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);

    try {
      if (!teamName.trim()) {
        throw new Error('Team name is required');
      }

      // Check if user already has a team
      const hasTeam = Object.values(draft.teams).some(
        team => team.ownerID === userId || team.coOwners.includes(userId)
      );
      if (hasTeam) {
        throw new Error('You already have a team in this draft');
      }

      // Check if draft is full
      if (Object.keys(draft.teams).length >= draft.settings.teamsLimit) {
        throw new Error('Draft is full');
      }

      // Get user's display name
      const userDoc = await getDoc(doc(db, 'users', userId));
      if (!userDoc.exists()) {
        throw new Error('User not found');
      }

      // Generate team ID
      const teamId = `team_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Create the team
      const newTeam: Team = {
        teamId,
        ownerID: userId,
        coOwners: [],
        teamName: teamName.trim(),
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

      // Add team to draft
      const draftRef = doc(db, 'drafts', draft.id);
      await updateDoc(draftRef, {
        [`teams.${teamId}`]: newTeam,
      });

      setShow(false);
      onJoined?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join draft');
    } finally {
      setLoading(false);
    }
  };

  // Don't show join button if user is already in the draft or if draft is full
  const hasTeam = Object.values(draft.teams).some(
    team => team.ownerID === userId || team.coOwners.includes(userId)
  );
  const isFull = Object.keys(draft.teams).length >= draft.settings.teamsLimit;
  const canJoin = !hasTeam && !isFull && draft.status === 'pending';

  if (!canJoin) {
    return null;
  }

  return (
    <>
      <button className="btn btn-success" onClick={() => setShow(true)}>
        Join Draft
      </button>

      {show && (
        <div
          className="modal fade show d-block"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
        >
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Join Draft</h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => setShow(false)}
                  aria-label="Close"
                ></button>
              </div>

              <div className="modal-body">
                {error && <div className="alert alert-danger">{error}</div>}

                <div className="mb-3">
                  <label className="form-label">Team Name</label>
                  <input
                    type="text"
                    className="form-control"
                    value={teamName}
                    onChange={(e) => setTeamName(e.target.value)}
                    placeholder="Enter your team name"
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShow(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-success"
                  onClick={handleSubmit}
                  disabled={loading || !teamName.trim()}
                >
                  {loading ? 'Joining...' : 'Join Draft'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default JoinDraftDialog; 
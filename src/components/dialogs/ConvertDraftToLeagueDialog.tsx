import React, { useState } from 'react';
import { doc, setDoc, updateDoc, collection, arrayUnion, deleteDoc, query, getDocs, orderBy, limit } from 'firebase/firestore';
import { db } from '../../firebase/config';
import type { Draft, League, DraftPick } from '../../types';

interface ConvertDraftToLeagueDialogProps {
  draft: Draft;
  onLeagueCreated?: (leagueId: string) => void;
}

const ConvertDraftToLeagueDialog: React.FC<ConvertDraftToLeagueDialogProps> = ({
  draft,
  onLeagueCreated,
}) => {
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formState, setFormState] = useState({
    settings: {
      faabBudget: 100,
      currentCup: 0,
      playoffs: false,
      playoffTeams: 4,
    },
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    if (name.startsWith('settings.')) {
      const settingName = name.split('.')[1];
      if (settingName === 'playoffs') {
        setFormState((prev) => ({
          ...prev,
          settings: {
            ...prev.settings,
            [settingName]: (e.target as HTMLInputElement).checked,
          },
        }));
      } else {
        setFormState((prev) => ({
          ...prev,
          settings: {
            ...prev.settings,
            [settingName]: parseInt(value) || 0,
          },
        }));
      }
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);

    try {
      // Generate a new league ID
      const leagueId = Date.now().toString();

      // Get the current global cup
      const leaguesRef = collection(db, 'leagues');
      const leaguesQuery = query(leaguesRef, orderBy('settings.currentCup', 'desc'), limit(1));
      const leaguesSnapshot = await getDocs(leaguesQuery);
      const currentCup = leaguesSnapshot.empty ? 1 : leaguesSnapshot.docs[0].data().settings.currentCup;

      // Create the league document
      const leagueData: Partial<League> = {
        id: parseInt(leagueId),
        name: draft.name,
        season: draft.season,
        type: 'season-long',
        phase: 'drafting',
        settings: {
          ...draft.settings,
          ...formState.settings,
          draftStarted: false,
          currentCup: currentCup,
        },
        commissioner: draft.commissioner,
        transactions: [],
        draftId: draft.id,
        // Handle both old and new draft formats
        picks: draft.picks ? 
          // New format - picks array is directly on draft
          draft.picks.map((pick: DraftPick) => ({
            teamId: pick.teamId,
            playerId: pick.playerId,
            round: pick.round,
            pick: pick.pick,
            timestamp: pick.timestamp
          })) :
          // Old format - picks are in draftData
          draft.draftData?.picks?.map((pick: DraftPick) => ({
            teamId: pick.teamId,
            playerId: pick.playerId,
            round: pick.round,
            pick: pick.pick,
            timestamp: pick.timestamp
          })) || []
      };

      // Create the league document first
      await setDoc(doc(db, 'leagues', leagueId), leagueData);

      // Create teams in the teams subcollection
      const teamsCollection = collection(db, 'leagues', leagueId, 'teams');
      await Promise.all(
        Object.values(draft.teams).map(async (team) => {
          await setDoc(doc(teamsCollection, team.teamId), {
            ...team,
            faabBudget: formState.settings.faabBudget,
          });
        })
      );

      // Update all involved users' leagues array
      await Promise.all(
        Object.values(draft.teams).map(async (team) => {
          // Update owner
          await updateDoc(doc(db, 'users', team.ownerID), {
            leagues: arrayUnion(leagueId)
          });
          
          // Update co-owners if any
          if (team.coOwners) {
            await Promise.all(
              team.coOwners.map(async (coOwnerId) => {
                await updateDoc(doc(db, 'users', coOwnerId), {
                  leagues: arrayUnion(leagueId)
                });
              })
            );
          }
        })
      );

      // After successful league creation and all updates, delete the draft
      await deleteDoc(doc(db, 'drafts', draft.id));

      // Close the dialog
      setShow(false);
      onLeagueCreated?.(leagueId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create league');
    } finally {
      setLoading(false);
    }
  };

  if (draft.status !== 'completed') {
    return null;
  }

  return (
    <>
      <button className="btn btn-success" onClick={() => setShow(true)}>
        Convert to League
      </button>

      {show && (
        <div
          className="modal fade show d-block"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
        >
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Convert Draft to League</h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => setShow(false)}
                  aria-label="Close"
                ></button>
              </div>

              <div className="modal-body">
                {error && <div className="alert alert-danger">{error}</div>}

                <p>
                  You're about to convert this draft into a full league. 
                  Please configure the additional league settings below.
                </p>

                <div className="mb-3">
                  <label className="form-label">Starting FAAB Budget</label>
                  <input
                    type="number"
                    className="form-control"
                    name="settings.faabBudget"
                    value={formState.settings.faabBudget}
                    onChange={handleInputChange}
                    min="0"
                  />
                </div>

                <div className="form-check mb-3">
                  <input
                    type="checkbox"
                    className="form-check-input"
                    name="settings.playoffs"
                    checked={formState.settings.playoffs}
                    onChange={handleInputChange}
                    id="playoffsCheck"
                  />
                  <label className="form-check-label" htmlFor="playoffsCheck">
                    Enable Playoffs
                  </label>
                </div>

                {formState.settings.playoffs && (
                  <div className="mb-3">
                    <label className="form-label">Number of Playoff Teams</label>
                    <input
                      type="number"
                      className="form-control"
                      name="settings.playoffTeams"
                      value={formState.settings.playoffTeams}
                      onChange={handleInputChange}
                      min="2"
                      max={draft.settings.teamsLimit}
                    />
                  </div>
                )}
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
                  disabled={loading}
                >
                  {loading ? 'Converting...' : 'Convert to League'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ConvertDraftToLeagueDialog; 
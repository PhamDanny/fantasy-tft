import React, { useState } from 'react';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import type { DraftSettings, Team } from '../../types';
import { useNavigate } from 'react-router-dom';

interface CreateDraftDialogProps {
  userId: string;
  onDraftCreated?: () => void;
}

type DraftType = 'snake' | 'auction';

const CreateDraftDialog: React.FC<CreateDraftDialogProps> = ({
  userId,
  onDraftCreated,
}) => {
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formState, setFormState] = useState({
    name: '',
    season: 'Set 13',
    settings: {
      draftType: 'snake' as DraftType,
      draftOrder: [],
      captainSlots: 1,
      naSlots: 5,
      brLatamSlots: 1,
      flexSlots: 3,
      benchSlots: 3,
      teamsLimit: 12,
    },
  });

  const navigate = useNavigate();

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    if (name.startsWith('settings.')) {
      const settingName = name.split('.')[1] as keyof DraftSettings;
      setFormState((prev) => ({
        ...prev,
        settings: {
          ...prev.settings,
          [settingName]: settingName === 'draftType' ? value : parseInt(value) || 0,
        },
      }));
    } else {
      setFormState((prev) => ({
        ...prev,
        [name]: value,
      }));
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);

    try {
      // Check if auction draft is selected
      if (formState.settings.draftType === 'auction') {
        throw new Error('Sorry, auction draft mode is not implemented yet. Please select snake draft.');
      }

      // Validate total slots
      const totalStartingSlots = 
        formState.settings.captainSlots +
        formState.settings.naSlots +
        formState.settings.brLatamSlots +
        formState.settings.flexSlots;

      if (totalStartingSlots > 20) {
        throw new Error('Total number of starting slots cannot exceed 20');
      }

      if (totalStartingSlots === 0) {
        throw new Error('There must be at least one starting slot');
      }

      // Get user's display name
      const userDoc = await getDoc(doc(db, 'users', userId));
      if (!userDoc.exists()) {
        throw new Error('User not found');
      }
      const userName = userDoc.data().displayName || 'New Team';

      // Generate a new draft ID and team ID
      const draftId = `draft_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const teamId = `team_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Create commissioner's team
      const commissionerTeam: Team = {
        teamId,
        ownerID: userId,
        coOwners: [],
        teamName: userName,
        ownerDisplayName: userName,
        coOwnerDisplayNames: {},
        roster: [],
        faabBudget: 0,  // This will be set when converting to league
        pendingBids: [], // No bids in draft mode
        cupLineups: {
          cup1: {
            captains: Array(formState.settings.captainSlots).fill(null),
            naSlots: Array(formState.settings.naSlots).fill(null),
            brLatamSlots: Array(formState.settings.brLatamSlots).fill(null),
            flexSlots: Array(formState.settings.flexSlots).fill(null),
            bench: [],
            locked: false,
          },
          cup2: {
            captains: Array(formState.settings.captainSlots).fill(null),
            naSlots: Array(formState.settings.naSlots).fill(null),
            brLatamSlots: Array(formState.settings.brLatamSlots).fill(null),
            flexSlots: Array(formState.settings.flexSlots).fill(null),
            bench: [],
            locked: false,
          },
          cup3: {
            captains: Array(formState.settings.captainSlots).fill(null),
            naSlots: Array(formState.settings.naSlots).fill(null),
            brLatamSlots: Array(formState.settings.brLatamSlots).fill(null),
            flexSlots: Array(formState.settings.flexSlots).fill(null),
            bench: [],
            locked: false,
          },
        },
      };

      // Create the draft document
      const draftData = {
        id: draftId,
        name: formState.name,
        creationDate: new Date().toISOString(),
        season: formState.season,
        settings: formState.settings,
        commissioner: userId,
        teams: {
          [teamId]: commissionerTeam,
        },
        status: 'pending',
        currentRound: 1,
        currentPick: 0,
        picks: [],
      };

      await setDoc(doc(db, 'drafts', draftId), draftData);

      // Close the dialog and reset form
      setShow(false);
      onDraftCreated?.();
      
      // Navigate to the new draft
      navigate(`/drafts/${draftId}`);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create draft');
    } finally {
      setLoading(false);
    }
  };

  // Helper function to generate number options
  const generateOptions = (max: number, min: number = 0) => {
    return Array.from({ length: max - min + 1 }, (_, i) => i + min);
  };

  return (
    <>
      <button className="btn btn-primary w-100" onClick={() => setShow(true)}>
        Create New Draft
      </button>

      {show && (
        <div
          className="modal fade show d-block"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
        >
          <div className="modal-dialog modal-lg">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Create New Draft</h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => setShow(false)}
                  aria-label="Close"
                ></button>
              </div>

              <div className="modal-body">
                {error && <div className="alert alert-danger">{error}</div>}

                <div className="mb-3 text-start">
                  <label className="form-label">Draft Name</label>
                  <input
                    type="text"
                    className="form-control"
                    name="name"
                    value={formState.name}
                    onChange={handleInputChange}
                  />
                  <small className="text-muted">
                    This name will be used as the league name if you convert the draft to a league later.
                  </small>
                </div>

                <div className="mb-3 text-start">
                  <label className="form-label">Set</label>
                  <input
                    type="text"
                    className="form-control"
                    name="season"
                    value={formState.season}
                    onChange={handleInputChange}
                  />
                </div>

                <div className="mb-3 text-start">
                  <label className="form-label">Draft Type</label>
                  <select
                    className="form-select"
                    name="settings.draftType"
                    value={formState.settings.draftType}
                    onChange={handleInputChange}
                  >
                    <option value="snake">Snake Draft</option>
                    <option value="auction">Auction Draft</option>
                  </select>
                </div>

                <h6 className="mb-3">Roster Settings</h6>

                <div className="row g-3">
                  <div className="col-md-6">
                    <label className="form-label">Captain Slots</label>
                    <select
                      className="form-select"
                      name="settings.captainSlots"
                      value={formState.settings.captainSlots}
                      onChange={handleInputChange}
                    >
                      {generateOptions(20).map(num => (
                        <option key={num} value={num}>{num}</option>
                      ))}
                    </select>
                  </div>

                  <div className="col-md-6">
                    <label className="form-label">NA Slots</label>
                    <select
                      className="form-select"
                      name="settings.naSlots"
                      value={formState.settings.naSlots}
                      onChange={handleInputChange}
                    >
                      {generateOptions(20).map(num => (
                        <option key={num} value={num}>{num}</option>
                      ))}
                    </select>
                  </div>

                  <div className="col-md-6">
                    <label className="form-label">BR/LATAM Slots</label>
                    <select
                      className="form-select"
                      name="settings.brLatamSlots"
                      value={formState.settings.brLatamSlots}
                      onChange={handleInputChange}
                    >
                      {generateOptions(20).map(num => (
                        <option key={num} value={num}>{num}</option>
                      ))}
                    </select>
                  </div>

                  <div className="col-md-6">
                    <label className="form-label">Flex Slots</label>
                    <select
                      className="form-select"
                      name="settings.flexSlots"
                      value={formState.settings.flexSlots}
                      onChange={handleInputChange}
                    >
                      {generateOptions(20).map(num => (
                        <option key={num} value={num}>{num}</option>
                      ))}
                    </select>
                  </div>

                  <div className="col-md-6">
                    <label className="form-label">Bench Slots</label>
                    <select
                      className="form-select"
                      name="settings.benchSlots"
                      value={formState.settings.benchSlots}
                      onChange={handleInputChange}
                    >
                      {generateOptions(20).map(num => (
                        <option key={num} value={num}>{num}</option>
                      ))}
                    </select>
                  </div>

                  <div className="col-md-6">
                    <label className="form-label">Teams</label>
                    <select
                      className="form-select"
                      name="settings.teamsLimit"
                      value={formState.settings.teamsLimit}
                      onChange={handleInputChange}
                    >
                      {generateOptions(20, 1).map(num => (
                        <option key={num} value={num}>{num}</option>
                      ))}
                    </select>
                  </div>
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
                  className="btn btn-primary"
                  onClick={handleSubmit}
                  disabled={loading}
                >
                  {loading ? 'Creating...' : 'Create Draft'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default CreateDraftDialog;

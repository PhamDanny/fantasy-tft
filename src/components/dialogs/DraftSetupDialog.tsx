import React, { useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import type { Draft } from '../../types';

interface DraftSetupDialogProps {
  draft: Draft;
  onDraftStarted?: () => void;
}

const DraftSetupDialog: React.FC<DraftSetupDialogProps> = ({
  draft,
  onDraftStarted,
}) => {
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draftOrder, setDraftOrder] = useState<string[]>([]);

  const handleRandomize = () => {
    const teams = Object.values(draft.teams);
    const shuffled = [...teams]
      .sort(() => Math.random() - 0.5)
      .map(team => team.teamId);
    setDraftOrder(shuffled);
  };

  const handleMoveTeam = (teamId: string, direction: 'up' | 'down') => {
    const currentIndex = draftOrder.indexOf(teamId);
    if (currentIndex === -1) return;

    const newOrder = [...draftOrder];
    const newIndex = direction === 'up' 
      ? Math.max(0, currentIndex - 1)
      : Math.min(draftOrder.length - 1, currentIndex + 1);

    // Swap positions
    [newOrder[currentIndex], newOrder[newIndex]] = 
    [newOrder[newIndex], newOrder[currentIndex]];

    setDraftOrder(newOrder);
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);

    try {
      if (draftOrder.length === 0) {
        throw new Error('Please set up the draft order first');
      }

      if (draftOrder.length !== Object.keys(draft.teams).length) {
        throw new Error('Draft order must include all teams');
      }

      // Update draft with order and start it
      const draftRef = doc(db, 'drafts', draft.id);
      await updateDoc(draftRef, {
        'settings.draftOrder': draftOrder,
        status: 'in_progress',
        currentRound: 1,
        currentPick: 0,
      });

      setShow(false);
      onDraftStarted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start draft');
    } finally {
      setLoading(false);
    }
  };

  if (draft.status !== 'pending' || !draft.teams || Object.keys(draft.teams).length < 2) {
    return null;
  }

  return (
    <>
      <button className="btn btn-primary" onClick={() => setShow(true)}>
        Set Up Draft Order
      </button>

      {show && (
        <div
          className="modal fade show d-block"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
        >
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Set Up Draft Order</h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => setShow(false)}
                  aria-label="Close"
                ></button>
              </div>

              <div className="modal-body">
                {error && <div className="alert alert-danger">{error}</div>}

                <div className="d-grid mb-3">
                  <button
                    className="btn btn-outline-primary"
                    onClick={handleRandomize}
                  >
                    Randomize Order
                  </button>
                </div>

                <div className="list-group">
                  {draftOrder.length > 0 ? (
                    draftOrder.map((teamId, index) => {
                      const team = draft.teams[teamId];
                      return (
                        <div
                          key={teamId}
                          className="list-group-item d-flex justify-content-between align-items-center"
                        >
                          <span>
                            {index + 1}. {team.teamName}
                          </span>
                          <div>
                            <button
                              className="btn btn-sm btn-outline-secondary me-1"
                              onClick={() => handleMoveTeam(teamId, 'up')}
                              disabled={index === 0}
                            >
                              ↑
                            </button>
                            <button
                              className="btn btn-sm btn-outline-secondary"
                              onClick={() => handleMoveTeam(teamId, 'down')}
                              disabled={index === draftOrder.length - 1}
                            >
                              ↓
                            </button>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-center py-3 text-muted">
                      Click "Randomize Order" to get started
                    </div>
                  )}
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
                  disabled={loading || draftOrder.length === 0}
                >
                  {loading ? 'Starting...' : 'Start Draft'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default DraftSetupDialog; 
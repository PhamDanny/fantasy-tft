// InviteDialog.tsx
import React, { useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../../firebase/config";
import type { League, LeagueInvite } from "../../types/index";

interface InviteDialogProps {
  league: League;
  show: boolean;
  onClose: () => void;
}

const InviteDialog: React.FC<InviteDialogProps> = ({ league, show, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newInvite, setNewInvite] = useState({
    maxUses: 1,
    expiresInDays: 7,
  });

  const createInvite = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const inviteCode = Math.random().toString(36).substring(2, 10);
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + newInvite.expiresInDays);

      const invite: LeagueInvite = {
        code: inviteCode,
        createdAt: new Date().toISOString(),
        expiresAt: expiresAt.toISOString(),
        maxUses: newInvite.maxUses,
        usedCount: 0,
        status: 'active' as const,
        usedBy: [],
        createdBy: league.commissioner
      };

      await updateDoc(doc(db, 'leagues', league.id.toString()), {
        [`invites.${inviteCode}`]: invite,
      });

      setNewInvite({ maxUses: 1, expiresInDays: 7 });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create invite');
    } finally {
      setLoading(false);
    }
  };

  const copyInviteLink = (code: string) => {
    const link = `${window.location.origin}/join/${code}`;
    navigator.clipboard.writeText(link);
  };

  const getTimeRemaining = (expiresAt: string) => {
    const remaining = new Date(expiresAt).getTime() - new Date().getTime();
    const days = Math.floor(remaining / (1000 * 60 * 60 * 24));
    const hours = Math.floor((remaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    return `${days}d ${hours}h`;
  };

  const deleteInvite = async (code: string) => {
    setLoading(true);
    try {
      await updateDoc(doc(db, 'leagues', league.id.toString()), {
        [`invites.${code}`]: {
          ...league.invites?.[code],
          status: 'expired'
        }
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete invite');
    } finally {
      setLoading(false);
    }
  };

  const activeInvites = Object.entries(league.invites || {}).filter(
    ([_, invite]) => 
      invite.status === 'active' && 
      invite.expiresAt &&
      new Date(invite.expiresAt) > new Date()
  );

  if (!show) return null;

  return (
    <div className="modal fade show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="modal-dialog">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">League Invites</h5>
            <button type="button" className="btn-close" onClick={onClose}></button>
          </div>

          <div className="modal-body">
            {error && <div className="alert alert-danger">{error}</div>}

            <h6 className="mb-3">Active Invites</h6>
            {activeInvites.length === 0 ? (
              <p className="text-muted">No active invites</p>
            ) : (
              <div className="list-group mb-4">
                {activeInvites.map(([code, invite]) => (
                  <div key={code} className="list-group-item d-flex justify-content-between align-items-center">
                    <div>
                      <div className="small text-muted">Code: {code}</div>
                      <div>
                        {invite.maxUses ? (
                          `${invite.maxUses - invite.usedCount} uses remaining`
                        ) : (
                          'Unlimited uses'
                        )}
                        <span className="mx-2">•</span>
                        Expires in: {invite.expiresAt ? getTimeRemaining(invite.expiresAt) : 'N/A'}
                      </div>
                    </div>
                    <div>
                      <button
                        className="btn btn-outline-primary btn-sm me-2"
                        onClick={() => copyInviteLink(code)}
                      >
                        Copy Link
                      </button>
                      <button
                        className="btn btn-outline-danger btn-sm"
                        onClick={() => deleteInvite(code)}
                        disabled={loading}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <h6 className="mb-3">Create New Invite</h6>
            <div className="mb-3">
              <label className="form-label">Maximum Uses</label>
              <input
                type="number"
                className="form-control"
                value={newInvite.maxUses}
                onChange={(e) => setNewInvite(prev => ({ ...prev, maxUses: parseInt(e.target.value) }))}
                min="1"
              />
            </div>

            <div className="mb-3">
              <label className="form-label">Expires In (Days)</label>
              <input
                type="number"
                className="form-control"
                value={newInvite.expiresInDays}
                onChange={(e) => setNewInvite(prev => ({ ...prev, expiresInDays: parseInt(e.target.value) }))}
                min="1"
              />
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Close
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={createInvite}
              disabled={loading}
            >
              {loading ? 'Creating...' : 'Create New Invite'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InviteDialog;

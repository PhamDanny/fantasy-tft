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

  // Calculate remaining team slots
  const remainingSlots = league.settings.teamsLimit - Object.keys(league.teams || {}).length;

  const expirationOptions = [
    { label: "12 Hours", value: 0.5 },
    { label: "1 Day", value: 1 },
    { label: "3 Days", value: 3 },
    { label: "7 Days", value: 7 },
  ];

  const createInvite = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const inviteCode = Math.random().toString(36).substring(2, 10);
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + newInvite.expiresInDays);
      const expiresAtString = expiresAt.toISOString();

      const invite: LeagueInvite = {
        code: inviteCode,
        createdAt: new Date().toISOString(),
        expiresAt: expiresAtString,
        maxUses: newInvite.maxUses,
        usedCount: 0,
        status: 'active',
        usedBy: [],
        createdBy: league.commissioner,
        type: 'team',
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
      new Date(invite.expiresAt) > new Date() &&
      (!invite.type || invite.type === 'team')
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

            <h6 className="mb-3">Active Team Invites</h6>
            {activeInvites.length === 0 ? (
              <p className="text-muted">No active team invites</p>
            ) : (
              <div className="list-group mb-4">
                {activeInvites.map(([code, invite]) => (
                  <div key={code} className="list-group-item">
                    <div className="d-flex justify-content-between align-items-center mb-2">
                      <div>
                        {invite.maxUses ? (
                          `${invite.maxUses - invite.usedCount} uses remaining`
                        ) : (
                          'Unlimited uses'
                        )}
                        <span className="mx-2">•</span>
                        Expires: {invite.expiresAt ? getTimeRemaining(invite.expiresAt) : 'Never'}
                      </div>
                      <div>
                        <button
                          className="btn btn-outline-primary btn-sm me-2"
                          onClick={() => copyInviteLink(code)}
                        >
                          Copy
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
                    <div className="small text-muted">
                      {`${window.location.origin}/join/${code}`}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <h6 className="mb-3">Create New Invite</h6>
            <div className="mb-3">
              <label className="form-label">Maximum Uses</label>
              <select
                className="form-select"
                value={newInvite.maxUses}
                onChange={(e) => setNewInvite(prev => ({ 
                  ...prev, 
                  maxUses: parseInt(e.target.value) 
                }))}
              >
                {Array.from({ length: remainingSlots }, (_, i) => i + 1).map(num => (
                  <option key={num} value={num}>{num}</option>
                ))}
              </select>
            </div>

            <div className="mb-3">
              <label className="form-label">Expires In</label>
              <select
                className="form-select"
                value={newInvite.expiresInDays}
                onChange={(e) => setNewInvite(prev => ({ 
                  ...prev, 
                  expiresInDays: parseFloat(e.target.value)
                }))}
              >
                {expirationOptions.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
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

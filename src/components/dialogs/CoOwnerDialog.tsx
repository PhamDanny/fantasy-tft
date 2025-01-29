import React, { useState, useEffect } from "react";
import { doc, updateDoc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../firebase/config";
import type { League, Team, LeagueInvite } from "../../types";
import { User } from "firebase/auth";

interface CoOwnerDialogProps {
  league: League;
  team: Team;
  show: boolean;
  onClose: () => void;
  user: User;
}

const CoOwnerDialog: React.FC<CoOwnerDialogProps> = ({
  league,
  team,
  show,
  onClose,
  user,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newInvite, setNewInvite] = useState({
    expiresInDays: 7,
  });
  const [coOwnerNames, setCoOwnerNames] = useState<Record<string, string>>({});

  const expirationOptions = [
    { label: "12 Hours", value: 0.5 },
    { label: "1 Day", value: 1 },
    { label: "3 Days", value: 3 },
    { label: "7 Days", value: 7 },
  ];

  // Fetch display names for co-owners
  useEffect(() => {
    const fetchCoOwnerNames = async () => {
      const names: Record<string, string> = {};
      for (const coOwnerId of team.coOwners || []) {
        try {
          const userDoc = await getDoc(doc(db, "users", coOwnerId));
          if (userDoc.exists()) {
            names[coOwnerId] = userDoc.data().displayName || "Unknown User";
          }
        } catch (err) {
          console.error("Error fetching co-owner name:", err);
          names[coOwnerId] = "Unknown User";
        }
      }
      setCoOwnerNames(names);
    };

    fetchCoOwnerNames();
  }, [team.coOwners]);

  const createCoOwnerInvite = async () => {
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
        maxUses: 1,
        usedCount: 0,
        status: 'active' as const,
        usedBy: [],
        createdBy: user.uid,
        type: 'coowner',
        teamId: team.teamId,
      };

      await updateDoc(doc(db, 'leagues', league.id.toString()), {
        [`invites.${inviteCode}`]: invite,
      });

      setNewInvite({ expiresInDays: 7 });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create invite');
    } finally {
      setLoading(false);
    }
  };

  const removeCoOwner = async (coOwnerId: string) => {
    setLoading(true);
    try {
      // Get owner's display name
      const ownerDoc = await getDoc(doc(db, "users", team.ownerID));
      const ownerName = ownerDoc.exists() ? ownerDoc.data().displayName : "Unknown";

      // Get removed co-owner's name and data
      const coOwnerDoc = await getDoc(doc(db, "users", coOwnerId));
      const coOwnerName = coOwnerDoc.exists() ? coOwnerDoc.data().displayName : "Unknown";
      const coOwnerLeagues = coOwnerDoc.exists() ? coOwnerDoc.data().leagues || [] : [];

      // Get remaining co-owner names
      const remainingCoOwners = team.coOwners.filter(id => id !== coOwnerId);
      let newTeamName = ownerName;

      if (remainingCoOwners.length > 0) {
        const remainingCoOwnerDoc = await getDoc(doc(db, "users", remainingCoOwners[0]));
        const remainingCoOwnerName = remainingCoOwnerDoc.exists() ? remainingCoOwnerDoc.data().displayName : "Unknown";
        newTeamName = `${ownerName}/${remainingCoOwnerName}`;
      }

      // Update team
      await updateDoc(doc(db, 'leagues', league.id.toString(), 'teams', team.teamId), {
        coOwners: remainingCoOwners,
        teamName: newTeamName
      });

      // Update co-owner's leagues array
      await updateDoc(doc(db, 'users', coOwnerId), {
        leagues: coOwnerLeagues.filter((id: string) => id !== league.id.toString())
      });

      // Add chat message about the removal
      const chatRef = doc(db, 'leagues', league.id.toString(), 'chat', Date.now().toString());
      await setDoc(chatRef, {
        type: 'system',
        content: `${coOwnerName} was removed as co-owner`,
        timestamp: serverTimestamp(),
        userId: 'system'
      });

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove co-owner');
    } finally {
      setLoading(false);
    }
  };

  const copyInviteLink = (code: string) => {
    const link = `${window.location.origin}/join/${code}`;
    navigator.clipboard.writeText(link);
  };

  const deleteInvite = async (code: string) => {
    setLoading(true);
    try {
      await updateDoc(doc(db, 'leagues', league.id.toString()), {
        [`invites.${code}.status`]: 'inactive'
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
      invite.type === 'coowner' &&
      invite.teamId === team.teamId &&
      invite.expiresAt &&
      new Date(invite.expiresAt) > new Date()
  );

  const getTimeRemaining = (expiresAt: string) => {
    const remaining = new Date(expiresAt).getTime() - new Date().getTime();
    const days = Math.floor(remaining / (1000 * 60 * 60 * 24));
    const hours = Math.floor((remaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    return `${days}d ${hours}h`;
  };

  if (!show) return null;

  return (
    <div className="modal fade show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="modal-dialog">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">Manage Co-Owners</h5>
            <button type="button" className="btn-close" onClick={onClose}></button>
          </div>

          <div className="modal-body">
            {error && <div className="alert alert-danger">{error}</div>}

            <h6 className="mb-3">Current Co-Owners</h6>
            {team.coOwners?.length === 0 ? (
              <p className="text-muted">No co-owners</p>
            ) : (
              <div className="list-group mb-4">
                {team.coOwners?.map((coOwnerId) => (
                  <div key={coOwnerId} className="list-group-item d-flex justify-content-between align-items-center">
                    <div>{coOwnerNames[coOwnerId] || "Loading..."}</div>
                    <button
                      className="btn btn-outline-danger btn-sm"
                      onClick={() => removeCoOwner(coOwnerId)}
                      disabled={loading}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}

            <h6 className="mb-3">Active Invites</h6>
            {activeInvites.length === 0 ? (
              <p className="text-muted">No active invites</p>
            ) : (
              <div className="list-group mb-4">
                {activeInvites.map(([code, invite]) => (
                  <div key={code} className="list-group-item">
                    <div className="d-flex justify-content-between align-items-center">
                      <div>
                        <div>Expires in: {invite.expiresAt ? getTimeRemaining(invite.expiresAt) : 'Never'}</div>
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
                    <div className="small text-muted">
                      {`${window.location.origin}/join/${code}`}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <h6 className="mb-3">Create New Co-Owner Invite</h6>
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
              onClick={createCoOwnerInvite}
              disabled={loading}
            >
              {loading ? 'Creating...' : 'Create Co-Owner Invite'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CoOwnerDialog; 
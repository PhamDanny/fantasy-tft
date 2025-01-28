// InviteDialog.tsx
import React, { useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../../firebase/config";
import type { League, LeagueInvite } from "../../types";

interface InviteDialogProps {
  leagueId: number;
  league: League;
  onClose: () => void;
  onInviteCreated?: () => void;
}

const getInviteLink = (inviteCode: string): string => {
  const baseUrl = window.location.origin;
  return `${baseUrl}/join/${inviteCode}`;
};

const InviteDialog: React.FC<InviteDialogProps> = ({
  leagueId,
  league,
  onClose,
  onInviteCreated,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [maxUses, setMaxUses] = useState<number | "unlimited">(1);
  const [expiryHours, setExpiryHours] = useState<number | null>(24);

  const generateInviteCode = () => {
    return Math.random().toString(36).substring(2, 10).toUpperCase();
  };

  // Calculate remaining slots
  const remainingSlots =
    league.settings.teamsLimit - Object.keys(league.teams).length;

  const createInvite = async () => {
    setLoading(true);
    setError(null);
    setSuccess(false);
    setInviteCode(null);

    try {
      const code = generateInviteCode();
      const invite: LeagueInvite = {
        code,
        createdBy: "user_id", // TODO: Get from auth
        createdAt: new Date().toISOString(),
        expiresAt: expiryHours
          ? new Date(Date.now() + expiryHours * 3600000).toISOString()
          : undefined,
        maxUses: maxUses === "unlimited" ? undefined : maxUses,
        usedCount: 0,
        status: "active",
        usedBy: [],
      };

      await updateDoc(doc(db, "leagues", leagueId.toString()), {
        [`invites.${code}`]: invite,
      });

      setInviteCode(code);
      setSuccess(true);
      onInviteCreated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create invite");
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setSuccess(true);
    } catch (err) {
      setError("Failed to copy to clipboard");
    }
  };

  return (
    <div
      className="modal fade show d-block"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
    >
      <div className="modal-dialog">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">Create League Invite</h5>
            <button
              type="button"
              className="btn-close"
              onClick={onClose}
              aria-label="Close"
            ></button>
          </div>

          <div className="modal-body">
            {error && <div className="alert alert-danger">{error}</div>}
            {success && inviteCode && (
              <div className="alert alert-success">
                Invite code created successfully!
              </div>
            )}

            {!inviteCode ? (
              <div>
                <div className="mb-3">
                  <label className="form-label">Number of Uses</label>
                  <select
                    className="form-select"
                    value={
                      maxUses === "unlimited" ? "unlimited" : maxUses.toString()
                    }
                    onChange={(e) => {
                      const value = e.target.value;
                      setMaxUses(
                        value === "unlimited" ? "unlimited" : parseInt(value)
                      );
                    }}
                  >
                    {[...Array(remainingSlots)].map((_, i) => (
                      <option key={i + 1} value={i + 1}>
                        {i + 1}
                      </option>
                    ))}
                    <option value="unlimited">Unlimited uses</option>
                  </select>
                  <small className="text-muted">
                    Select how many times this invite can be used
                  </small>
                </div>

                <div className="mb-3">
                  <label className="form-label">Expires After</label>
                  <select
                    className="form-select"
                    value={
                      expiryHours === null ? "never" : expiryHours.toString()
                    }
                    onChange={(e) => {
                      const value = e.target.value;
                      setExpiryHours(
                        value === "never" ? null : parseInt(value)
                      );
                    }}
                  >
                    <option value="never">Never</option>
                    <option value="12">12 hours</option>
                    <option value="24">1 day</option>
                    <option value="72">3 days</option>
                    <option value="168">7 days</option>
                  </select>
                  <small className="text-muted">
                    Choose when this invite code expires
                  </small>
                </div>
              </div>
            ) : (
              <div className="text-center">
                <div className="mb-3">
                  <label className="form-label">Invite Link</label>
                  <div className="input-group">
                    <input
                      type="text"
                      className="form-control"
                      value={getInviteLink(inviteCode)}
                      readOnly
                    />
                    <button
                      className="btn btn-outline-primary"
                      onClick={() => copyToClipboard(getInviteLink(inviteCode))}
                    >
                      Copy Link
                    </button>
                  </div>
                </div>
                <small className="text-muted d-block mb-3">
                  Share this link with friends to invite them to your league
                </small>
                <div className="mb-3">
                  <label className="form-label">
                    Or share the invite code:
                  </label>
                  <h4 className="mb-3">{inviteCode}</h4>
                  <button
                    className="btn btn-outline-secondary"
                    onClick={() => copyToClipboard(inviteCode)}
                  >
                    Copy Code
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="modal-footer">
            {!inviteCode ? (
              <>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={onClose}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={createInvite}
                  disabled={loading}
                >
                  {loading ? "Creating..." : "Create Invite"}
                </button>
              </>
            ) : (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={onClose}
              >
                Close
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default InviteDialog;

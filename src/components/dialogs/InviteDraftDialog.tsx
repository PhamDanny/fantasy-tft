import React, { useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../../firebase/config";
import type { Draft } from "../../types";

interface InviteDraftDialogProps {
  draft: Draft;
  onInviteCreated?: () => void;
}

const InviteDraftDialog: React.FC<InviteDraftDialogProps> = ({
  draft,
  onInviteCreated,
}) => {
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  
  // Get existing invite code if one exists
  const existingInvite = draft.invites ? 
    Object.entries(draft.invites).find(([_, invite]) => invite.status === 'active')?.[0] 
    : null;
  const [inviteCode, setInviteCode] = useState<string | null>(existingInvite || null);

  const handleCreateInvite = async () => {
    // Don't create new invite if one already exists
    if (existingInvite) {
      setInviteCode(existingInvite);
      return;
    }

    setLoading(true);
    setError(null);
    setCopied(false);

    try {
      // Generate invite code
      const code = `draft_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Create invite
      const invite = {
        code,
        createdBy: draft.commissioner,
        createdAt: new Date().toISOString(),
        status: 'active',
        usedCount: 0,
      };

      // Add invite to draft
      const draftRef = doc(db, 'drafts', draft.id);
      await updateDoc(draftRef, {
        [`invites.${code}`]: invite,
      });

      setInviteCode(code);
      onInviteCreated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create invite');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyLink = async () => {
    if (!inviteCode) return;

    try {
      const inviteLink = `${window.location.origin}/drafts/join/${inviteCode}`;
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      setError('Failed to copy link to clipboard');
    }
  };

  // Don't show invite button if draft is full or not pending
  const isFull = Object.keys(draft.teams).length >= draft.settings.teamsLimit;
  if (isFull || draft.status !== 'pending') {
    return null;
  }

  return (
    <>
      <button className="btn btn-outline-primary" onClick={() => setShow(true)}>
        Invite Players
      </button>

      {show && (
        <div
          className="modal fade show d-block"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
        >
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Invite Players to Draft</h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => setShow(false)}
                  aria-label="Close"
                ></button>
              </div>

              <div className="modal-body">
                {error && <div className="alert alert-danger">{error}</div>}

                {inviteCode ? (
                  <div>
                    <p>Share this link with players you want to invite:</p>
                    <div className="input-group mb-3">
                      <input
                        type="text"
                        className="form-control"
                        value={`${window.location.origin}/drafts/join/${inviteCode}`}
                        readOnly
                      />
                      <button
                        className="btn btn-outline-primary"
                        onClick={handleCopyLink}
                      >
                        {copied ? 'Copied!' : 'Copy Link'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-center">
                    <p>Create an invite link to share with other players.</p>
                    <button
                      className="btn btn-primary"
                      onClick={handleCreateInvite}
                      disabled={loading}
                    >
                      {loading ? 'Creating...' : 'Create Invite Link'}
                    </button>
                  </div>
                )}
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShow(false)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default InviteDraftDialog; 
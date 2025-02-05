import React, { useState } from 'react';
import type { Player } from '../../types';

interface WaiverClaimDialogProps {
  show: boolean;
  onClose: () => void;
  onSubmit: (bidAmount: number, dropPlayerId: string | null) => void;
  selectedPlayer: Player;
  roster: string[];
  players: Record<string, Player>;
  maxBid: number;
  isWaiver: boolean;
  loading?: boolean;
}

const WaiverClaimDialog: React.FC<WaiverClaimDialogProps> = ({
  show,
  onClose,
  onSubmit,
  selectedPlayer,
  roster,
  players,
  maxBid,
  isWaiver,
  loading = false,
}) => {
  const [bidAmount, setBidAmount] = useState<number>(0);
  const [dropPlayer, setDropPlayer] = useState<string | null>(null);

  if (!show) return null;

  return (
    <div className="modal d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="modal-dialog">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">
              {isWaiver ? 'Place Waiver Claim' : 'Add Free Agent'}
            </h5>
            <button 
              type="button" 
              className="btn-close" 
              onClick={onClose}
              disabled={loading}
            />
          </div>
          <div className="modal-body">
            <div className="mb-3">
              <label className="form-label">Selected Player</label>
              <div className="form-control">
                {selectedPlayer.name} ({selectedPlayer.region})
              </div>
            </div>

            {isWaiver && (
              <div className="mb-3">
                <label className="form-label">Bid Amount</label>
                <div className="input-group">
                  <span className="input-group-text">$</span>
                  <input
                    type="number"
                    className="form-control"
                    value={bidAmount}
                    onChange={(e) => setBidAmount(Math.max(0, parseInt(e.target.value) || 0))}
                    min="0"
                    max={maxBid}
                  />
                </div>
                <small className="text-muted">Maximum bid: ${maxBid}</small>
              </div>
            )}

            <div className="mb-3">
              <label className="form-label">Drop Player (Optional)</label>
              <select
                className="form-select"
                value={dropPlayer || ""}
                onChange={(e) => setDropPlayer(e.target.value || null)}
              >
                <option value="">No drop - add to roster</option>
                {roster.map((playerId) => (
                  <option key={playerId} value={playerId}>
                    {players[playerId]?.name} ({players[playerId]?.region})
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="modal-footer">
            <button 
              className="btn btn-secondary" 
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={() => onSubmit(bidAmount, dropPlayer)}
              disabled={loading}
            >
              {loading ? "Processing..." : isWaiver ? "Submit Claim" : "Add Player"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WaiverClaimDialog; 
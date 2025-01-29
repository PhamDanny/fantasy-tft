import React, { useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import type { Draft, Player, DraftPick } from '../types';

interface PlayerSelectorProps {
  draft: Draft;
  players: Player[];
  isCurrentTeam: boolean;
}

const PlayerSelector: React.FC<PlayerSelectorProps> = ({
  draft,
  players,
  isCurrentTeam,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);

  const availablePlayers = players.filter(
    player => !draft.picks.some(pick => pick.playerId === player.id)
  );

  const filteredPlayers = availablePlayers.filter(player =>
    player.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    player.region.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getRegionColor = (region: string): string => {
    switch (region.toLowerCase()) {
      case 'na':
        return 'text-primary';
      case 'brazil':
        return 'text-success';
      case 'latam':
        return 'text-warning';
      default:
        return '';
    }
  };

  const handleSelectPlayer = async (player: Player) => {
    if (!isCurrentTeam || loading) return;

    try {
      setLoading(true);

      const currentTeamId = draft.settings.draftOrder[draft.currentPick - 1];
      const newPick: DraftPick = {
        teamId: currentTeamId,
        playerId: player.id,
        round: draft.currentRound,
        pick: draft.currentPick,
        timestamp: new Date().toISOString(),
      };

      // Calculate next pick based on draft type and current position
      let nextRound = draft.currentRound;
      let nextPick = draft.currentPick;

      if (draft.settings.draftType === 'snake') {
        // In snake draft, even rounds go in reverse order
        const isReverseRound = draft.currentRound % 2 === 0;
        
        if (isReverseRound) {
          if (nextPick === 1) {
            nextRound++;
            nextPick = 1;
          } else {
            nextPick--;
          }
        } else {
          if (nextPick === draft.settings.draftOrder.length) {
            nextRound++;
            nextPick = draft.settings.draftOrder.length;
          } else {
            nextPick++;
          }
        }
      } else {
        // In auction draft, just go sequentially
        if (nextPick === draft.settings.draftOrder.length) {
          nextRound++;
          nextPick = 1;
        } else {
          nextPick++;
        }
      }

      // Update draft with new pick
      await updateDoc(doc(db, 'drafts', draft.id), {
        picks: [...draft.picks, newPick],
        currentRound: nextRound,
        currentPick: nextPick,
        status: nextRound > Math.ceil(draft.settings.teamsLimit * 
          (draft.settings.captainSlots + draft.settings.naSlots + 
           draft.settings.brLatamSlots + draft.settings.flexSlots))
          ? 'completed'
          : 'in_progress',
      });
    } catch (error) {
      console.error('Failed to select player:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!isCurrentTeam) return null;

  return (
    <div className="card">
      <div className="card-header">
        <h5 className="mb-0">Select Player</h5>
      </div>
      <div className="card-body">
        <div className="mb-3">
          <input
            type="text"
            className="form-control"
            placeholder="Search players..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="table-responsive" style={{ maxHeight: '400px' }}>
          <table className="table table-hover">
            <thead>
              <tr>
                <th>Name</th>
                <th>Region</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredPlayers.map((player) => (
                <tr key={player.id}>
                  <td>{player.name}</td>
                  <td className={getRegionColor(player.region)}>
                    {player.region}
                  </td>
                  <td>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => handleSelectPlayer(player)}
                      disabled={loading}
                    >
                      Select
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default PlayerSelector; 
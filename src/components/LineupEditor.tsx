import React, { useState, useMemo } from 'react';
import type { Player, PerfectRosterLineup } from '../types';
import { Search } from 'lucide-react';

interface LineupEditorProps {
  players: Record<string, Player>;
  lineup: Partial<PerfectRosterLineup>;
  onSave: (lineup: PerfectRosterLineup) => Promise<void>;
  isLocked: boolean;
  set: number;
}

const LineupEditor: React.FC<LineupEditorProps> = ({
  players,
  lineup,
  onSave,
  isLocked,
  set
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const usedPlayers = useMemo(() => {
    return [
      ...(lineup.captains || []),
      ...(lineup.naSlots || []),
      ...(lineup.brLatamSlots || []),
      ...(lineup.flexSlots || [])
    ].filter(Boolean);
  }, [lineup]);

  const getPlayerTotalQP = (player: Player): number => {
    if (!player.scores) return 0;
    return Object.entries(player.scores)
      .filter(([cup]) => cup.startsWith('cup'))
      .reduce((total, [_, score]) => total + score, 0);
  };

  const filteredPlayers = useMemo(() => {
    const searchLower = searchQuery.toLowerCase();
    
    return Object.entries(players)
      .filter(([_, player]) => (
        player.set === set &&
        (player.name.toLowerCase().includes(searchLower) ||
        player.region.toLowerCase().includes(searchLower))
      ))
      .sort((a, b) => {
        const [, playerA] = a;
        const [, playerB] = b;
        
        const qpA = getPlayerTotalQP(playerA);
        const qpB = getPlayerTotalQP(playerB);

        if (qpA !== qpB) {
          return qpB - qpA;
        }
        
        return playerA.name.localeCompare(playerB.name);
      });
  }, [players, set, searchQuery]);

  const handleSlotClick = async (
    slotType: 'captains' | 'naSlots' | 'brLatamSlots' | 'flexSlots',
    index: number
  ) => {
    if (!selectedPlayer || isLocked) return;

    const player = players[selectedPlayer];
    if (!player) return;

    // Validate player region
    if (slotType === 'naSlots' && player.region !== 'NA') {
      setError('This slot requires an NA player');
      return;
    }
    if (slotType === 'brLatamSlots' && !['BR', 'LATAM'].includes(player.region)) {
      setError('This slot requires a BR/LATAM player');
      return;
    }

    try {
      const newLineup = { ...lineup } as PerfectRosterLineup;
      const slots = newLineup[slotType] as string[];
      slots[index] = selectedPlayer;

      await onSave(newLineup);
      setSelectedPlayer(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update lineup');
    }
  };

  const handleRemovePlayer = async (
    slotType: 'captains' | 'naSlots' | 'brLatamSlots' | 'flexSlots',
    index: number,
    e: React.MouseEvent
  ) => {
    e.stopPropagation();
    if (isLocked) return;

    try {
      const newLineup = { ...lineup } as PerfectRosterLineup;
      const slots = newLineup[slotType] as string[];
      slots[index] = null as any;
      await onSave(newLineup);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove player');
    }
  };

  const renderSlot = (
    slotType: 'captains' | 'naSlots' | 'brLatamSlots' | 'flexSlots',
    index: number
  ) => {
    const slots = lineup[slotType] as string[];
    const playerId = slots[index];
    const player = playerId ? players[playerId] : null;

    return (
      <div 
        className={`d-flex align-items-center p-2 border rounded mb-2 ${
          player ? 'border-dark' : 'border-secondary'
        }`}
        style={{ cursor: isLocked ? 'default' : 'pointer' }}
        onClick={() => !isLocked && handleSlotClick(slotType, index)}
      >
        {player ? (
          <div className="d-flex justify-content-between align-items-center w-100">
            <div>
              <div className="fw-bold">{player.name}</div>
              <small className="text-muted">{player.region}</small>
            </div>
            {!isLocked && (
              <button
                className="btn btn-sm text-danger"
                onClick={(e) => handleRemovePlayer(slotType, index, e)}
                style={{ padding: '4px 8px' }}
              >
                ×
              </button>
            )}
          </div>
        ) : (
          <div className="text-muted w-100">Empty Slot</div>
        )}
      </div>
    );
  };

  return (
    <div className="row">
      <div className="col-md-8">
        <div className="card mb-4">
          <div className="card-header">
            <h5 className="mb-0">My Lineup</h5>
          </div>
          <div className="card-body">
            {error && (
              <div className="alert alert-danger mb-3">{error}</div>
            )}
            
            <div className="alert alert-warning mb-3">
              <strong>Note:</strong> Scoring is based on Qualification Points (QP) earned from the event, not game-to-game placements. 
              Select players playing in Tactician's Trials at your own risk!
            </div>
            
            <div className="mb-4">
              <h6>
                {lineup.captains?.length === 1 ? 'Captain' : 'Captains'} <span className="badge bg-warning text-dark">1.5x Points</span>
              </h6>
              {renderSlot('captains', 0)}
            </div>

            <div className="mb-4">
              <h6>{lineup.naSlots?.length === 1 ? 'NA Player' : 'NA Players'}</h6>
              {Array.from({ length: lineup.naSlots?.length || 0 }).map((_, i) => (
                <div key={i}>{renderSlot('naSlots', i)}</div>
              ))}
            </div>

            <div className="mb-4">
              <h6>{lineup.brLatamSlots?.length === 1 ? 'BR/LATAM Player' : 'BR/LATAM Players'}</h6>
              {renderSlot('brLatamSlots', 0)}
            </div>

            <div className="mb-4">
              <h6>{lineup.flexSlots?.length === 1 ? 'Flex Player' : 'Flex Players'}</h6>
              {Array.from({ length: lineup.flexSlots?.length || 0 }).map((_, i) => (
                <div key={i}>{renderSlot('flexSlots', i)}</div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="col-md-4">
        <div className="card">
          <div className="card-header">
            <div className="input-group">
              <span className="input-group-text">
                <Search size={16} />
              </span>
              <input
                type="text"
                className="form-control"
                placeholder="Search players..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
          <div className="card-body" style={{ maxHeight: '600px', overflowY: 'auto' }}>
            {filteredPlayers.map(([id, player]) => {
              const isUsed = usedPlayers.includes(id);
              const totalQP = getPlayerTotalQP(player);
              
              return (
                <div
                  key={id}
                  className={`d-flex align-items-center p-2 border rounded mb-2 ${
                    selectedPlayer === id ? 'border-primary' : 'border-secondary'
                  }`}
                  style={{ 
                    cursor: isLocked || isUsed ? 'default' : 'pointer',
                    opacity: isUsed ? 0.5 : 1,
                    backgroundColor: isUsed ? '#f8f9fa' : 'white'
                  }}
                  onClick={() => !isLocked && !isUsed && setSelectedPlayer(id)}
                >
                  <div className="w-100">
                    <div className="d-flex justify-content-between align-items-center">
                      <div className="fw-bold">
                        {player.name}
                        {isUsed && (
                          <span className="badge bg-secondary ms-2">In Lineup</span>
                        )}
                      </div>
                      {totalQP > 0 && (
                        <small className="text-muted">{totalQP} QP</small>
                      )}
                    </div>
                    <small className="text-muted">
                      {player.region}
                    </small>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default LineupEditor; 
import React, { useState, useMemo } from 'react';
import type { Player, PerfectRosterLineup, PlayerScores, PerfectRosterChallenge } from '../types';
import { PLAYOFF_SCORES } from '../types';  // Import as value, not type
import { Search } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { DndProvider, useDrag, useDrop, useDragLayer } from 'react-dnd';
import { HTML5Backend, getEmptyImage } from 'react-dnd-html5-backend';

interface LineupEditorProps {
  players: Record<string, Player>;
  lineup: Partial<PerfectRosterLineup>;
  onSave: (lineup: PerfectRosterLineup) => Promise<void>;
  isLocked: boolean;
  set: number;
  currentCup: keyof PlayerScores | 'regionals';  // Allow 'regionals' as a value
  entries: Record<string, PerfectRosterLineup>;
  currentUser: { uid: string };
  challenge: PerfectRosterChallenge;
}

interface DragItem {
  type: 'PLAYER';
  id: string;
  player: Player;
  sourceSlot?: {
    type: 'captains' | 'naSlots' | 'brLatamSlots' | 'flexSlots';
    index: number;
  };
}

interface DroppableSlotProps {
  slotType: 'captains' | 'naSlots' | 'brLatamSlots' | 'flexSlots';
  index: number;
  onDrop: (playerId: string) => void;
  children: React.ReactNode;
}

const formatScore = (score: number): string => {
  return score % 1 === 0 ? score.toFixed(0) : score.toFixed(1);
};

const DroppableSlot: React.FC<DroppableSlotProps> = ({ slotType, onDrop, children }) => {
  const [{ isOver, canDrop }, dropRef] = useDrop<DragItem, void, { isOver: boolean; canDrop: boolean }>({
    accept: 'PLAYER',
    drop: (item) => {
      onDrop(item.id);
    },
    canDrop: (item) => {
      const player = item.player;
      if (slotType === 'naSlots') {
        return player.region === 'NA';
      }
      if (slotType === 'brLatamSlots') {
        return ['BR', 'LAN','LAS','LATAM'].includes(player.region);
      }
      return true;
    },
    collect: monitor => ({
      isOver: !!monitor.isOver(),
      canDrop: !!monitor.canDrop(),
    }),
  });

  return (
    <div 
      ref={dropRef as unknown as React.RefObject<HTMLDivElement>}
      style={{ 
        position: 'relative',
        transition: 'all 0.2s ease',
        transform: isOver ? 'scale(1.02)' : 'scale(1)',
        boxShadow: isOver 
          ? (canDrop 
              ? '0 0 10px rgba(40, 167, 69, 0.5)'  // Green glow for valid
              : '0 0 10px rgba(220, 53, 69, 0.5)')  // Red glow for invalid
          : 'none',
      }}
    >
      {isOver && !canDrop && (
        <div 
          className="position-absolute w-100 h-100 d-flex align-items-center justify-content-center"
          style={{
            backgroundColor: 'rgba(220, 53, 69, 0.1)',
            zIndex: 1,
            top: 0,
            left: 0,
            pointerEvents: 'none',
          }}
        >
          <div className="badge bg-danger">
            Invalid Region
          </div>
        </div>
      )}
      {children}
    </div>
  );
};

// Add this new component for the custom drag layer
const DragPreview: React.FC<{ player: Player; isDarkMode: boolean }> = ({ player, isDarkMode }) => {
  return (
    <div
      className={`d-flex align-items-center p-2 border rounded mb-2 border-secondary`}
      style={{ 
        backgroundColor: isDarkMode ? '#212529' : 'white',
        width: '300px',  // Match the width of the original card
        transform: 'rotate(3deg)',  // Slight rotation for better drag feel
        cursor: 'grabbing',
        position: 'fixed',  // Take it out of document flow
        pointerEvents: 'none',  // Prevent it from interfering with drops
        zIndex: 1000,
      }}
    >
      <div className="w-100">
        <div className="d-flex justify-content-between align-items-center">
          <div className="fw-bold">{player.name}</div>
          <small className="text-muted">
            {Object.entries(player.scores || {})
              .filter(([cup]) => cup.startsWith('cup'))
              .reduce((total, [_, score]) => total + score, 0)} QP
          </small>
        </div>
        <small className="text-muted">{player.region}</small>
      </div>
    </div>
  );
};

const DraggablePlayer: React.FC<{ 
  id: string; 
  player: Player; 
  isUsed: boolean; 
  isDarkMode: boolean;
  onSelect: (id: string) => void;
  isSelected: boolean;
  isLocked: boolean;
}> = ({ 
  id, 
  player, 
  isUsed,
  isDarkMode,
  onSelect,
  isSelected,
  isLocked
}) => {
  const [{ isDragging }, dragRef, dragPreview] = useDrag<DragItem, unknown, { isDragging: boolean }>({
    type: 'PLAYER',
    item: { type: 'PLAYER', id, player },
    collect: monitor => ({
      isDragging: !!monitor.isDragging(),
    }),
    canDrag: !isLocked && !isUsed,
  });

  React.useEffect(() => {
    dragPreview(getEmptyImage());
  }, [dragPreview]);

  const totalQP = Object.entries(player.scores || {})
    .filter(([cup]) => cup.startsWith('cup'))
    .reduce((total, [_, score]) => total + score, 0);

  return (
    <div
      ref={dragRef as unknown as React.RefObject<HTMLDivElement>}
      className={`d-flex align-items-center p-2 border rounded mb-2 ${
        isSelected ? 'border-primary' : 'border-secondary'
      }`}
      style={{ 
        cursor: isLocked || isUsed ? 'default' : 'grab',
        opacity: isDragging ? 0 : isUsed ? 0.5 : 1,
        backgroundColor: isDarkMode 
          ? (isUsed ? '#2d3238' : '#212529')
          : (isUsed ? '#f8f9fa' : 'white'),
        transition: 'all 0.2s ease',
        WebkitUserSelect: 'none',
        MozUserSelect: 'none',
        msUserSelect: 'none',
        userSelect: 'none',
      }}
      onClick={() => !isLocked && !isUsed && onSelect(id)}
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
};

const DragLayer: React.FC = () => {
  const collected = useDragLayer(monitor => ({
    item: monitor.getItem(),
    currentOffset: monitor.getSourceClientOffset(),
    isDragging: monitor.isDragging(),
  }));

  if (!collected.isDragging || !collected.currentOffset) {
    return null;
  }

  return (
    <div style={{
      position: 'fixed',
      pointerEvents: 'none',
      zIndex: 100,
      left: 0,
      top: 0,
      width: '100%',
      height: '100%'
    }}>
      <div style={{
        position: 'absolute',
        transform: `translate(${collected.currentOffset.x}px, ${collected.currentOffset.y}px)`,
        WebkitTransform: `translate(${collected.currentOffset.x}px, ${collected.currentOffset.y}px)`
      }}>
        <DragPreview player={collected.item.player} isDarkMode={false} />
      </div>
    </div>
  );
};

// Add a new component for placed players
const PlacedPlayer: React.FC<{
  player: Player;
  isDarkMode: boolean;
  isLocked: boolean;
  onRemove: (e: React.MouseEvent) => void;
  onDrop: (playerId: string) => void;
  score?: number;
}> = ({ 
  player, 
  isDarkMode, 
  isLocked, 
  onRemove, 
  score 
}) => {
  return (
    <div className={`d-flex align-items-center p-2 border rounded mb-2 ${isDarkMode ? 'bg-dark' : ''}`}>
      <div className="flex-grow-1">
        <a 
          href={player.profileLink}
          target="_blank"
          rel="noopener noreferrer"
          className="text-decoration-none"
          onClick={(e) => e.stopPropagation()}
        >
          {player.name}
        </a>
        <span className="text-muted ms-2">({player.region})</span>
      </div>
      {score !== undefined && (
        <div className="ms-2">
          <span className="badge bg-secondary">
            {formatScore(score)}
          </span>
        </div>
      )}
      {!isLocked && (
        <button
          className="btn btn-sm btn-outline-danger ms-2"
          onClick={onRemove}
        >
          Remove
        </button>
      )}
    </div>
  );
};

// Add formatRank function
const formatRank = (rank: number): string => {
  const lastDigit = rank % 10;
  const lastTwoDigits = rank % 100;

  // Special case for 11th, 12th, 13th
  if (lastTwoDigits >= 11 && lastTwoDigits <= 13) {
    return `${rank}th`;
  }

  // For other numbers, check the last digit
  switch (lastDigit) {
    case 1:
      return `${rank}st`;
    case 2:
      return `${rank}nd`;
    case 3:
      return `${rank}rd`;
    default:
      return `${rank}th`;
  }
};

const getPlayerTotalQP = (player: Player): number => {
  if (!player.scores) return 0;
  return Object.values(player.scores).reduce((total, score) => total + score, 0);
};

const LineupEditor: React.FC<LineupEditorProps> = ({
  players,
  lineup,
  onSave,
  isLocked,
  set,
  currentCup,
  entries,
  currentUser,
  challenge
}) => {
  const { isDarkMode } = useTheme();
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

  const filteredPlayers = useMemo(() => {
    const searchLower = searchQuery.toLowerCase();
    
    return Object.entries(players)
      .filter(([_, player]) => {
        // Make sure player exists and has required fields
        if (!player || typeof player.name !== 'string' || !player.region) return false;
        
        // For regionals challenges, only show qualified players
        if (challenge.type === 'regionals') {
          return player.set === set && 
                 player.regionals?.qualified === true &&
                 (player.name.toLowerCase().includes(searchLower) ||
                  player.region.toLowerCase().includes(searchLower));
        }
        
        // For regular challenges
        return player.set === set &&
               (player.name.toLowerCase().includes(searchLower) ||
                player.region.toLowerCase().includes(searchLower));
      })
      .sort((a, b) => {
        const [, playerA] = a;
        const [, playerB] = b;
        
        // Always sort by QP first
        const qpA = getPlayerTotalQP(playerA);
        const qpB = getPlayerTotalQP(playerB);
        
        if (qpA !== qpB) {
          return qpB - qpA;
        }
        
        // For regionals challenges, use placement as secondary sort
        if (challenge.type === 'regionals') {
          const placementA = playerA.regionals?.placement || 999;
          const placementB = playerB.regionals?.placement || 999;
          if (placementA !== placementB) {
            return placementA - placementB;
          }
        }
        
        // Finally sort by name
        return playerA.name.localeCompare(playerB.name);
      });
  }, [players, set, searchQuery, challenge.type]);

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
    if (slotType === 'brLatamSlots' && !['BR', 'LAN','LAS','LATAM'].includes(player.region)) {
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

  const handleDrop = async (
    slotType: 'captains' | 'naSlots' | 'brLatamSlots' | 'flexSlots',
    index: number,
    playerId: string
  ) => {
    if (isLocked) return;

    const player = players[playerId];
    if (!player) return;

    try {
      const newLineup = { ...lineup } as PerfectRosterLineup;
      
      // Initialize arrays if they don't exist
      newLineup.captains = [...(newLineup.captains || [])];
      newLineup.naSlots = [...(newLineup.naSlots || [])];
      newLineup.brLatamSlots = [...(newLineup.brLatamSlots || [])];
      newLineup.flexSlots = [...(newLineup.flexSlots || [])];

      // Get the current player in the target slot (if any)
      const targetSlots = newLineup[slotType] as string[];
      const existingPlayerId = targetSlots[index];
      const existingPlayer = existingPlayerId ? players[existingPlayerId] : null;

      // Find the source slot of the dragged player
      let sourceSlotType: keyof PerfectRosterLineup | undefined;
      let sourceIndex: number | undefined;

      const slotTypes: (keyof PerfectRosterLineup)[] = ['captains', 'naSlots', 'brLatamSlots', 'flexSlots'];
      slotTypes.forEach(type => {
        const slots = newLineup[type];
        if (Array.isArray(slots)) {
          const idx = slots.indexOf(playerId);
          if (idx !== -1) {
            sourceSlotType = type;
            sourceIndex = idx;
          }
        }
      });

      // Validate both players' new positions
      const isValidMove = (player: Player, slotType: string): boolean => {
        if (slotType === 'naSlots') {
          return player.region === 'NA';
        }
        if (slotType === 'brLatamSlots') {
          return ['BR', 'LAN','LAS','LATAM'].includes(player.region);
        }
        return true; // captains and flex slots accept all regions
      };

      // Check if the dragged player can go in the target slot
      if (!isValidMove(player, slotType)) {
        setError(`${player.name} cannot be placed in ${slotType}`);
        return;
      }

      // If there's an existing player, check if they can go in the source slot
      if (existingPlayer && sourceSlotType && !isValidMove(existingPlayer, sourceSlotType)) {
        setError(`${existingPlayer.name} cannot be placed in ${sourceSlotType}`);
        return;
      }

      // If we get here, both moves are valid
      if (sourceSlotType && sourceIndex !== undefined) {
        (newLineup[sourceSlotType] as string[])[sourceIndex] = existingPlayerId || null as any;
      }

      // Place the dragged player in the new slot
      targetSlots[index] = playerId;

      await onSave(newLineup);
      setSelectedPlayer(null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update lineup');
    }
  };

  const renderSlot = (
    slotType: 'captains' | 'naSlots' | 'brLatamSlots' | 'flexSlots',
    index: number
  ) => {
    const slots = lineup[slotType] as string[];
    const playerId = slots[index];
    const player = playerId ? players[playerId] : null;
    
    let score = 0;
    if (player) {
      if (challenge.type === 'regionals') {
        const placement = player.regionals?.placement;
        if (placement && placement in PLAYOFF_SCORES) {
          score = PLAYOFF_SCORES[placement];
        }
      } else {
        score = player.scores?.[currentCup as keyof PlayerScores] || 0;
      }
    }
    
    const finalScore = slotType === 'captains' ? score * 1.5 : score;

    return (
      <DroppableSlot
        slotType={slotType}
        index={index}
        onDrop={(playerId) => handleDrop(slotType, index, playerId)}
      >
        {player ? (
          <PlacedPlayer
            player={player}
            isDarkMode={isDarkMode}
            isLocked={isLocked}
            onRemove={(e) => handleRemovePlayer(slotType, index, e)}
            onDrop={(newPlayerId) => handleDrop(slotType, index, newPlayerId)}
            score={isLocked ? finalScore : undefined}
          />
        ) : (
          <div 
            className={`d-flex align-items-center p-2 border rounded mb-2 border-secondary ${isDarkMode ? 'bg-dark' : ''}`}
            style={{ cursor: isLocked ? 'default' : 'pointer' }}
            onClick={() => !isLocked && handleSlotClick(slotType, index)}
          >
            <div className="text-muted w-100">Empty Slot</div>
          </div>
        )}
      </DroppableSlot>
    );
  };

  const calculateTotalScore = () => {
    if (!lineup) return 0;

    if (challenge.type === 'regionals') {
      // For regionals, calculate based on placements
      return [
        ...(lineup.captains || []).map(id => {
          const player = players[id];
          const placement = player?.regionals?.placement;
          if (placement && placement in PLAYOFF_SCORES) {
            return PLAYOFF_SCORES[placement] * 1.5; // Captain multiplier
          }
          return 0;
        }),
        ...(lineup.naSlots || []).map(id => {
          const player = players[id];
          const placement = player?.regionals?.placement;
          return placement && placement in PLAYOFF_SCORES ? PLAYOFF_SCORES[placement] : 0;
        }),
        ...(lineup.brLatamSlots || []).map(id => {
          const player = players[id];
          const placement = player?.regionals?.placement;
          return placement && placement in PLAYOFF_SCORES ? PLAYOFF_SCORES[placement] : 0;
        }),
        ...(lineup.flexSlots || []).map(id => {
          const player = players[id];
          const placement = player?.regionals?.placement;
          return placement && placement in PLAYOFF_SCORES ? PLAYOFF_SCORES[placement] : 0;
        })
      ].reduce((a, b) => a + b, 0);
    }

    // Regular challenge scoring using cup scores
    return [
      ...(lineup.captains || []).map(id => {
        const player = players[id];
        if (!player) return 0;
        
        if (challenge.type === 'regionals') {
          const placement = player.regionals?.placement;
          return placement && placement in PLAYOFF_SCORES ? PLAYOFF_SCORES[placement] * 1.5 : 0;
        }
        return (player.scores?.[currentCup as keyof PlayerScores] || 0) * 1.5;
      }),
      ...(lineup.naSlots || []).map(id => {
        const player = players[id];
        if (!player) return 0;
        
        if (challenge.type === 'regionals') {
          const placement = player.regionals?.placement;
          return placement && placement in PLAYOFF_SCORES ? PLAYOFF_SCORES[placement] : 0;
        }
        return player.scores?.[currentCup as keyof PlayerScores] || 0;
      }),
      ...(lineup.brLatamSlots || []).map(id => {
        const player = players[id];
        if (!player) return 0;
        
        if (challenge.type === 'regionals') {
          const placement = player.regionals?.placement;
          return placement && placement in PLAYOFF_SCORES ? PLAYOFF_SCORES[placement] : 0;
        }
        return player.scores?.[currentCup as keyof PlayerScores] || 0;
      }),
      ...(lineup.flexSlots || []).map(id => {
        const player = players[id];
        if (!player) return 0;
        
        if (challenge.type === 'regionals') {
          const placement = player.regionals?.placement;
          return placement && placement in PLAYOFF_SCORES ? PLAYOFF_SCORES[placement] : 0;
        }
        return player.scores?.[currentCup as keyof PlayerScores] || 0;
      })
    ].reduce((a, b) => a + b, 0);
  };

  const calculateRank = () => {
    // Calculate scores for all entries
    const entriesWithScores = Object.values(entries)
      .map(entry => ({
        ...entry,
        totalScore: challenge.type === 'regionals' 
          ? [
              ...entry.captains.map(id => {
                const player = players[id];
                const placement = player?.regionals?.placement;
                return placement && placement in PLAYOFF_SCORES ? PLAYOFF_SCORES[placement] * 1.5 : 0;
              }),
              ...entry.naSlots.map(id => {
                const player = players[id];
                const placement = player?.regionals?.placement;
                return placement && placement in PLAYOFF_SCORES ? PLAYOFF_SCORES[placement] : 0;
              }),
              ...entry.brLatamSlots.map(id => {
                const player = players[id];
                const placement = player?.regionals?.placement;
                return placement && placement in PLAYOFF_SCORES ? PLAYOFF_SCORES[placement] : 0;
              }),
              ...entry.flexSlots.map(id => {
                const player = players[id];
                const placement = player?.regionals?.placement;
                return placement && placement in PLAYOFF_SCORES ? PLAYOFF_SCORES[placement] : 0;
              })
            ].reduce((a, b) => a + b, 0)
          : [
              ...entry.captains.map(id => {
                const player = players[id];
                if (!player) return 0;
                return (player.scores?.[currentCup as keyof PlayerScores] || 0) * 1.5;
              }),
              ...entry.naSlots.map(id => {
                const player = players[id];
                if (!player) return 0;
                return player.scores?.[currentCup as keyof PlayerScores] || 0;
              }),
              ...entry.brLatamSlots.map(id => {
                const player = players[id];
                if (!player) return 0;
                return player.scores?.[currentCup as keyof PlayerScores] || 0;
              }),
              ...entry.flexSlots.map(id => {
                const player = players[id];
                if (!player) return 0;
                return player.scores?.[currentCup as keyof PlayerScores] || 0;
              })
            ].reduce((a, b) => a + b, 0)
      }))
      .sort((a, b) => b.totalScore - a.totalScore);

    // Find the user's entry and determine their actual rank (accounting for ties)
    let currentRank = 1;
    let currentScore = entriesWithScores[0]?.totalScore ?? 0;
    let skipCount = 0;
    let userRank = 1;

    for (let i = 0; i < entriesWithScores.length; i++) {
      const entry = entriesWithScores[i];
      
      if (entry.totalScore !== currentScore) {
        currentRank = currentRank + skipCount + 1;
        currentScore = entry.totalScore;
        skipCount = 0;
      } else if (i > 0) {
        skipCount++;
      }

      if (entry.userId === currentUser.uid) {
        userRank = currentRank;
        break;
      }
    }

    return `${userRank} of ${entriesWithScores.length}`;
  };

  const RegionalsScoringTable = () => (
    <div className="card mb-4">
      <div className="card-header">
        <h5 className="mb-0">Regionals Scoring System</h5>
      </div>
      <div className="card-body">
        <div className="row">
          {[0, 1, 2, 3].map(columnIndex => (
            <div key={columnIndex} className="col-md-3">
              <div className="table-responsive">
                <table className="table table-sm">
                  <thead>
                    <tr>
                      <th>Place</th>
                      <th className="text-end">Pts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: 8 }, (_, i) => i + 1 + (columnIndex * 8)).map(placement => (
                      <tr key={placement}>
                        <td>{formatRank(placement)}</td>
                        <td className="text-end">{PLAYOFF_SCORES[placement]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
        <div className="text-muted small mt-2">
          Note: Captain slots receive 1.5x points
        </div>
      </div>
    </div>
  );

  return (
    <DndProvider backend={HTML5Backend}>
      <DragLayer />
      <div className="row">
        <div className="col-md-8">
          <div className="card mb-4">
            <div className="card-header">
              <div className="d-flex justify-content-between align-items-center">
                <h5 className="mb-0">My Lineup</h5>
                {isLocked && (
                  <div className="d-flex gap-2">
                    <span className="badge bg-primary">
                      Rank: {calculateRank()}
                    </span>
                    <span className="badge bg-success">
                      Total: {formatScore(calculateTotalScore())}
                    </span>
                  </div>
                )}
              </div>
            </div>
            <div className="card-body">
              {error && (
                <div className="alert alert-danger mb-3">{error}</div>
              )}
              
              {isLocked ? (
                <div className={`alert ${isDarkMode ? 'alert-dark' : 'alert-warning'} mb-3`}>
                  <strong>Rosters Locked!</strong> The submission period for this challenge has ended. No further changes can be made to lineups.
                </div>
              ) : (
                <div className="alert alert-warning mb-3">
                  <strong>How to Play:</strong> {
                    challenge.type === 'regionals' 
                      ? "Drag and drop players from the player list into appropriate lineup slots. Scoring is based on overall placement in the event, not game-to-game placements. See below for scoring details."
                      : "Drag and drop players from the player list into appropriate lineup slots. Scoring is based on Qualification Points (QP) earned from the event, not game-to-game placements. Select players playing in Tactician's Trials at your own risk!"
                  }
                </div>
              )}
              
              {(lineup.captains?.length || 0) > 0 && (
                <div className="mb-4">
                  <h6>
                    {lineup.captains?.length === 1 ? 'Captain' : 'Captains'} <span className="badge bg-warning text-dark">1.5x Points</span>
                  </h6>
                  {lineup.captains?.map((_, idx) => (
                    <div key={`captain-${idx}`}>
                      {renderSlot('captains', idx)}
                    </div>
                  ))}
                </div>
              )}

              {(lineup.naSlots?.length || 0) > 0 && (
                <div className="mb-4">
                  <h6>{lineup.naSlots?.length === 1 ? 'NA Player' : 'NA Players'}</h6>
                  {lineup.naSlots?.map((_, idx) => (
                    <div key={`na-${idx}`}>
                      {renderSlot('naSlots', idx)}
                    </div>
                  ))}
                </div>
              )}

              {(lineup.brLatamSlots?.length || 0) > 0 && (
                <div className="mb-4">
                  <h6>{lineup.brLatamSlots?.length === 1 ? 'BR/LATAM Player' : 'BR/LATAM Players'}</h6>
                  {lineup.brLatamSlots?.map((_, idx) => (
                    <div key={`br-${idx}`}>
                      {renderSlot('brLatamSlots', idx)}
                    </div>
                  ))}
                </div>
              )}

              {(lineup.flexSlots?.length || 0) > 0 && (
                <div className="mb-4">
                  <h6>{lineup.flexSlots?.length === 1 ? 'Flex Player' : 'Flex Players'}</h6>
                  <small className="text-muted d-block mb-2">Can be filled by players from any region</small>
                  {lineup.flexSlots?.map((_, idx) => (
                    <div key={`flex-${idx}`}>
                      {renderSlot('flexSlots', idx)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          
          {/* Move RegionalsScoringTable here */}
          {challenge.type === 'regionals' && <RegionalsScoringTable />}
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
                
                return (
                  <DraggablePlayer
                    key={id}
                    id={id}
                    player={player}
                    isUsed={isUsed}
                    isDarkMode={isDarkMode}
                    onSelect={setSelectedPlayer}
                    isSelected={selectedPlayer === id}
                    isLocked={isLocked}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </DndProvider>
  );
};

export default LineupEditor; 
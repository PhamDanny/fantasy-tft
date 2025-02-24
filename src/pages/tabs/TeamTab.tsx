import React, { useState } from "react";
import type { League, Player, Team, CupLineup, PlayerScores } from "../../types";
import { getLeagueType, PLAYOFF_SCORES } from "../../types";  // Import as values, not types
import { updateDoc, doc, runTransaction, collection, addDoc, getDocs } from "firebase/firestore";
import { db } from "../../firebase/config";
import CoOwnerDialog from "../../components/dialogs/CoOwnerDialog";
import { useNavigate } from "react-router-dom";
import { DndProvider, useDrag, useDrop, useDragLayer } from 'react-dnd';
import { HTML5Backend, getEmptyImage } from 'react-dnd-html5-backend';
import type { DropTargetMonitor } from 'react-dnd';

interface TeamTabProps {
  league: League;
  players: Record<string, Player>;
  userTeam: Team | null;
  leagueId: number;
  teams: Record<string, Team>;
  user: any;
}

const TWO_CUP_SETS = ["Set 13"] as const;
type TwoCupSet = typeof TWO_CUP_SETS[number];

// Add interface for user data
interface UserData {
  displayName: string;
  leagues: string[];
}

// Add these interfaces for DnD types
interface DragItem {
  type: 'PLAYER';
  id: string | null;
  slotType: "captains" | "naSlots" | "brLatamSlots" | "flexSlots" | "bench";
  slotIndex: number;
}

// Add this helper function at the top of the file
const formatScore = (score: number): string => {
  return score % 1 === 0 ? score.toFixed(0) : score.toFixed(1);
};

// Create a separate component for bench players
const BenchPlayer: React.FC<{
  playerId: string;
  player: Player;
  isLineupLocked: boolean;
  canEdit: boolean;
  onDrop: (playerId: string) => void;
  loading: boolean;
  selectedCup: CupSelection;
}> = ({ playerId, player, isLineupLocked, canEdit, onDrop, loading, selectedCup }) => {
  const [{ isDragging }, drag, preview] = useDrag<
    DragItem,
    unknown,
    { isDragging: boolean }
  >({
    type: 'PLAYER',
    item: { 
      type: 'PLAYER', 
      id: playerId, 
      slotType: 'bench', 
      slotIndex: -1 
    },
    canDrag: () => !isLineupLocked && canEdit,
    collect: (monitor) => ({
      isDragging: monitor.isDragging()
    })
  });

  React.useEffect(() => {
    preview(getEmptyImage());
  }, [preview]);

  // Create a ref function that properly handles the drag ref
  const ref = (node: HTMLDivElement | null) => {
    drag(node);
  };

  // Calculate the score for the current cup
  const cupKey = `cup${selectedCup}` as keyof PlayerScores;
  const score = player.scores[cupKey] || 0;

  return (
    <div
      ref={ref}
      className={`p-3 border rounded mb-2`}
      style={{ 
        cursor: isLineupLocked || !canEdit ? 'default' : 'grab',
        opacity: isDragging ? 0 : 1,
        transition: 'opacity 0.2s ease'
      }}
    >
      <div className="d-flex justify-content-between align-items-center">
        <div className="d-flex align-items-center">
          <div>
            <span>{player.name}</span>
            <small className="text-muted"> ({player.region})</small>
          </div>
          {score > 0 && (
            <span className="badge bg-secondary ms-2">
              {formatScore(score)}
            </span>
          )}
        </div>
        {canEdit && (
          <button
            className="btn btn-sm btn-outline-danger"
            onClick={(e) => {
              e.stopPropagation();
              onDrop(playerId);
            }}
            disabled={loading}
          >
            Drop
          </button>
        )}
      </div>
    </div>
  );
};

// Update the BenchDropZone component
const BenchDropZone: React.FC<{
  isLineupLocked: boolean;
  canEdit: boolean;
  onDrop: (playerId: string | null) => void;
}> = ({ isLineupLocked, canEdit, onDrop }) => {
  const [{ isOver, canDrop }, dropRef] = useDrop<
    DragItem,
    void,
    { isOver: boolean; canDrop: boolean }
  >({
    accept: 'PLAYER',
    canDrop: () => !isLineupLocked && canEdit,
    drop: (item: DragItem) => {
      if (item.id) {
        onDrop(item.id);
      }
    },
    collect: (monitor: DropTargetMonitor<DragItem>) => ({
      isOver: monitor.isOver(),
      canDrop: monitor.canDrop()
    })
  });

  // Create a ref function that properly handles the drop ref
  const ref = React.useCallback((node: HTMLDivElement | null) => {
    if (node) {
      dropRef(node);
    }
  }, [dropRef]);

  return (
    <div
      ref={ref}
      className={`p-3 border rounded mb-3 text-center ${
        isOver && canDrop 
          ? 'bg-primary bg-opacity-25 border-primary border-2' 
          : canDrop 
            ? 'border-primary border-2' 
            : 'border-dashed'
      }`}
      style={{ 
        minHeight: '60px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all 0.2s ease'
      }}
    >
      <span className={`text-muted ${canDrop ? 'text-primary' : ''}`}>
        {isOver && canDrop 
          ? 'Drop to move to bench' 
          : canDrop 
            ? 'Drop here to move to bench'
            : 'Drag players here to move them to bench'
        }
      </span>
    </div>
  );
};

// Add this new component at the top level
const DragPreview: React.FC<{ player: Player }> = ({ player }) => {
  return (
    <div
      className="p-3 border rounded bg-white"
      style={{ 
        width: '300px',
        transform: 'rotate(3deg)',
        cursor: 'grabbing',
        boxShadow: '0 5px 15px rgba(0,0,0,0.15)',
        opacity: 1,
        backgroundColor: 'white',
        zIndex: 1000,
        pointerEvents: 'none',  // Make sure it doesn't interfere with drops
      }}
    >
      <div className="d-flex justify-content-between align-items-center">
        <div>
          <span className="fw-bold">{player.name}</span>
          <small className="text-muted"> ({player.region})</small>
        </div>
      </div>
    </div>
  );
};

// Create a separate LineupSlot component
const LineupSlot: React.FC<{
  slotType: "captains" | "naSlots" | "brLatamSlots" | "flexSlots";
  playerId: string | null;
  index: number;
  showScore: boolean;
  isLineupLocked: boolean;
  canEdit: boolean;
  players: Record<string, Player>;
  selectedCup: CupSelection;
  league: League;
  onSlotClick: (slotType: "captains" | "naSlots" | "brLatamSlots" | "flexSlots", playerId: string | null, index: number) => void;
  onDropPlayer: (playerId: string) => void;
}> = ({ 
  slotType, 
  playerId, 
  index, 
  showScore, 
  isLineupLocked, 
  canEdit, 
  players,
  selectedCup,
  league,
  onSlotClick,
  onDropPlayer 
}) => {
  const player = playerId ? players[playerId] : null;
  
  // Update score calculation to handle regionals leagues
  let finalScore = 0;
  if (player) {
    if (getLeagueType(league) === 'regionals') {
      // For regionals, use placement to determine score
      const placement = player.regionals?.placement;
      if (placement && placement in PLAYOFF_SCORES) {
        const score = PLAYOFF_SCORES[placement];
        finalScore = slotType === "captains" ? score * 1.5 : score;
      }
    } else if (typeof selectedCup === 'number') {
      const cupKey = `cup${selectedCup}` as keyof PlayerScores;
      const score = player.scores?.[cupKey] || 0;
      finalScore = slotType === "captains" ? score * 1.5 : score;
    }
  }

  const [{ isDragging }, drag, preview] = useDrag<DragItem, unknown, { isDragging: boolean }>({
    type: 'PLAYER',
    item: { type: 'PLAYER', id: playerId, slotType, slotIndex: index },
    canDrag: () => !isLineupLocked && canEdit && playerId !== null,
    collect: (monitor) => ({
      isDragging: monitor.isDragging()
    })
  });

  const [{ isOver, canDrop }, drop] = useDrop<DragItem, void, { isOver: boolean; canDrop: boolean }>({
    accept: 'PLAYER',
    canDrop: (item) => {
      if (!canEdit || isLineupLocked) return false;
      const draggedPlayer = item.id ? players[item.id] : null;
      if (!draggedPlayer) return false;
      
      // Allow drops from bench or other slots
      switch (slotType) {
        case "captains":
          return true; // Captains can accept any player
        case "naSlots":
          return draggedPlayer.region === "NA";
        case "brLatamSlots":
          return ["BR", "LAN", "LAS", "LATAM"].includes(draggedPlayer.region);
        case "flexSlots":
          return true; // Flex slots can accept any player
        default:
          return false;
      }
    },
    drop: (item) => {
      if (item.id) {
        // Call onSlotClick directly with the dragged player's ID
        onSlotClick(slotType, item.id, index);
      }
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
      canDrop: monitor.canDrop()
    })
  });

  React.useEffect(() => {
    preview(getEmptyImage());
  }, [preview]);

  const ref = (node: HTMLDivElement | null) => {
    drag(node);
    drop(node);
  };

  let className = `d-flex align-items-center p-2 border rounded mb-2 `;
  if (isOver) {
    className += canDrop ? "border-primary bg-primary bg-opacity-10 " : "border-danger bg-danger bg-opacity-10 ";
  }

  return (
    <div
      ref={ref}
      className={className}
      style={{ 
        cursor: isLineupLocked || !canEdit ? 'default' : 'grab',
        opacity: isDragging ? 0 : 1,
        transition: 'all 0.2s ease'
      }}
      onClick={() => {
        if (!isLineupLocked && canEdit) {
          onSlotClick(slotType, playerId, index);
        }
      }}
    >
      {player ? (
        <>
          <div className="flex-grow-1">
            <a 
              href={player.profileLink}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-decoration-none"
            >
              {player.name}
            </a>
            <span className="text-muted ms-2">({player.region})</span>
          </div>
          {showScore && finalScore > 0 && (
            <div className="ms-2">
              <span className="badge bg-secondary">
                {formatScore(finalScore)}
              </span>
            </div>
          )}
          {!isLineupLocked && canEdit && (
            <button
              className="btn btn-sm btn-outline-danger ms-2"
              onClick={(e) => {
                e.stopPropagation();
                if (playerId) {
                  onDropPlayer(playerId);
                }
              }}
            >
              Drop
            </button>
          )}
        </>
      ) : (
        <div className="text-muted">Empty Slot</div>
      )}
    </div>
  );
};

// Add a type for cup selection
type CupSelection = number | 'regionals';

// Add type for slot keys
type SlotKey = 'captainSlots' | 'naSlots' | 'brLatamSlots' | 'flexSlots';

const TeamTab: React.FC<TeamTabProps> = ({
  league,
  players,
  userTeam,
  leagueId,
  teams,
  user,
}) => {
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState<string>("");
  const [selectedCup, setSelectedCup] = useState<CupSelection>(() => {
    // For regionals leagues, use 'regionals'
    if (getLeagueType(league) === 'regionals') {
      return 'regionals';
    }
    // For playoffs, use cup 4
    if (league.settings.playoffs && league.settings.playoffSettings?.playoffAuctionStarted) {
      return 4;
    }
    // Regular cup logic for other leagues
    const upcomingCup = Math.min(league.settings.currentCup + 1, 3);
    const maxCups = TWO_CUP_SETS.includes(league.season as TwoCupSet) ? 2 : 3;
    return Math.min(upcomingCup, maxCups);
  });
  const [showCoOwnerDialog, setShowCoOwnerDialog] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  if (!userTeam) {
    return <div>You don't have a team in this league.</div>;
  }

  // Get the currently selected team
  const selectedTeam = teams[selectedTeamId] || userTeam;

  // Simple ownership check - it's the same team whether regular season or playoffs
  const canEdit = selectedTeam?.ownerID === user?.uid || 
                 selectedTeam?.coOwners?.includes(user?.uid);

  // Simple check if team is in playoffs
  const isInPlayoffs = league.settings?.playoffs && selectedTeam.playoffRoster;

  // Initialize cupLineups if it doesn't exist
  if (!selectedTeam.cupLineups) {
    selectedTeam.cupLineups = {};
  }

  const getCupLineup = (cupNumber: number): CupLineup => {
    const cupKey = `cup${cupNumber}` as keyof typeof selectedTeam.cupLineups;
    const existingLineup = selectedTeam.cupLineups[cupKey];


    if (existingLineup) {
      // Return the existing lineup directly instead of creating a new object
      return existingLineup;
    }

    // Create new empty lineup only if one doesn't exist
    return {
      captains: Array(league.settings?.captainSlots || 0).fill(null),
      naSlots: Array(league.settings?.naSlots || 0).fill(null),
      brLatamSlots: Array(league.settings?.brLatamSlots || 0).fill(null),
      flexSlots: Array(league.settings?.flexSlots || 0).fill(null),
      bench: [],
      locked: cupNumber <= (league.settings?.currentCup || 0),
    };
  };

  const getLineup = (cupSelection: CupSelection): CupLineup => {
    if (cupSelection === 'regionals' || getLeagueType(league) === 'regionals') {
      return selectedTeam.regionalsLineup || {
        captains: Array(league.settings.captainSlots || 1).fill(null),
        naSlots: Array(league.settings.naSlots || 0).fill(null),
        brLatamSlots: Array(league.settings.brLatamSlots || 0).fill(null),
        flexSlots: Array(league.settings.flexSlots || 3).fill(null),
        bench: [],
        locked: false
      };
    }

    // Special handling for playoffs (cup 4)
    if (cupSelection === 4) {
      const playoffSettings = league.settings.playoffSettings || {
        captainSlots: 1,
        naSlots: 1,
        brLatamSlots: 1,
        flexSlots: 3
      };

      return {
        ...selectedTeam.playoffLineup || {
          captains: Array(playoffSettings.captainSlots).fill(null),
          naSlots: Array(playoffSettings.naSlots).fill(null),
          brLatamSlots: Array(playoffSettings.brLatamSlots).fill(null),
          flexSlots: Array(playoffSettings.flexSlots).fill(null),
          bench: []
        },
        locked: false
      };
    }

    // Regular cup logic...
    return getCupLineup(cupSelection as number);
  };

  const lineup = getLineup(selectedCup);
  const isLineupLocked = (getLeagueType(league) === 'regionals' 
    ? (lineup.locked || selectedTeam.roster.some(id => {
        const player = players[id];
        return player?.regionals?.placement !== undefined && player.regionals.placement > 0;
      }))
    : selectedCup === 4 
      ? selectedTeam.playoffRoster?.some(id => {
          const player = players[id];
          return player?.regionals?.placement !== undefined && player.regionals.placement > 0;
        }) ?? false
      : typeof selectedCup === 'number' 
        ? selectedCup <= (league.settings?.currentCup || 0)
        : false) ?? false;

  // Calculate bench as players not in starting lineup
  const getBenchPlayers = () => {
    const startingPlayers = new Set(
      [
        ...lineup.captains,
        ...lineup.naSlots,
        ...lineup.brLatamSlots,
        ...lineup.flexSlots,
      ].filter(Boolean)
    );

    // Use playoff roster when in playoffs (cup 4)
    const rosterToUse = selectedCup === 4
      ? (selectedTeam.playoffRoster || [])
      : selectedTeam.roster;

    return rosterToUse
      .filter(playerId => !startingPlayers.has(playerId))
      .map(playerId => {
        const player = players[playerId];
        if (!player) return null;

        return (
          <BenchPlayer
            key={playerId}
            playerId={playerId}
            player={player}
            isLineupLocked={isLineupLocked}
            canEdit={canEdit}
            onDrop={handleDropPlayer}
            loading={loading}
            selectedCup={selectedCup}
          />
        );
      });
  };

  const getPlayerCurrentSlot = (
    playerId: string,
    lineup: CupLineup
  ): { slotType: "captains" | "naSlots" | "brLatamSlots" | "flexSlots"; index: number } | null => {
    if (lineup.captains.includes(playerId)) {
      return { slotType: "captains", index: lineup.captains.indexOf(playerId) };
    }
    if (lineup.naSlots.includes(playerId)) {
      return { slotType: "naSlots", index: lineup.naSlots.indexOf(playerId) };
    }
    if (lineup.brLatamSlots.includes(playerId)) {
      return {
        slotType: "brLatamSlots",
        index: lineup.brLatamSlots.indexOf(playerId),
      };
    }
    if (lineup.flexSlots.includes(playerId)) {
      return { slotType: "flexSlots", index: lineup.flexSlots.indexOf(playerId) };
    }
    return null;
  };

  const handleSlotClick = async (
    slotType: "captains" | "naSlots" | "brLatamSlots" | "flexSlots",
    draggedPlayerId: string | null,
    slotIndex: number
  ) => {
    if (!selectedTeam || isLineupLocked || !canEdit || !draggedPlayerId) return;

    try {
      const newLineup = { ...lineup };
      const targetSlots = newLineup[slotType];
      const existingPlayerId = targetSlots[slotIndex];
      const draggedPlayer = players[draggedPlayerId];

      // Check if the dragged player can legally go in the target slot
      const canDraggedPlayerGoToNewSlot =
        slotType === "captains" ||
        slotType === "flexSlots" ||
        (slotType === "naSlots" && draggedPlayer.region === "NA") ||
        (slotType === "brLatamSlots" && ["BR", "LAN", "LAS", "LATAM"].includes(draggedPlayer.region));

      if (!canDraggedPlayerGoToNewSlot) {
        return; // Invalid move for this player's region
      }

      // Find where the dragged player is coming from
      const draggedPlayerCurrentSlot = getPlayerCurrentSlot(draggedPlayerId, lineup);

      // Handle the swap/move
      if (existingPlayerId) {
        // This is a swap
        const existingPlayer = players[existingPlayerId];
        
        if (draggedPlayerCurrentSlot) {
          // Player is coming from another lineup slot
          const canExistingPlayerGoToDraggedSlot = 
            draggedPlayerCurrentSlot.slotType === "captains" || 
            draggedPlayerCurrentSlot.slotType === "flexSlots" ||
            (draggedPlayerCurrentSlot.slotType === "naSlots" && existingPlayer.region === "NA") ||
            (draggedPlayerCurrentSlot.slotType === "brLatamSlots" && 
              ["BR", "LAN", "LAS", "LATAM"].includes(existingPlayer.region));

          if (canExistingPlayerGoToDraggedSlot) {
            // Perform the swap
            const sourceSlots = newLineup[draggedPlayerCurrentSlot.slotType] as (string | null)[];
            sourceSlots[draggedPlayerCurrentSlot.index] = existingPlayerId;
            targetSlots[slotIndex] = draggedPlayerId;
          } else {
            // If existing player can't go to source slot, move them to bench
            targetSlots[slotIndex] = draggedPlayerId;
            // Remove dragged player from old position
            const sourceSlots = newLineup[draggedPlayerCurrentSlot.slotType] as (string | null)[];
            sourceSlots[draggedPlayerCurrentSlot.index] = null;
          }
        } else {
          // Player is coming from bench, just replace the existing player
          targetSlots[slotIndex] = draggedPlayerId;
        }
      } else {
        // No existing player in target slot
        if (draggedPlayerCurrentSlot) {
          // Remove from old position if coming from lineup
          const sourceSlots = newLineup[draggedPlayerCurrentSlot.slotType] as (string | null)[];
          sourceSlots[draggedPlayerCurrentSlot.index] = null;
        }
        // Place in new position
        targetSlots[slotIndex] = draggedPlayerId;
      }

      // Update Firebase based on league type
      if (getLeagueType(league) === 'regionals') {
        await updateDoc(
          doc(db, "leagues", leagueId.toString(), "teams", selectedTeam.teamId),
          {
            regionalsLineup: newLineup,
          }
        );
      } else if (selectedCup === 4) {
        await updateDoc(
          doc(db, "leagues", leagueId.toString(), "teams", selectedTeam.teamId),
          {
            playoffLineup: newLineup,
          }
        );
      } else {
        const cupKey = `cup${selectedCup}` as keyof typeof selectedTeam.cupLineups;
        await updateDoc(
          doc(db, "leagues", leagueId.toString(), "teams", selectedTeam.teamId),
          {
            [`cupLineups.${cupKey}`]: newLineup,
          }
        );
      }

      setSelectedPlayer(null);
    } catch (error) {
      console.error("Failed to update lineup:", error);
    }
  };

  const handleDropPlayer = async (playerId: string) => {
    if (!window.confirm(`Are you sure you want to drop ${players[playerId]?.name}?`)) {
      return;
    }

    setLoading(true);

    try {
      const teamRef = doc(db, "leagues", leagueId.toString(), "teams", selectedTeam.teamId);
      const newRoster = [...selectedTeam.roster];
      const dropIndex = newRoster.indexOf(playerId);
      if (dropIndex !== -1) {
        newRoster.splice(dropIndex, 1);
      }

      // Create drop transaction
      const transaction = {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        type: 'drop' as const,
        teamIds: [selectedTeam.teamId],
        adds: {},
        drops: { [selectedTeam.teamId]: [playerId] },
        metadata: {
          type: 'drop',
          playerNames: {
            [playerId]: {
              name: players[playerId]?.name || 'Unknown Player',
              region: players[playerId]?.region || 'Unknown Region'
            }
          }
        }
      };

      const updates: any = {
        roster: newRoster
      };

      // Remove player from future cup lineups (after current cup)
      const currentCup = league.settings?.currentCup || 0;
      if (selectedTeam.cupLineups) {
        for (let cupNumber = currentCup + 1; cupNumber <= 3; cupNumber++) {
          const cupKey = `cup${cupNumber}` as keyof typeof selectedTeam.cupLineups;
          if (selectedTeam.cupLineups[cupKey]) {
            const newLineup = {
              ...selectedTeam.cupLineups[cupKey],
              captains: selectedTeam.cupLineups[cupKey].captains.map((id: string | null) => 
                id === playerId ? null : id
              ),
              naSlots: selectedTeam.cupLineups[cupKey].naSlots.map((id: string | null) => 
                id === playerId ? null : id
              ),
              brLatamSlots: selectedTeam.cupLineups[cupKey].brLatamSlots.map((id: string | null) => 
                id === playerId ? null : id
              ),
              flexSlots: selectedTeam.cupLineups[cupKey].flexSlots.map((id: string | null) => 
                id === playerId ? null : id
              ),
            };
            updates[`cupLineups.${cupKey}`] = newLineup;
          }
        }
      }

      // Only update the roster - preserve all cup lineups
      await updateDoc(doc(db, "leagues", leagueId.toString()), {
        transactions: [...league.transactions, transaction]
      });

      // If in playoffs, also remove from playoff roster if present
      if (league.settings?.playoffs && selectedTeam.playoffRoster) {
        const newPlayoffRoster = selectedTeam.playoffRoster.filter(id => id !== playerId);
        updates.playoffRoster = newPlayoffRoster;
      }

      await updateDoc(teamRef, updates);
    } catch (err) {
      console.error(err instanceof Error ? err.message : "Failed to drop player");
    } finally {
      setLoading(false);
    }
  };

  // Update the handleMoveToBench function
  const handleMoveToBench = async (playerId: string | null) => {
    if (!playerId || !selectedTeam || isLineupLocked || !canEdit) return;

    try {
      const newLineup = {
        ...lineup,
        captains: lineup.captains.map(id => id === playerId ? null : id),
        naSlots: lineup.naSlots.map(id => id === playerId ? null : id),
        brLatamSlots: lineup.brLatamSlots.map(id => id === playerId ? null : id),
        flexSlots: lineup.flexSlots.map(id => id === playerId ? null : id),
      };

      // Update Firebase based on league type
      if (getLeagueType(league) === 'regionals') {
        await updateDoc(
          doc(db, "leagues", leagueId.toString(), "teams", selectedTeam.teamId),
          {
            regionalsLineup: newLineup,
          }
        );
      } else if (selectedCup === 4) { // Changed from 0 to 4
        await updateDoc(
          doc(db, "leagues", leagueId.toString(), "teams", selectedTeam.teamId),
          {
            playoffLineup: newLineup,
          }
        );
      } else {
        const cupKey = `cup${selectedCup}` as keyof typeof selectedTeam.cupLineups;
        await updateDoc(
          doc(db, "leagues", leagueId.toString(), "teams", selectedTeam.teamId),
          {
            [`cupLineups.${cupKey}`]: newLineup,
          }
        );
      }

      setSelectedPlayer(null);
    } catch (error) {
      console.error("Failed to move player to bench:", error);
    }
  };

  const handleLeaveLeague = async () => {
    if (!user) return;

    if (!window.confirm('Are you sure you want to leave this league?')) {
      return;
    }

    // Get user's team from the teams subcollection
    const teamsRef = collection(db, "leagues", leagueId.toString(), "teams");
    const teamSnapshot = await getDocs(teamsRef);
    const userTeam = teamSnapshot.docs.find(doc => {
      const data = doc.data() as Team;
      return data.ownerID === user.uid || data.coOwners?.includes(user.uid);
    });

    if (!userTeam) return;

    setLoading(true);
    const teamData = userTeam.data() as Team;
    const teamId = userTeam.id;
    const isOwner = teamData.ownerID === user.uid;

    try {
      await runTransaction(db, async (transaction) => {
        const userRef = doc(db, "users", user.uid);
        const userDoc = await transaction.get(userRef);
        const userName = userDoc.exists() ? userDoc.data().displayName : "Unknown User";

        // Remove league from user's leagues array
        const userData = userDoc.data() as UserData;
        transaction.update(userRef, {
          leagues: userData.leagues.filter(id => id !== leagueId.toString())
        });

        const teamRef = doc(db, "leagues", leagueId.toString(), "teams", teamId);

        if (isOwner) {
          if (!teamData.coOwners || teamData.coOwners.length === 0) {
            // Delete the team if no co-owners
            transaction.delete(teamRef);

            // Add system message
            await addDoc(collection(db, "leagues", leagueId.toString(), "chat"), {
              userId: "system",
              userName: "System",
              content: `Team "${teamData.teamName}" has been disbanded as ${userName} left the league.`,
              timestamp: new Date().toISOString(),
              type: "system"
            });
          } else {
            // Promote random co-owner to owner
            const newOwner = teamData.coOwners[Math.floor(Math.random() * teamData.coOwners.length)];
            const newOwnerDoc = await transaction.get(doc(db, "users", newOwner));
            const newOwnerName = newOwnerDoc.exists() ? newOwnerDoc.data().displayName : "Unknown User";
            const updatedCoOwners = teamData.coOwners.filter((id: string) => id !== newOwner);

            transaction.update(teamRef, {
              ownerID: newOwner,
              coOwners: updatedCoOwners
            });

            // Add system message
            await addDoc(collection(db, "leagues", leagueId.toString(), "chat"), {
              userId: "system",
              userName: "System",
              content: `${userName} has left the league. ${newOwnerName} is now the owner of team "${teamData.teamName}".`,
              timestamp: new Date().toISOString(),
              type: "system"
            });
          }
        } else {
          // Handle leaving as co-owner
          const updatedCoOwners = teamData.coOwners.filter((id: string) => id !== user.uid);
          
          transaction.update(teamRef, {
            coOwners: updatedCoOwners
          });

          // Add system message
          await addDoc(collection(db, "leagues", leagueId.toString(), "chat"), {
            userId: "system",
            userName: "System",
            content: `${userName} has left as co-owner of team "${teamData.teamName}".`,
            timestamp: new Date().toISOString(),
            type: "system"
          });
        }
      });

      navigate('/');
    } catch (error) {
      console.error("Error leaving league:", error);
      setError("Failed to leave league");
    } finally {
      setLoading(false);
    }
  };

  // Update the renderSlot function to use the new component
  const renderSlot = (
    slotType: "captains" | "naSlots" | "brLatamSlots" | "flexSlots",
    playerId: string | null,
    index: number,
    showScore: boolean
  ) => {
    return (
      <LineupSlot
        slotType={slotType}
        playerId={playerId}
        index={index}
        showScore={showScore}
        isLineupLocked={isLineupLocked}
        canEdit={canEdit}
        players={players}
        selectedCup={selectedCup}
        league={league}
        onSlotClick={handleSlotClick}
        onDropPlayer={handleDropPlayer}
      />
    );
  };

  // Add this at the top level of the TeamTab component
  const CustomDragLayer = () => {
    const { isDragging, item, currentOffset } = useDragLayer((monitor) => ({
      item: monitor.getItem(),
      currentOffset: monitor.getSourceClientOffset(),
      isDragging: monitor.isDragging(),
    }));

    if (!isDragging || !currentOffset || !item?.id) {
      return null;
    }

    const player = players[item.id];
    if (!player) return null;

    return (
      <div style={{
        position: 'fixed',
        pointerEvents: 'none',
        zIndex: 100,
        left: 0,
        top: 0,
        transform: `translate(${currentOffset.x}px, ${currentOffset.y}px)`
      }}>
        <DragPreview player={player} />
      </div>
    );
  };

  const getTournamentWarning = () => {
    if (selectedCup === 4 && !isInPlayoffs) {
      return (
        <div className="alert alert-warning mt-3">
          This team did not qualify for playoffs.
        </div>
      );
    }
  };

  // Update the lineup card header
  const getCardHeader = () => {
    if (selectedCup === 4) {
      return 'Playoff Lineup';
    }
    if (getLeagueType(league) === 'regionals' || selectedCup === 'regionals') {
      return 'Regionals Lineup';
    }
    return `Cup ${selectedCup} Lineup`;
  };

  // Update the getSlotCount function to use cup 4 for playoffs
  const getSlotCount = (slotType: SlotKey): number => {
    if (selectedCup === 4) {  // Changed from 0 to 4
      const playoffSettings = league.settings.playoffSettings || {
        captainSlots: 1,
        naSlots: 1,
        brLatamSlots: 1,
        flexSlots: 3
      };
      return playoffSettings[slotType];
    }
    return league.settings[slotType];
  };

  return (
    <div className="row">
      <CustomDragLayer />
      
      {/* Add error display */}
      {error && (
        <div className="col-12 mb-3">
          <div className="alert alert-danger alert-dismissible fade show" role="alert">
            {error}
            <button 
              type="button" 
              className="btn-close" 
              onClick={() => setError(null)} 
              aria-label="Close"
            />
          </div>
        </div>
      )}
      
      {/* Add the warning at the top */}
      {getTournamentWarning()}

      <div className="col-12 mb-4">
        <div className="d-flex gap-3 align-items-center mb-4">
          <div className="flex-grow-1">
            <label className="form-label">Select Team</label>
            <select
              className="form-select"
              value={selectedTeam?.teamId || ""}
              onChange={(e) => {
                const teamId = e.target.value;
                setSelectedTeamId(teamId);
              }}
            >
              {Object.values(teams).map((team) => (
                <option key={team.teamId} value={team.teamId}>
                  {team.teamName}{" "}
                  {team.ownerID === user?.uid || team.coOwners?.includes(user?.uid) ? "(Your Team)" : ""}
                </option>
              ))}
            </select>
          </div>
          {!canEdit && (
            <div className="alert alert-info mb-0">
              Viewing {selectedTeam?.teamName}'s lineup (read-only)
            </div>
          )}
        </div>

        <div className="col-md-9">
          {/* Cup Selection and Manage Co-Owners */}
          <div className="d-flex justify-content-between align-items-center mb-4">
            <div className="btn-group">
              {getLeagueType(league) === 'regionals' ? (
                null
              ) : (
                <>
                  {Array.from({ length: TWO_CUP_SETS.includes(league.season as TwoCupSet) ? 2 : 3 }, (_, i) => i + 1).map((cupNumber) => {
                    const isLocked = cupNumber <= league.settings.currentCup;
                    return (
                      <button
                        key={cupNumber}
                        className={`btn ${selectedCup === cupNumber ? 'btn-primary' : 'btn-outline-primary'}`}
                        onClick={() => setSelectedCup(cupNumber)}
                      >
                        Cup {cupNumber}
                        {isLocked && (
                          <i className="bi bi-lock-fill ms-1" title="Cup lineup is locked"></i>
                        )}
                      </button>
                    );
                  })}
                  {/* Show Playoffs button instead of Regionals */}
                  {league.settings.playoffs && league.settings.playoffSettings?.playoffAuctionStarted && isInPlayoffs && (
                    <button
                      className={`btn btn-${selectedCup === 4 ? "primary" : "outline-primary"}`}
                      onClick={() => setSelectedCup(4)}
                    >
                      Playoffs
                    </button>
                  )}
                </>
              )}
            </div>
            
            {selectedTeam?.ownerID === user?.uid && (
              <div className="btn-group">
                <button
                  className="btn btn-outline-primary"
                  onClick={() => setShowCoOwnerDialog(true)}
                >
                  Manage Co-Owners
                </button>
                <button
                  className="btn btn-outline-primary"
                  onClick={() => {
                    const newName = prompt("Enter new team name (20 characters max):", selectedTeam.teamName);
                    if (newName && newName.trim() && newName !== selectedTeam.teamName) {
                      if (newName.length > 20) {
                        alert("Team name must be 20 characters or less");
                        return;
                      }
                      updateDoc(
                        doc(db, "leagues", leagueId.toString(), "teams", selectedTeam.teamId),
                        {
                          teamName: newName.trim()
                        }
                      ).catch(error => {
                        console.error("Failed to update team name:", error);
                      });
                    }
                  }}
                >
                  Change Team Name
                </button>
              </div>
            )}
          </div>

          {/* Lineup Editor */}
          <div className="row">
            {!isLineupLocked ? (
              <div className="col-12 mb-4">
                <div className="alert alert-info">
                  Drag and drop players between slots to set your lineup. 
                  Players can only be placed in slots matching their region, Captain and Flex slots can be filled by any player.
                </div>
              </div>
            ) : (
              <div className="col-12 mb-4">
                <div className="alert alert-info">
                  Rosters for this tournament have been locked. Only commissioners can edit lineups after the tournament has started. 
                  Scores recorded during the tournament are not final and may not be perfectly accurate until the tournament has completed.
                </div>
              </div>
            )}

            <div className="col-md-8">
              <div className="card mb-4">
                <div className="card-header">
                  <h4 className="card-title mb-0">
                    {getCardHeader()}
                  </h4>
                </div>
                <div className="card-body">
                  {selectedCup !== 0 || isInPlayoffs ? (
                    <>
                      {getSlotCount('captainSlots') > 0 && (
                        <div className="mb-4">
                          <label className="form-label">Captain (1.5x Points)</label>
                          {Array(getSlotCount('captainSlots')).fill(null).map((_, index) => (
                            <div key={index} className="mb-2">
                              {renderSlot("captains", lineup.captains[index], index, true)}
                            </div>
                          ))}
                        </div>
                      )}

                      {getSlotCount('naSlots') > 0 && (
                        <div className="mb-4">
                          <label className="form-label">NA</label>
                          {Array(getSlotCount('naSlots')).fill(null).map((_, index) => (
                            <div key={index} className="mb-2">
                              {renderSlot("naSlots", lineup.naSlots[index], index, true)}
                            </div>
                          ))}
                        </div>
                      )}

                      {getSlotCount('brLatamSlots') > 0 && (
                        <div className="mb-4">
                          <label className="form-label">BR/LATAM</label>
                          {Array(getSlotCount('brLatamSlots')).fill(null).map((_, index) => (
                            <div key={index} className="mb-2">
                              {renderSlot("brLatamSlots", lineup.brLatamSlots[index], index, true)}
                            </div>
                          ))}
                        </div>
                      )}

                      {getSlotCount('flexSlots') > 0 && (
                        <div className="mb-4">
                          <label className="form-label">Flex</label>
                          {Array(getSlotCount('flexSlots')).fill(null).map((_, index) => (
                            <div key={index} className="mb-2">
                              {renderSlot("flexSlots", lineup.flexSlots[index], index, true)}
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="col-md-4">
              <div className="card">
                <div className="card-header">
                  <h4 className="card-title mb-0">Bench</h4>
                </div>
                <div className="card-body">
                  {!isLineupLocked && canEdit && (
                    <BenchDropZone
                      isLineupLocked={isLineupLocked}
                      canEdit={canEdit}
                      onDrop={handleMoveToBench}
                    />
                  )}

                  <div className="list-group">
                    {/* Show temporary "Move to Bench" option when a starting player is selected */}
                    {selectedPlayer && canEdit && getPlayerCurrentSlot(selectedPlayer, lineup) && (
                      <div
                        className="list-group-item list-group-item-action border-primary mb-2"
                        onClick={() => {
                          if (!isLineupLocked && canEdit) {
                            // Create new lineup with selected player removed from their current position
                            const newLineup = {
                              ...lineup,
                              captains: lineup.captains.map((id) =>
                                id === selectedPlayer ? null : id
                              ),
                              naSlots: lineup.naSlots.map((id) =>
                                id === selectedPlayer ? null : id
                              ),
                              brLatamSlots: lineup.brLatamSlots.map((id) =>
                                id === selectedPlayer ? null : id
                              ),
                              flexSlots: lineup.flexSlots.map((id) =>
                                id === selectedPlayer ? null : id
                              ),
                              bench: [],
                            };

                            // Update Firebase
                            const cupKey =
                              `cup${selectedCup}` as keyof typeof selectedTeam.cupLineups;
                            updateDoc(
                              doc(
                                db,
                                "leagues",
                                leagueId.toString(),
                                "teams",
                                selectedTeam.teamId
                              ),
                              {
                                [`cupLineups.${cupKey}`]: newLineup,
                              }
                            )
                              .then(() => {
                                setSelectedPlayer(null);
                              })
                              .catch((error) => {
                                console.error(
                                  "Failed to move player to bench:",
                                  error
                                );
                              });
                          }
                        }}
                        style={{
                          cursor: isLineupLocked || !canEdit ? "default" : "pointer",
                          opacity: isLineupLocked || !canEdit ? 0.8 : 1,
                        }}
                      >
                        <div className="d-flex justify-content-between align-items-center">
                          <div>
                            <span className="text-primary">Move to Bench</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {getBenchPlayers()}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showCoOwnerDialog && (
        <CoOwnerDialog
          league={league}
          team={selectedTeam}
          show={showCoOwnerDialog}
          onClose={() => setShowCoOwnerDialog(false)}
          user={user}
        />
      )}

      {user && (
        <button
          className="btn btn-danger"
          onClick={handleLeaveLeague}
          disabled={loading}
        >
          Leave League
        </button>
      )}
    </div>
  );
};

// Wrap the exported component with DndProvider
export default function TeamTabWithDnD(props: TeamTabProps) {
  return (
    <DndProvider backend={HTML5Backend}>
      <TeamTab {...props} />
    </DndProvider>
  );
}

import React, { useState } from "react";
import type { League, Player, Team, CupLineup } from "../../types";
import { updateDoc, doc, runTransaction, collection, addDoc, deleteField } from "firebase/firestore";
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

// Create a separate component for bench players
const BenchPlayer: React.FC<{
  playerId: string;
  player: Player;
  isLineupLocked: boolean;
  canEdit: boolean;
  onDrop: (playerId: string) => void;
  loading: boolean;
}> = ({ playerId, player, isLineupLocked, canEdit, onDrop, loading }) => {
  const [{ isDragging }, drag, preview] = useDrag<
    DragItem,
    unknown,
    { isDragging: boolean }
  >({
    type: 'PLAYER',
    item: { type: 'PLAYER', id: playerId, slotType: 'bench', slotIndex: -1 },
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
        <div>
          <span>{player.name}</span>
          <small className="text-muted"> ({player.region})</small>
        </div>
        {!isLineupLocked && canEdit && (
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

// Create a separate component for lineup slots
const LineupSlot: React.FC<{
  slotType: "captains" | "naSlots" | "brLatamSlots" | "flexSlots";
  currentPlayer: string | null;
  slotIndex: number;
  showScore: boolean;
  isLineupLocked: boolean;
  canEdit: boolean;
  isPastCup: boolean;
  players: Record<string, Player>;
  selectedCup: number;
  selectedTeam: Team;
  selectedPlayer: string | null;
  onSlotClick: (slotType: "captains" | "naSlots" | "brLatamSlots" | "flexSlots", playerId: string | null, index: number) => void;
  onDropPlayer: (playerId: string) => void;
  loading: boolean;
}> = ({ slotType, currentPlayer, slotIndex, showScore, isLineupLocked, canEdit, isPastCup, players, selectedCup, selectedTeam, selectedPlayer, onSlotClick, onDropPlayer, loading }) => {
  const player = currentPlayer ? players[currentPlayer] : null;

  const [{ isDragging }, drag, preview] = useDrag<
    DragItem,
    unknown,
    { isDragging: boolean }
  >({
    type: 'PLAYER',
    item: { type: 'PLAYER', id: currentPlayer, slotType, slotIndex },
    canDrag: () => !isLineupLocked && canEdit && currentPlayer !== null && !isPastCup,
    collect: (monitor) => ({
      isDragging: monitor.isDragging()
    })
  });

  const [{ isOver, canDrop }, drop] = useDrop<
    DragItem,
    void,
    { isOver: boolean; canDrop: boolean }
  >({
    accept: 'PLAYER',
    canDrop: (item: DragItem) => {
      if (!canEdit || isLineupLocked || isPastCup) return false;
      const draggedPlayer = item.id ? players[item.id] : null;
      if (!draggedPlayer) return false;
      
      switch (slotType) {
        case "naSlots":
          return draggedPlayer.region === "NA";
        case "brLatamSlots":
          return ["BR", "LATAM"].includes(draggedPlayer.region);
        default:
          return true;
      }
    },
    drop: (item: DragItem) => {
      if (item.id) {
        onSlotClick(slotType, item.id, slotIndex);
      }
    },
    collect: (monitor: DropTargetMonitor<DragItem>) => ({
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

  let className = "p-3 border rounded ";
  if (currentPlayer && canEdit && selectedPlayer === currentPlayer) {
    className += "bg-primary text-white ";
  } else if (isOver) {
    className += canDrop 
      ? "bg-primary bg-opacity-25 border-primary border-2 " 
      : "bg-danger bg-opacity-10 border-danger ";
  } else if (canDrop) {
    className += "border-primary border-2 ";
  }
  if (isPastCup && player && currentPlayer && !selectedTeam.roster.includes(currentPlayer)) {
    className += "bg-light ";
  }

  return (
    <div
      ref={ref}
      className={className}
      onClick={() => canEdit && !isPastCup && onSlotClick(slotType, currentPlayer, slotIndex)}
      style={{
        cursor: isLineupLocked || !canEdit || isPastCup ? "default" : "grab",
        opacity: isDragging ? 0 : (isLineupLocked || !canEdit ? 0.8 : 1),
        transition: 'opacity 0.2s ease'
      }}
    >
      {player ? (
        <div className="d-flex justify-content-between align-items-center">
          <div className="d-flex align-items-center gap-2">
            <div>
              <span>{player.name}</span>
              <small className={currentPlayer && canEdit && selectedPlayer === currentPlayer ? "text-white-50" : "text-muted"}>
                {" "}
                ({player.region})
              </small>
            </div>
            {isPastCup && currentPlayer && !selectedTeam.roster.includes(currentPlayer) && (
              <span className="badge bg-danger">Off Roster</span>
            )}
          </div>
          <div className="d-flex align-items-center gap-3">
            {showScore && player.scores && (
              <span className="fw-bold fs-5">
                {slotType === "captains" 
                  ? `${(player.scores[`cup${selectedCup}` as keyof typeof player.scores] * 1.5) % 1 === 0 
                      ? Math.round(player.scores[`cup${selectedCup}` as keyof typeof player.scores] * 1.5)
                      : (player.scores[`cup${selectedCup}` as keyof typeof player.scores] * 1.5).toFixed(1)
                    }`
                  : player.scores[`cup${selectedCup}` as keyof typeof player.scores]
                }
              </span>
            )}
            {!isLineupLocked && canEdit && !isPastCup && (
              <button
                className="btn btn-sm btn-outline-danger"
                onClick={(e) => {
                  e.stopPropagation();
                  onDropPlayer(currentPlayer!);
                }}
                disabled={loading}
              >
                Drop
              </button>
            )}
          </div>
        </div>
      ) : (
        <span className="text-muted">Empty Slot</span>
      )}
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
  const [selectedCup, setSelectedCup] = useState<number>(() => {
    const upcomingCup = Math.min(league.settings.currentCup + 1, 3);
    const maxCups = TWO_CUP_SETS.includes(league.season as TwoCupSet) ? 2 : 3;
    return Math.min(upcomingCup, maxCups);
  });
  const [showCoOwnerDialog, setShowCoOwnerDialog] = useState(false);
  const [loading, setLoading] = useState(false);
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

  const getLineup = (cupNumber: number): CupLineup => {
    if (cupNumber === 0) {  // Regionals
      const playoffLineup = selectedTeam.playoffLineup || {
        captains: Array(league.settings.playoffSettings?.captainSlots || 1).fill(null),
        naSlots: Array(league.settings.playoffSettings?.naSlots || 1).fill(null),
        brLatamSlots: Array(league.settings.playoffSettings?.brLatamSlots || 1).fill(null),
        flexSlots: Array(league.settings.playoffSettings?.flexSlots || 3).fill(null),
        bench: [],
        locked: false
      };
      return playoffLineup;
    }
    return getCupLineup(cupNumber);
  };

  const lineup = getLineup(selectedCup);
  const isLineupLocked = lineup.locked;

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

    const benchPlayerIds = selectedCup === 0
      ? (selectedTeam.playoffRoster || [])
      : selectedTeam.roster;

    return benchPlayerIds
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
          />
        );
      });
  };

  const getPlayerCurrentSlot = (
    playerId: string,
    lineup: CupLineup
  ): { slotType: string; index: number } | null => {
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
    if (!selectedTeam) return;
    if (isLineupLocked || !canEdit) return;

    try {
      const newLineup = {
        ...lineup,
        captains: [...lineup.captains],
        naSlots: [...lineup.naSlots],
        brLatamSlots: [...lineup.brLatamSlots],
        flexSlots: [...lineup.flexSlots],
      };

      // Get the player currently in the target slot
      const targetSlots = newLineup[slotType];
      const existingPlayerId = targetSlots[slotIndex];

      // Find where the dragged player currently is
      const draggedPlayerCurrentSlot = draggedPlayerId ? getPlayerCurrentSlot(draggedPlayerId, lineup) : null;

      // Handle the swap
      if (draggedPlayerCurrentSlot && draggedPlayerCurrentSlot.slotType !== 'bench') {
        // Remove dragged player from their current slot
        const sourceSlots = newLineup[draggedPlayerCurrentSlot.slotType as keyof CupLineup] as (string | null)[];
        sourceSlots[draggedPlayerCurrentSlot.index] = existingPlayerId;  // Put existing player in dragged player's old slot
      }

      // Put dragged player in the target slot
      targetSlots[slotIndex] = draggedPlayerId;

      // Update Firebase
      if (selectedCup === 0) {
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

  // Add a function to handle moving players to bench
  const handleMoveToBench = async (playerId: string | null) => {
    if (!playerId || !selectedTeam || isLineupLocked || !canEdit) return;

    try {
      const newLineup = {
        ...lineup,
        captains: [...lineup.captains],
        naSlots: [...lineup.naSlots],
        brLatamSlots: [...lineup.brLatamSlots],
        flexSlots: [...lineup.flexSlots],
      };

      // Remove player from all slots
      newLineup.captains = newLineup.captains.map(id => id === playerId ? null : id);
      newLineup.naSlots = newLineup.naSlots.map(id => id === playerId ? null : id);
      newLineup.brLatamSlots = newLineup.brLatamSlots.map(id => id === playerId ? null : id);
      newLineup.flexSlots = newLineup.flexSlots.map(id => id === playerId ? null : id);

      // Update Firebase
      if (selectedCup === 0) {
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
    const confirmLeagueName = prompt(
      `To confirm leaving ${league.name}, please type the league name below:`
    );

    if (!confirmLeagueName || confirmLeagueName !== league.name) {
      alert("League name did not match. Action cancelled.");
      return;
    }

    const team = Object.entries(league.teams).find(([_, t]) => 
      t.ownerID === user.uid || t.coOwners?.includes(user.uid)
    );

    if (!team) return;

    setLoading(true);
    const [teamId, teamData] = team;
    const isOwner = teamData.ownerID === user.uid;

    try {
      await runTransaction(db, async (transaction) => {
        const leagueRef = doc(db, "leagues", leagueId.toString());
        const chatRef = collection(db, "leagues", leagueId.toString(), "chat");

        // Get user display names
        const userDoc = await transaction.get(doc(db, "users", user.uid));
        const userData = userDoc.exists() ? userDoc.data() as UserData : null;
        const userName = userData?.displayName || "Unknown User";

        if (isOwner) {
          if (!teamData.coOwners || teamData.coOwners.length === 0) {
            // Delete the team if no co-owners
            transaction.update(leagueRef, {
              [`teams.${teamId}`]: deleteField()
            });

            await addDoc(chatRef, {
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
            const updatedCoOwners = teamData.coOwners.filter(id => id !== newOwner);

            transaction.update(leagueRef, {
              [`teams.${teamId}.ownerID`]: newOwner,
              [`teams.${teamId}.coOwners`]: updatedCoOwners
            });

            await addDoc(chatRef, {
              userId: "system",
              userName: "System",
              content: `${userName} has left the league. ${newOwnerName} is now the owner of team "${teamData.teamName}".`,
              timestamp: new Date().toISOString(),
              type: "system"
            });
          }
        } else {
          // Handle leaving as co-owner
          const updatedCoOwners = teamData.coOwners.filter(id => id !== user.uid);
          
          transaction.update(leagueRef, {
            [`teams.${teamId}.coOwners`]: updatedCoOwners
          });

          await addDoc(chatRef, {
            userId: "system",
            userName: "System",
            content: `${userName} has left as co-owner of team "${teamData.teamName}".`,
            timestamp: new Date().toISOString(),
            type: "system"
          });
        }

        // Update user's leagues array
        const userRef = doc(db, "users", user.uid);
        const userLeagues = userData?.leagues || [];
        transaction.update(userRef, {
          leagues: userLeagues.filter((id: string) => id !== leagueId.toString())
        });

        // Add to transaction history
        const transactionDoc = {
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          teamIds: [teamId],
          adds: {},
          drops: {},
          type: 'commissioner' as const,
          metadata: {
            reason: `${userName} left the league`,
            action: isOwner ? 'member_left' : 'member_left',
          }
        };

        transaction.update(leagueRef, {
          transactions: [
            ...(league.transactions || []),
            transactionDoc
          ]
        });
      });

      navigate('/my-leagues');
    } catch (error) {
      console.error("Failed to leave league:", error);
    } finally {
      setLoading(false);
    }
  };

  const renderSlot = (
    slotType: "captains" | "naSlots" | "brLatamSlots" | "flexSlots",
    currentPlayer: string | null,
    slotIndex: number,
    showScore = false
  ) => {
    return (
      <LineupSlot
        slotType={slotType}
        currentPlayer={currentPlayer}
        slotIndex={slotIndex}
        showScore={showScore}
        isLineupLocked={isLineupLocked}
        canEdit={canEdit}
        isPastCup={selectedCup <= (league.settings?.currentCup || 0)}
        players={players}
        selectedCup={selectedCup}
        selectedTeam={selectedTeam}
        selectedPlayer={selectedPlayer}
        onSlotClick={handleSlotClick}
        onDropPlayer={handleDropPlayer}
        loading={loading}
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

  return (
    <div className="row">
      <CustomDragLayer />
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
              {Array.from({ length: TWO_CUP_SETS.includes(league.season as TwoCupSet) ? 2 : 3 }, (_, i) => i + 1).map((cupNumber) => {
                // Cup is locked if it's less than or equal to the current cup
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
              {league.settings.playoffs && league.settings.playoffSettings?.playoffAuctionStarted && isInPlayoffs && (
                <button
                  className={`btn btn-${selectedCup === 0 ? "primary" : "outline-primary"}`}
                  onClick={() => setSelectedCup(0)}
                >
                  Regionals
                </button>
              )}
            </div>
            
            {selectedTeam?.ownerID === user?.uid && (
              <button
                className="btn btn-outline-primary"
                onClick={() => setShowCoOwnerDialog(true)}
              >
                Manage Co-Owners
              </button>
            )}
          </div>

          {/* Lineup Editor */}
          <div className="row">
            {!isLineupLocked && canEdit && (
              <div className="col-12 mb-4">
                <div className="alert alert-info">
                  Drag and drop players between slots to set your lineup. 
                  Players can only be placed in slots matching their region, Captain and Flex slots can be filled by any player.
                  <br></br><br></br>
                  Scores recorded during the tournament are not final and may not be perfectly accurate until the tournament has completed.
                </div>
              </div>
            )}

            <div className="col-md-8">
              <div className="card mb-4">
                <div className="card-header">
                  <h4 className="card-title mb-0">Cup {selectedCup} Lineup</h4>
                </div>
                <div className="card-body">
                  {selectedCup !== 0 || isInPlayoffs ? (
                    <>
                      <div className="mb-4">
                        <label className="form-label">Captain (1.5x Points)</label>
                        {lineup.captains.map((playerId, index) => (
                          <div key={index} className="mb-2">
                            {renderSlot("captains", playerId, index, selectedCup <= (league.settings?.currentCup || 0))}
                          </div>
                        ))}
                      </div>

                      <div className="mb-4">
                        <label className="form-label">NA</label>
                        {lineup.naSlots.map((playerId, index) => (
                          <div key={index} className="mb-2">
                            {renderSlot("naSlots", playerId, index, selectedCup <= (league.settings?.currentCup || 0))}
                          </div>
                        ))}
                      </div>

                      <div className="mb-4">
                        <label className="form-label">BR/LATAM</label>
                        {lineup.brLatamSlots.map((playerId, index) => (
                          <div key={index} className="mb-2">
                            {renderSlot("brLatamSlots", playerId, index, selectedCup <= (league.settings?.currentCup || 0))}
                          </div>
                        ))}
                      </div>

                      <div className="mb-4">
                        <label className="form-label">Flex</label>
                        {lineup.flexSlots.map((playerId, index) => (
                          <div key={index} className="mb-2">
                            {renderSlot("flexSlots", playerId, index, selectedCup <= (league.settings?.currentCup || 0))}
                          </div>
                        ))}
                      </div>
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

      {selectedCup === 0 && !isInPlayoffs && (
        <div className="alert alert-warning mt-3">
          This team did not qualify for playoffs.
        </div>
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

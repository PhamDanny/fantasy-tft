import React, { useState } from "react";
import type { League, Player, Team, CupLineup } from "../../types";
import { updateDoc, doc } from "firebase/firestore";
import { db } from "../../firebase/config";
import { ArrowLeftRight } from "lucide-react";
import CoOwnerDialog from "../../components/dialogs/CoOwnerDialog";

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

const TeamTab: React.FC<TeamTabProps> = ({
  league,
  players,
  userTeam,
  leagueId,
  teams,
  user,
}) => {
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState<string>(userTeam?.teamId || "");
  const [selectedCup, setSelectedCup] = useState<number>(() => {
    const currentCup = league.settings?.currentCup ?? 0;
    const maxCups = TWO_CUP_SETS.includes(league.season as TwoCupSet) ? 2 : 3;
    return Math.min(currentCup + 1, maxCups);
  });
  const [showCoOwnerDialog, setShowCoOwnerDialog] = useState(false);

  // Define selectedTeam from selectedTeamId
  const selectedTeam = selectedTeamId ? teams[selectedTeamId] : userTeam;
  const canEdit = selectedTeam?.ownerID === userTeam?.ownerID || 
                 selectedTeam?.coOwners?.includes(user.uid);

  if (!userTeam) {
    return <div>You don't have a team in this league.</div>;
  }

  if (!selectedTeam) {
    return <div>Team not found.</div>;
  }

  // Initialize cupLineups if it doesn't exist
  if (!selectedTeam.cupLineups) {
    selectedTeam.cupLineups = {};
  }

  const getCupLineup = (cupNumber: number): CupLineup => {
    const cupKey = `cup${cupNumber}` as keyof typeof selectedTeam.cupLineups;
    const existingLineup = selectedTeam.cupLineups[cupKey];

    if (existingLineup) {
      return {
        captains: [...(existingLineup.captains || [])],
        naSlots: [...(existingLineup.naSlots || [])],
        brLatamSlots: [...(existingLineup.brLatamSlots || [])],
        flexSlots: [...(existingLineup.flexSlots || [])],
        bench: [], // We'll maintain an empty bench array to satisfy the type
        locked: cupNumber <= (league.settings?.currentCup || 0),
      };
    }

    // Create new empty lineup
    return {
      captains: Array(league.settings?.captainSlots || 0).fill(null),
      naSlots: Array(league.settings?.naSlots || 0).fill(null),
      brLatamSlots: Array(league.settings?.brLatamSlots || 0).fill(null),
      flexSlots: Array(league.settings?.flexSlots || 0).fill(null),
      bench: [],
      locked: cupNumber <= (league.settings?.currentCup || 0),
    };
  };

  const lineup = getCupLineup(selectedCup);
  const isLineupLocked = lineup.locked;

  // Calculate bench as players not in starting lineup
  const getBenchPlayers = (): string[] => {
    const startingPlayers = new Set(
      [
        ...lineup.captains,
        ...lineup.naSlots,
        ...lineup.brLatamSlots,
        ...lineup.flexSlots,
      ].filter(Boolean)
    );

    return selectedTeam.roster.filter(
      (playerId) => !startingPlayers.has(playerId)
    );
  };

  const getPlayerCurrentSlot = (
    playerId: string,
    lineup: CupLineup
  ): { slotType: string; index: number } | null => {
    if (lineup.captains.includes(playerId)) {
      return { slotType: "captain", index: lineup.captains.indexOf(playerId) };
    }
    if (lineup.naSlots.includes(playerId)) {
      return { slotType: "na", index: lineup.naSlots.indexOf(playerId) };
    }
    if (lineup.brLatamSlots.includes(playerId)) {
      return {
        slotType: "brLatam",
        index: lineup.brLatamSlots.indexOf(playerId),
      };
    }
    if (lineup.flexSlots.includes(playerId)) {
      return { slotType: "flex", index: lineup.flexSlots.indexOf(playerId) };
    }
    return null;
  };

  const canPlayerFitSlot = (playerId: string, slotType: string): boolean => {
    const player = players[playerId];
    if (!player) return false;

    switch (slotType) {
      case "captain":
      case "flex":
        return true;
      case "na":
        return player.region === "NA";
      case "brLatam":
        return player.region === "BR" || player.region === "LATAM";
      default:
        return false;
    }
  };

  const handleSlotClick = async (
    slotType: "captain" | "na" | "brLatam" | "flex",
    currentPlayer: string | null,
    slotIndex: number
  ) => {
    if (isLineupLocked || !canEdit) return;

    // If clicking the same player that's selected, deselect it
    if (selectedPlayer === currentPlayer) {
      setSelectedPlayer(null);
      return;
    }

    // If no player is selected and this slot has a player, select it
    if (!selectedPlayer && currentPlayer && canEdit) {
      setSelectedPlayer(currentPlayer);
      return;
    }

    // If no player is selected and slot is empty, do nothing
    if (!selectedPlayer) {
      return;
    }

    // Verify the selected player can fit in the target slot
    if (!canPlayerFitSlot(selectedPlayer, slotType)) {
      setSelectedPlayer(null);
      return;
    }

    try {
      const newLineup = {
        ...lineup,
        captains: [...lineup.captains],
        naSlots: [...lineup.naSlots],
        brLatamSlots: [...lineup.brLatamSlots],
        flexSlots: [...lineup.flexSlots],
      };

      // Remove selected player from current position if they're in one
      newLineup.captains = newLineup.captains.map((id) =>
        id === selectedPlayer ? null : id
      );
      newLineup.naSlots = newLineup.naSlots.map((id) =>
        id === selectedPlayer ? null : id
      );
      newLineup.brLatamSlots = newLineup.brLatamSlots.map((id) =>
        id === selectedPlayer ? null : id
      );
      newLineup.flexSlots = newLineup.flexSlots.map((id) =>
        id === selectedPlayer ? null : id
      );

      // If there's a player in the target slot, remove them
      if (currentPlayer) {
        newLineup.captains = newLineup.captains.map((id) =>
          id === currentPlayer ? null : id
        );
        newLineup.naSlots = newLineup.naSlots.map((id) =>
          id === currentPlayer ? null : id
        );
        newLineup.brLatamSlots = newLineup.brLatamSlots.map((id) =>
          id === currentPlayer ? null : id
        );
        newLineup.flexSlots = newLineup.flexSlots.map((id) =>
          id === currentPlayer ? null : id
        );
      }

      // Place selected player in new slot
      switch (slotType) {
        case "captain":
          newLineup.captains[slotIndex] = selectedPlayer;
          break;
        case "na":
          newLineup.naSlots[slotIndex] = selectedPlayer;
          break;
        case "brLatam":
          newLineup.brLatamSlots[slotIndex] = selectedPlayer;
          break;
        case "flex":
          newLineup.flexSlots[slotIndex] = selectedPlayer;
          break;
      }

      // Update the lineup in Firebase
      const cupKey = `cup${selectedCup}` as keyof typeof userTeam.cupLineups;
      await updateDoc(
        doc(db, "leagues", leagueId.toString(), "teams", userTeam.teamId),
        {
          [`cupLineups.${cupKey}`]: newLineup,
        }
      );

      setSelectedPlayer(null);
    } catch (error) {
      console.error("Failed to update lineup:", error);
    }
  };

  const renderSlot = (
    slotType: "captain" | "na" | "brLatam" | "flex",
    currentPlayer: string | null,
    slotIndex: number,
    showScore = false
  ) => {
    // Only allow selection if user can edit
    const isSelected = canEdit && selectedPlayer === currentPlayer;
    const isValidTarget =
      !isLineupLocked &&
      canEdit &&
      selectedPlayer &&
      canPlayerFitSlot(selectedPlayer, slotType);
    const player = currentPlayer ? players[currentPlayer] : null;

    let className = "p-3 border rounded ";
    if (isSelected && currentPlayer) {
      className += "bg-primary text-white ";
    } else if (selectedPlayer && isValidTarget) {
      className += "border-primary ";
    }

    return (
      <div
        className={className}
        onClick={() => canEdit && handleSlotClick(slotType, currentPlayer, slotIndex)}
        style={{
          cursor: isLineupLocked || !canEdit ? "default" : "pointer",
          opacity: isLineupLocked || !canEdit ? 0.8 : 1,
        }}
      >
        {player ? (
          <div className="d-flex justify-content-between align-items-center">
            <div>
              <span>{player.name}</span>
              <small className={isSelected ? "text-white-50" : "text-muted"}>
                {" "}
                ({player.region})
              </small>
            </div>
            <div className="d-flex align-items-center gap-3">
              {showScore && (
                <span className="fw-bold fs-5">
                  {slotType === "captain" 
                    ? `${(player.scores[`cup${selectedCup}` as keyof typeof player.scores] * 1.5) % 1 === 0 
                        ? Math.round(player.scores[`cup${selectedCup}` as keyof typeof player.scores] * 1.5)
                        : (player.scores[`cup${selectedCup}` as keyof typeof player.scores] * 1.5).toFixed(1)
                      }`
                    : player.scores[`cup${selectedCup}` as keyof typeof player.scores]
                  }
                </span>
              )}
              {!isLineupLocked && canEdit && !isSelected && (
                <ArrowLeftRight size={18} />
              )}
            </div>
          </div>
        ) : (
          <span className="text-muted">Empty Slot</span>
        )}
      </div>
    );
  };

  const benchPlayers = getBenchPlayers();

  return (
    <div className="row">
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
                  {team.ownerID === userTeam.ownerID ? "(Your Team)" : ""}
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
              {[1, 2, 3].map((cupNumber) => (
                <button
                  key={cupNumber}
                  className={`btn btn-${
                    selectedCup === cupNumber ? "primary" : "outline-primary"
                  }`}
                  onClick={() => setSelectedCup(cupNumber)}
                >
                  Cup {cupNumber}
                </button>
              ))}
            </div>
            
            {userTeam?.ownerID === user?.uid && (
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
            <div className="col-md-8">
              <div className="card mb-4">
                <div className="card-header">
                  <h4 className="card-title mb-0">Cup {selectedCup} Lineup</h4>
                </div>
                <div className="card-body">
                  <div className="mb-4">
                    <label className="form-label">Captain (1.5x Points)</label>
                    {lineup.captains.map((playerId, index) => (
                      <div key={index} className="mb-2">
                        {renderSlot("captain", playerId, index, isLineupLocked)}
                      </div>
                    ))}
                  </div>

                  <div className="mb-4">
                    <label className="form-label">NA</label>
                    {lineup.naSlots.map((playerId, index) => (
                      <div key={index} className="mb-2">
                        {renderSlot("na", playerId, index, isLineupLocked)}
                      </div>
                    ))}
                  </div>

                  <div className="mb-4">
                    <label className="form-label">BR/LATAM</label>
                    {lineup.brLatamSlots.map((playerId, index) => (
                      <div key={index} className="mb-2">
                        {renderSlot("brLatam", playerId, index, isLineupLocked)}
                      </div>
                    ))}
                  </div>

                  <div className="mb-4">
                    <label className="form-label">Flex</label>
                    {lineup.flexSlots.map((playerId, index) => (
                      <div key={index} className="mb-2">
                        {renderSlot("flex", playerId, index, isLineupLocked)}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="col-md-4">
              <div className="card">
                <div className="card-header">
                  <h4 className="card-title mb-0">Bench</h4>
                </div>
                <div className="card-body">
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
                              `cup${selectedCup}` as keyof typeof userTeam.cupLineups;
                            updateDoc(
                              doc(
                                db,
                                "leagues",
                                leagueId.toString(),
                                "teams",
                                userTeam.teamId
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
                          {!isLineupLocked && canEdit && <ArrowLeftRight size={18} />}
                        </div>
                      </div>
                    )}

                    {benchPlayers.map((playerId) => {
                      const player = players[playerId];
                      if (!player) return null;

                      const isSelected = canEdit && selectedPlayer === playerId;

                      return (
                        <button
                          key={playerId}
                          className={`list-group-item list-group-item-action ${
                            isSelected ? "active" : ""
                          }`}
                          onClick={() =>
                            !isLineupLocked &&
                            canEdit &&
                            setSelectedPlayer(isSelected ? null : playerId)
                          }
                          disabled={isLineupLocked || !canEdit}
                        >
                          <div className="d-flex justify-content-between align-items-center">
                            <div>
                              <span>{player.name}</span>
                              <small className={isSelected ? "text-white-50" : "text-muted"}>
                                {" "}
                                ({player.region})
                              </small>
                            </div>
                            <div className="d-flex align-items-center gap-3">
                              {isLineupLocked && (
                                <span className="fw-bold fs-5">
                                  {player.scores[`cup${selectedCup}` as keyof typeof player.scores]}
                                </span>
                              )}
                              {!isLineupLocked && canEdit && !isSelected && (
                                <ArrowLeftRight size={18} />
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })}
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
    </div>
  );
};

export default TeamTab;

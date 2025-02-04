import React, { useState } from "react";
import type { League, Player, Team, CupLineup } from "../../types";
import { updateDoc, doc, runTransaction, collection, addDoc, deleteField } from "firebase/firestore";
import { db } from "../../firebase/config";
import { Trash2 } from "lucide-react";
import CoOwnerDialog from "../../components/dialogs/CoOwnerDialog";
import { useNavigate } from "react-router-dom";

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
    const currentCup = league.settings?.currentCup ?? 0;
    const maxCups = TWO_CUP_SETS.includes(league.season as TwoCupSet) ? 2 : 3;
    return Math.min(currentCup + 1, maxCups);
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

    console.log('Getting cup lineup:', {
      cupNumber,
      cupKey,
      existingLineup,
      selectedTeam
    });

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
  const getBenchPlayers = (): string[] => {
    const startingPlayers = new Set(
      [
        ...lineup.captains,
        ...lineup.naSlots,
        ...lineup.brLatamSlots,
        ...lineup.flexSlots,
      ].filter(Boolean)
    );

    if (selectedCup === 0) {  // Regionals
      // Get all players from playoff roster - both retained and acquired
      const allPlayoffPlayers = selectedTeam.playoffRoster || [];
      return allPlayoffPlayers.filter(
        (playerId) => !startingPlayers.has(playerId)
      );
    }

    // For all other cases, bench is just current roster players not in starting lineup
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
    if (!selectedTeam) return;  // Add early return if no selected team
    
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

      // If there's a player in the target slot and they're not in any other slot,
      // and they're not in the current roster, we need to drop them
      if (currentPlayer) {
        const isInOtherSlot = [
          ...newLineup.captains,
          ...newLineup.naSlots,
          ...newLineup.brLatamSlots,
          ...newLineup.flexSlots
        ].filter(id => id === currentPlayer).length > 1;

        if (!isInOtherSlot && !selectedTeam.roster.includes(currentPlayer)) {
          // Drop the player
          await handleDropPlayer(currentPlayer);
        }
      }

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
      if (selectedCup === 0) {  // Regionals
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

  const renderSlot = (
    slotType: "captain" | "na" | "brLatam" | "flex",
    currentPlayer: string | null,
    slotIndex: number,
    showScore = false
  ) => {
    // Debug all players in lineup slots
    if (currentPlayer) {
      console.log('Player slot debug:', {
        currentPlayer,
        playerInDatabase: players[currentPlayer],
        inCurrentRoster: selectedTeam.roster.includes(currentPlayer),
        cupNumber: selectedCup,
        slotType,
        scores: players[currentPlayer]?.scores,
        showScore
      });
    }

    const isPastCup = selectedCup <= (league.settings?.currentCup || 0);
    const isSelected = canEdit && selectedPlayer === currentPlayer;
    const isValidTarget =
      !isLineupLocked &&
      canEdit &&
      selectedPlayer &&
      canPlayerFitSlot(selectedPlayer, slotType) &&
      !isPastCup;

    // Simply look up the player in the players database
    const player = currentPlayer ? players[currentPlayer] : null;

    let className = "p-3 border rounded ";
    if (isSelected && currentPlayer) {
      className += "bg-primary text-white ";
    } else if (selectedPlayer && isValidTarget) {
      className += "border-primary ";
    }
    if (isPastCup && player && currentPlayer && !selectedTeam.roster.includes(currentPlayer)) {
      className += "bg-light "; // Visual indication this is a historical entry
    }

    return (
      <div
        className={className}
        onClick={() => canEdit && !isPastCup && handleSlotClick(slotType, currentPlayer, slotIndex)}
        style={{
          cursor: isLineupLocked || !canEdit || isPastCup ? "default" : "pointer",
          opacity: isLineupLocked || !canEdit ? 0.8 : 1,
        }}
      >
        {player ? (
          <div className="d-flex justify-content-between align-items-center">
            <div className="d-flex align-items-center gap-2">
              <div>
                <span>{player.name}</span>
                <small className={isSelected ? "text-white-50" : "text-muted"}>
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
                  {slotType === "captain" 
                    ? `${(player.scores[`cup${selectedCup}` as keyof typeof player.scores] * 1.5) % 1 === 0 
                        ? Math.round(player.scores[`cup${selectedCup}` as keyof typeof player.scores] * 1.5)
                        : (player.scores[`cup${selectedCup}` as keyof typeof player.scores] * 1.5).toFixed(1)
                      }`
                    : player.scores[`cup${selectedCup}` as keyof typeof player.scores]
                  }
                </span>
              )}
              {!isLineupLocked && canEdit && !isSelected && !isPastCup && (
                <button
                  className="btn btn-sm btn-outline-danger"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDropPlayer(currentPlayer!);
                  }}
                  disabled={loading}
                >
                  <Trash2 size={16} />
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

  const benchPlayers = getBenchPlayers();

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
              {Array.from({ length: TWO_CUP_SETS.includes(league.season as TwoCupSet) ? 2 : 3 }, (_, i) => i + 1).map((cupNumber) => (
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
                            {renderSlot("captain", playerId, index, selectedCup <= (league.settings?.currentCup || 0))}
                          </div>
                        ))}
                      </div>

                      <div className="mb-4">
                        <label className="form-label">NA</label>
                        {lineup.naSlots.map((playerId, index) => (
                          <div key={index} className="mb-2">
                            {renderSlot("na", playerId, index, selectedCup <= (league.settings?.currentCup || 0))}
                          </div>
                        ))}
                      </div>

                      <div className="mb-4">
                        <label className="form-label">BR/LATAM</label>
                        {lineup.brLatamSlots.map((playerId, index) => (
                          <div key={index} className="mb-2">
                            {renderSlot("brLatam", playerId, index, selectedCup <= (league.settings?.currentCup || 0))}
                          </div>
                        ))}
                      </div>

                      <div className="mb-4">
                        <label className="form-label">Flex</label>
                        {lineup.flexSlots.map((playerId, index) => (
                          <div key={index} className="mb-2">
                            {renderSlot("flex", playerId, index, selectedCup <= (league.settings?.currentCup || 0))}
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
                                <button
                                  className="btn btn-sm btn-outline-danger"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDropPlayer(playerId);
                                  }}
                                  disabled={loading}
                                >
                                  <Trash2 size={16} />
                                </button>
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

export default TeamTab;

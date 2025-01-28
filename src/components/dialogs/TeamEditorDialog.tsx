import { useState, useEffect } from "react";
import { doc, updateDoc, collection, getDocs } from "firebase/firestore";
import { db } from "../../firebase/config";
import { ArrowLeftRight, AlertTriangle } from "lucide-react";
import type { League, Team, Player, CupLineup } from "../../types";

interface TeamEditorProps {
  league: League;
  leagueId: number;
}

const TeamEditor = ({ league, leagueId }: TeamEditorProps) => {
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);

  // Remove any dialog-related state since this is now a regular component
  const [selectedCup, setSelectedCup] = useState<number>(1);
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
  const [allPlayers, setAllPlayers] = useState<Record<string, Player>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Fetch all players on mount
  useEffect(() => {
    const fetchAllPlayers = async () => {
      try {
        const playersSnapshot = await getDocs(collection(db, "players"));
        const playersData: Record<string, Player> = {};
        playersSnapshot.forEach((doc) => {
          playersData[doc.id] = doc.data() as Player;
        });
        setAllPlayers(playersData);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to fetch players"
        );
      }
    };

    fetchAllPlayers();
  }, []);

  const generateEmptyLineup = (): CupLineup => {
    return {
      captains: Array(league.settings.captainSlots).fill(null),
      naSlots: Array(league.settings.naSlots).fill(null),
      brLatamSlots: Array(league.settings.brLatamSlots).fill(null),
      flexSlots: Array(league.settings.flexSlots).fill(null),
      bench: [],
      locked: false,
    };
  };

  const getCurrentLineup = (): CupLineup => {
    if (!selectedTeam) return generateEmptyLineup();
    const cupKey = `cup${selectedCup}` as keyof typeof selectedTeam.cupLineups;
    return selectedTeam.cupLineups[cupKey] || generateEmptyLineup();
  };

  const canPlayerFitSlot = (playerId: string, slotType: string): boolean => {
    const player = allPlayers[playerId];
    if (!player) return false;

    switch (slotType) {
      case "captain":
      case "flex":
        return true;
      case "na":
        return player.region === "NA";
      case "brLatam":
        return player.region === "BR" || player.region === "LATAM";
      case "bench":
        return true;
      default:
        return false;
    }
  };

  const handleSlotClick = async (
    slotType: "captain" | "na" | "brLatam" | "flex" | "bench",
    currentPlayer: string | null,
    slotIndex: number
  ) => {
    if (!selectedTeam || !selectedPlayer) return;
    setError(null);

    try {
      setLoading(true);
      const lineup = getCurrentLineup();
      const newLineup = { ...lineup };

      // Remove the selected player from their current position
      if (selectedPlayer !== currentPlayer) {
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
        newLineup.bench = newLineup.bench.filter((id) => id !== selectedPlayer);
      }

      // Place player in new slot
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
        case "bench":
          newLineup.bench.push(selectedPlayer);
          break;
      }

      // Update the lineup in Firebase
      const cupKey =
        `cup${selectedCup}` as keyof typeof selectedTeam.cupLineups;
      await updateDoc(
        doc(db, "leagues", leagueId.toString(), "teams", selectedTeam.teamId),
        {
          [`cupLineups.${cupKey}`]: newLineup,
        }
      );

      // Update local state
      setSelectedTeam((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          cupLineups: {
            ...prev.cupLineups,
            [cupKey]: newLineup,
          },
        };
      });

      setSelectedPlayer(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update lineup");
    } finally {
      setLoading(false);
    }
  };

  const renderSlot = (
    slotType: "captain" | "na" | "brLatam" | "flex" | "bench",
    currentPlayer: string | null,
    slotIndex: number
  ) => {
    const isSelected = selectedPlayer === currentPlayer;
    const isValidTarget =
      selectedPlayer && canPlayerFitSlot(selectedPlayer, slotType);
    const player = currentPlayer ? allPlayers[currentPlayer] : null;

    let className = "p-3 border rounded ";
    if (isSelected && currentPlayer) {
      className += "bg-primary text-white ";
    } else if (selectedPlayer && isValidTarget) {
      className += "border-primary ";
    }

    return (
      <div
        className={className}
        onClick={() => handleSlotClick(slotType, currentPlayer, slotIndex)}
        style={{
          cursor: "pointer",
          transition: "all 0.15s ease-in-out",
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
            {!isSelected && <ArrowLeftRight size={18} className="ms-2" />}
          </div>
        ) : (
          <span className="text-muted">Empty Slot</span>
        )}
      </div>
    );
  };

  const handleAddToRoster = async (playerId: string) => {
    if (!selectedTeam) return;
    setError(null);

    try {
      setLoading(true);
      const newRoster = [...selectedTeam.roster, playerId];

      await updateDoc(
        doc(db, "leagues", leagueId.toString(), "teams", selectedTeam.teamId),
        {
          roster: newRoster,
        }
      );

      setSelectedTeam((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          roster: newRoster,
        };
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add player");
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveFromRoster = async (playerId: string) => {
    if (!selectedTeam) return;
    setError(null);

    try {
      setLoading(true);
      const newRoster = selectedTeam.roster.filter((id) => id !== playerId);

      // Also remove from all lineups
      const updatedLineups = { ...selectedTeam.cupLineups };
      Object.keys(updatedLineups).forEach((cupKey) => {
        const lineup = updatedLineups[cupKey as keyof typeof updatedLineups];
        if (lineup) {
          lineup.captains = lineup.captains.map((id) =>
            id === playerId ? null : id
          );
          lineup.naSlots = lineup.naSlots.map((id) =>
            id === playerId ? null : id
          );
          lineup.brLatamSlots = lineup.brLatamSlots.map((id) =>
            id === playerId ? null : id
          );
          lineup.flexSlots = lineup.flexSlots.map((id) =>
            id === playerId ? null : id
          );
          lineup.bench = lineup.bench.filter((id) => id !== playerId);
        }
      });

      await updateDoc(
        doc(db, "leagues", leagueId.toString(), "teams", selectedTeam.teamId),
        {
          roster: newRoster,
          cupLineups: updatedLineups,
        }
      );

      setSelectedTeam((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          roster: newRoster,
          cupLineups: updatedLineups,
        };
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove player");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card border-danger mt-4">
      <div className="card-header bg-danger text-white d-flex align-items-center gap-2">
        <AlertTriangle size={20} />
        <h4 className="h5 mb-0">Edit Rosters</h4>
      </div>

      <div className="card-body">
        {error && <div className="alert alert-danger">{error}</div>}

        <div className="alert alert-warning">
          <strong>Warning:</strong> Changes made here directly modify team
          rosters and lineups. Any changes made will be retroactively applied to
          results.
        </div>

        <div className="row">
          <div className="col-md-3">
            {/* Team Selection */}
            <div className="mb-4">
              <label className="form-label">Select Team to Edit</label>
              <select
                className="form-select"
                value={selectedTeam?.teamId || ""}
                onChange={(e) => {
                  const team = Object.values(league.teams).find(
                    (t) => t.teamId === e.target.value
                  );
                  setSelectedTeam(team || null);
                  setSelectedPlayer(null);
                }}
              >
                <option value="">Choose a team...</option>
                {Object.values(league.teams).map((team) => (
                  <option key={team.teamId} value={team.teamId}>
                    {team.teamName}
                  </option>
                ))}
              </select>
            </div>

            {selectedTeam && (
              <>
                {/* Current Roster */}
                <div className="mb-4">
                  <h6>Current Roster</h6>
                  <div className="list-group">
                    {selectedTeam.roster.map((playerId) => {
                      const player = allPlayers[playerId];
                      if (!player) return null;

                      return (
                        <button
                          key={playerId}
                          className={`list-group-item list-group-item-action ${
                            selectedPlayer === playerId ? "active" : ""
                          }`}
                          onClick={() =>
                            setSelectedPlayer(
                              selectedPlayer === playerId ? null : playerId
                            )
                          }
                        >
                          <div className="d-flex justify-content-between align-items-center">
                            <div>
                              <span>{player.name}</span>
                              <small
                                className={
                                  selectedPlayer === playerId
                                    ? "text-white-50"
                                    : "text-muted"
                                }
                              >
                                {" "}
                                ({player.region})
                              </small>
                            </div>
                            <button
                              className="btn btn-sm btn-danger"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRemoveFromRoster(playerId);
                              }}
                            >
                              Remove
                            </button>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Available Players */}
                <div>
                  <h6>Add Players</h6>
                  <input
                    type="text"
                    className="form-control mb-2"
                    placeholder="Search players..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  <div
                    className="list-group"
                    style={{ maxHeight: "300px", overflowY: "auto" }}
                  >
                    {Object.entries(allPlayers)
                      .filter(
                        ([playerId, player]) =>
                          !selectedTeam.roster.includes(playerId) &&
                          player.name
                            .toLowerCase()
                            .includes(searchQuery.toLowerCase())
                      )
                      .map(([playerId, player]) => (
                        <button
                          key={playerId}
                          className="list-group-item list-group-item-action"
                          onClick={() => handleAddToRoster(playerId)}
                        >
                          <div className="d-flex justify-content-between align-items-center">
                            <div>
                              <span>{player.name}</span>
                              <small className="text-muted">
                                {" "}
                                ({player.region})
                              </small>
                            </div>
                            <button className="btn btn-sm btn-primary">
                              Add
                            </button>
                          </div>
                        </button>
                      ))}
                  </div>
                </div>
              </>
            )}
          </div>

          {selectedTeam && (
            <div className="col-md-9">
              {/* Cup Selection */}
              <div className="btn-group mb-4">
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

              {/* Lineup Editor */}
              <div className="row">
                <div className="col-md-8">
                  <div className="mb-4">
                    <label className="form-label">Captain Slots</label>
                    {getCurrentLineup().captains.map((playerId, index) => (
                      <div key={index} className="mb-2">
                        {renderSlot("captain", playerId, index)}
                      </div>
                    ))}
                  </div>

                  <div className="mb-4">
                    <label className="form-label">NA Slots</label>
                    {getCurrentLineup().naSlots.map((playerId, index) => (
                      <div key={index} className="mb-2">
                        {renderSlot("na", playerId, index)}
                      </div>
                    ))}
                  </div>

                  <div className="mb-4">
                    <label className="form-label">BR/LATAM Slots</label>
                    {getCurrentLineup().brLatamSlots.map((playerId, index) => (
                      <div key={index} className="mb-2">
                        {renderSlot("brLatam", playerId, index)}
                      </div>
                    ))}
                  </div>

                  <div className="mb-4">
                    <label className="form-label">Flex Slots</label>
                    {getCurrentLineup().flexSlots.map((playerId, index) => (
                      <div key={index} className="mb-2">
                        {renderSlot("flex", playerId, index)}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="col-md-4">
                  <div className="mb-4">
                    <label className="form-label">Bench</label>
                    <div className="list-group">
                      {getCurrentLineup().bench.map((playerId, index) => (
                        <div key={index} className="mb-2">
                          {renderSlot("bench", playerId, index)}
                        </div>
                      ))}
                      {selectedPlayer && (
                        <div className="mb-2">
                          {renderSlot(
                            "bench",
                            null,
                            getCurrentLineup().bench.length
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TeamEditor;

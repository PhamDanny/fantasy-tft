import { useState, useEffect } from "react";
import { doc, updateDoc, collection, getDocs } from "firebase/firestore";
import { db } from "../../firebase/config";
import type { League, Player, CupLineup } from "../../types";

interface CommissionerTeamEditDialogProps {
  league: League;
  leagueId: number;
  teamId: string;
  onClose: () => void;
}

const CommissionerTeamEditDialog: React.FC<CommissionerTeamEditDialogProps> = ({
  league,
  leagueId,
  teamId,
  onClose
}) => {
  const team = league.teams[teamId];
  const [allPlayers, setAllPlayers] = useState<Record<string, Player>>({});
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCup, setSelectedCup] = useState<number>(1);
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'roster' | 'lineup'>('roster');

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

  const handleAddToRoster = async (playerId: string) => {
    setError(null);
    try {
      const newRoster = [...team.roster, playerId];
      await updateDoc(
        doc(db, "leagues", leagueId.toString(), "teams", teamId),
        {
          roster: newRoster,
        }
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add player");
    }
  };

  const handleRemoveFromRoster = async (playerId: string) => {
    setError(null);
    try {
      const newRoster = team.roster.filter((id) => id !== playerId);
      await updateDoc(
        doc(db, "leagues", leagueId.toString(), "teams", teamId),
        {
          roster: newRoster,
        }
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove player");
    }
  };

  const generateEmptyLineup = (): CupLineup => ({
    captains: Array(league.settings.captainSlots).fill(null),
    naSlots: Array(league.settings.naSlots).fill(null),
    brLatamSlots: Array(league.settings.brLatamSlots).fill(null),
    flexSlots: Array(league.settings.flexSlots).fill(null),
    bench: [],
    locked: false
  });

  const getCurrentLineup = (): CupLineup => {
    const cupKey = `cup${selectedCup}` as keyof typeof team.cupLineups;
    return team.cupLineups[cupKey] || generateEmptyLineup();
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
    if (!selectedPlayer) return;
    setError(null);

    try {
      const lineup = getCurrentLineup();
      const newLineup = { ...lineup };

      // Remove the selected player from their current position
      if (selectedPlayer !== currentPlayer) {
        newLineup.captains = newLineup.captains.map(id => id === selectedPlayer ? null : id);
        newLineup.naSlots = newLineup.naSlots.map(id => id === selectedPlayer ? null : id);
        newLineup.brLatamSlots = newLineup.brLatamSlots.map(id => id === selectedPlayer ? null : id);
        newLineup.flexSlots = newLineup.flexSlots.map(id => id === selectedPlayer ? null : id);
        newLineup.bench = newLineup.bench.filter(id => id !== selectedPlayer);
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

      const cupKey = `cup${selectedCup}` as keyof typeof team.cupLineups;
      await updateDoc(doc(db, "leagues", leagueId.toString(), "teams", teamId), {
        [`cupLineups.${cupKey}`]: newLineup
      });

      setSelectedPlayer(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update lineup");
    }
  };

  const renderSlot = (
    slotType: "captain" | "na" | "brLatam" | "flex" | "bench",
    currentPlayer: string | null,
    slotIndex: number
  ) => {
    const isSelected = selectedPlayer === currentPlayer;
    const isValidTarget = selectedPlayer && canPlayerFitSlot(selectedPlayer, slotType);
    const player = currentPlayer ? allPlayers[currentPlayer] : null;

    let className = "p-2 border rounded ";
    if (isSelected && currentPlayer) {
      className += "bg-primary text-white ";
    } else if (selectedPlayer && isValidTarget) {
      className += "border-primary ";
    }

    return (
      <div
        className={className}
        onClick={() => handleSlotClick(slotType, currentPlayer, slotIndex)}
        style={{ cursor: "pointer" }}
      >
        {player ? (
          <div className="d-flex justify-content-between align-items-center">
            <div>
              <span>{player.name}</span>
              <small className={isSelected ? "text-white-50" : "text-muted"}> ({player.region})</small>
            </div>
          </div>
        ) : (
          <span className="text-muted">Empty Slot</span>
        )}
      </div>
    );
  };

  return (
    <div 
      className="modal show d-block" 
      tabIndex={-1}
      style={{ 
        backgroundColor: 'rgba(0,0,0,0.5)',
        zIndex: 1050,
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%'
      }}
    >
      <div className="modal-dialog modal-dialog-centered modal-lg">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">Edit {team.teamName}</h5>
            <button
              type="button"
              className="btn-close"
              onClick={onClose}
              aria-label="Close"
            ></button>
          </div>
          <div className="modal-body">
            {error && <div className="alert alert-danger">{error}</div>}

            <ul className="nav nav-tabs mb-3">
              <li className="nav-item">
                <button
                  className={`nav-link ${activeTab === 'roster' ? 'active' : ''}`}
                  onClick={() => setActiveTab('roster')}
                >
                  Roster
                </button>
              </li>
              <li className="nav-item">
                <button
                  className={`nav-link ${activeTab === 'lineup' ? 'active' : ''}`}
                  onClick={() => setActiveTab('lineup')}
                >
                  Lineup
                </button>
              </li>
            </ul>

            {activeTab === 'roster' ? (
              // Roster Management Tab
              <div className="row">
                {/* Keep existing roster management content */}
                <div className="col-md-6">
                  <h6>Current Roster</h6>
                  <div className="list-group mb-3">
                    {team.roster.map((playerId) => {
                      const player = allPlayers[playerId];
                      if (!player) return null;
                      return (
                        <div key={playerId} className="list-group-item">
                          <div className="d-flex justify-content-between align-items-center">
                            <div>
                              <span>{player.name}</span>
                              <small className="text-muted"> ({player.region})</small>
                            </div>
                            <button
                              className="btn btn-sm btn-danger"
                              onClick={() => handleRemoveFromRoster(playerId)}
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="col-md-6">
                  <h6>Add Players</h6>
                  <input
                    type="text"
                    className="form-control mb-2"
                    placeholder="Search players..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  <div className="list-group" style={{ maxHeight: "400px", overflowY: "auto" }}>
                    {Object.entries(allPlayers)
                      .filter(([playerId, player]) =>
                        !team.roster.includes(playerId) &&
                        player.name.toLowerCase().includes(searchQuery.toLowerCase())
                      )
                      .map(([playerId, player]) => (
                        <div key={playerId} className="list-group-item">
                          <div className="d-flex justify-content-between align-items-center">
                            <div>
                              <span>{player.name}</span>
                              <small className="text-muted"> ({player.region})</small>
                            </div>
                            <button
                              className="btn btn-sm btn-primary"
                              onClick={() => handleAddToRoster(playerId)}
                            >
                              Add
                            </button>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            ) : (
              // Lineup Management Tab
              <div>
                <div className="btn-group mb-3">
                  {[1, 2, 3].map((cup) => (
                    <button
                      key={cup}
                      className={`btn btn-${selectedCup === cup ? 'primary' : 'outline-primary'}`}
                      onClick={() => setSelectedCup(cup)}
                    >
                      Cup {cup}
                    </button>
                  ))}
                </div>

                <div className="row">
                  <div className="col-md-4">
                    <h6>Team Roster</h6>
                    <div className="list-group">
                      {team.roster.map((playerId) => {
                        const player = allPlayers[playerId];
                        if (!player) return null;
                        return (
                          <button
                            key={playerId}
                            className={`list-group-item list-group-item-action ${
                              selectedPlayer === playerId ? 'active' : ''
                            }`}
                            onClick={() => setSelectedPlayer(
                              selectedPlayer === playerId ? null : playerId
                            )}
                          >
                            {player.name} ({player.region})
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="col-md-8">
                    <div className="mb-3">
                      <h6>Captain Slots</h6>
                      {getCurrentLineup().captains.map((playerId, index) => (
                        <div key={index} className="mb-2">
                          {renderSlot("captain", playerId, index)}
                        </div>
                      ))}
                    </div>

                    <div className="mb-3">
                      <h6>NA Slots</h6>
                      {getCurrentLineup().naSlots.map((playerId, index) => (
                        <div key={index} className="mb-2">
                          {renderSlot("na", playerId, index)}
                        </div>
                      ))}
                    </div>

                    <div className="mb-3">
                      <h6>BR/LATAM Slots</h6>
                      {getCurrentLineup().brLatamSlots.map((playerId, index) => (
                        <div key={index} className="mb-2">
                          {renderSlot("brLatam", playerId, index)}
                        </div>
                      ))}
                    </div>

                    <div className="mb-3">
                      <h6>Flex Slots</h6>
                      {getCurrentLineup().flexSlots.map((playerId, index) => (
                        <div key={index} className="mb-2">
                          {renderSlot("flex", playerId, index)}
                        </div>
                      ))}
                    </div>

                    <div>
                      <h6>Bench</h6>
                      {getCurrentLineup().bench.map((playerId, index) => (
                        <div key={index} className="mb-2">
                          {renderSlot("bench", playerId, index)}
                        </div>
                      ))}
                      {selectedPlayer && (
                        <div className="mb-2">
                          {renderSlot("bench", null, getCurrentLineup().bench.length)}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CommissionerTeamEditDialog; 
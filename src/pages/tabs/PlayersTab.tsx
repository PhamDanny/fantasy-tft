import React, { useState, useEffect } from "react";
import type { League, Player, Team, PendingBid } from "../../types";
import { updateDoc, doc, collection, getDocs } from "firebase/firestore";
import { db } from "../../firebase/config";
import { getTotalRosterLimit } from "../../utils/rosterUtils";
import WaiverHelpDialog from "../../components/dialogs/WaiverHelpDialog";
import { processWaivers } from "../../utils/waiverUtils";
import WaiverClaimDialog from "../../components/dialogs/WaiverClaimDialog";
import { getLeagueType } from "../../types";
import TeamDisplay from "../../components/TeamDisplay";

interface PlayersTabProps {
  league: League;
  players: Record<string, Player>;
  userTeam: Team | null;
  leagueId: number;
  teams: Record<string, Team>;
  user: any;
}

const formatScore = (score: number): string => {
  return score % 1 === 0 ? score.toFixed(0) : score.toFixed(1);
};

const PlayersTab: React.FC<PlayersTabProps> = ({
  league,
  players,
  userTeam,
  leagueId,
  teams,
  user,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
  const [allPlayers, setAllPlayers] = useState<Record<string, Player>>({});
  const [sortField, setSortField] = useState<
    "total" | "cup1" | "cup2" | "cup3"
  >("total");
  const [sortDirection, setSortDirection] = useState<"desc" | "asc">("desc");
  const [searchQuery, setSearchQuery] = useState("");
  const [showWaiverHelpDialog, setShowWaiverHelpDialog] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [playersPerPage] = useState(20);
  const [hideRostered, setHideRostered] = useState(true);
  const [showWaiverDialog, setShowWaiverDialog] = useState(false);

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

  useEffect(() => {
    setCurrentPage(1);
  }, [hideRostered, searchQuery]);

  if (!userTeam) {
    return <div>You don't have a team in this league.</div>;
  }

  const playoffsStarted = league.settings.playoffSettings?.playoffAuctionStarted === true;

  if (playoffsStarted) {
    return (
      <div className="alert alert-info">
        Waivers and free agent pickups are locked during playoffs. 
        You will be able to earn more players in the Playoff Auction.
      </div>
    );
  }

  const pendingBids = userTeam.pendingBids || [];
  const faabBudget = userTeam.faabBudget ?? league.settings.faabBudget ?? 1000;

  const getPlayerTotalScore = (player: Player) => {
    return player.scores.cup1 + player.scores.cup2 + player.scores.cup3;
  };

  const getAvailablePlayers = () => {
    const rosteredPlayersMap = new Map<string, Team>();
    Object.entries(teams).forEach(([_, team]) => {
      team.roster.forEach(playerId => {
        rosteredPlayersMap.set(playerId, team);
      });
    });

    const filteredPlayers = Object.entries(allPlayers)
      .filter(([playerId, player]) => {
        if (!player) return false;
        const matchesSearch =
          player.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          player.region.toLowerCase().includes(searchQuery.toLowerCase());
        
        return matchesSearch && (!hideRostered || !rosteredPlayersMap.has(playerId));
      })
      .sort((a, b) => {
        const playerA = a[1];
        const playerB = b[1];
        if (!playerA || !playerB) return 0;

        if (sortField === "total") {
          const diff =
            getPlayerTotalScore(playerB) - getPlayerTotalScore(playerA);
          return sortDirection === "desc" ? diff : -diff;
        }

        const diff = playerB.scores[sortField] - playerA.scores[sortField];
        return sortDirection === "desc" ? diff : -diff;
      });

    const indexOfLastPlayer = currentPage * playersPerPage;
    const indexOfFirstPlayer = indexOfLastPlayer - playersPerPage;
    return {
      paginatedPlayers: filteredPlayers.slice(indexOfFirstPlayer, indexOfLastPlayer),
      totalPlayers: filteredPlayers.length,
      rosteredPlayersMap
    };
  };

  const submitBid = async (bidAmount: number, dropPlayer: string | null) => {
    if (!selectedPlayer) {
      setError("Please select a player to claim");
      return;
    }

    if (bidAmount < 0) {
      setError("Bid amount cannot be negative");
      return;
    }

    if (bidAmount > faabBudget) {
      setError("Bid amount exceeds total FAAB budget");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const newBid: PendingBid = {
        playerId: selectedPlayer,
        amount: bidAmount,
        dropPlayerId: dropPlayer,
        timestamp: new Date().toISOString(),
        processed: false,
        status: "pending",
        processingOrder: pendingBids.length,
      };

      const updatedBids = [...pendingBids, newBid]
        .sort((a, b) => b.amount - a.amount)
        .map((bid, index) => ({ ...bid, processingOrder: index }));

      await updateDoc(
        doc(db, "leagues", leagueId.toString(), "teams", userTeam.teamId),
        {
          pendingBids: updatedBids,
        }
      );

      setShowWaiverDialog(false);
      setSelectedPlayer(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit bid");
    } finally {
      setLoading(false);
    }
  };

  const cancelBid = async (bidIndex: number) => {
    setLoading(true);
    setError(null);

    try {
      const updatedBids = pendingBids
        .filter((_, index) => index !== bidIndex)
        .map((bid, index) => ({ ...bid, processingOrder: index }));

      await updateDoc(
        doc(db, "leagues", leagueId.toString(), "teams", userTeam.teamId),
        {
          pendingBids: updatedBids,
        }
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel bid");
    } finally {
      setLoading(false);
    }
  };

  const modifyBid = async (bidIndex: number, newAmount: number) => {
    if (newAmount < 0) {
      setError("Bid amount cannot be negative");
      return;
    }

    if (newAmount > faabBudget) {
      setError("Bid amount cannot exceed FAAB budget");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const updatedBids = pendingBids
        .map((bid, idx) =>
          idx === bidIndex ? { ...bid, amount: newAmount } : bid
        )
        .sort((a, b) => b.amount - a.amount)
        .map((bid, index) => ({ ...bid, processingOrder: index }));

      await updateDoc(
        doc(db, "leagues", leagueId.toString(), "teams", userTeam.teamId),
        {
          pendingBids: updatedBids,
        }
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update bid");
    } finally {
      setLoading(false);
    }
  };

  const addFreeAgent = async (playerId: string, dropPlayerId: string | null) => {
    const rosterLimit = getTotalRosterLimit(league.settings);
    if (!dropPlayerId && userTeam.roster.length >= rosterLimit) {
      setError("Cannot add player - roster is full");
      return;
    }

    if (!window.confirm(`Are you sure you want to ${dropPlayerId ? 'drop ' + players[dropPlayerId]?.name + ' and ' : ''}add ${allPlayers[playerId]?.name}?`)) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const teamRef = doc(db, "leagues", leagueId.toString(), "teams", userTeam.teamId);
      const newRoster = [...userTeam.roster];
      
      if (dropPlayerId) {
        const dropIndex = newRoster.indexOf(dropPlayerId);
        if (dropIndex !== -1) {
          newRoster.splice(dropIndex, 1);
        }
      }
      newRoster.push(playerId);

      const transaction = {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        type: 'free_agent' as const,
        teamIds: [userTeam.teamId],
        adds: { [userTeam.teamId]: [playerId] },
        drops: dropPlayerId ? { [userTeam.teamId]: [dropPlayerId] } : {},
        metadata: {
          type: 'free_agent',
          playerNames: {
            [playerId]: {
              name: allPlayers[playerId]?.name || 'Unknown Player',
              region: allPlayers[playerId]?.region || 'Unknown Region'
            },
            ...(dropPlayerId ? {
              [dropPlayerId]: {
                name: allPlayers[dropPlayerId]?.name || players[dropPlayerId]?.name || 'Unknown Player',
                region: allPlayers[dropPlayerId]?.region || players[dropPlayerId]?.region || 'Unknown Region'
              }
            } : {})
          }
        }
      };

      await updateDoc(doc(db, "leagues", leagueId.toString()), {
        transactions: [...league.transactions, transaction]
      });

      await updateDoc(teamRef, {
        roster: newRoster
      });

      setShowWaiverDialog(false);
      setSelectedPlayer(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add player");
    } finally {
      setLoading(false);
    }
  };

  const playoffTeams = league.settings?.playoffs ? 
    Object.values(teams)
      .filter(t => t.playoffRoster)
      .map(team => ({ team }))
    : [];

  const hasTeam = user && (userTeam || playoffTeams.some(({ team }) => 
    team.ownerID === user.uid || team.coOwners?.includes(user.uid)
  ));

  if (!hasTeam) {
    return <div>You don't have a team in this league.</div>;
  }

  const { paginatedPlayers, totalPlayers, rosteredPlayersMap } = getAvailablePlayers();

  const Pagination = ({ totalPlayers }: { totalPlayers: number }) => {
    const pageNumbers = Math.ceil(totalPlayers / playersPerPage);
    
    const pageItems = [];
    for (let i = 1; i <= pageNumbers; i++) {
      if (
        i === 1 ||
        i === pageNumbers ||
        (i >= currentPage - 2 && i <= currentPage + 2)
      ) {
        pageItems.push(
          <li key={i} className={`page-item ${currentPage === i ? 'active' : ''}`}>
            <button 
              className="page-link"
              onClick={() => setCurrentPage(i)}
            >
              {i}
            </button>
          </li>
        );
      } else if (
        i === currentPage - 3 ||
        i === currentPage + 3
      ) {
        pageItems.push(
          <li key={i} className="page-item disabled">
            <span className="page-link">...</span>
          </li>
        );
      }
    }

    return (
      <nav aria-label="Players pagination">
        <ul className="pagination justify-content-center">
          <li className={`page-item ${currentPage === 1 ? 'disabled' : ''}`}>
            <button
              className="page-link"
              onClick={() => setCurrentPage(curr => Math.max(1, curr - 1))}
            >
              Previous
            </button>
          </li>
          {pageItems}
          <li className={`page-item ${currentPage === pageNumbers ? 'disabled' : ''}`}>
            <button
              className="page-link"
              onClick={() => setCurrentPage(curr => Math.min(pageNumbers, curr + 1))}
            >
              Next
            </button>
          </li>
        </ul>
      </nav>
    );
  };

  return (
    <>
      {error && (
        <div className="alert alert-danger mb-3">
          {error}
        </div>
      )}
      <div className="row">
        <div className="col-12 col-lg-8">
          <div className="card">
            <div className="card-header d-flex justify-content-between align-items-center flex-wrap gap-2">
              <h4 className="h5 mb-0">Available Players</h4>
              <div className="d-flex gap-2">
                <input
                  type="text"
                  className="form-control form-control-sm"
                  placeholder="Search players..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <div className="form-check form-switch">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    checked={hideRostered}
                    onChange={(e) => setHideRostered(e.target.checked)}
                    id="hideRosteredSwitch"
                  />
                  <label className="form-check-label" htmlFor="hideRosteredSwitch">
                    Hide Rostered
                  </label>
                </div>
              </div>
            </div>

            {/* Add the info box here */}
            <div className="alert alert-info m-3 mb-0">
              {getLeagueType(league) === 'season-long' && league.settings.waiversEnabled ? (
                <>
                  Waivers are enabled. Players must be claimed through the waiver system.
                  <button
                    className="btn btn-link btn-sm p-0 ms-2"
                    onClick={() => setShowWaiverHelpDialog(true)}
                  >
                    Learn More
                  </button>
                </>
              ) : (
                "Free Agency is active. Players can be added instantly."
              )}
            </div>

            {/* Desktop View */}
            <div className="d-none d-md-block">
              <div className="table-responsive">
                <table className="table table-hover">
                  <thead>
                    <tr>
                      <th className="ps-3">Player</th>
                      <th>Region</th>
                      <th>Team</th>
                      <th
                        className="cursor-pointer"
                        onClick={() => {
                          if (sortField === "cup1") {
                            setSortDirection((d) =>
                              d === "asc" ? "desc" : "asc"
                            );
                          } else {
                            setSortField("cup1");
                            setSortDirection("desc");
                          }
                        }}
                      >
                        Cup 1{" "}
                        {sortField === "cup1" &&
                          (sortDirection === "asc" ? "↑" : "↓")}
                      </th>
                      <th
                        className="cursor-pointer"
                        onClick={() => {
                          if (sortField === "cup2") {
                            setSortDirection((d) =>
                              d === "asc" ? "desc" : "asc"
                            );
                          } else {
                            setSortField("cup2");
                            setSortDirection("desc");
                          }
                        }}
                      >
                        Cup 2{" "}
                        {sortField === "cup2" &&
                          (sortDirection === "asc" ? "↑" : "↓")}
                      </th>
                      <th
                        className="cursor-pointer"
                        onClick={() => {
                          if (sortField === "cup3") {
                            setSortDirection((d) =>
                              d === "asc" ? "desc" : "asc"
                            );
                          } else {
                            setSortField("cup3");
                            setSortDirection("desc");
                          }
                        }}
                      >
                        Cup 3{" "}
                        {sortField === "cup3" &&
                          (sortDirection === "asc" ? "↑" : "↓")}
                      </th>
                      <th
                        className="cursor-pointer"
                        onClick={() => {
                          if (sortField === "total") {
                            setSortDirection((d) =>
                              d === "asc" ? "desc" : "asc"
                            );
                          } else {
                            setSortField("total");
                            setSortDirection("desc");
                          }
                        }}
                      >
                        Total{" "}
                        {sortField === "total" &&
                          (sortDirection === "asc" ? "↑" : "↓")}
                      </th>
                      <th>Current Bid</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedPlayers.map(([playerId, player]) => {
                      const existingBid = pendingBids.find(
                        (bid) => bid.playerId === playerId
                      );
                      const rosteredTeam = rosteredPlayersMap.get(playerId);
                      const isRostered = rosteredPlayersMap.has(playerId);

                      return (
                        <tr key={playerId}>
                          <td className="ps-3">{player.name}</td>
                          <td>{player.region}</td>
                          <td>
                            {isRostered ? 
                              <TeamDisplay team={rosteredTeam} /> : 
                              "Free Agent"
                            }
                          </td>
                          <td className="text-center">
                            {player.scores.cup1 > 0 ? formatScore(player.scores.cup1) : "-"}
                          </td>
                          <td className="text-center">
                            {player.scores.cup2 > 0 ? formatScore(player.scores.cup2) : "-"}
                          </td>
                          <td className="text-center">
                            {player.scores.cup3 > 0 ? formatScore(player.scores.cup3) : "-"}
                          </td>
                          <td className="text-center fw-bold">
                            {getPlayerTotalScore(player) > 0 ? formatScore(getPlayerTotalScore(player)) : "-"}
                          </td>
                          <td>{existingBid ? `$${existingBid.amount}` : "-"}</td>
                          <td>
                            {existingBid ? (
                              <button
                                className="btn btn-sm btn-danger"
                                onClick={() =>
                                  cancelBid(pendingBids.indexOf(existingBid))
                                }
                                disabled={loading || !hasTeam}
                              >
                                Cancel Bid
                              </button>
                            ) : league.settings.waiversEnabled ? (
                              <button
                                className="btn btn-sm btn-primary"
                                onClick={() => {
                                  setSelectedPlayer(playerId);
                                  setShowWaiverDialog(true);
                                }}
                                disabled={loading || !hasTeam || isRostered}
                              >
                                {league.settings.waiversEnabled ? 'Place Bid' : 'Add'}
                              </button>
                            ) : (
                              <button
                                className="btn btn-sm btn-success"
                                onClick={() => addFreeAgent(playerId, null)}
                                disabled={loading || !hasTeam || isRostered}
                              >
                                Add Player
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <Pagination totalPlayers={totalPlayers} />
              </div>
            </div>

            {/* Mobile View */}
            <div className="d-md-none">
              <div className="list-group list-group-flush">
                {getAvailablePlayers().paginatedPlayers.map(([playerId, player]) => {
                  const isRostered = getAvailablePlayers().rosteredPlayersMap.has(playerId);
                  const rosteredTeam = getAvailablePlayers().rosteredPlayersMap.get(playerId);

                  return (
                    <div key={playerId} className="list-group-item px-3">
                      <div className="d-flex justify-content-between align-items-start mb-2">
                        <div>
                          <h6 className="mb-0">{player.name}</h6>
                          <small className="text-muted">{player.region}</small>
                        </div>
                        {isRostered ? (
                          <span className="badge bg-secondary">
                            <TeamDisplay team={rosteredTeam} />
                          </span>
                        ) : (
                          <button
                            className="btn btn-sm btn-primary"
                            onClick={() => {
                              setSelectedPlayer(playerId);
                              setShowWaiverDialog(true);
                            }}
                            disabled={loading}
                          >
                            {league.settings.waiversEnabled ? 'Claim' : 'Add'}
                          </button>
                        )}
                      </div>
                      <div className="d-flex justify-content-between small">
                        <div>
                          <span className="me-2">Cup 1: {player.scores.cup1}</span>
                          <span className="me-2">Cup 2: {player.scores.cup2}</span>
                          <span>Cup 3: {player.scores.cup3}</span>
                        </div>
                        <div>
                          Total: {player.scores.cup1 + player.scores.cup2 + player.scores.cup3}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Pagination */}
            <div className="card-footer d-flex justify-content-between align-items-center">
              <div className="small text-muted">
                Showing {getAvailablePlayers().paginatedPlayers.length} of {getAvailablePlayers().totalPlayers} players
              </div>
              <div className="btn-group">
                <button
                  className="btn btn-sm btn-outline-secondary"
                  onClick={() => setCurrentPage(currentPage - 1)}
                  disabled={currentPage === 1}
                >
                  Previous
                </button>
                <button
                  className="btn btn-sm btn-outline-secondary"
                  onClick={() => setCurrentPage(currentPage + 1)}
                  disabled={
                    currentPage * playersPerPage >= getAvailablePlayers().totalPlayers
                  }
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="col-12 col-lg-4 mt-3 mt-lg-0">
          {/* Only show FAAB Budget Card for season-long leagues with waivers enabled */}
          {getLeagueType(league) === 'season-long' && league.settings.waiversEnabled && (
            <div className="card mb-4">
              <div className="card-header">
                <h4 className="h5 mb-0">FAAB Budget</h4>
              </div>
              <div className="card-body">
                <p className="mb-0">
                  <strong>Remaining Budget:</strong> ${faabBudget}
                </p>
              </div>
            </div>
          )}

          {/* Add new Commissioner Controls card */}
          {league.commissioner === user.uid && getLeagueType(league) === 'season-long' && (
            <div className="card mb-4">
              <div className="card-header">
                <h4 className="h5 mb-0">Commissioner Controls</h4>
              </div>
              <div className="card-body">
                <div className="d-grid gap-2">
                  <button
                    className="btn btn-outline-primary"
                    onClick={async () => {
                      try {
                        setLoading(true);
                        await updateDoc(doc(db, "leagues", leagueId.toString()), {
                          "settings.waiversEnabled": !league.settings.waiversEnabled,
                        });
                      } catch (err) {
                        setError(err instanceof Error ? err.message : "Failed to update waiver settings");
                      } finally {
                        setLoading(false);
                      }
                    }}
                    disabled={loading}
                  >
                    {league.settings.waiversEnabled ? "Switch to Free Agency" : "Enable Waivers"}
                  </button>

                  {league.settings.waiversEnabled && (
                    <button
                      className="btn btn-warning"
                      onClick={async () => {
                        if (!window.confirm("Are you sure you want to process all pending waiver claims?")) {
                          return;
                        }
                        try {
                          setLoading(true);
                          await processWaivers(leagueId.toString());
                        } catch (err) {
                          setError(err instanceof Error ? err.message : "Failed to process waivers");
                        } finally {
                          setLoading(false);
                        }
                      }}
                      disabled={loading}
                    >
                      Process Waivers
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Only show pending claims section for season-long leagues with waivers enabled */}
          {getLeagueType(league) === 'season-long' && league.settings.waiversEnabled && (
            <div className="card mb-4">
              <div className="card-header">
                <h4 className="h5 mb-0">Pending Claims</h4>
              </div>
              <div className="card-body">
                <div className="alert alert-warning mb-3">
                  Any claim that causes you to go over the roster limit will be ignored.
                  Current roster size: {userTeam.roster.length}/{getTotalRosterLimit(league.settings)}
                </div>

                {pendingBids.length === 0 ? (
                  <p className="text-muted">No pending claims</p>
                ) : (
                  <div className="list-group">
                    {pendingBids.map((bid, index) => {
                      const player = allPlayers[bid.playerId];
                      const dropPlayerInfo = bid.dropPlayerId
                        ? players[bid.dropPlayerId]
                        : null;

                      return (
                        <div key={index} className="list-group-item">
                          <div className="d-flex justify-content-between align-items-center mb-2">
                            <strong>{player?.name}</strong>
                            <div className="btn-group">
                              <button
                                className="btn btn-sm btn-outline-secondary"
                                onClick={() => {
                                  const newAmount = parseInt(
                                    prompt(
                                      "Enter new bid amount:",
                                      bid.amount.toString()
                                    ) || "0"
                                  );
                                  if (!isNaN(newAmount)) {
                                    modifyBid(index, newAmount);
                                  }
                                }}
                                disabled={loading}
                              >
                                ${bid.amount}
                              </button>
                              <button
                                className="btn btn-sm btn-danger"
                                onClick={() => cancelBid(index)}
                                disabled={loading}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                          {dropPlayerInfo && (
                            <div className="small text-danger mb-2">
                              Drop: {dropPlayerInfo.name}
                            </div>
                          )}
                          <div className="small text-muted">
                            Priority: {bid.processingOrder + 1}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Waiver Claim Dialog */}
          {selectedPlayer && (
            <WaiverClaimDialog
              show={showWaiverDialog}
              onClose={() => {
                setShowWaiverDialog(false);
                setSelectedPlayer(null);
              }}
              onSubmit={(bidAmount, dropPlayerId) => {
                if (league.settings.waiversEnabled) {
                  submitBid(bidAmount, dropPlayerId);
                } else {
                  addFreeAgent(selectedPlayer as string, dropPlayerId);
                }
              }}
              selectedPlayer={allPlayers[selectedPlayer as string] || null}
              roster={userTeam.roster}
              players={players}
              maxBid={faabBudget}
              isWaiver={league.settings.waiversEnabled}
              loading={loading}
            />
          )}
        </div>
      </div>
      
      <WaiverHelpDialog 
        show={showWaiverHelpDialog} 
        onClose={() => setShowWaiverHelpDialog(false)} 
      />
    </>
  );
};

export default PlayersTab;

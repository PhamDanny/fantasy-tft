import React, { useState, useEffect } from "react";
import type { League, Player, Team, PendingBid } from "../../types";
import { updateDoc, doc, collection, getDocs } from "firebase/firestore";
import { db } from "../../firebase/config";
import { getTotalRosterLimit } from "../../utils/rosterUtils";
import WaiverHelpDialog from "../../components/dialogs/WaiverHelpDialog";
import { processWaivers } from "../../utils/waiverUtils";

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
  const [bidAmount, setBidAmount] = useState<number>(0);
  const [dropPlayer, setDropPlayer] = useState<string | null>(null);
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

  const isCommissioner = league.commissioner === user.uid;

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
    const rosteredPlayersMap = new Map<string, string>();
    Object.entries(teams).forEach(([_, team]) => {
      team.roster.forEach(playerId => {
        rosteredPlayersMap.set(playerId, team.teamName || "Unnamed Team");
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

  const submitBid = async () => {
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

      setSelectedPlayer(null);
      setBidAmount(0);
      setDropPlayer(null);
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

    const otherBidsTotal = pendingBids.reduce(
      (sum, bid, idx) => (idx === bidIndex ? sum : sum + bid.amount),
      0
    );

    if (newAmount + otherBidsTotal > faabBudget) {
      setError("Total bids would exceed FAAB budget");
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

      setSelectedPlayer(null);
      setDropPlayer(null);
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
      <div className="row">
        <div className="col-md-8">
          <div className="card">
            <div className="card-header">
              <h4 className="h5 mb-0">Available Players</h4>
            </div>
            <div className="card-body">
              <div className="alert alert-info mb-3">
                {error && <div className="alert alert-danger mb-2">{error}</div>}
                {league.settings.waiversEnabled ? (
                  <>
                    <strong>Waivers are enabled</strong>
                    <p className="mb-2">
                      Players must be claimed through the waiver system.
                      {!isCommissioner && ' Ask your commissioner when waivers will be processed.'}
                    </p>
                    <div className="d-flex gap-2 align-items-center">
                      <button 
                        className="btn btn-sm btn-outline-primary"
                        onClick={() => setShowWaiverHelpDialog(true)}
                      >
                        Learn More
                      </button>
                      {isCommissioner && (
                        <button 
                          className="btn btn-sm btn-warning"
                          onClick={async () => {
                            if (!window.confirm('Are you sure you want to process waivers? This will resolve all pending claims.')) {
                              return;
                            }
                            setLoading(true);
                            try {
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
                  </>
                ) : (
                  <strong>Free Agency is active - players can be added instantly</strong>
                )}
              </div>

              {isCommissioner && (
                <div className="mb-3 d-flex align-items-center gap-3">
                  <div className="form-check form-switch">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      id="waiversEnabled"
                      checked={league.settings.waiversEnabled}
                      onChange={async (e) => {
                        setLoading(true);
                        try {
                          await updateDoc(doc(db, "leagues", leagueId.toString()), {
                            "settings.waiversEnabled": e.target.checked
                          });
                        } catch (err) {
                          setError(err instanceof Error ? err.message : "Failed to update waiver settings");
                        } finally {
                          setLoading(false);
                        }
                      }}
                      disabled={loading}
                    />
                    <label className="form-check-label" htmlFor="waiversEnabled">
                      Enable Waivers
                    </label>
                  </div>
                </div>
              )}

              <div className="mb-3 d-flex gap-3 align-items-center">
                <div className="form-check">
                  <input
                    type="checkbox"
                    className="form-check-input"
                    id="hideRostered"
                    checked={hideRostered}
                    onChange={(e) => setHideRostered(e.target.checked)}
                  />
                  <label className="form-check-label" htmlFor="hideRostered">
                    Hide players on rosters
                  </label>
                </div>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Search players..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <div className="table-responsive">
                <table className="table table-hover">
                  <thead>
                    <tr>
                      <th>Player</th>
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
                      const teamName = rosteredPlayersMap.get(playerId) || "Free Agent";

                      return (
                        <tr key={playerId}>
                          <td>{player.name}</td>
                          <td>{player.region}</td>
                          <td>{teamName}</td>
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
                                onClick={() => setSelectedPlayer(playerId)}
                                disabled={loading || !hasTeam || teamName !== "Free Agent"}
                              >
                                Place Bid
                              </button>
                            ) : (
                              <button
                                className="btn btn-sm btn-success"
                                onClick={() => addFreeAgent(playerId, null)}
                                disabled={loading || !hasTeam || teamName !== "Free Agent"}
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
          </div>
        </div>

        <div className="col-md-4">
          <div className="card mb-4">
            <div className="card-header">
              <h4 className="h5 mb-0">FAAB Budget</h4>
            </div>
            <div className="card-body">
              <p className="mb-2">
                <strong>Remaining Budget:</strong> ${faabBudget}
              </p>
            </div>
          </div>

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

          {selectedPlayer && (
            <div className="card">
              <div className="card-header">
                <h4 className="h5 mb-0">
                  {league.settings.waiversEnabled ? 'Place Waiver Claim' : 'Add Free Agent'}
                </h4>
              </div>
              <div className="card-body">
                <div className="mb-3">
                  <label className="form-label">Selected Player</label>
                  <input
                    type="text"
                    className="form-control"
                    value={allPlayers[selectedPlayer]?.name || ""}
                    disabled
                  />
                </div>

                {league.settings.waiversEnabled && (
                  <div className="mb-3">
                    <label className="form-label">Bid Amount</label>
                    <div className="input-group">
                      <span className="input-group-text">$</span>
                      <input
                        type="number"
                        className="form-control"
                        value={bidAmount}
                        onChange={(e) => setBidAmount(Math.max(0, parseInt(e.target.value) || 0))}
                        min="0"
                        max={faabBudget}
                      />
                    </div>
                    <small className="text-muted">Maximum bid: ${faabBudget}</small>
                  </div>
                )}

                <div className="mb-3">
                  <label className="form-label">Drop Player (Optional)</label>
                  <select
                    className="form-select"
                    value={dropPlayer || ""}
                    onChange={(e) => setDropPlayer(e.target.value || null)}
                  >
                    <option value="">No drop - add to roster</option>
                    {userTeam.roster.map((playerId) => (
                      <option key={playerId} value={playerId}>
                        {players[playerId]?.name} ({players[playerId]?.region})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="d-grid gap-2">
                  <button
                    className="btn btn-primary"
                    onClick={league.settings.waiversEnabled ? submitBid : () => addFreeAgent(selectedPlayer, dropPlayer)}
                    disabled={loading}
                  >
                    {loading ? "Processing..." : league.settings.waiversEnabled ? "Submit Claim" : "Add Player"}
                  </button>
                  <button
                    className="btn btn-secondary"
                    onClick={() => {
                      setSelectedPlayer(null);
                      setBidAmount(0);
                      setDropPlayer(null);
                    }}
                    disabled={loading}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
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

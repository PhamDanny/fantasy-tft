import React, { useState, useEffect } from "react";
import type { League, Player, Team, PendingBid } from "../../types";
import { updateDoc, doc, collection, getDocs } from "firebase/firestore";
import { db } from "../../firebase/config";
import { getTotalRosterLimit } from "../../utils/rosterUtils";

interface PlayersTabProps {
  league: League;
  players: Record<string, Player>;
  userTeam: Team | null;
  leagueId: number;
  teams: Record<string, Team>;
  user: any;
}

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

  if (!userTeam) {
    return <div>You don't have a team in this league.</div>;
  }

  if (!league || !league.settings) {
    return <div>Loading league data...</div>;
  }

  const pendingBids = userTeam.pendingBids || [];
  const faabBudget = userTeam.faabBudget ?? league.settings.faabBudget ?? 1000;

  const getPlayerTotalScore = (player: Player) => {
    return player.scores.cup1 + player.scores.cup2 + player.scores.cup3;
  };

  const getAvailablePlayers = () => {
    const allRosteredPlayers = new Set(
      Object.values(teams).flatMap((team) => team.roster)
    );

    return Object.entries(allPlayers)
      .filter(([playerId, player]) => {
        const matchesSearch =
          player.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          player.region.toLowerCase().includes(searchQuery.toLowerCase());
        return !allRosteredPlayers.has(playerId) && matchesSearch;
      })
      .sort((a, b) => {
        const playerA = a[1];
        const playerB = b[1];

        if (sortField === "total") {
          const diff =
            getPlayerTotalScore(playerB) - getPlayerTotalScore(playerA);
          return sortDirection === "desc" ? diff : -diff;
        }

        const diff = playerB.scores[sortField] - playerA.scores[sortField];
        return sortDirection === "desc" ? diff : -diff;
      });
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

    // Verify roster space if not dropping a player
    if (!dropPlayer) {
      const currentRosterSize = userTeam.roster.length;
      const pendingAdds = pendingBids.length;
      const pendingDrops = pendingBids.filter((bid) => bid.dropPlayerId).length;
      const effectiveRosterSize =
        currentRosterSize + (pendingAdds - pendingDrops);

      if (effectiveRosterSize >= getTotalRosterLimit(league.settings)) {
        setError("Must select a player to drop - roster would exceed limit");
        return;
      }
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

      // Add new bid and sort by amount
      const updatedBids = [...pendingBids, newBid]
        .sort((a, b) => b.amount - a.amount)
        .map((bid, index) => ({ ...bid, processingOrder: index }));

      await updateDoc(
        doc(db, "leagues", leagueId.toString(), "teams", userTeam.teamId),
        {
          pendingBids: updatedBids,
        }
      );

      // Reset form
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

  const canManageTeam = userTeam?.ownerID === user.uid || 
                       userTeam?.coOwners?.includes(user.uid);

  return (
    <div className="row">
      <div className="col-md-8">
        <div className="card">
          <div className="card-header">
            <h4 className="h5 mb-0">Bench</h4>
          </div>
          <div className="card-body">
            <div className="mb-3">
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
                  {getAvailablePlayers().map(([playerId, player]) => {
                    const existingBid = pendingBids.find(
                      (bid) => bid.playerId === playerId
                    );

                    return (
                      <tr key={playerId}>
                        <td>{player.name}</td>
                        <td>{player.region}</td>
                        <td>{player.scores.cup1}</td>
                        <td>{player.scores.cup2}</td>
                        <td>{player.scores.cup3}</td>
                        <td>{getPlayerTotalScore(player)}</td>
                        <td>{existingBid ? `$${existingBid.amount}` : "-"}</td>
                        <td>
                          {existingBid ? (
                            <button
                              className="btn btn-sm btn-danger"
                              onClick={() =>
                                cancelBid(pendingBids.indexOf(existingBid))
                              }
                              disabled={loading || !canManageTeam}
                            >
                              Cancel Bid
                            </button>
                          ) : (
                            <button
                              className="btn btn-sm btn-primary"
                              onClick={() => setSelectedPlayer(playerId)}
                              disabled={loading || !canManageTeam}
                            >
                              Place Bid
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
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
            {error && <div className="alert alert-danger">{error}</div>}

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
              <h4 className="h5 mb-0">Place Waiver Claim</h4>
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

              <div className="mb-3">
                <label className="form-label">Bid Amount</label>
                <div className="input-group">
                  <span className="input-group-text">$</span>
                  <input
                    type="number"
                    className="form-control"
                    value={bidAmount}
                    onChange={(e) =>
                      setBidAmount(Math.max(0, parseInt(e.target.value) || 0))
                    }
                    min="0"
                    max={faabBudget}
                  />
                </div>
                <small className="text-muted">Maximum bid: ${faabBudget}</small>
              </div>

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
                  onClick={submitBid}
                  disabled={loading}
                >
                  {loading ? "Submitting..." : "Submit Claim"}
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
  );
};

export default PlayersTab;

import React, { useState } from "react";
import type {
  League,
  Player,
  Team,
  TradeOffer,
  Transaction,
} from "../../types";
import { updateDoc, doc } from "firebase/firestore";
import { db } from "../../firebase/config";
import { getTotalRosterLimit } from "../../utils/rosterUtils";
import TeamDisplay from "../../components/TeamDisplay";

interface TradeTabProps {
  league: League;
  players: Record<string, Player>;
  userTeam: Team | null;
  leagueId: number;
  teams: Record<string, Team>;
  user: any;
}

const TradeTab: React.FC<TradeTabProps> = ({
  league,
  players,
  userTeam,
  leagueId,
  teams,
  user,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [selectedProposerPlayers, setSelectedProposerPlayers] = useState<
    string[]
  >([]);
  const [selectedReceiverPlayers, setSelectedReceiverPlayers] = useState<
    string[]
  >([]);

  if (!userTeam) {
    return <div>You don't have a team in this league.</div>;
  }

  // Simple list of other teams
  const otherTeams = Object.values(teams).filter(
    team => team.teamId !== userTeam.teamId
  );

  const trades = league.trades || {};
  const transactions = league.transactions || [];

  const generateTradeId = () =>
    `trade_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const generateTransactionId = () =>
    `transaction_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const getPendingTrades = () => {
    return Object.entries(trades).filter(
      ([_, trade]) =>
        trade.status === "pending" &&
        (trade.proposerId === userTeam.teamId ||
          trade.receiverId === userTeam.teamId)
    );
  };

  const getRecentTransactions = () => {
    return transactions
      .filter((t) => t.type === "trade" && t.teamIds.includes(userTeam.teamId))
      .sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      )
      .slice(0, 5); // Show last 5 trades
  };

  const renderPlayerNames = (playerIds: string[]) => {
    return playerIds
      .map((id) => players[id]?.name)
      .filter(Boolean)
      .join(", ");
  };

  const cancelTrade = async (tradeId: string) => {
    setLoading(true);
    setError(null);

    try {
      const updatedTrades = { ...trades };
      updatedTrades[tradeId] = {
        ...updatedTrades[tradeId],
        status: "cancelled",
      };

      await updateDoc(doc(db, "leagues", leagueId.toString()), {
        trades: updatedTrades,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel trade");
    } finally {
      setLoading(false);
    }
  };

  const proposeTrade = async () => {
    if (
      !selectedTeam ||
      selectedProposerPlayers.length === 0 ||
      selectedReceiverPlayers.length === 0
    ) {
      setError("Please select players from both teams");
      return;
    }

    // Only check proposer's roster limit
    const proposerNewSize =
      userTeam.roster.length -
      selectedProposerPlayers.length +
      selectedReceiverPlayers.length;

    if (proposerNewSize > getTotalRosterLimit(league.settings)) {
      setError("Trade would exceed your roster limit");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const tradeId = generateTradeId();
      const newTrade: TradeOffer = {
        proposerId: userTeam.teamId,
        receiverId: selectedTeam.teamId,
        proposerPlayers: selectedProposerPlayers,
        receiverPlayers: selectedReceiverPlayers,
        status: "pending",
        timestamp: new Date().toISOString(),
      };

      await updateDoc(doc(db, "leagues", leagueId.toString()), {
        [`trades.${tradeId}`]: newTrade,
      });

      // Reset form
      setSelectedTeam(null);
      setSelectedProposerPlayers([]);
      setSelectedReceiverPlayers([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to propose trade");
    } finally {
      setLoading(false);
    }
  };

  const respondToTrade = async (tradeId: string, accept: boolean) => {
    setLoading(true);
    setError(null);

    try {
      const trade = trades[tradeId];
      if (!trade) throw new Error("Trade not found");

      if (accept) {
        // Get current teams
        const proposerTeam = teams[trade.proposerId];
        const receiverTeam = teams[trade.receiverId];

        // Calculate new roster size
        const receiverNewSize =
          receiverTeam.roster.length -
          trade.receiverPlayers.length +
          trade.proposerPlayers.length;

        // Only check receiver's roster size when accepting
        if (receiverNewSize > getTotalRosterLimit(league.settings)) {
          setError("You must drop players to make room for this trade");
          setLoading(false);
          return;
        }

        // Step 1: Create transaction and mark trade as accepted
        const transactionId = generateTransactionId();
        const transaction: Transaction = {
          id: transactionId,
          timestamp: new Date().toISOString(),
          teamIds: [trade.proposerId, trade.receiverId],
          adds: {
            [trade.proposerId]: trade.receiverPlayers,
            [trade.receiverId]: trade.proposerPlayers,
          },
          drops: {
            [trade.proposerId]: trade.proposerPlayers,
            [trade.receiverId]: trade.receiverPlayers,
          },
          type: "trade",
          metadata: {
            tradeId,
          },
        };

        await updateDoc(doc(db, "leagues", leagueId.toString()), {
          [`trades.${tradeId}`]: {
            ...trade,
            status: "accepted",
            transactionId,
          },
          transactions: [...(league.transactions || []), transaction],
        });

        // Step 2: Update team rosters
        const updatedProposerRoster = proposerTeam.roster
          .filter((playerId) => !trade.proposerPlayers.includes(playerId))
          .concat(trade.receiverPlayers);

        const updatedReceiverRoster = receiverTeam.roster
          .filter((playerId) => !trade.receiverPlayers.includes(playerId))
          .concat(trade.proposerPlayers);

        // Update cup lineups for future cups only
        const currentCup = league.settings.currentCup;
        const updateCupLineups = (team: Team, newRoster: string[]) => {
          const updatedCupLineups = { ...team.cupLineups };
          
          // Only update future cups
          for (let cupNum = currentCup + 1; cupNum <= 3; cupNum++) {
            const cupKey = `cup${cupNum}` as keyof typeof updatedCupLineups;
            const cupLineup = updatedCupLineups[cupKey];
            
            if (cupLineup) {
              // Update each slot type
              const updateSlots = (slots: (string | null)[]) => {
                return slots.map(playerId => {
                  if (!playerId) return null;
                  // If player was traded away, remove them
                  if (!newRoster.includes(playerId)) return null;
                  return playerId;
                });
              };

              updatedCupLineups[cupKey] = {
                ...cupLineup,
                captains: updateSlots(cupLineup.captains),
                naSlots: updateSlots(cupLineup.naSlots),
                brLatamSlots: updateSlots(cupLineup.brLatamSlots),
                flexSlots: updateSlots(cupLineup.flexSlots),
                bench: cupLineup.bench.filter(playerId => newRoster.includes(playerId))
              };
            }
          }
          return updatedCupLineups;
        };

        await Promise.all([
          updateDoc(
            doc(db, "leagues", leagueId.toString(), "teams", trade.proposerId),
            { 
              roster: updatedProposerRoster,
              cupLineups: updateCupLineups(proposerTeam, updatedProposerRoster)
            }
          ),
          updateDoc(
            doc(db, "leagues", leagueId.toString(), "teams", trade.receiverId),
            { 
              roster: updatedReceiverRoster,
              cupLineups: updateCupLineups(receiverTeam, updatedReceiverRoster)
            }
          ),
        ]);
      } else {
        await updateDoc(doc(db, "leagues", leagueId.toString()), {
          [`trades.${tradeId}.status`]: "rejected",
        });
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to respond to trade"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleTeamSelect = (teamId: string) => {
    setSelectedTeam(teams[teamId]);
    setSelectedProposerPlayers([]);
    setSelectedReceiverPlayers([]);
  };

  return (
    <div className="row">
      {/* Only show trade proposal section if user can manage team */}
      {(userTeam.ownerID === user.uid || userTeam.coOwners?.includes(user.uid)) && (
        <div className="col-md-7">
          <div className="card">
            <div className="card-header">
              <h4 className="h5 mb-0">Propose Trade</h4>
            </div>
            <div className="card-body">
              {error && <div className="alert alert-danger">{error}</div>}

              <div className="mb-4">
                <label className="form-label">Select Team to Trade With</label>
                <select
                  className="form-select"
                  value={selectedTeam?.teamId || ""}
                  onChange={(e) => handleTeamSelect(e.target.value)}
                >
                  <option value="">Select a team...</option>
                  {otherTeams.map((team) => (
                    <option key={team.teamId} value={team.teamId}>
                      <TeamDisplay team={team} />
                    </option>
                  ))}
                </select>
              </div>

              {selectedTeam && (
                <div className="row">
                  <div className="col-md-6">
                    <h6>Your Players</h6>
                    <div className="list-group mb-3">
                      {userTeam.roster.map((playerId) => {
                        const player = players[playerId];
                        if (!player) return null;

                        return (
                          <button
                            key={playerId}
                            className={`list-group-item list-group-item-action ${
                              selectedProposerPlayers.includes(playerId)
                                ? "active"
                                : ""
                            }`}
                            onClick={() => {
                              setSelectedProposerPlayers((prev) =>
                                prev.includes(playerId)
                                  ? prev.filter((id) => id !== playerId)
                                  : [...prev, playerId]
                              );
                            }}
                          >
                            <div className="d-flex justify-content-between align-items-center">
                              <div>
                                <span>{player.name}</span>
                                <small
                                  className={`ms-2 ${
                                    selectedProposerPlayers.includes(playerId)
                                      ? "text-white"
                                      : "text-muted"
                                  }`}
                                >
                                  ({player.region})
                                </small>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="col-md-6">
                    <h6>{selectedTeam.teamName}'s Players</h6>
                    <div className="list-group mb-3">
                      {selectedTeam.roster.map((playerId) => {
                        const player = players[playerId];
                        if (!player) return null;

                        return (
                          <button
                            key={playerId}
                            className={`list-group-item list-group-item-action ${
                              selectedReceiverPlayers.includes(playerId)
                                ? "active"
                                : ""
                            }`}
                            onClick={() => {
                              setSelectedReceiverPlayers((prev) =>
                                prev.includes(playerId)
                                  ? prev.filter((id) => id !== playerId)
                                  : [...prev, playerId]
                              );
                            }}
                          >
                            <div className="d-flex justify-content-between align-items-center">
                              <div>
                                <span>{player.name}</span>
                                <small
                                  className={`ms-2 ${
                                    selectedReceiverPlayers.includes(playerId)
                                      ? "text-white"
                                      : "text-muted"
                                  }`}
                                >
                                  ({player.region})
                                </small>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="col-12">
                    <button
                      className="btn btn-primary w-100"
                      onClick={proposeTrade}
                      disabled={
                        loading ||
                        selectedProposerPlayers.length === 0 ||
                        selectedReceiverPlayers.length === 0
                      }
                    >
                      {loading ? "Processing..." : "Propose Trade"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Pending Trades and Recent History */}
      <div className="col-md-5">
        {/* Pending Trades */}
        <div className="card mb-4">
          <div className="card-header">
            <h4 className="h5 mb-0">Pending Trades</h4>
          </div>
          <div className="card-body">
            {getPendingTrades().length === 0 ? (
              <p className="text-muted">No pending trades</p>
            ) : (
              <div className="list-group">
                {getPendingTrades().map(([tradeId, trade]) => {
                  const proposerTeam = teams[trade.proposerId];
                  const receiverTeam = teams[trade.receiverId];

                  return (
                    <div key={tradeId} className="list-group-item">
                      <div className="mb-3">
                        <p className="mb-1">
                          <strong><TeamDisplay team={proposerTeam} /></strong> receives:{" "}
                          {renderPlayerNames(trade.receiverPlayers)}
                        </p>
                        <p className="mb-0">
                          <strong><TeamDisplay team={receiverTeam} /></strong> receives:{" "}
                          {renderPlayerNames(trade.proposerPlayers)}
                        </p>
                      </div>

                      <div className="btn-group">
                        {trade.receiverId === userTeam.teamId ? (
                          <>
                            <button
                              className="btn btn-sm btn-success"
                              onClick={() => respondToTrade(tradeId, true)}
                              disabled={loading || !userTeam.ownerID}
                            >
                              Accept
                            </button>
                            <button
                              className="btn btn-sm btn-danger"
                              onClick={() => respondToTrade(tradeId, false)}
                              disabled={loading || !userTeam.ownerID}
                            >
                              Reject
                            </button>
                          </>
                        ) : (
                          <button
                            className="btn btn-sm btn-danger"
                            onClick={() => cancelTrade(tradeId)}
                            disabled={loading || !userTeam.ownerID}
                          >
                            Cancel Trade
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Recent Trade History */}
        <div className="card">
          <div className="card-header">
            <h4 className="h5 mb-0">Recent Trade History</h4>
          </div>
          <div className="card-body">
            {getRecentTransactions().length === 0 ? (
              <p className="text-muted">No recent trades</p>
            ) : (
              <div className="list-group">
                {getRecentTransactions().map((transaction) => {
                  const date = new Date(
                    transaction.timestamp
                  ).toLocaleDateString();

                  return (
                    <div key={transaction.id} className="list-group-item">
                      <small className="text-muted d-block mb-2">{date}</small>
                      {transaction.teamIds.map((teamId) => {
                        const team = teams[teamId];
                        const addedPlayers = transaction.adds[teamId] || [];
                        const droppedPlayers = transaction.drops[teamId] || [];

                        return (
                          <div key={teamId} className="mb-2">
                            <strong><TeamDisplay team={team} /></strong>
                            <div className="ms-3">
                              {addedPlayers.length > 0 && (
                                <div className="text-success">
                                  + Received: {renderPlayerNames(addedPlayers)}
                                </div>
                              )}
                              {droppedPlayers.length > 0 && (
                                <div className="text-danger">
                                  - Sent: {renderPlayerNames(droppedPlayers)}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TradeTab;

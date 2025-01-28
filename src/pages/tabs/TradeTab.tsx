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

interface TradeTabProps {
  league: League;
  players: Record<string, Player>;
  userTeam: Team | null;
  leagueId: number;
  teams: Record<string, Team>;
}

const TradeTab: React.FC<TradeTabProps> = ({
  league,
  players,
  userTeam,
  leagueId,
  teams,
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

  const getOtherTeams = () => {
    return Object.values(teams).filter(
      (team) => team.teamId !== userTeam?.teamId
    );
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

    // Calculate new roster sizes after trade
    const proposerNewSize =
      userTeam.roster.length -
      selectedProposerPlayers.length +
      selectedReceiverPlayers.length;
    const receiverNewSize =
      selectedTeam.roster.length -
      selectedReceiverPlayers.length +
      selectedProposerPlayers.length;

    if (proposerNewSize > getTotalRosterLimit(league.settings)) {
      setError("Trade would exceed your roster limit");
      return;
    }

    if (receiverNewSize > getTotalRosterLimit(league.settings)) {
      setError("Trade would exceed other team's roster limit");
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

        // Calculate new roster sizes
        const proposerNewSize =
          proposerTeam.roster.length -
          trade.proposerPlayers.length +
          trade.receiverPlayers.length;
        const receiverNewSize =
          receiverTeam.roster.length -
          trade.receiverPlayers.length +
          trade.proposerPlayers.length;

        if (
          proposerNewSize > getTotalRosterLimit(league.settings) ||
          receiverNewSize > getTotalRosterLimit(league.settings)
        ) {
          setError("Trade would exceed roster size limits");
          return;
        }

        // Create transaction record
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

        // Update rosters
        const updatedProposerRoster = proposerTeam.roster
          .filter((playerId) => !trade.proposerPlayers.includes(playerId))
          .concat(trade.receiverPlayers);

        const updatedReceiverRoster = receiverTeam.roster
          .filter((playerId) => !trade.receiverPlayers.includes(playerId))
          .concat(trade.proposerPlayers);

        // Update both teams, trade status, and add transaction
        await Promise.all([
          updateDoc(
            doc(db, "leagues", leagueId.toString(), "teams", trade.proposerId),
            { roster: updatedProposerRoster }
          ),
          updateDoc(
            doc(db, "leagues", leagueId.toString(), "teams", trade.receiverId),
            { roster: updatedReceiverRoster }
          ),
          updateDoc(doc(db, "leagues", leagueId.toString()), {
            [`trades.${tradeId}`]: {
              ...trade,
              status: "accepted",
              transactionId,
            },
            transactions: [...(league.transactions || []), transaction],
          }),
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

  return (
    <div className="row">
      {/* Propose Trade */}
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
                onChange={(e) => {
                  const team = getOtherTeams().find(
                    (t) => t.teamId === e.target.value
                  );
                  setSelectedTeam(team || null);
                  setSelectedProposerPlayers([]);
                  setSelectedReceiverPlayers([]);
                }}
              >
                <option value="">Select a team...</option>
                {getOtherTeams().map((team) => (
                  <option key={team.teamId} value={team.teamId}>
                    {team.teamName}
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
                          <strong>{proposerTeam.teamName}</strong> receives:{" "}
                          {renderPlayerNames(trade.receiverPlayers)}
                        </p>
                        <p className="mb-0">
                          <strong>{receiverTeam.teamName}</strong> receives:{" "}
                          {renderPlayerNames(trade.proposerPlayers)}
                        </p>
                      </div>

                      <div className="btn-group">
                        {trade.receiverId === userTeam.teamId ? (
                          <>
                            <button
                              className="btn btn-sm btn-success"
                              onClick={() => respondToTrade(tradeId, true)}
                              disabled={loading}
                            >
                              Accept
                            </button>
                            <button
                              className="btn btn-sm btn-danger"
                              onClick={() => respondToTrade(tradeId, false)}
                              disabled={loading}
                            >
                              Reject
                            </button>
                          </>
                        ) : (
                          <button
                            className="btn btn-sm btn-danger"
                            onClick={() => cancelTrade(tradeId)}
                            disabled={loading}
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
                            <strong>{team.teamName}</strong>
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

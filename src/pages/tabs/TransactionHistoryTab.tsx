import React, { useState } from "react";
import type { League, Player, Transaction, Team } from "../../types";
import { format } from "date-fns";

interface TransactionHistoryTabProps {
  league: League;
  players: Record<string, Player>;
  teams: Record<string, Team>;
}

const TransactionHistoryTab: React.FC<TransactionHistoryTabProps> = ({
  league,
  players,
  teams,
}) => {
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");

  const transactions = league.transactions || [];

  const transactionTypes = {
    trade: "Trades",
    waiver: "Waiver Claims",
    free_agent: "Free Agent Adds",
    commissioner: "Commissioner Actions",
  };

  const getTeamName = (teamId: string) =>
    teams[teamId]?.teamName || "Unknown Team";

  const getPlayerName = (playerId: string) =>
    players[playerId]?.name || "Unknown Player";

  interface BaseTransactionDetail {
    team: string;
    added: string;
    dropped: string;
  }

  interface TradeTransactionDetail extends BaseTransactionDetail {}

  interface WaiverTransactionDetail extends BaseTransactionDetail {
    faabSpent?: number;
  }

  interface FreeAgentTransactionDetail extends BaseTransactionDetail {}

  interface CommissionerTransactionDetail extends BaseTransactionDetail {
    reason?: string;
    commissioner?: string;
  }

  type TransactionDetail =
    | TradeTransactionDetail
    | WaiverTransactionDetail
    | FreeAgentTransactionDetail
    | CommissionerTransactionDetail;

  const formatTransaction = (transaction: Transaction): TransactionDetail[] => {
    switch (transaction.type) {
      case "trade":
        return transaction.teamIds.map((teamId) => ({
          team: getTeamName(teamId),
          added: (transaction.adds[teamId] || []).map(getPlayerName).join(", "),
          dropped: (transaction.drops[teamId] || [])
            .map(getPlayerName)
            .join(", "),
        }));

      case "waiver":
        return transaction.teamIds.map((teamId) => ({
          team: getTeamName(teamId),
          added: (transaction.adds[teamId] || []).map(getPlayerName).join(", "),
          dropped: (transaction.drops[teamId] || [])
            .map(getPlayerName)
            .join(", "),
          faabSpent: transaction.metadata.faabSpent?.[teamId],
        }));

      case "free_agent":
        return transaction.teamIds.map((teamId) => ({
          team: getTeamName(teamId),
          added: (transaction.adds[teamId] || []).map(getPlayerName).join(", "),
          dropped: (transaction.drops[teamId] || [])
            .map(getPlayerName)
            .join(", "),
        }));

      case "commissioner":
        return transaction.teamIds.map((teamId) => ({
          team: getTeamName(teamId),
          added: (transaction.adds[teamId] || []).map(getPlayerName).join(", "),
          dropped: (transaction.drops[teamId] || []).map(getPlayerName).join(", "),
          reason: transaction.metadata.reason,
          commissioner: transaction.metadata.commissioner 
            ? getTeamName(transaction.metadata.commissioner)
            : "System"
        }));

      default:
        return [];
    }
  };

  const filteredTransactions = transactions
    .filter((transaction) => {
      // Filter by selected types
      if (
        selectedTypes.length > 0 &&
        !selectedTypes.includes(transaction.type)
      ) {
        return false;
      }

      // Filter by selected team
      if (selectedTeam && !transaction.teamIds.includes(selectedTeam)) {
        return false;
      }

      // Filter by search query
      if (searchQuery) {
        const searchLower = searchQuery.toLowerCase();
        const teamsInvolved = transaction.teamIds
          .map((id) => getTeamName(id).toLowerCase())
          .join(" ");
        const playersInvolved = [
          ...Object.values(transaction.adds).flat(),
          ...Object.values(transaction.drops).flat(),
        ]
          .map((id) => getPlayerName(id).toLowerCase())
          .join(" ");

        return (
          teamsInvolved.includes(searchLower) ||
          playersInvolved.includes(searchLower)
        );
      }

      return true;
    })
    .sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

  return (
    <div className="row">
      <div className="col-12">
        <div className="card">
          <div className="card-header">
            <h4 className="h5 mb-0">Transaction History</h4>
          </div>
          <div className="card-body">
            {/* Filters */}
            <div className="row mb-4">
              <div className="col-md-4">
                <label className="form-label">Transaction Types</label>
                <div>
                  {Object.entries(transactionTypes).map(([type, label]) => (
                    <div className="form-check form-check-inline" key={type}>
                      <input
                        className="form-check-input"
                        type="checkbox"
                        id={`type-${type}`}
                        checked={selectedTypes.includes(type)}
                        onChange={(e) => {
                          setSelectedTypes(
                            e.target.checked
                              ? [...selectedTypes, type]
                              : selectedTypes.filter((t) => t !== type)
                          );
                        }}
                      />
                      <label
                        className="form-check-label"
                        htmlFor={`type-${type}`}
                      >
                        {label}
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              <div className="col-md-4">
                <label className="form-label">Filter by Team</label>
                <select
                  className="form-select"
                  value={selectedTeam}
                  onChange={(e) => setSelectedTeam(e.target.value)}
                >
                  <option value="">All Teams</option>
                  {Object.entries(teams).map(([teamId, team]) => (
                    <option key={teamId} value={teamId}>
                      {team.teamName}
                    </option>
                  ))}
                </select>
              </div>

              <div className="col-md-4">
                <label className="form-label">Search</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Search teams or players..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            {/* Transactions List */}
            <div className="list-group">
              {filteredTransactions.length === 0 ? (
                <div className="text-muted text-center py-4">
                  No transactions found
                </div>
              ) : (
                filteredTransactions.map((transaction) => {
                  const formattedDetails = formatTransaction(
                    transaction
                  ) as TransactionDetail[];
                  const date = format(
                    new Date(transaction.timestamp),
                    "MMM d, yyyy h:mm a"
                  );

                  return (
                    <div key={transaction.id} className="list-group-item">
                      <div className="d-flex justify-content-between align-items-center mb-2">
                        <span className="badge bg-secondary">
                          {transactionTypes[transaction.type]}
                        </span>
                        <small className="text-muted">{date}</small>
                      </div>

                      {formattedDetails.map((detail, index) => (
                        <div key={index} className="mb-2">
                          <strong>{detail.team}</strong>
                          <div className="ms-3">
                            {transaction.type === "trade" ? (
                              <>
                                {detail.added && (
                                  <div className="text-success">
                                    + Received: {detail.added}
                                  </div>
                                )}
                                {detail.dropped && (
                                  <div className="text-danger">
                                    - Sent: {detail.dropped}
                                  </div>
                                )}
                              </>
                            ) : (
                              <>
                                {detail.added && (
                                  <div className="text-success">
                                    + Added: {detail.added}
                                  </div>
                                )}
                                {detail.dropped && (
                                  <div className="text-danger">
                                    - Dropped: {detail.dropped}
                                  </div>
                                )}
                              </>
                            )}
                            {"faabSpent" in detail &&
                              detail.faabSpent !== undefined && (
                                <div className="text-muted">
                                  FAAB Spent: ${detail.faabSpent}
                                </div>
                              )}
                          </div>
                          {"reason" in detail && detail.reason && (
                            <div className="mt-1 text-muted">
                              <small>
                                Reason: {detail.reason} (by Commissioner{" "}
                                {detail.commissioner})
                              </small>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TransactionHistoryTab;

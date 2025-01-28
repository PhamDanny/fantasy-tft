import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { fetchPlayers, subscribeToLeague } from "../firebase/queries";
import { useAuth } from "../firebase/auth";
import type { League, Player, Team } from "../types";
import { User } from "firebase/auth";
import StandingsTab from "./tabs/StandingsTab";
import TeamTab from "./tabs/TeamTab";
import PlayersTab from "./tabs/PlayersTab";
import TradeTab from "./tabs/TradeTab";
import TransactionHistoryTab from "./tabs/TransactionHistoryTab";
import LeagueSettingsTab from "./tabs/LeagueSettingsTab";

const TABS = {
  STANDINGS: "Standings",
  TEAM: "Team",
  PLAYERS: "Players",
  TRADE: "Trade",
  TRANSACTIONS: "Transaction History",
  SETTINGS: "Edit League Settings",
} as const;

type TabType = (typeof TABS)[keyof typeof TABS];

export const LeagueView: React.FC = () => {
  const { leagueId } = useParams();
  const numericLeagueId = parseInt(leagueId || "");
  const [activeTab, setActiveTab] = useState<TabType>(TABS.STANDINGS);

  const [league, setLeague] = useState<League | null>(null);
  const [players, setPlayers] = useState<Record<string, Player>>({});
  const [isCommissioner, setIsCommissioner] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [userTeam, setUserTeam] = useState<Team | null>(null);

  useEffect(() => {
    let leagueUnsubscribe: (() => void) | undefined;

    const authUnsubscribe = useAuth((authUser) => {
      setUser(authUser);
      if (authUser) {
        setLoading(true);

        leagueUnsubscribe = subscribeToLeague(
          numericLeagueId,
          (leagueData: League) => {
            setLeague(leagueData);
            setIsCommissioner(leagueData.commissioner === authUser.uid);

            // Find user's team
            const foundUserTeam = Object.values(leagueData.teams).find(
              (team) => team.ownerID === authUser.uid
            ) as Team | undefined;

            setUserTeam(foundUserTeam || null);

            // Get all unique player IDs from all teams
            const playerIds = Array.from(
              new Set(
                Object.values(leagueData.teams).flatMap(
                  (team) => (team as Team).roster
                )
              )
            );

            // Fetch players
            fetchPlayers(playerIds).then((playersData) => {
              setPlayers(playersData);
              setLoading(false);
            });
          },
          (error: Error) => {
            setError(error.message);
            setLoading(false);
          }
        );
      }
    });

    return () => {
      authUnsubscribe();
      if (leagueUnsubscribe) {
        leagueUnsubscribe();
      }
    };
  }, [numericLeagueId]);

  if (loading) return <div className="p-4">Loading...</div>;
  if (error) return <div className="p-4 text-danger">Error: {error}</div>;
  if (!league) return <div className="p-4">League not found</div>;
  if (!user)
    return <div className="p-4">Please log in to view league details</div>;

  // Calculate pending items
  const pendingWaivers = userTeam?.pendingBids?.length || 0;
  const pendingTrades = Object.values(league.trades || {}).filter(
    (trade) =>
      trade.status === "pending" &&
      (trade.proposerId === userTeam?.teamId ||
        trade.receiverId === userTeam?.teamId)
  ).length;

  return (
    <div className="container-fluid mt-4">
      <div className="card">
        <div className="card-header border-bottom">
          <h2 className="h4 mb-0">{league.name}</h2>
          <div className="small text-muted">
            {league.season}
            {isCommissioner && (
              <span className="ms-2 text-primary">(Commissioner)</span>
            )}
          </div>
        </div>

        <div className="card-body p-0">
          {/* Tabs */}
          <ul className="nav nav-tabs">
            {Object.values(TABS).map((tab) => (
              <li className="nav-item" key={tab}>
                <button
                  className={`nav-link ${activeTab === tab ? "active" : ""}`}
                  onClick={() => setActiveTab(tab)}
                >
                  {tab}
                  {tab === TABS.PLAYERS && pendingWaivers > 0 && (
                    <span className="badge bg-danger rounded-pill ms-2">
                      {pendingWaivers}
                    </span>
                  )}
                  {tab === TABS.TRADE && pendingTrades > 0 && (
                    <span className="badge bg-danger rounded-pill ms-2">
                      {pendingTrades}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>

          {/* Tab Content */}
          <div className="p-4">
            {activeTab === TABS.STANDINGS && (
              <StandingsTab league={league} players={players} user={user} />
            )}
            {activeTab === TABS.TEAM && (
              <TeamTab
                league={league}
                players={players}
                userTeam={userTeam}
                leagueId={numericLeagueId}
              />
            )}
            {activeTab === TABS.PLAYERS && (
              <PlayersTab
                league={league}
                players={players}
                userTeam={userTeam}
                leagueId={numericLeagueId}
              />
            )}
            {activeTab === TABS.TRADE && (
              <TradeTab
                league={league}
                players={players}
                userTeam={userTeam}
                leagueId={numericLeagueId}
              />
            )}
            {activeTab === TABS.TRANSACTIONS && (
              <TransactionHistoryTab league={league} players={players} />
            )}
            {activeTab === TABS.SETTINGS && (
              <LeagueSettingsTab
                league={league}
                isCommissioner={isCommissioner}
                leagueId={numericLeagueId}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default LeagueView;

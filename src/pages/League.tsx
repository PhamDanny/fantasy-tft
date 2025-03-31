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
import { collection, onSnapshot, query, getDoc, doc } from "firebase/firestore";
import { db } from "../firebase/config";
import DraftTab from "./tabs/DraftTab";
import PlayoffsTab from "./tabs/PlayoffsTab";
import { TABS } from '../types'; 
import { getLeagueType } from "../types";

function hasTeam(league: League, userId: string, teamsData: Record<string, Team>, isAdmin: boolean): boolean {
  // Admins can access any league
  if (isAdmin) return true;

  // Check if user is commissioner
  if (league.commissioner === userId) return true;
  
  // Check if user has a team in the teams subcollection
  return Object.values(teamsData).some((team: Team) => 
    team.ownerID === userId || team.coOwners?.includes(userId)
  );
}

const getAvailableTabs = (league: League, isCommissioner: boolean): Record<string, boolean> => {
  const { phase, settings } = league;

  // Base tabs that are always false unless set to true
  const baseTabs = {
    STANDINGS: false,
    TEAM: false,
    PLAYERS: false,
    TRADE: false,
    DRAFT: false,
    PLAYOFFS: false,
    TRANSACTIONS: false,
    SETTINGS: false,
  };

  switch (phase) {
    case 'drafting':
      // If draft is completed but still in drafting phase, show all in_season tabs
      if (settings.draftStarted) {
        return {
          ...baseTabs,
          STANDINGS: true,
          TEAM: true,
          PLAYERS: false,
          TRADE: settings.tradingEnabled === true && getLeagueType(league) === "season-long",
          TRANSACTIONS: true,
          SETTINGS: isCommissioner,
          DRAFT: true,
        };
      }
      // If draft hasn't started, only show draft and settings
      return {
        ...baseTabs,
        DRAFT: true,
        SETTINGS: isCommissioner,
      };
    
    case 'in_season':
      return {
        ...baseTabs,
        STANDINGS: true,
        TEAM: true,
        PLAYERS: true,
        TRADE: settings.tradingEnabled === true && getLeagueType(league) === "season-long",
        TRANSACTIONS: true,
        SETTINGS: isCommissioner,
        PLAYOFFS: settings.playoffs === true,
        DRAFT: true,
      };
    
    case 'playoffs':
      return {
        ...baseTabs,
        STANDINGS: true,
        TEAM: true,
        PLAYOFFS: settings.playoffs === true,
        TRANSACTIONS: true,
        SETTINGS: isCommissioner,
        DRAFT: true,
      };
    
    case 'completed':
      return {
        ...baseTabs,
        STANDINGS: true,
        TEAM: true,
        PLAYOFFS: settings.playoffs === true,
        TRANSACTIONS: true,
        DRAFT: true,
      };

    default:
      return baseTabs;
  }
};

// Add this helper function to get tabs in order
const getOrderedTabs = (availableTabs: Record<string, boolean>) => {
  const orderedTabs = Object.entries(TABS)
    .filter(([key, _]) => availableTabs[key]);  // Use the TABS key to look up in availableTabs
  return orderedTabs;
};


export const LeagueView: React.FC = () => {
  const { leagueId } = useParams();
  const [league, setLeague] = useState<League | null>(null);
  const [players, setPlayers] = useState<Record<string, Player>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<string>('STANDINGS');
  const [teams, setTeams] = useState<Record<string, Team>>({});
  const [isCommissioner, setIsCommissioner] = useState(false);
  const [userTeam, setUserTeam] = useState<Team | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let leagueUnsubscribe: (() => void) | undefined;
    let teamsUnsubscribe: (() => void) | undefined;

    const authUnsubscribe = useAuth(async (authUser) => {
      setUser(authUser);
      if (authUser && leagueId) {
        const numericLeagueId = parseInt(leagueId);
        try {
          setLoading(true);
          
          // Check if user is admin
          const userDoc = await getDoc(doc(db, 'users', authUser.uid));
          setIsAdmin(userDoc.exists() && userDoc.data().admin === true);

          // Subscribe to league first to get the season
          leagueUnsubscribe = subscribeToLeague(
            numericLeagueId,
            async (leagueData: League) => {
              setLeague(leagueData);
              setIsCommissioner(leagueData.commissioner === authUser.uid);

              // Load players with the league's season
              const allPlayers = await fetchPlayers(leagueData.season);
              setPlayers(allPlayers);

              // Subscribe to teams subcollection
              const teamsQuery = query(collection(db, "leagues", numericLeagueId.toString(), "teams"));
              teamsUnsubscribe = onSnapshot(teamsQuery, (snapshot) => {
                const teamsData: Record<string, Team> = {};
                snapshot.forEach((doc) => {
                  teamsData[doc.id] = doc.data() as Team;
                });
                setTeams(teamsData);
                
                const foundUserTeam = Object.values(teamsData).find(team => 
                  team.ownerID === authUser.uid || team.coOwners?.includes(authUser.uid)
                );
                setUserTeam(foundUserTeam || null);
              });

              setLoading(false);
            },
            (error: Error) => {
              setError(error.message);
              setLoading(false);
            }
          );
        } catch (err) {
          console.error('Error setting up league subscriptions:', err);
          setError('Failed to load league data');
          setLoading(false);
        }
      } else {
        setLoading(false);
      }
    });

    return () => {
      authUnsubscribe();
      if (leagueUnsubscribe) leagueUnsubscribe();
      if (teamsUnsubscribe) teamsUnsubscribe();
    };
  }, [leagueId]);

  useEffect(() => {
    // When league phase changes, ensure selected tab is valid
    if (league) {
      const availableTabs = getAvailableTabs(league, isCommissioner);
      if (!availableTabs[activeTab]) {
        // Set to first available tab
        const firstTab = Object.entries(availableTabs)
          .find(([_, isAvailable]) => isAvailable)?.[0] as string;
        setActiveTab(firstTab || 'STANDINGS');
      }
    }
  }, [league?.phase, isCommissioner, activeTab]);

  if (loading) {
    return (
      <div className="p-4">
        <div className="d-flex align-items-center">
          <div className="spinner-border me-2" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
          Loading league data...
        </div>
      </div>
    );
  }

  if (error) return <div className="p-4 text-danger">Error: {error}</div>;
  if (!league) return <div className="p-4">League not found</div>;
  if (!user) return <div className="p-4">Please log in to view league details</div>;

  // Check access after loading
  if (!hasTeam(league, user.uid, teams, isAdmin)) {
    return (
      <div className="container mt-4">
        <div className="alert alert-danger">
          You do not have permission to view this league.
        </div>
      </div>
    );
  }

  // Calculate pending items
  const pendingWaivers = userTeam?.pendingBids?.length || 0;
  const pendingTrades = Object.values(league.trades || {}).filter(
    (trade) =>
      trade.status === "pending" &&
      (trade.proposerId === userTeam?.teamId ||
        trade.receiverId === userTeam?.teamId)
  ).length;

  const availableTabs = getAvailableTabs(league, isCommissioner);

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
          {/* Desktop Tabs */}
          <ul className="nav nav-tabs d-none d-md-flex">
            {getOrderedTabs(availableTabs).map(([tab, label]) => (
              <li className="nav-item" key={tab}>
                <button
                  className={`nav-link ${activeTab === tab ? "active" : ""}`}
                  onClick={() => setActiveTab(tab as string)}
                >
                  {label}
                  {tab === 'PLAYERS' && pendingWaivers > 0 && (
                    <span className="badge bg-danger rounded-pill ms-2">
                      {pendingWaivers}
                    </span>
                  )}
                  {tab === 'TRADE' && pendingTrades > 0 && (
                    <span className="badge bg-danger rounded-pill ms-2">
                      {pendingTrades}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>

          {/* Mobile Tabs Dropdown */}
          <div className="d-md-none p-2">
            <select 
              className="form-select"
              value={activeTab}
              onChange={(e) => setActiveTab(e.target.value as string)}
            >
              {getOrderedTabs(availableTabs).map(([tab, label]) => (
                <option key={tab} value={tab}>
                  {label}
                  {tab === 'PLAYERS' && pendingWaivers > 0 && ` (${pendingWaivers})`}
                  {tab === 'TRADE' && pendingTrades > 0 && ` (${pendingTrades})`}
                </option>
              ))}
            </select>
          </div>

          {/* Tab Content */}
          <div className="p-2 p-md-4">
            {activeTab === 'STANDINGS' && (
              <StandingsTab league={league} players={players} user={user} teams={teams} />
            )}
            {activeTab === 'TEAM' && (
              <TeamTab
                league={league}
                players={players}
                userTeam={userTeam}
                leagueId={parseInt(leagueId || "")}
                teams={teams}
                user={user}
              />
            )}
            {activeTab === 'PLAYERS' && (
              <PlayersTab
                league={league}
                players={players}
                userTeam={userTeam}
                leagueId={parseInt(leagueId || "")}
                teams={teams}
                user={user}
              />
            )}
            {activeTab === 'TRADE' && (
              <TradeTab
                league={league}
                players={players}
                userTeam={userTeam}
                leagueId={parseInt(leagueId || "")}
                teams={teams}
                user={user}
              />
            )}
            {activeTab === 'TRANSACTIONS' && (
              <TransactionHistoryTab league={league} players={players} teams={teams} />
            )}
            {activeTab === 'SETTINGS' && (
              <LeagueSettingsTab
                league={league}
                isCommissioner={isCommissioner}
                leagueId={parseInt(leagueId || "")}
                teams={teams}
                players={players}
              />
            )}
            {activeTab === 'DRAFT' && (
              <DraftTab 
                league={league} 
                players={players}
                teams={teams}
              />
            )}
            {activeTab === 'PLAYOFFS' && (
              <PlayoffsTab
                league={league}
                players={players}
                user={user}
                teams={teams}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default LeagueView;

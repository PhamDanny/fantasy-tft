import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../firebase/auth";
import { fetchUserLeagues } from "../firebase/queries";
import type { League } from "../types";
import CreateLeagueDialog from "../components/dialogs/CreateLeagueDialog";
import AdminCupPanel from '../components/AdminCupPanel';
import { getDoc, doc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { getLeagueType } from '../types';

const MyLeagues = () => {
  const [user, setUser] = useState<any>(null);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);
  const [filter, setFilter] = useState<'all' | 'season' | 'tournament'>('all');

  const loadLeagues = async (authUser: any) => {
    if (!authUser) return;
    try {
      const userLeagues = await fetchUserLeagues(authUser.uid);
      setLeagues(userLeagues);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch leagues");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const unsubscribe = useAuth(async (authUser) => {
      setUser(authUser);
      if (authUser) {
        // Check if user is admin
        const userDoc = await getDoc(doc(db, 'users', authUser.uid));
        setIsAdmin(userDoc.exists() && userDoc.data().admin === true);
        loadLeagues(authUser);
      } else {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  // Group leagues by type
  const seasonLeagues = leagues.filter(l => getLeagueType(l) === 'season-long');
  const tournamentLeagues = leagues.filter(l => getLeagueType(l) === 'single-tournament');
  
  const getPhaseDisplay = (league: League) => {
    switch (league.phase) {
      case 'drafting':
        return <span className="badge bg-info">Drafting</span>;
      case 'in_season':
        // Only show cup number for single-tournament leagues
        return getLeagueType(league) === 'single-tournament' ? 
          <span className="badge bg-success">Tactician's Cup {league.settings.currentCup}</span> :
          <span className="badge bg-success">Regular Season</span>;
      case 'playoffs':
        return <span className="badge bg-warning text-dark">Playoffs</span>;
      case 'completed':
        return <span className="badge bg-secondary">Completed</span>;
      default:
        return null;
    }
  };

  const getLeagueTypeDisplay = (league: League) => {
    return getLeagueType(league) === 'season-long' ? 
      <span className="badge bg-primary">Full Season</span> :
      <span className="badge bg-primary">Single Tournament</span>;
  };

  const displayLeagues = filter === 'all' ? leagues :
    filter === 'season' ? seasonLeagues : tournamentLeagues;

  if (loading) {
    return <div className="p-4">Loading...</div>;
  }

  if (error) {
    return <div className="p-4 text-danger">Error: {error}</div>;
  }

  return (
    <div className="container mt-4">
      {isAdmin && (
        <AdminCupPanel 
          isVisible={isAdmin} 
          user={user}
        />
      )}

      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2>Leagues</h2>
        {user && leagues.length > 0 && (
          <div className="btn-group">
            <button 
              className={`btn btn-outline-primary ${filter === 'all' ? 'active' : ''}`}
              onClick={() => setFilter('all')}
            >
              All
            </button>
            <button 
              className={`btn btn-outline-primary ${filter === 'season' ? 'active' : ''}`}
              onClick={() => setFilter('season')}
            >
              Full Season
            </button>
            <button 
              className={`btn btn-outline-primary ${filter === 'tournament' ? 'active' : ''}`}
              onClick={() => setFilter('tournament')}
            >
              Single Tournament
            </button>
          </div>
        )}
      </div>

      <div className="row mb-4">
        <div className="col-md-6">
          <div className="card h-100">
            <div className="card-header bg-primary bg-opacity-10">
              <h5 className="mb-0">Full Season Leagues</h5>
            </div>
            <div className="card-body">
              <p className="card-text">
                Compete over an entire TFT set through multiple tournaments:
              </p>
              <ul className="mb-0">
                <li>Participate in every Tactician's Cups</li>
                <li>Manage your roster through trades and free agency</li>
                <li>Optional playoffs based on the Americas Golden Spatula</li>
                <li>Perfect for long-term competition with your friends</li>
              </ul>
            </div>
          </div>
        </div>
        <div className="col-md-6">
          <div className="card h-100">
            <div className="card-header bg-warning bg-opacity-10">
              <h5 className="mb-0">Single Tournament Leagues</h5>
            </div>
            <div className="card-body">
              <p className="card-text">
                Quick, focused competition for one Tactician's Cup or Golden Spatula:
              </p>
              <ul className="mb-0">
                <li>Draft and compete for just one Tournament</li>
                <li>Simplified roster management</li>
                <li>No waivers or FAAB system</li>
                <li>Great for a low-commitment casual experience</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {!user ? (
        <div className="alert alert-info mb-4 d-flex justify-content-between align-items-center">
          <div>
            <strong>Want to create or join a league?</strong> Sign up to start competing with friends!
          </div>
          <a href="/login?mode=signup" className="btn btn-primary btn-sm">
            Sign Up Now
          </a>
        </div>
      ) : leagues.length === 0 ? (
        <div className="text-center py-5">
          <p className="text-muted mb-4">
            You are not a member of any leagues yet.
          </p>
          <CreateLeagueDialog
            userId={user.uid}
            onLeagueCreated={() => loadLeagues(user)}
          />
        </div>
      ) : (
        <>
          <div className="list-group mb-4">
            {displayLeagues.map((league) => {
              const userTeam = Object.values(league.teams).find(
                (team) => team.ownerID === user.uid || team.coOwners?.includes(user.uid)
              );

              return (
                <button
                  key={league.id}
                  className="list-group-item list-group-item-action"
                  onClick={() => navigate(`/leagues/${league.id}`)}
                >
                  <div className="d-flex justify-content-between align-items-center">
                    <div>
                      <div className="d-flex align-items-center gap-2 mb-1">
                        <h5 className="mb-0">{league.name}</h5>
                        {getLeagueTypeDisplay(league)}
                        {getPhaseDisplay(league)}
                      </div>
                      <small className="text-muted">
                        {league.commissioner === user.uid
                          ? userTeam
                            ? `Commissioner • Team: ${userTeam.teamName}`
                            : "Commissioner"
                          : userTeam
                          ? `Team: ${userTeam.teamName}`
                          : "Member"}
                      </small>
                    </div>
                    <div className="text-end">
                      <div>{league.season}</div>
                      <small className="text-muted">
                        {Object.keys(league.teams).length} / {league.settings.teamsLimit} teams
                      </small>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <CreateLeagueDialog
            userId={user.uid}
            onLeagueCreated={() => loadLeagues(user)}
          />
        </>
      )}
    </div>
  );
};

export default MyLeagues;

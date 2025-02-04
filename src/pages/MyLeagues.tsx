import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../firebase/auth";
import { fetchUserLeagues } from "../firebase/queries";
import type { League } from "../types";
import CreateLeagueDialog from "../components/dialogs/CreateLeagueDialog";

const MyLeagues = () => {
  const [user, setUser] = useState<any>(null);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

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
        loadLeagues(authUser);
      } else {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return <div className="p-4">Loading...</div>;
  }

  if (error) {
    return <div className="p-4 text-danger">Error: {error}</div>;
  }

  return (
    <div className="container mt-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2>Leagues</h2>
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
            {leagues.map((league) => {
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
                      <h5 className="mb-1">{league.name}</h5>
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
                    <small>{league.season}</small>
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

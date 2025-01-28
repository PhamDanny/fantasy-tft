import React, { useState, useEffect } from "react";
import { signIn, signUp, signOut, useAuth } from "../firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase/config";
import { fetchUserLeagues } from "../firebase/queries";
import type { League } from "../types";

export const Profile = () => {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState("");
  const [userData, setUserData] = useState<any>(null);
  const [leagues, setLeagues] = useState<League[]>([]);

  useEffect(() => {
    const unsubscribe = useAuth(async (authUser) => {
      setUser(authUser);
      setLoading(false);

      if (authUser) {
        try {
          const userDoc = await getDoc(doc(db, "users", authUser.uid));
          if (userDoc.exists()) {
            const userData = userDoc.data();
            setUserData(userData);

            // Fetch leagues data if user has any leagues
            if (userData.leagues && userData.leagues.length > 0) {
              const fetchedLeagues = await fetchUserLeagues(authUser.uid);
              setLeagues(fetchedLeagues);
            }
          }
        } catch (err) {
          console.error("Error fetching user data:", err);
          setError(err instanceof Error ? err.message : "An error occurred");
        }
      }
    });

    return () => unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    try {
      if (isSignUp) {
        await signUp(email, password, displayName);
      } else {
        await signIn(email, password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      setUser(null);
      setUserData(null);
      setLeagues([]);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "An error occurred signing out"
      );
    }
  };

  if (loading) {
    return <div className="text-center p-4">Loading...</div>;
  }

  if (user && userData) {
    return (
      <div className="card mt-4">
        <div className="card-header d-flex justify-content-between align-items-center">
          <h2 className="mb-0">Profile</h2>
          <button onClick={handleSignOut} className="btn btn-danger">
            Sign Out
          </button>
        </div>

        <div className="card-body">
          <div className="mb-3">
            <label className="fw-bold">Display Name</label>
            <p className="mb-0">{userData.displayName}</p>
          </div>

          <div className="mb-3">
            <label className="fw-bold">Email</label>
            <p className="mb-0">{userData.email}</p>
          </div>

          <div className="mb-3">
            <label className="fw-bold">Account Created</label>
            <p className="mb-0">
              {new Date(userData.createdAt).toLocaleDateString()}
            </p>
          </div>

          <div className="mb-3">
            <label className="fw-bold">Leagues</label>
            {!userData.leagues || userData.leagues.length === 0 ? (
              <p className="text-muted mb-0">Not part of any leagues yet</p>
            ) : (
              <ul className="list-group">
                {leagues.map((league) => {
                  const userTeam = Object.values(league.teams).find(
                    (team) => team.ownerID === user.uid || team.coOwners?.includes(user.uid)
                  );
                  return (
                    <li key={league.id} className="list-group-item">
                      {league.name}
                      {league.commissioner === user.uid && " (Commissioner)"}
                      {userTeam && ` (Team: ${userTeam.teamName})`}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card mt-4">
      <div className="card-header">
        <h2 className="mb-0">{isSignUp ? "Sign Up" : "Login"}</h2>
      </div>

      <div className="card-body">
        <form onSubmit={handleSubmit}>
          {isSignUp && (
            <div className="mb-3">
              <label className="form-label">Display Name</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="form-control"
                required
              />
            </div>
          )}

          <div className="mb-3">
            <label className="form-label">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="form-control"
              required
            />
          </div>

          <div className="mb-3">
            <label className="form-label">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="form-control"
              required
            />
          </div>

          {error && <div className="alert alert-danger">{error}</div>}

          <button type="submit" className="btn btn-primary w-100">
            {isSignUp ? "Sign Up" : "Login"}
          </button>
        </form>

        <button
          onClick={() => setIsSignUp(!isSignUp)}
          className="btn btn-link w-100 mt-3"
        >
          {isSignUp
            ? "Already have an account? Login"
            : "Need an account? Sign Up"}
        </button>
      </div>
    </div>
  );
};

export default Profile;

import { useState, useEffect } from "react";
import { signOut, useAuth } from "../firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase/config";
import { fetchUserLeagues } from "../firebase/queries";
import type { League } from "../types";
import Login from "./Login";
import { User } from "firebase/auth";
import { Timestamp } from 'firebase/firestore';

interface UserData {
  displayName: string;
  email: string;
  createdAt: string | Timestamp;
  leagues?: string[];
}

export const Profile = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [userData, setUserData] = useState<UserData | null>(null);
  const [leagues, setLeagues] = useState<League[]>([]);

  useEffect(() => {
    const unsubscribe = useAuth(async (authUser) => {
      setUser(authUser);
      setLoading(false);

      if (authUser) {
        try {
          const userDoc = await getDoc(doc(db, "users", authUser.uid));
          if (userDoc.exists()) {
            const data = userDoc.data() as UserData;
            setUserData(data);

            if (data.leagues && data.leagues.length > 0) {
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

  if (!user || !userData) {
    return <Login />;
  }

  return (
    <div className="card mt-4">
      <div className="card-header d-flex justify-content-between align-items-center">
        <h2 className="mb-0">Profile</h2>
        <button onClick={handleSignOut} className="btn btn-danger">
          Sign Out
        </button>
      </div>

      <div className="card-body">
        {error && <div className="alert alert-danger mb-3">{error}</div>}
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
            {typeof userData.createdAt === 'string' 
              ? new Date(userData.createdAt).toLocaleDateString()
              : userData.createdAt.toDate().toLocaleDateString()}
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
};

export default Profile;

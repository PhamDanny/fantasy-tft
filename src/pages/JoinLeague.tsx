import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { collection, getDocs, runTransaction, doc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase/config";
import { useAuth } from "../firebase/auth";
import type { League, Team } from "../types";

export const JoinLeague = () => {
  const { inviteCode } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const unsubscribe = useAuth((authUser) => {
      setUser(authUser);
      if (authUser && inviteCode) {
        handleJoin(authUser.uid, inviteCode);
      }
    });

    return () => unsubscribe();
  }, [inviteCode]);

  const handleJoin = async (userId: string, code: string) => {
    try {
      // Query all leagues
      const leaguesCol = collection(db, "leagues");
      const leaguesSnapshot = await getDocs(leaguesCol);

      // Find the league with this invite code
      let foundLeague: League | null = null;
      let foundLeagueId: string | null = null;

      for (const leagueDoc of leaguesSnapshot.docs) {
        const leagueData = leagueDoc.data() as League;
        if (leagueData.invites?.[code]) {
          foundLeague = leagueData;
          foundLeagueId = leagueDoc.id;
          break;
        }
      }

      if (!foundLeague || !foundLeagueId) {
        throw new Error("Invalid invite code");
      }

      // Check if user is already in the league by checking teams subcollection
      const teamsSnapshot = await getDocs(
        collection(db, "leagues", foundLeagueId, "teams")
      );
      
      const userTeam = teamsSnapshot.docs.find(
        doc => (doc.data() as any).ownerID === userId
      );

      if (userTeam) {
        // User is already in the league, just redirect them
        navigate(`/leagues/${foundLeagueId}`);
        return;
      }

      const targetLeague = foundLeague;
      const leagueId = foundLeagueId;

      // Use transaction for the join process
      await runTransaction(db, async (transaction) => {
        const invite = targetLeague.invites?.[code];
        if (!invite) {
          throw new Error("Invalid invite code");
        }

        // Validate invite
        if (invite.status !== "active") {
          throw new Error("This invite has expired or been used");
        }

        if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) {
          throw new Error("This invite has expired");
        }

        if (invite.maxUses && invite.usedCount >= invite.maxUses) {
          throw new Error("This invite has reached its maximum uses");
        }

        // Get user display name
        const userDoc = await transaction.get(doc(db, "users", userId));
        const userName = userDoc.exists() ? userDoc.data().displayName : "Unknown";
        const leagues = userDoc.exists() ? userDoc.data().leagues || [] : [];

        if (invite.type === 'coowner') {
          if (!invite.teamId) {
            throw new Error("Invalid co-owner invite");
          }

          // Handle co-owner invite
          const teamRef = doc(db, "leagues", foundLeagueId, "teams", invite.teamId);
          const teamDoc = await transaction.get(teamRef);
          if (!teamDoc.exists()) {
            throw new Error("Team not found");
          }
          const team = teamDoc.data() as Team;

          // Check if already a co-owner
          if (team.coOwners?.includes(userId)) {
            throw new Error("You are already a co-owner of this team");
          }

          // Get owner display name
          const ownerDoc = await transaction.get(doc(db, "users", team.ownerID));
          const ownerName = ownerDoc.exists() ? ownerDoc.data().displayName : "Unknown";

          // Update team
          transaction.update(teamRef, {
            coOwners: [...(team.coOwners || []), userId],
            teamName: `${ownerName}/${userName}`
          });
        } else {
          // Handle team invite
          // Create new team
          const teamId = Math.random().toString(36).substring(2, 10);
          const teamRef = doc(db, "leagues", foundLeagueId, "teams", teamId);

          const newTeam: Team = {
            teamId,
            ownerID: userId,
            coOwners: [],
            teamName: userName,
            roster: [],
            cupLineups: {},
            faabBudget: targetLeague.settings.faabBudget,
            pendingBids: []
          };

          transaction.set(teamRef, newTeam);
        }

        // Update invite status
        transaction.update(doc(db, 'leagues', leagueId), {
          [`invites.${code}`]: {
            ...invite,
            usedCount: invite.usedCount + 1,
            usedBy: [...(invite.usedBy || []), userId],
            status: invite.maxUses && invite.usedCount + 1 >= invite.maxUses ? 'used' : 'active'
          }
        });

        // Update user's leagues
        transaction.update(doc(db, 'users', userId), {
          leagues: [...leagues, leagueId]
        });

        // Add chat message about the new join
        const chatRef = doc(db, 'leagues', leagueId, 'chat', Date.now().toString());
        transaction.set(chatRef, {
          type: 'system',
          content: invite.type === 'coowner' 
            ? `${userName} joined as a co-owner`
            : `${userName} joined the league`,
          timestamp: serverTimestamp(),
          userId: 'system'
        });
      });

      // Navigate after transaction completes
      navigate(`/leagues/${leagueId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to join league");
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="container mt-4">
        <div className="alert alert-warning">
          Please log in to join this league
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="container mt-4">
        <div className="text-center">
          <div className="spinner-border" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
          <p className="mt-2">Joining league...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mt-4">
        <div className="alert alert-danger">{error}</div>
      </div>
    );
  }

  return null;
};

export default JoinLeague;

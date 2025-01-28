import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { collection, getDocs, runTransaction, doc } from "firebase/firestore";
import { db } from "../firebase/config";
import { useAuth } from "../firebase/auth";
import { addUserToLeague } from "../firebase/queries";
import type { League, LeagueInvite } from "../types";

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

        // Check if league is full by counting teams in subcollection
        const teamsSnapshot = await getDocs(
          collection(db, "leagues", leagueId, "teams")
        );
        const currentTeamCount = teamsSnapshot.size;

        if (currentTeamCount >= targetLeague.settings.teamsLimit) {
          throw new Error("This league is full");
        }

        // Create new team
        const teamId = `team_${Date.now()}_${Math.random()
          .toString(36)
          .substr(2, 9)}`;
        const userDoc = await transaction.get(doc(db, "users", userId));
        const userName = userDoc.exists()
          ? userDoc.data().displayName
          : "New Team";

        const newTeam = {
          teamId,
          ownerID: userId,
          teamName: userName,
          roster: [],
          cupLineups: {
            cup1: {
              captains: Array(targetLeague.settings.captainSlots).fill(null),
              naSlots: Array(targetLeague.settings.naSlots).fill(null),
              brLatamSlots: Array(targetLeague.settings.brLatamSlots).fill(
                null
              ),
              flexSlots: Array(targetLeague.settings.flexSlots).fill(null),
              bench: [],
              locked: targetLeague.settings.currentCup >= 1,
            },
            cup2: {
              captains: Array(targetLeague.settings.captainSlots).fill(null),
              naSlots: Array(targetLeague.settings.naSlots).fill(null),
              brLatamSlots: Array(targetLeague.settings.brLatamSlots).fill(
                null
              ),
              flexSlots: Array(targetLeague.settings.flexSlots).fill(null),
              bench: [],
              locked: targetLeague.settings.currentCup >= 2,
            },
            cup3: {
              captains: Array(targetLeague.settings.captainSlots).fill(null),
              naSlots: Array(targetLeague.settings.naSlots).fill(null),
              brLatamSlots: Array(targetLeague.settings.brLatamSlots).fill(
                null
              ),
              flexSlots: Array(targetLeague.settings.flexSlots).fill(null),
              bench: [],
              locked: targetLeague.settings.currentCup >= 3,
            },
          },
          faabBudget: targetLeague.settings.faabBudget,
          pendingBids: [],
        };

        // Update invite usage
        const updatedInvite: LeagueInvite = {
          ...invite,
          usedCount: invite.usedCount + 1,
          usedBy: [...(invite.usedBy || []), userId],
          status:
            invite.maxUses && invite.usedCount + 1 >= invite.maxUses
              ? "used"
              : "active",
        };

        // Only update the invite in the league document
        transaction.update(doc(db, "leagues", leagueId), {
          [`invites.${code}`]: updatedInvite,
        });

        // Create team document in subcollection
        transaction.set(doc(db, "leagues", leagueId, "teams", teamId), newTeam);

        // Add league to user's leagues
        await addUserToLeague(userId, leagueId);

        // Navigate to the league
        navigate(`/leagues/${leagueId}`);
      });
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

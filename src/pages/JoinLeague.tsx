import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { collection, getDocs, doc, serverTimestamp, getDoc, updateDoc, setDoc } from "firebase/firestore";
import { db } from "../firebase/config";
import { useAuth } from "../firebase/auth";
import type { League, Team, Draft } from "../types";

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
      // First try to find a draft with this invite code
      const draftsCol = collection(db, "drafts");
      const draftsSnapshot = await getDocs(draftsCol);
      
      for (const draftDoc of draftsSnapshot.docs) {
        const invitesSnapshot = await getDocs(collection(draftDoc.ref, "invites"));
        const invite = invitesSnapshot.docs.find(doc => doc.id === code);
        
        if (invite) {
          return handleJoinDraft(userId, code, draftDoc.id, draftDoc.data() as Draft, invite.data());
        }
      }

      // If no draft found, try leagues
      const leaguesCol = collection(db, "leagues");
      const leaguesSnapshot = await getDocs(leaguesCol);

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

      await handleJoinLeague(userId, code, foundLeagueId, foundLeague);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to join");
    } finally {
      setLoading(false);
    }
  };

  const handleJoinDraft = async (
    userId: string,
    code: string,
    draftId: string,
    draft: Draft,
    invite: any
  ) => {
    // Get user display name
    const userDoc = await getDoc(doc(db, "users", userId));
    const userName = userDoc.exists() ? userDoc.data().displayName : "Unknown";

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

    // Create new team in the draft
    const teamId = `team_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newTeam = {
      teamId,
      ownerID: userId,
      coOwners: [],
      teamName: userName,
      roster: [],
      faabBudget: draft.settings.faabBudget,
    };

    // Update draft with new team
    await updateDoc(doc(db, "drafts", draftId), {
      teams: {
        ...draft.teams,
        [teamId]: newTeam,
      },
      settings: {
        ...draft.settings,
        draftOrder: [...draft.settings.draftOrder, teamId],
      },
    });

    // Update invite status
    await updateDoc(doc(db, "drafts", draftId, "invites", code), {
      ...invite,
      usedCount: invite.usedCount + 1,
      usedBy: [...(invite.usedBy || []), userId],
      status: invite.maxUses && invite.usedCount + 1 >= invite.maxUses ? "used" : "active",
    });

    // Navigate to draft
    navigate(`/drafts/${draftId}`);
  };

  const handleJoinLeague = async (
    userId: string,
    code: string,
    leagueId: string,
    league: League
  ) => {
    // Get user display name
    const userDoc = await getDoc(doc(db, "users", userId));
    const userName = userDoc.exists() ? userDoc.data().displayName : "Unknown";
    const leagues = userDoc.exists() ? userDoc.data().leagues || [] : [];

    const invite = league.invites?.[code];
    if (!invite) {
      throw new Error("Invalid invite code");
    }

    // Rest of the existing league join logic
    if (invite.type === 'coowner') {
      if (!invite.teamId) {
        throw new Error("Invalid co-owner invite");
      }

      const teamRef = doc(db, "leagues", leagueId, "teams", invite.teamId);
      const teamDoc = await getDoc(teamRef);
      
      if (!teamDoc.exists()) {
        throw new Error("Team not found");
      }
      
      const team = teamDoc.data() as Team;

      if (team.coOwners?.includes(userId)) {
        throw new Error("You are already a co-owner of this team");
      }

      const ownerDoc = await getDoc(doc(db, "users", team.ownerID));
      const ownerName = ownerDoc.exists() ? ownerDoc.data().displayName : "Unknown";

      await updateDoc(teamRef, {
        coOwners: [...(team.coOwners || []), userId],
        teamName: `${ownerName}/${userName}`
      });

      await updateDoc(doc(db, 'leagues', leagueId), {
        [`invites.${code}`]: {
          ...invite,
          usedCount: invite.usedCount + 1,
          usedBy: [...(invite.usedBy || []), userId],
          status: invite.maxUses && invite.usedCount + 1 >= invite.maxUses ? 'used' : 'active'
        }
      });

      await updateDoc(doc(db, 'users', userId), {
        leagues: [...leagues, leagueId]
      });

      const chatRef = doc(
        db, 
        'leagues', 
        leagueId, 
        'chat', 
        `-${Date.now()}-${crypto.randomUUID()}`
      );
      await setDoc(chatRef, {
        type: 'system',
        content: `${userName} joined as a co-owner`,
        timestamp: serverTimestamp(),
        userId: 'system',
        userName: 'System',
        sortOrder: -Date.now()
      });

    } else {
      const teamId = Math.random().toString(36).substring(2, 10);
      const teamRef = doc(db, "leagues", leagueId, "teams", teamId);

      const newTeam: Team = {
        teamId,
        ownerID: userId,
        coOwners: [],
        teamName: userName,
        roster: [],
        cupLineups: {},
        faabBudget: league.settings.faabBudget,
        pendingBids: []
      };

      await setDoc(teamRef, newTeam);

      await updateDoc(doc(db, 'leagues', leagueId), {
        [`invites.${code}`]: {
          ...invite,
          usedCount: invite.usedCount + 1,
          usedBy: [...(invite.usedBy || []), userId],
          status: invite.maxUses && invite.usedCount + 1 >= invite.maxUses ? 'used' : 'active'
        }
      });

      await updateDoc(doc(db, 'users', userId), {
        leagues: [...leagues, leagueId]
      });

      const chatRef = doc(
        db, 
        'leagues', 
        leagueId, 
        'chat', 
        `-${Date.now()}-${crypto.randomUUID()}`
      );
      await setDoc(chatRef, {
        type: 'system',
        content: `${userName} joined the league`,
        timestamp: serverTimestamp(),
        userId: 'system',
        userName: 'System',
        sortOrder: -Date.now()
      });
    }

    navigate(`/leagues/${leagueId}`);
  };

  if (!user) {
    return (
      <div className="container mt-4">
        <div className="alert alert-warning">
          Please log in to join
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
          <p className="mt-2">Joining...</p>
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

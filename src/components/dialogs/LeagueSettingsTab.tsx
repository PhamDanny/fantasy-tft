import React, { useState } from "react";
import { doc, updateDoc, runTransaction, serverTimestamp } from "firebase/firestore";
import { db } from "../../firebase/config";
import type { League, LeagueSettings, Team } from "../../types";
import InviteDialog from '../../components/dialogs/InviteDialog';
import CommissionerTeamEditDialog from "../../components/dialogs/CommissionerTeamEditDialog";

// ... rest of the file

interface LeagueMemberRowProps {
  teamId: string;
  team: Team;
  onEditRoster: (teamId: string) => void;
  onRemoveOwner: (teamId: string, team: Team) => void;
} 
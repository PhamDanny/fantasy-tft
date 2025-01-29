import React, { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type {
  League,
  Player,
  Team,
  TeamLineup,
  LeagueSettings,
} from "../../types";
import { User } from "firebase/auth";
import InviteDialog from "../../components/dialogs/InviteDialog";
import LeagueChat from "../../components/chat/LeagueChat"; 
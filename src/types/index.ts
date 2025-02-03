// src/types/index.ts

export interface PlayerScores {
  cup1: number;
  cup2: number;
  cup3: number;
}

export interface Player {
  id: string;
  name: string;
  region: string;
  scores: PlayerScores;
  regionals?: {
    qualified: boolean;
    placement: number;
  };
}

export interface RosterSlots {
  captainSlots: number;
  naSlots: number;
  brLatamSlots: number;
  flexSlots: number;
  benchSlots: number;
}

export interface TeamLineup {
  captains: (string | null)[];  // Array to support multiple captain slots
  naSlots: (string | null)[];
  brLatamSlots: (string | null)[];
  flexSlots: (string | null)[];
  bench: string[];  // Bench always contains valid player IDs
}

export interface CupLineup extends TeamLineup {
  locked: boolean;
  score?: number;  // Total score for this cup's lineup
  playerScores?: Record<string, number>;  // Individual scores per player
}

export interface PendingBid {
  playerId: string;         // ID of player being claimed
  amount: number;           // FAAB bid amount
  dropPlayerId: string | null;  // Optional player to drop
  timestamp: string;        // When bid was placed
  processed: boolean;       // Whether bid has been processed
  status: 'pending' | 'won' | 'lost' | 'cancelled' | 'invalid'; // Bid status
  processingOrder: number;  // Position in processing queue, determined by amount
}

export interface Team {
  teamId: string;
  ownerID: string;
  coOwners: string[];  // Add this field for co-owners
  teamName: string;
  roster: string[];
  cupLineups: {
    cup1?: CupLineup;
    cup2?: CupLineup;
    cup3?: CupLineup;
  };
  faabBudget: number;
  pendingBids: PendingBid[];  // Changed from Record to Array to maintain order
  playoffRoster?: string[];
  playoffLineup?: PlayoffLineup;
  playoffDollars?: number;
  playoffBids?: Record<string, number>;  // Map of player ID to bid amount
}

export interface LeagueSettings extends RosterSlots {
  teamsLimit: number;
  faabBudget: number;
  currentCup: number;  // 0 for preseason, 1-3 for active cups
  playoffs: boolean;   // Whether playoffs are enabled
  playoffTeams: number; // Number of teams that make playoffs
  waiversEnabled: boolean;  // When false, players can be added instantly as free agents
  playoffSettings?: PlayoffSettings;
}

export interface TradeOffer {
  proposerId: string;
  receiverId: string;
  proposerPlayers: string[];
  receiverPlayers: string[];
  status: 'pending' | 'accepted' | 'rejected' | 'cancelled';
  timestamp: string;
  transactionId?: string;  // Reference to the transaction when completed
}

export type TransactionType = 'trade' | 'waiver' | 'free_agent' | 'commissioner' | 'drop';

export interface Transaction {
  id: string;
  timestamp: string;
  type: TransactionType;
  teamIds: string[];
  adds: Record<string, string[]>;  // teamId -> playerIds[]
  drops: Record<string, string[]>; // teamId -> playerIds[]
  metadata: {
    type?: TransactionType;
    tradeId?: string;
    faabSpent?: Record<string, number>;
    reason?: string;
    commissioner?: string;
    action?: 'roster_edit' | 'member_removed' | 'member_left';
    waiver?: {
      bidAmount: number;
      success?: boolean;
      failureReason?: string;
      losingBids?: Array<{
        teamId: string;
        teamName: string;
        bidAmount: number;
        failureReason?: string;
      }>;
    };
    playerNames?: Record<string, {
      name: string;
      region: string;
    }>;
  }
}

export interface League {
  id: number;
  name: string;
  creationDate: string;
  season: string;
  settings: LeagueSettings;
  commissioner: string;
  teams: Record<string, Team>;
  trades?: Record<string, TradeOffer>;
  transactions: Transaction[];
  invites?: Record<string, LeagueInvite>;
  draftId?: string;  // ID of the draft this league was created from
  draftData?: {
    settings: {
      draftOrder: string[];
    };
    picks: {
      teamId: string;
      playerId: string;
      round: number;
      pick: number;
      timestamp: string;
    }[];
  };
}

export interface LeagueInvite {
  code: string;
  createdBy: string;
  createdAt: string;
  expiresAt?: string;
  maxUses?: number;
  usedCount: number;
  status: 'active' | 'used' | 'expired';
  usedBy?: string[];
  type: 'team' | 'coowner';  // Add this field to distinguish invite types
  teamId?: string;  // Add this field for co-owner invites
}

export interface DraftSettings extends LeagueSettings {
  draftType: 'snake' | 'auction';
  draftOrder: string[];  // Array of team IDs in draft order
}

export interface DraftPick {
  teamId: string;
  playerId: string;
  round: number;
  pick: number;
  timestamp: string;
}

export interface Draft {
  id: string;
  name: string;
  creationDate: string;
  season: string;
  settings: DraftSettings;
  commissioner: string;
  teams: Record<string, Team>;
  status: 'pending' | 'in_progress' | 'completed';
  currentRound: number;
  currentPick: number;
  picks: DraftPick[];
  invites?: Record<string, LeagueInvite>;
}

// Add playoff-specific types
export interface PlayoffNomination {
  playerId: string;
  nominator: string;
  currentBid: {
    teamId: string;
    amount: number;
    timestamp: string;
  } | null;
  passedTeams: string[];
  status: 'bidding' | 'completed';
}

export interface AuctionLogEntry {
  timestamp: string;
  teamId: string;
  playerId: string;
  amount: number;
}

export interface PlayoffSettings {
  captainSlots: number;
  naSlots: number;
  brLatamSlots: number;
  flexSlots: number;
  playoffAuctionStarted?: boolean;
  currentNomination?: PlayoffNomination;
  currentNominator?: string;
  nominationOrder?: string[];
  auctionLog?: AuctionLogEntry[];
}

export interface PlayoffLineup extends TeamLineup {
  locked: boolean;
}

// Add playoff scoring constant
export const PLAYOFF_SCORES: Record<number, number> = {
  1: 40, 2: 37, 3: 35, 4: 33, 5: 32, 6: 31, 7: 30, 8: 29,
  9: 26, 10: 25, 11: 24, 12: 23, 13: 22, 14: 21, 15: 20, 16: 19,
  17: 18, 18: 17, 19: 16, 20: 15, 21: 14, 22: 13, 23: 12, 24: 11,
  25: 8, 26: 7, 27: 6, 28: 5, 29: 4, 30: 3, 31: 2, 32: 1
};
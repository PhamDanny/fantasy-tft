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
  teamName: string;
  roster: string[];
  cupLineups: {
    cup1?: CupLineup;
    cup2?: CupLineup;
    cup3?: CupLineup;
  };
  faabBudget: number;
  pendingBids: PendingBid[];  // Changed from Record to Array to maintain order
}

export interface LeagueSettings extends RosterSlots {
  teamsLimit: number;
  faabBudget: number;
  currentCup: number;  // 0 for preseason, 1-3 for active cups
  playoffs: boolean;   // Whether playoffs are enabled
  playoffTeams: number; // Number of teams that make playoffs
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

export type TransactionType = 'trade' | 'waiver' | 'free_agent' | 'commissioner';

export interface Transaction {
  id: string;
  timestamp: string;
  teamIds: string[];
  adds: Record<string, string[]>;  // teamId -> playerIds[]
  drops: Record<string, string[]>; // teamId -> playerIds[]
  type: TransactionType;
  metadata: {
    tradeId?: string;  // For trade transactions
    faabSpent?: Record<string, number>;  // For waiver/free_agent transactions
    reason?: string;  // For commissioner transactions
    commissioner?: string;  // For commissioner transactions
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
}
// src/types/index.ts

import { Timestamp } from 'firebase/firestore';

export interface PlayerScores {
  cup1: number;
  cup2: number;
  cup3: number;
}

export interface Player {
  id: string;
  fullName: string;
  name: string;
  tag: string;
  region: string;
  ladderRegion: string;
  set: number;
  profileLink: string;
  prevSetQP: number;
  scores: {
    cup1: number;
    cup2: number;
    cup3: number;
  };
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
  coOwners: string[];
  teamName: string;
  ownerDisplayName: string;
  coOwnerDisplayNames?: Record<string, string>;
  roster: string[];
  cupLineups: Record<string, CupLineup>;
  regionalsLineup?: RegionalsLineup;  // Add this for regionals leagues
  faabBudget: number;
  pendingBids: PendingBid[];
  playoffRoster?: string[];
  playoffLineup?: TeamLineup;
  playoffDollars?: number;
  playoffBids?: Record<string, number>;  // Map of player ID to bid amount
}

export interface LeagueSettings {
  captainSlots: number;
  naSlots: number;
  brLatamSlots: number;
  flexSlots: number;
  benchSlots: number;
  teamsLimit: number;
  faabBudget: number;
  currentCup: number;
  draftStarted?: boolean;
  draftOrder?: string[];
  playoffs: boolean;
  playoffTeams: number;
  waiversEnabled: boolean;
  tradingEnabled: boolean;
  freeAgencyEnabled: boolean;
  playoffSettings?: {
    captainSlots: number;
    naSlots: number;
    brLatamSlots: number;
    flexSlots: number;
    playoffAuctionStarted?: boolean;
  };
  thirdRoundReversal?: boolean;
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
    teamName?: string;
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

// Add these new types
export type LeaguePhase = 'drafting' | 'in_season' | 'playoffs' | 'completed';
export type LeagueType = 'season-long' | 'single-tournament' | 'regionals';

export interface League {
  id: number;
  name: string;
  creationDate: string;
  season: string;
  type: LeagueType;
  leagueType?: LeagueType;
  phase: LeaguePhase;
  settings: LeagueSettings & {
    draftOrder: string[];
    draftStarted: boolean;
  };
  commissioner: string;
  trades?: Record<string, TradeOffer>;
  transactions: Transaction[];
  invites: { [key: string]: LeagueInvite };
  draftId?: string;
  currentRound?: number;
  currentPick?: number;
  picks?: DraftPick[];
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
  // Add legacy format support
  draftData?: {
    settings: {
      draftOrder: string[];
    };
    picks: DraftPick[];
  };
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

export interface PerfectRosterLineup {
  captains: string[];
  naSlots: string[];
  brLatamSlots: string[];
  flexSlots: string[];
  locked: boolean;
  userId: string;
  userName: string;
  timestamp: string;
  score?: number;
}

export interface PerfectRosterChallenge {
  id: string;
  name: string;
  season: string;
  set: number;
  currentCup: string;
  startDate: Timestamp;
  endDate: Timestamp;
  status: 'active' | 'completed';
  settings: {
    captainSlots: number;
    naSlots: number;
    brLatamSlots: number;
    flexSlots: number;
  };
  entries: Record<string, PerfectRosterLineup>;
  adminOnly?: boolean;
  type: 'regular' | 'regionals';
}

export interface UserData {
  displayName: string;
  leagues: string[];
  admin?: boolean;
  currentCup?: number;
}

export const TABS = {
  STANDINGS: 'Standings',
  TEAM: 'Team',
  PLAYERS: 'Players',
  TRADE: 'Trade',
  DRAFT: 'Draft',
  PLAYOFFS: 'Playoffs',
  TRANSACTIONS: 'History',
  SETTINGS: 'League Settings'
} as const;

export type TabType = typeof TABS[keyof typeof TABS];

// Add a helper function to get league type with default
export function getLeagueType(league: League): LeagueType {
  if (league.leagueType) return league.leagueType;
  if (league.type) return league.type;
  return 'season-long';
}

export interface GlobalSettings {
  currentCup: {
    currentCup: number;
    updatedAt: string;
    updatedBy: string;
  };
  currentSet: {
    set: string;  // e.g. "Set 13"
    name: string; // e.g. "Into the Arcane"
    updatedAt: string;
    updatedBy: string;
  };
}

// Add helper function to determine if we're in regionals phase
export function isRegionalsPhase(currentCup: number): boolean {
  return currentCup === 4;
}

// Add helper to filter players for regionals
export function getAvailablePlayers(players: Record<string, Player>, leagueType: LeagueType): Record<string, Player> {
  if (leagueType === 'regionals') {
    return Object.fromEntries(
      Object.entries(players).filter(([_, player]) =>
        player.regionals?.qualified === true
      )
    );
  }
  return players;
}

// Add regionals lineup type
export interface RegionalsLineup extends CupLineup {
  // Same structure as CupLineup but specifically for regionals
  locked: boolean;
}
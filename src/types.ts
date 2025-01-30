interface LeagueSettings {
  waiversEnabled: boolean;
  nextWaiverProcessing: string | null; // ISO timestamp
  isProcessingWaivers: boolean;
}

// Add new transaction type
interface WaiverTransaction {
  id: string;
  timestamp: string;
  type: 'waiver';
  teamId: string;
  playerId: string;
  droppedPlayerId?: string;
  bidAmount: number;
  success: boolean;
  failureReason?: string;
  losingBids?: Array<{
    teamId: string;
    bidAmount: number;
  }>;
} 
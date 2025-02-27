import React from 'react';
import type { Player, PerfectRosterChallenge, PlayerScores } from '../types';
import { Trophy } from 'lucide-react';
import { PLAYOFF_SCORES } from '../types';

interface PerfectLineupProps {
  players: Record<string, Player>;
  currentCup: keyof PlayerScores;
  settings: PerfectRosterChallenge['settings'];
  isComplete: boolean;
  challenge: PerfectRosterChallenge;
}

const PerfectLineup: React.FC<PerfectLineupProps> = ({
  players,
  currentCup,
  settings,
  isComplete,
  challenge
}) => {
  const calculatePlayerScore = (player: Player, isCapt: boolean): number => {
    if (challenge.type === 'regionals') {
      const placement = player.regionals?.placement;
      if (placement && placement in PLAYOFF_SCORES) {
        return PLAYOFF_SCORES[placement] * (isCapt ? 1.5 : 1);
      }
      return 0;
    }

    if (!player.scores || !(currentCup in player.scores)) return 0;
    return player.scores[currentCup as keyof typeof player.scores] * (isCapt ? 1.5 : 1);
  };

  // For regionals, check if any player has placement "1"
  const hasWinner = challenge.type === 'regionals' 
    ? Object.values(players).some(p => p.regionals?.placement === 1)
    : isComplete;

  if (!hasWinner) {
    return (
      <div className="alert alert-info">
        Check back after the tournament is complete to see what the perfect roster would have been!
      </div>
    );
  }

  const calculatePerfectLineup = () => {
    const playersWithScores = Object.entries(players)
      .map(([playerId, player]) => ({
        ...player,
        id: playerId,
        currentScore: calculatePlayerScore(player, false)
      }))
      .filter(p => p.currentScore > 0);

    // Sort by score descending
    const sortedPlayers = [...playersWithScores].sort((a, b) => b.currentScore - a.currentScore);
    
    const lineup = {
      captains: [] as typeof sortedPlayers,
      naPlayers: [] as typeof sortedPlayers,
      brLatamPlayers: [] as typeof sortedPlayers,
      flexPlayers: [] as typeof sortedPlayers,
      totalScore: 0
    };

    // First, assign captains (they get 1.5x points)
    const captainCandidates = [...sortedPlayers];
    while (lineup.captains.length < settings.captainSlots && captainCandidates.length > 0) {
      const player = captainCandidates.shift()!;
      // Create a new player object with captain score
      lineup.captains.push({
        ...player,
        currentScore: calculatePlayerScore(player, true)
      });
    }

    // Then, assign NA players (using original scores)
    const remainingPlayers = captainCandidates;
    const naPlayers = remainingPlayers.filter(p => p.region === 'NA')
      .sort((a, b) => b.currentScore - a.currentScore);
    
    while (lineup.naPlayers.length < settings.naSlots && naPlayers.length > 0) {
      lineup.naPlayers.push(naPlayers.shift()!);
    }

    // Then, assign BR/LATAM players
    const brLatamPlayers = remainingPlayers
      .filter(p => ['BR', 'LATAM'].includes(p.region))
      .sort((a, b) => b.currentScore - a.currentScore);
    
    while (lineup.brLatamPlayers.length < settings.brLatamSlots && brLatamPlayers.length > 0) {
      lineup.brLatamPlayers.push(brLatamPlayers.shift()!);
    }

    // Finally, assign flex slots from remaining highest scorers
    const flexCandidates = remainingPlayers
      .filter(p => 
        !lineup.captains.find(c => c.id === p.id) &&
        !lineup.naPlayers.find(c => c.id === p.id) &&
        !lineup.brLatamPlayers.find(c => c.id === p.id)
      )
      .sort((a, b) => b.currentScore - a.currentScore);

    while (lineup.flexPlayers.length < settings.flexSlots && flexCandidates.length > 0) {
      lineup.flexPlayers.push(flexCandidates.shift()!);
    }

    // Calculate total score
    lineup.totalScore = 
      lineup.captains.reduce((sum, p) => sum + p.currentScore, 0) +
      lineup.naPlayers.reduce((sum, p) => sum + p.currentScore, 0) +
      lineup.brLatamPlayers.reduce((sum, p) => sum + p.currentScore, 0) +
      lineup.flexPlayers.reduce((sum, p) => sum + p.currentScore, 0);

    return lineup;
  };

  // Add new function to calculate roster percentages
  const calculateRosterStats = () => {
    const totalRosters = Object.keys(challenge.entries).length;
    if (totalRosters === 0) return new Map();

    const stats = new Map<string, { total: number, asCaptain: number }>();

    Object.values(challenge.entries).forEach(entry => {
      [...entry.captains, ...entry.naSlots, ...entry.brLatamSlots, ...entry.flexSlots].forEach(playerId => {
        if (!playerId) return;
        
        if (!stats.has(playerId)) {
          stats.set(playerId, { total: 0, asCaptain: 0 });
        }
        
        const playerStats = stats.get(playerId)!;
        playerStats.total++;
        
        if (entry.captains.includes(playerId)) {
          playerStats.asCaptain++;
        }
      });
    });

    return stats;
  };

  const perfectLineup = calculatePerfectLineup();
  const rosterStats = calculateRosterStats();
  const totalRosters = Object.keys(challenge.entries).length;

  const renderPlayerCard = (player: Player & { currentScore: number }) => {
    const stats = rosterStats.get(player.id);
    const rosterPercentage = stats ? (stats.total / totalRosters) * 100 : 0;
    const captainPercentage = stats ? (stats.asCaptain / totalRosters) * 100 : 0;

    return (
      <div key={player.id} className="d-flex align-items-center p-2 border rounded mb-2">
        <div className="w-100">
          <div className="d-flex justify-content-between align-items-center">
            <div>
              <div className="fw-bold">{player.name}</div>
              <small className="text-muted">
                {player.region} • {player.currentScore.toFixed(1)} points
              </small>
            </div>
            <div className="d-flex gap-2">
              {captainPercentage > 0 && (
                <span className="badge bg-warning text-dark">
                  {captainPercentage.toFixed(1)}% Captain Rate
                </span>
              )}
              <span className="badge bg-light text-dark">
                {rosterPercentage.toFixed(1)}% of rosters
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="card">
      <div className="card-header d-flex align-items-center">
        <Trophy className="text-warning me-2" size={20} />
        <h4 className="mb-0">Perfect Roster</h4>
      </div>
      <div className="card-body">
        <div className="mb-4">
          <h5 className="mb-3">Total Score: {perfectLineup.totalScore.toFixed(1)}</h5>
        </div>

        {settings.captainSlots > 0 && (
          <div className="mb-4">
            <h6>{settings.captainSlots > 1 ? 'Captains' : 'Captain'}</h6>
            {perfectLineup.captains.map(player => renderPlayerCard(player))}
          </div>
        )}

        {settings.naSlots > 0 && (
          <div className="mb-4">
            <h6>NA Players</h6>
            {perfectLineup.naPlayers.map(player => renderPlayerCard(player))}
          </div>
        )}

        {settings.brLatamSlots > 0 && (
          <div className="mb-4">
            <h6>BR/LATAM Players</h6>
            {perfectLineup.brLatamPlayers.map(player => renderPlayerCard(player))}
          </div>
        )}

        {settings.flexSlots > 0 && (
          <div className="mb-4">
            <h6>Flex Players</h6>
            {perfectLineup.flexPlayers.map(player => renderPlayerCard(player))}
          </div>
        )}
      </div>
    </div>
  );
};

export default PerfectLineup; 
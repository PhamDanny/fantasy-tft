import React from 'react';
import type { Player, PerfectRosterChallenge, PlayerScores } from '../types';
import { Trophy } from 'lucide-react';

interface PerfectLineupProps {
  players: Record<string, Player>;
  currentCup: keyof PlayerScores;
  settings: PerfectRosterChallenge['settings'];
  isComplete: boolean;
}

const PerfectLineup: React.FC<PerfectLineupProps> = ({
  players,
  currentCup,
  settings,
  isComplete
}) => {
  const calculatePerfectLineup = () => {
    const playersWithScores = Object.entries(players)
      .map(([playerId, player]) => ({
        ...player,
        id: playerId,
        currentScore: player.scores?.[currentCup] || 0
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
      lineup.captains.push(captainCandidates.shift()!);
    }

    // Then, assign NA players
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
      lineup.captains.reduce((sum, p) => sum + p.currentScore * 1.5, 0) +
      lineup.naPlayers.reduce((sum, p) => sum + p.currentScore, 0) +
      lineup.brLatamPlayers.reduce((sum, p) => sum + p.currentScore, 0) +
      lineup.flexPlayers.reduce((sum, p) => sum + p.currentScore, 0);

    return lineup;
  };

  if (!isComplete) {
    return (
      <div className="card">
        <div className="card-body text-center py-5">
          <h4 className="mb-3">Tournament In Progress</h4>
          <p className="text-muted mb-0">
            Check back after the tournament is complete to see what the perfect roster would have been!
          </p>
        </div>
      </div>
    );
  }

  const perfectLineup = calculatePerfectLineup();

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

        <div className="mb-4">
          <h6>Captains (1.5x)</h6>
          {perfectLineup.captains.map(player => (
            <div key={player.id} className="d-flex align-items-center p-2 border rounded mb-2">
              <div>
                <div className="fw-bold">{player.name}</div>
                <small className="text-muted">
                  {player.region} • {(player.currentScore * 1.5).toFixed(1)} points
                </small>
              </div>
            </div>
          ))}
        </div>

        <div className="mb-4">
          <h6>NA Players</h6>
          {perfectLineup.naPlayers.map(player => (
            <div key={player.id} className="d-flex align-items-center p-2 border rounded mb-2">
              <div>
                <div className="fw-bold">{player.name}</div>
                <small className="text-muted">
                  {player.region} • {player.currentScore.toFixed(1)} points
                </small>
              </div>
            </div>
          ))}
        </div>

        <div className="mb-4">
          <h6>BR/LATAM Players</h6>
          {perfectLineup.brLatamPlayers.map(player => (
            <div key={player.id} className="d-flex align-items-center p-2 border rounded mb-2">
              <div>
                <div className="fw-bold">{player.name}</div>
                <small className="text-muted">
                  {player.region} • {player.currentScore.toFixed(1)} points
                </small>
              </div>
            </div>
          ))}
        </div>

        <div className="mb-4">
          <h6>Flex Players</h6>
          {perfectLineup.flexPlayers.map(player => (
            <div key={player.id} className="d-flex align-items-center p-2 border rounded mb-2">
              <div>
                <div className="fw-bold">{player.name}</div>
                <small className="text-muted">
                  {player.region} • {player.currentScore.toFixed(1)} points
                </small>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default PerfectLineup; 
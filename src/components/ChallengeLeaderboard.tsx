import React, { useState } from 'react';
import type { PerfectRosterLineup, Player } from '../types';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface ChallengeLeaderboardProps {
  entries: Record<string, PerfectRosterLineup>;
  players: Record<string, Player>;
  currentCup: string;
}

const ChallengeLeaderboard: React.FC<ChallengeLeaderboardProps> = ({
  entries,
  players,
  currentCup
}) => {
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null);

  // Calculate scores for entries
  const calculatePlayerScore = (playerId: string, isCapt: boolean): number => {
    const player = players[playerId];
    if (!player || !player.scores || !player.scores[currentCup]) return 0;
    return player.scores[currentCup] * (isCapt ? 1.5 : 1);
  };

  const getEntriesWithScores = () => {
    return Object.entries(entries).map(([_, entry]) => {
      let totalScore = 0;

      // Calculate captain scores
      entry.captains.forEach((playerId: string) => {
        totalScore += calculatePlayerScore(playerId, true);
      });

      // Calculate NA player scores
      entry.naSlots.forEach((playerId: string) => {
        totalScore += calculatePlayerScore(playerId, false);
      });

      // Calculate BR/LATAM player scores
      entry.brLatamSlots.forEach((playerId: string) => {
        totalScore += calculatePlayerScore(playerId, false);
      });

      // Calculate flex player scores
      entry.flexSlots.forEach((playerId: string) => {
        totalScore += calculatePlayerScore(playerId, false);
      });

      return {
        ...entry,
        score: totalScore
      };
    })
    .sort((a, b) => (b.score || 0) - (a.score || 0));
  };

  const sortedEntries = getEntriesWithScores();

  const getRankStyle = (rank: number): string => {
    switch (rank) {
      case 1: return 'bg-warning text-dark';  // Gold
      case 2: return 'bg-secondary text-white';  // Silver
      case 3: return 'bg-bronze text-white';  // Bronze
      default: return 'bg-light text-dark';
    }
  };

  const formatRank = (rank: number): string => {
    if (rank === 1) return '1st';
    if (rank === 2) return '2nd';
    if (rank === 3) return '3rd';
    return `${rank}th`;
  };

  const getPlayerContributions = (entry: PerfectRosterLineup) => {
    const contributions: Record<string, number> = {};
    
    // Calculate captain contributions (1.5x)
    entry.captains.forEach((playerId: string) => {
      if (playerId && players[playerId]?.scores?.[currentCup]) {
        contributions[playerId] = players[playerId].scores[currentCup] * 1.5;
      }
    });

    // Calculate other slot contributions
    const slotTypes = ['naSlots', 'brLatamSlots', 'flexSlots'] as const;
    slotTypes.forEach(slotType => {
      // Type assertion to ensure TypeScript knows these are arrays
      const slots = entry[slotType] as string[];
      slots.forEach((playerId: string) => {
        if (playerId && players[playerId]?.scores?.[currentCup]) {
          contributions[playerId] = players[playerId].scores[currentCup];
        }
      });
    });

    return Object.entries(contributions)
      .map(([playerId, score]) => ({
        playerId,
        score,
        player: players[playerId]
      }))
      .sort((a, b) => b.score - a.score);
  };

  return (
    <div className="card">
      <div className="card-body">
        <div className="table-responsive">
          <table className="table table-hover mb-0">
            <thead className="table-light">
              <tr>
                <th style={{ width: '60px' }} className="text-center">Rank</th>
                <th>Player</th>
                <th style={{ width: '100px' }} className="text-end">Score</th>
              </tr>
            </thead>
            <tbody>
              {sortedEntries.map((entry, index) => {
                const rank = index + 1;
                const contributions = getPlayerContributions(entry);
                
                return (
                  <React.Fragment key={entry.userId}>
                    <tr 
                      onClick={() => setExpandedEntry(expandedEntry === entry.userId ? null : entry.userId)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td className="text-center">
                        <span 
                          className={`badge ${getRankStyle(rank)} px-2 py-1`} 
                          style={{ 
                            minWidth: '42px',
                            backgroundColor: rank === 3 ? '#CD7F32' : undefined 
                          }}
                        >
                          {formatRank(rank)}
                        </span>
                      </td>
                      <td>
                        <div className="d-flex align-items-center gap-2">
                          {expandedEntry === entry.userId ? (
                            <ChevronUp size={16} />
                          ) : (
                            <ChevronDown size={16} />
                          )}
                          <span className="fw-medium">{entry.userName}</span>
                        </div>
                      </td>
                      <td className="text-end fw-bold">
                        {entry.score?.toFixed(1)}
                      </td>
                    </tr>
                    
                    {expandedEntry === entry.userId && (
                      <tr>
                        <td></td>
                        <td colSpan={2}>
                          <div className="bg-light p-3">
                            <h6 className="mb-3">Player Contributions</h6>
                            <table className="table table-sm mb-0">
                              <thead>
                                <tr>
                                  <th>Player</th>
                                  <th className="text-end">Score</th>
                                </tr>
                              </thead>
                              <tbody>
                                {contributions.map(({ playerId, score, player }) => (
                                  <tr key={playerId}>
                                    <td>
                                      <div>
                                        <span>{player.name}</span>
                                        <small className="text-muted ms-2">
                                          ({player.region})
                                        </small>
                                        {entry.captains.includes(playerId) && (
                                          <span className="badge bg-warning text-dark ms-2">
                                            Captain
                                          </span>
                                        )}
                                      </div>
                                    </td>
                                    <td className="text-end">{score.toFixed(1)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ChallengeLeaderboard; 
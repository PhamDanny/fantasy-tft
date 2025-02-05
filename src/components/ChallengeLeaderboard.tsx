import React, { useState } from 'react';
import type { PerfectRosterLineup, Player } from '../types';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

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
  const { isDarkMode } = useTheme();
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null);

  // Calculate scores for entries
  const calculatePlayerScore = (playerId: string, isCapt: boolean): number => {
    const player = players[playerId];
    if (!player || !player.scores || !player.scores[currentCup]) return 0;
    return player.scores[currentCup] * (isCapt ? 1.5 : 1);
  };

  const getEntriesWithScores = () => {
    return Object.entries(entries).map(([userId, entry]) => {
      let totalScore = 0;
      const playerContributions: Array<{playerId: string, score: number}> = [];

      // Calculate captain scores
      entry.captains.forEach((playerId: string) => {
        if (playerId) {  // Only calculate if playerId exists
          const score = calculatePlayerScore(playerId, true);
          totalScore += score;
          playerContributions.push({ playerId, score });
        }
      });

      // Calculate NA player scores
      entry.naSlots.forEach((playerId: string) => {
        if (playerId) {
          const score = calculatePlayerScore(playerId, false);
          totalScore += score;
          playerContributions.push({ playerId, score });
        }
      });

      // Calculate BR/LATAM player scores
      entry.brLatamSlots.forEach((playerId: string) => {
        if (playerId) {
          const score = calculatePlayerScore(playerId, false);
          totalScore += score;
          playerContributions.push({ playerId, score });
        }
      });

      // Calculate flex player scores
      entry.flexSlots.forEach((playerId: string) => {
        if (playerId) {
          const score = calculatePlayerScore(playerId, false);
          totalScore += score;
          playerContributions.push({ playerId, score });
        }
      });

      return {
        ...entry,
        userId,
        score: totalScore,
        playerContributions
      };
    })
    .sort((a, b) => {
      // First sort by score (even if 0)
      const scoreCompare = (b.score || 0) - (a.score || 0);
      // If scores are equal, sort alphabetically by userName
      if (scoreCompare === 0) {
        return (a.userName || '').localeCompare(b.userName || '');
      }
      return scoreCompare;
    });
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

  const formatScore = (score: number): string => {
    return score % 1 === 0 ? score.toFixed(0) : score.toFixed(1);
  };

  return (
    <div className="card">
      <div className="card-body">
        <div className="table-responsive">
          <table className="table table-hover mb-0">
            <thead className={isDarkMode ? 'table-dark' : 'table-light'}>
              <tr>
                <th style={{ width: '60px' }} className="text-center">Rank</th>
                <th>Player</th>
                <th style={{ width: '100px' }} className="text-end">Score</th>
              </tr>
            </thead>
            <tbody>
              {sortedEntries.map((entry, index) => {
                const rank = index + 1;
                
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
                        {formatScore(entry.score || 0)}
                      </td>
                    </tr>
                    
                    {expandedEntry === entry.userId && (
                      <tr>
                        <td></td>
                        <td colSpan={2}>
                          <div className={`${isDarkMode ? 'bg-dark' : 'bg-light'} p-3`}>
                            <h6 className="mb-3">Roster</h6>
                            <table className="table table-sm mb-0">
                              <thead>
                                <tr>
                                  <th>Player</th>
                                  <th className="text-end">Score</th>
                                </tr>
                              </thead>
                              <tbody>
                                {/* Show captains first */}
                                {entry.captains.map((playerId, idx) => playerId && (
                                  <tr key={`captain-${idx}`}>
                                    <td>
                                      <div>
                                        <span>{players[playerId]?.name}</span>
                                        <small className="text-muted ms-2">
                                          ({players[playerId]?.region})
                                        </small>
                                        <span className="badge bg-warning text-dark ms-2">
                                          Captain
                                        </span>
                                      </div>
                                    </td>
                                    <td className="text-end">
                                      {formatScore(0)}  {/* For now it's 0, but will format properly when scores are available */}
                                    </td>
                                  </tr>
                                ))}
                                {/* Show NA players */}
                                {entry.naSlots.map((playerId, idx) => playerId && (
                                  <tr key={`na-${idx}`}>
                                    <td>
                                      <div>
                                        <span>{players[playerId]?.name}</span>
                                        <small className="text-muted ms-2">
                                          ({players[playerId]?.region})
                                        </small>
                                      </div>
                                    </td>
                                    <td className="text-end">
                                      {formatScore(0)}  {/* For now it's 0, but will format properly when scores are available */}
                                    </td>
                                  </tr>
                                ))}
                                {/* Show BR/LATAM players */}
                                {entry.brLatamSlots.map((playerId, idx) => playerId && (
                                  <tr key={`br-${idx}`}>
                                    <td>
                                      <div>
                                        <span>{players[playerId]?.name}</span>
                                        <small className="text-muted ms-2">
                                          ({players[playerId]?.region})
                                        </small>
                                      </div>
                                    </td>
                                    <td className="text-end">
                                      {formatScore(0)}  {/* For now it's 0, but will format properly when scores are available */}
                                    </td>
                                  </tr>
                                ))}
                                {/* Show flex players */}
                                {entry.flexSlots.map((playerId, idx) => playerId && (
                                  <tr key={`flex-${idx}`}>
                                    <td>
                                      <div>
                                        <span>{players[playerId]?.name}</span>
                                        <small className="text-muted ms-2">
                                          ({players[playerId]?.region})
                                        </small>
                                      </div>
                                    </td>
                                    <td className="text-end">
                                      {formatScore(0)}  {/* For now it's 0, but will format properly when scores are available */}
                                    </td>
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
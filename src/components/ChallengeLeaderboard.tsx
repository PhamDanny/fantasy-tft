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
  const [currentPage, setCurrentPage] = useState(1);
  const entriesPerPage = 20;

  // Calculate scores for entries
  const entriesWithScores = Object.values(entries).map(entry => {
    if (entry.score !== undefined) return entry;

    let totalScore = 0;
    
    // Calculate captain score (1.5x)
    entry.captains.forEach(playerId => {
      const player = players[playerId];
      if (player && player.scores && currentCup in player.scores) {
        totalScore += player.scores[currentCup] * 1.5;
      }
    });

    // Calculate other slots
    ['naSlots', 'brLatamSlots', 'flexSlots'].forEach(slotType => {
      entry[slotType].forEach(playerId => {
        const player = players[playerId];
        if (player && player.scores && currentCup in player.scores) {
          totalScore += player.scores[currentCup];
        }
      });
    });

    return {
      ...entry,
      score: totalScore
    };
  });

  const sortedEntries = entriesWithScores
    .sort((a, b) => (b.score || 0) - (a.score || 0));

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
    entry.captains.forEach(playerId => {
      if (playerId && players[playerId]?.scores?.[currentCup]) {
        contributions[playerId] = players[playerId].scores[currentCup] * 1.5;
      }
    });

    // Calculate other slot contributions
    ['naSlots', 'brLatamSlots', 'flexSlots'].forEach(slotType => {
      entry[slotType].forEach(playerId => {
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
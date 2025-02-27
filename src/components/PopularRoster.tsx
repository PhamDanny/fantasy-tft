import React, { useState } from 'react';
import type { Player, PerfectRosterChallenge, PerfectRosterLineup } from '../types';
import { Users, ArrowUpDown } from 'lucide-react';

interface PopularRosterProps {
  entries: Record<string, PerfectRosterLineup>;
  players: Record<string, Player>;
  settings: PerfectRosterChallenge['settings'];
}

type SortField = 'name' | 'rosterRate' | 'captainRate';
type SortDirection = 'asc' | 'desc';

const PopularRoster: React.FC<PopularRosterProps> = ({
  entries,
  players
}) => {
  const [sortField, setSortField] = useState<SortField>('rosterRate');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const totalRosters = Object.keys(entries).length;
  if (totalRosters === 0) return null;

  // Count player appearances in each role
  const getPlayerCounts = () => {
    const totalCounts: Record<string, { total: number; asCaptain: number; }> = {};

    Object.values(entries).forEach(entry => {
      // Count all appearances and track if they were captain
      [...entry.captains, ...entry.naSlots, ...entry.brLatamSlots, ...entry.flexSlots].forEach(playerId => {
        if (!playerId) return;
        const player = players[playerId];
        if (!player) return;

        // Initialize or increment total counts
        if (!totalCounts[playerId]) {
          totalCounts[playerId] = { total: 0, asCaptain: 0 };
        }
        totalCounts[playerId].total++;

        // Track if this appearance was as captain
        if (entry.captains.includes(playerId)) {
          totalCounts[playerId].asCaptain++;
        }
      });
    });

    return { totalCounts };
  };

  const { totalCounts } = getPlayerCounts();

  // Convert player counts to array of player stats
  const playerStats = Object.entries(totalCounts)
    .map(([playerId, stats]) => ({
      player: players[playerId],
      rosterRate: (stats.total / totalRosters) * 100,
      captainRate: (stats.asCaptain / totalRosters) * 100
    }))
    .filter(stat => stat.rosterRate > 0); // Only show players with roster rate > 0%

  // Sort the player stats based on current sort field and direction
  const sortedPlayerStats = [...playerStats].sort((a, b) => {
    let comparison = 0;
    
    if (sortField === 'name') {
      comparison = a.player.name.localeCompare(b.player.name);
    } else if (sortField === 'rosterRate') {
      comparison = a.rosterRate - b.rosterRate;
    } else if (sortField === 'captainRate') {
      comparison = a.captainRate - b.captainRate;
    }

    return sortDirection === 'asc' ? comparison : -comparison;
  });

  const handleSort = (field: SortField) => {
    if (field === sortField) {
      // If clicking the same field, toggle direction
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      // If clicking a new field, set it as the sort field and default to descending
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const renderSortableHeader = (field: SortField, label: string) => (
    <th 
      className="cursor-pointer user-select-none" 
      onClick={() => handleSort(field)}
      style={{ cursor: 'pointer' }}
    >
      <div className="d-flex align-items-center gap-1">
        {label}
        <ArrowUpDown size={14} className={sortField === field ? 'opacity-100' : 'opacity-25'} />
      </div>
    </th>
  );

  return (
    <div className="card">
      <div className="card-header d-flex align-items-center">
        <Users className="text-primary me-2" size={20} />
        <h4 className="mb-0">Fan Favorites</h4>
      </div>
      <div className="card-body p-0">
        <div className="table-responsive" style={{ maxWidth: '768px' }}>
          <table className="table">
            <thead>
              <tr className="text-nowrap">
                {renderSortableHeader('name', 'Player')}
                {renderSortableHeader('rosterRate', 'Roster Rate')}
                {renderSortableHeader('captainRate', 'Captain Rate')}
              </tr>
            </thead>
            <tbody>
              {sortedPlayerStats.map(({ player, rosterRate, captainRate }) => (
                <tr key={player.id} className="text-nowrap">
                  <td>
                    <span className="fw-bold">{player.name}</span>
                    <span className="text-muted ms-1">({player.region})</span>
                  </td>
                  <td>{rosterRate.toFixed(1)}%</td>
                  <td>{captainRate > 0 ? `${captainRate.toFixed(1)}%` : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default PopularRoster; 
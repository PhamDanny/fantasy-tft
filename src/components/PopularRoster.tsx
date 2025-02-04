import React from 'react';
import type { Player, PerfectRosterChallenge, PerfectRosterLineup } from '../types';
import { Users } from 'lucide-react';

interface PopularRosterProps {
  entries: Record<string, PerfectRosterLineup>;
  players: Record<string, Player>;
  settings: PerfectRosterChallenge['settings'];
}

const PopularRoster: React.FC<PopularRosterProps> = ({
  entries,
  players,
  settings
}) => {
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

  // Get most popular captains based on captain usage
  const popularCaptains = Object.entries(totalCounts)
    .sort((a, b) => b[1].asCaptain - a[1].asCaptain)
    .slice(0, settings.captainSlots)
    .map(([playerId, stats]) => ({
      player: players[playerId],
      count: stats.total,
      asCaptain: stats.asCaptain,
      percentage: (stats.total / totalRosters) * 100
    }));

  // Track used players
  const usedPlayers = new Set(popularCaptains.map(p => p.player.id));

  // Get most popular NA players by total appearances, excluding used players
  const popularNA = Object.entries(totalCounts)
    .filter(([playerId]) => {
      const player = players[playerId];
      return player && 
             player.region === 'NA' && 
             !usedPlayers.has(playerId);
    })
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, settings.naSlots)
    .map(([playerId, stats]) => ({
      player: players[playerId],
      count: stats.total,
      asCaptain: stats.asCaptain,
      percentage: (stats.total / totalRosters) * 100
    }));

  // Add NA players to used set
  popularNA.forEach(p => usedPlayers.add(p.player.id));

  // Get most popular BR/LATAM players by total appearances, excluding used players
  const popularBRLatam = Object.entries(totalCounts)
    .filter(([playerId]) => {
      const player = players[playerId];
      return player && 
             ['BR', 'LATAM'].includes(player.region) && 
             !usedPlayers.has(playerId);
    })
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, settings.brLatamSlots)
    .map(([playerId, stats]) => ({
      player: players[playerId],
      count: stats.total,
      asCaptain: stats.asCaptain,
      percentage: (stats.total / totalRosters) * 100
    }));

  // Add BR/LATAM players to used set
  popularBRLatam.forEach(p => usedPlayers.add(p.player.id));

  // Get most popular flex players from remaining players
  const popularFlex = Object.entries(totalCounts)
    .filter(([playerId]) => !usedPlayers.has(playerId))
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, settings.flexSlots)
    .map(([playerId, stats]) => ({
      player: players[playerId],
      count: stats.total,
      asCaptain: stats.asCaptain,
      percentage: (stats.total / totalRosters) * 100
    }));

  const renderPlayerSlot = (
    player: Player,
    percentage: number,
    asCaptain?: number
  ) => (
    <div className="d-flex align-items-center p-2 border rounded mb-2">
      <div className="w-100">
        <div className="d-flex justify-content-between align-items-center">
          <div>
            <div className="fw-bold">{player.name}</div>
            <small className="text-muted">
              {player.region}
            </small>
          </div>
          <div className="d-flex gap-2">
            {asCaptain !== undefined && (
              <span className="badge bg-warning text-dark">
                {asCaptain.toFixed(1)}% Captain Rate
              </span>
            )}
            <span className="badge bg-light text-dark">
              {percentage.toFixed(1)}% of rosters
            </span>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="card">
      <div className="card-header d-flex align-items-center">
        <Users className="text-primary me-2" size={20} />
        <h4 className="mb-0">Popular Roster</h4>
      </div>
      <div className="card-body">
        <div className="mb-4">
          <h6>Most Popular Captain</h6>
          {popularCaptains.map(({ player, percentage, asCaptain }) => 
            renderPlayerSlot(player, percentage, (asCaptain / totalRosters) * 100)
          )}
        </div>

        <div className="mb-4">
          <h6>Most Popular NA Players</h6>
          {popularNA.map(({ player, percentage }) => 
            renderPlayerSlot(player, percentage)
          )}
        </div>

        <div className="mb-4">
          <h6>Most Popular BR/LATAM Players</h6>
          {popularBRLatam.map(({ player, percentage }) => 
            renderPlayerSlot(player, percentage)
          )}
        </div>

        <div className="mb-4">
          <h6>Most Popular Flex Players</h6>
          {popularFlex.map(({ player, percentage }) => 
            renderPlayerSlot(player, percentage)
          )}
        </div>
      </div>
    </div>
  );
};

export default PopularRoster; 
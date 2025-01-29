import React from 'react';
import type { League, Player } from '../../types';
import { Link } from 'react-router-dom';

interface DraftTabProps {
  league: League;
  players: Record<string, Player>;
  teams: Record<string, any>;
}

const DraftTab: React.FC<DraftTabProps> = ({ league, players, teams }) => {
  // Check if league has draft data
  if (!league.draftId || !league.draftData) {
    return (
      <div className="text-center text-muted py-5">
        This league did not have a draft on Fantasy TFT. If you want to draft rosters instead of importing them manually, please <Link to="/drafts">create a draft</Link>, then convert it to a league.
      </div>
    );
  }

  // Get draft picks from league's draft data
  const draftPicks = league.draftData.picks || [];
  if (draftPicks.length === 0) {
    return (
      <div className="text-center text-muted py-5">
        Draft data is no longer available.
      </div>
    );
  }

  // Calculate total rounds based on roster slots
  const totalRounds = 
    league.settings.captainSlots +
    league.settings.naSlots +
    league.settings.brLatamSlots +
    league.settings.flexSlots +
    league.settings.benchSlots;

  const draftOrder = league.draftData.settings.draftOrder;

  return (
    <div>
      <h4 className="mb-4">Draft Results</h4>
      <div className="table-responsive">
        <table className="table table-bordered table-sm">
          <thead>
            <tr>
              <th style={{ width: '60px' }}>Rd</th>
              {draftOrder.map((teamId) => (
                <th key={teamId}>{teams[teamId]?.teamName || 'Unknown Team'}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: totalRounds }, (_, round) => (
              <tr key={round}>
                <td className="text-center">
                  {round + 1}
                  <span className="ms-2 text-muted">
                    {(round + 1) % 2 === 0 ? '←' : '→'}
                  </span>
                </td>
                {draftOrder.map((teamId) => {
                  const pick = draftPicks.find(p => 
                    p.round === round + 1 && 
                    p.teamId === teamId
                  );
                  const player = pick ? players[pick.playerId] : null;
                  return (
                    <td key={teamId} className="p-2" style={{ minWidth: '200px' }}>
                      {player ? (
                        <div 
                          className={`card h-100 ${
                            player.region === 'NA' ? 'bg-primary bg-opacity-10' :
                            player.region === 'BR' ? 'bg-success bg-opacity-10' :
                            ['LATAM'].includes(player.region) ? 'bg-warning bg-opacity-10' :
                            ''
                          }`}
                        >
                          <div className="card-body p-2">
                            <h6 className="card-title mb-1">{player.name}</h6>
                            <small className="text-muted">{player.region}</small>
                          </div>
                        </div>
                      ) : ''}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default DraftTab;

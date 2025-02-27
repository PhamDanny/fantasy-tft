import React, { useState } from "react";
import type { League, Player, Team } from "../../types";
import { PLAYOFF_SCORES } from "../../types";
import { User } from "firebase/auth";
import AuctionDialog from "../../components/dialogs/AuctionDialog";
import { updateDoc, doc } from "firebase/firestore";
import { db } from "../../firebase/config";
import { ChevronUp, ChevronDown } from "lucide-react";
import TeamDisplay from "../../components/TeamDisplay";

interface PlayoffsTabProps {
  league: League;
  players: Record<string, Player>;
  user: User;
  teams: Record<string, Team>;
}

// Add type for cup keys
type CupKey = 'cup1' | 'cup2' | 'cup3';

const PlayoffsTab: React.FC<PlayoffsTabProps> = ({
  league,
  players,
  teams,
  user,
}) => {
  const [showAuction, setShowAuction] = useState(false);
  const [expandedStandingsTeams, setExpandedStandingsTeams] = useState<Record<string, boolean>>({});


  const isCommissioner = league.commissioner === user.uid;

  const POINTS_PER_PLAYOFF_DOLLAR = 10;

  const regionalsStarted = league.settings.currentCup === 4 && league.settings.playoffs;

  // Update the calculateTeamCupScore function
  const calculateTeamCupScore = (team: Team, cupNumber: number): number => {
    const cupKey = `cup${cupNumber}` as CupKey;
    const lineup = team.cupLineups[cupKey];
    let cupTotal = 0;

    if (!lineup) return 0;

    // Calculate captain scores (1.5x multiplier)
    lineup.captains.forEach((playerId) => {
      if (playerId && players[playerId]) {
        const baseScore = players[playerId].scores[cupKey] ?? 0;
        cupTotal += baseScore * 1.5;
      }
    });

    // Calculate other slot scores
    [...lineup.naSlots, ...lineup.brLatamSlots, ...lineup.flexSlots].forEach(
      (playerId) => {
        if (playerId && players[playerId]) {
          cupTotal += players[playerId].scores[cupKey] ?? 0;
        }
      }
    );

    return cupTotal;
  };

  // Function to calculate team's total score (copied from StandingsTab)
  const calculateTeamTotal = (team: Team): number => {
    return [1, 2, 3].reduce(
      (total, cupNumber) => {
        const cupTotal = calculateTeamCupScore(team, cupNumber);
        return total + cupTotal;
      },
      0
    );
  };

  // Get playoff teams - simple filter for teams with playoff rosters
  const playoffTeams = Object.values(teams)
    .sort((a, b) => calculateTeamTotal(b) - calculateTeamTotal(a))  // Sort by total points
    .slice(0, league.settings.playoffTeams || 8)  // Take top N teams
    .map(team => ({
      team,
      playoffDollars: Math.floor(calculateTeamTotal(team) / POINTS_PER_PLAYOFF_DOLLAR)
    }));

  // Simple check if user's team is in playoffs
  const isInPlayoffs = playoffTeams.some(({ team }) => 
    team.ownerID === user.uid || team.coOwners?.includes(user.uid)
  );

  // Update how we get regionals players - same change
  const regionalsPlayers = Object.values(players).filter(p => 
    p.regionals?.qualified === true
  );

  // Add helper function to get retained players
  const getRetainedPlayers = (team: Team): string[] => {
    if (!team.roster) return [];
    return team.roster.filter(id => 
      players[id] && players[id].regionals?.qualified === true
    );
  };

  // Add helper to get retained player objects
  const getRetainedPlayerObjects = (team: Team): Player[] => {
    const retainedIds = getRetainedPlayers(team);
    return retainedIds
      .map(id => players[id])
      .filter((p): p is Player => p !== undefined);
  };

  const getOrdinalSuffix = (n: number): string => {
    if (n >= 11 && n <= 13) return 'th';  // Handle 11th, 12th, 13th
    const lastDigit = n % 10;
    switch (lastDigit) {
      case 1: return 'st';
      case 2: return 'nd';
      case 3: return 'rd';
      default: return 'th';
    }
  };

  // Update getPlayerPlacement to handle undefined player
  const getPlayerPlacement = (player: Player | undefined) => {
    if (!player || !player.regionals?.placement || player.regionals.placement <= 0) return null;
    return {
      placement: player.regionals.placement,
      points: PLAYOFF_SCORES[player.regionals.placement]
    };
  };

  // Use the renamed value from league settings
  const playoffAuctionStarted = league.settings.playoffSettings?.playoffAuctionStarted || false;

  // Add a state to track if auction is complete
  const isAuctionComplete = regionalsStarted && 
    playoffAuctionStarted && 
    regionalsPlayers.every(player => 
      playoffTeams.some(({ team }) => team.playoffRoster?.includes(player.id))
    );

  // Add toggle function
  const toggleStandingsTeamExpanded = (teamId: string) => {
    setExpandedStandingsTeams(prev => ({
      ...prev,
      [teamId]: !prev[teamId]
    }));
  };

  // Update startPlayoffAuction
  const startPlayoffAuction = async () => {
    // First set auction as started and set initial nominator
    await updateDoc(doc(db, "leagues", league.id.toString()), {
      "settings.playoffSettings.playoffAuctionStarted": true,
      "settings.playoffSettings.currentNominator": playoffTeams[0].team.teamId
    });

    // Initialize playoff dollars and rosters for each team
    await Promise.all(playoffTeams.map(async ({ team }) => {
      const retainedPlayerIds = getRetainedPlayers(team);
      await updateDoc(doc(db, "leagues", league.id.toString(), "teams", team.teamId), {
        playoffDollars: Math.floor(calculateTeamTotal(team) / POINTS_PER_PLAYOFF_DOLLAR),
        playoffRoster: retainedPlayerIds  // Initialize with retained players
      });
    }));

    setShowAuction(true);
  };

  // Add restart function
  const handleRestartAuction = async () => {
    if (!window.confirm('Are you sure you want to restart the auction? This will reset all bids and rosters.')) {
      return;
    }

    // Reset nomination state and set initial nominator
    await updateDoc(doc(db, "leagues", league.id.toString()), {
      "settings.playoffSettings": {
        ...league.settings.playoffSettings,
        currentNomination: null,
        currentNominator: playoffTeams[0].team.teamId,  // Reset to highest seed
        nominationOrder: playoffTeams.map(pt => pt.team.teamId)  // Store the order
      }
    });

    // Reset all teams' playoff dollars and rosters
    await Promise.all(playoffTeams.map(async ({ team }) => {
      const retainedPlayerIds = getRetainedPlayers(team);
      await updateDoc(doc(db, "leagues", league.id.toString(), "teams", team.teamId), {
        playoffDollars: Math.floor(calculateTeamTotal(team) / POINTS_PER_PLAYOFF_DOLLAR),
        playoffRoster: retainedPlayerIds,
        playoffBids: {}
      });
    }));
  };

  // Add these helper functions near the top with the other helpers
  const getRankStyle = (rank: number): string => {
    switch (rank) {
      case 1:
        return 'bg-warning text-dark';  // Gold
      case 2:
        return 'bg-secondary text-white';  // Silver
      case 3:
        return 'bg-bronze text-white';  // Bronze
      default:
        return 'bg-light text-dark';
    }
  };

  const formatRank = (rank: number): string => {
    if (rank === 1) return '1st';
    if (rank === 2) return '2nd';
    if (rank === 3) return '3rd';
    return `${rank}th`;
  };

  // Add this helper function near the other helpers
  const getAvailableRegionalsPlayers = () => {
    // Get all qualified players
    const qualifiedPlayers = Object.values(players).filter(p => p.regionals?.qualified === true);
    
    // Get all retained players from playoff teams
    const retainedPlayerIds = new Set(
      playoffTeams.flatMap(({ team }) => getRetainedPlayers(team))
    );
    
    // Return qualified players not retained by playoff teams
    return qualifiedPlayers.filter(player => !retainedPlayerIds.has(player.id));
  };

  return (
    <div className="row">
      <div className="col-12">
        {/* Show standings only if auction is complete */}
        {isAuctionComplete && (
          <div className="card mb-4">
            <div className="card-header">
              <h4 className="mb-0">Playoff Championship</h4>
            </div>
            <div className="card-body">
              <div className="table-responsive">
                <table className="table table-hover">
                  <thead className="table-light">
                    <tr>
                      <th className="text-center" style={{ width: '80px' }}>Rank</th>
                      <th>Team</th>
                      <th className="text-end" style={{ width: '120px' }}>Points</th>
                    </tr>
                  </thead>
                  <tbody>
                    {playoffTeams
                      .map(({ team }) => ({
                        team,
                        retainedPoints: getRetainedPlayerObjects(team)
                          .reduce((sum, player) => {
                            const placement = getPlayerPlacement(player);
                            return sum + (placement?.points || 0);
                          }, 0),
                        acquiredPoints: (team.playoffRoster || [])
                          .filter(id => !team.roster.includes(id))
                          .reduce((sum, id) => {
                            const player = players[id];
                            const placement = getPlayerPlacement(player);
                            return sum + (placement?.points || 0);
                          }, 0)
                      }))
                      .map(({ team, retainedPoints, acquiredPoints }) => ({
                        team,
                        retainedPoints,
                        acquiredPoints,
                        totalPoints: retainedPoints + acquiredPoints
                      }))
                      .sort((a, b) => b.totalPoints - a.totalPoints)
                      .map(({ team, retainedPoints, acquiredPoints, totalPoints }, index) => {
                        const rank = index + 1;
                        const isExpanded = expandedStandingsTeams[team.teamId];
                        
                        return (
                          <React.Fragment key={team.teamId}>
                            <tr 
                              className="cursor-pointer"
                              onClick={() => toggleStandingsTeamExpanded(team.teamId)}
                            >
                              <td className="text-center">
                                <span 
                                  className={`badge ${getRankStyle(rank)} px-3 py-2`} 
                                  style={{ 
                                    minWidth: '50px',
                                    backgroundColor: rank === 3 ? '#CD7F32' : undefined,
                                    fontSize: '1.1em'
                                  }}
                                >
                                  {formatRank(rank)}
                                </span>
                              </td>
                              <td>
                                <div className="d-flex align-items-center gap-2">
                                  {isExpanded ? (
                                    <ChevronUp size={16} />
                                  ) : (
                                    <ChevronDown size={16} />
                                  )}
                                  <span className="h5 mb-0"><TeamDisplay team={team} /></span>
                                </div>
                              </td>
                              <td className="text-end">
                                <span className="h4 mb-0">{totalPoints}</span>
                              </td>
                            </tr>
                            
                            {isExpanded && (
                              <tr>
                                <td colSpan={3}>
                                  <div className="bg-light p-3">
                                    <div className="row">
                                      <div className="col-md-6">
                                        <h6>Retained Players ({retainedPoints} pts)</h6>
                                        <div className="list-group">
                                          {getRetainedPlayerObjects(team).map(player => {
                                            const placement = getPlayerPlacement(player);
                                            return (
                                              <div key={player.id} className="list-group-item d-flex justify-content-between align-items-center">
                                                <div>
                                                  {player.name} <span className="text-muted">({player.region})</span>
                                                  <small className="text-muted ms-2">
                                                    {placement ? `${placement.placement}${getOrdinalSuffix(placement.placement)}` : '-'}
                                                  </small>
                                                </div>
                                                <span className="badge bg-primary">{placement?.points || 0}</span>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      </div>
                                      <div className="col-md-6">
                                        <h6>Acquired Players ({acquiredPoints} pts)</h6>
                                        <div className="list-group">
                                          {team.playoffRoster
                                            ?.filter(id => !team.roster.includes(id))
                                            .map(id => {
                                              const player = players[id];
                                              if (!player) return null;
                                              const placement = getPlayerPlacement(player);
                                              return (
                                                <div key={player.id} className="list-group-item d-flex justify-content-between align-items-center">
                                                  <div>
                                                    {player.name} <span className="text-muted">({player.region})</span>
                                                    <small className="text-muted ms-2">
                                                      {placement ? `${placement.placement}${getOrdinalSuffix(placement.placement)}` : '-'}
                                                    </small>
                                                  </div>
                                                  <span className="badge bg-primary">{placement?.points || 0}</span>
                                                </div>
                                              );
                                            })}
                                        </div>
                                      </div>
                                    </div>
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
        )}

        <div className="card">
          <div className="card-header">
            <h4 className="h5 mb-0">Playoff Information</h4>
          </div>
          <div className="card-body">
            {!league.settings.playoffs ? (
              <div className="alert alert-info">
                {league.settings.currentCup === 4 ? (
                  // If global cup is 4 but playoffs are disabled
                  <div>
                    Playoffs are not enabled for this league. Since the playoff phase has already started, 
                    this setting cannot be changed.
                  </div>
                ) : (
                  // Normal message when playoffs haven't started
                  <div>
                    Playoffs are not enabled for this league. The commissioner can enable them in the settings tab.
                  </div>
                )}
              </div>
            ) : (
              <>
                {!regionalsStarted ? (
                  <div className="alert alert-info">
                    This is a preview of what playoffs would look like if they started today. Only confirmed regionals players are shown.
                  </div>
                ) : (
                  <div className="alert alert-warning">
                    Playoffs have started! Eliminated teams' players have been returned to the pool.
                  </div>
                )}

                <div className="row">
                  <div className="col-md-5">
                    <h5 className="mb-3">{regionalsStarted ? 'Current' : 'Projected'} Playoff Teams</h5>
                    <div className="table-responsive">
                      <table className="table table-sm">
                        <thead>
                          <tr>
                            <th style={{ width: '50px' }}>Rank</th>
                            <th>Team</th>
                            <th className="text-end" style={{ width: '80px' }}>Playoff Budget</th>
                          </tr>
                        </thead>
                        <tbody>
                          {playoffTeams.map(({ team, playoffDollars }, index) => (
                            <tr key={team.teamId}>
                              <td className="text-center">{index + 1}</td>
                              <td>{<TeamDisplay team={team} />}</td>
                              <td className="text-end">
                                ${playoffDollars}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <div className="small text-muted mt-2">
                        * $1 per {POINTS_PER_PLAYOFF_DOLLAR} regular season points
                      </div>
                    </div>
                  </div>

                  <div className="col-md-7">
                    <h5 className="mb-3">Playoff Format</h5>
                    <ul className="list-unstyled">
                      <li>• Top {league.settings.playoffTeams} teams qualify</li>
                      <li>• Teams retain their Regionals-qualified players</li>
                      <li>• Eliminated teams' players return to the pool</li>
                      <li>• Teams receive $1 in playoff dollars for every {POINTS_PER_PLAYOFF_DOLLAR} regular season points</li>
                      <li>• Playoff dollars are completely separate from regular season FAAB, which doesn't carry over</li>
                      <li>• Playoff auction draft using playoff dollars to build rosters</li>
                      <li>• Current playoff roster: {league.settings.playoffSettings?.captainSlots || 1} Captain, {league.settings.playoffSettings?.naSlots || 1} NA, {league.settings.playoffSettings?.brLatamSlots || 1} BR/LATAM, {league.settings.playoffSettings?.flexSlots || 3} Flex</li>
                    </ul>
                  </div>
                </div>

                {!regionalsStarted ? (
                  // Preview Mode
                  <div className="mt-4">
                    <h5 className="mb-3">Projected Playoff Rosters</h5>
                    {playoffTeams.map(({ team }) => (
                      <div key={team.teamId} className="card mb-3">
                        <div className="card-header">
                          <h6 className="mb-0"><TeamDisplay team={team} /></h6>
                        </div>
                        <div className="card-body">
                          {getRetainedPlayerObjects(team).length > 0 ? (
                            <div className="table-responsive">
                              <table className="table table-sm">
                                <thead>
                                  <tr>
                                    <th>Player</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {getRetainedPlayerObjects(team).map(player => (
                                    <tr key={player.id}>
                                      <td>
                                        {player.name} <span className="text-muted">({player.region})</span>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ) : (
                            <p className="text-muted">No qualified players yet</p>
                          )}
                        </div>
                      </div>
                    ))}

                    <div className="card mt-4">
                      <div className="card-header">
                        <h5 className="mb-0">Projected Auction Pool</h5>
                      </div>
                      <div className="card-body">
                        <div className="table-responsive">
                          {getAvailableRegionalsPlayers().length > 0 ? (
                            <table className="table table-sm">
                              <thead>
                                <tr>
                                  <th>Player</th>
                                </tr>
                              </thead>
                              <tbody>
                                {getAvailableRegionalsPlayers()
                                  .sort((a, b) => a.name.localeCompare(b.name))
                                  .map(player => (
                                    <tr key={player.id}>
                                      <td>
                                        {player.name} <span className="text-muted">({player.region})</span>
                                      </td>
                                    </tr>
                                  ))}
                              </tbody>
                            </table>
                          ) : (
                            <p className="text-muted">Regionals players not on a a playoff team will be available in the Playoff Auction.</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  // Full Playoff Mode - Show existing playoff content
                  <>
                    {/* Existing playoff content - standings, auction controls, etc */}
                    {isCommissioner && !playoffAuctionStarted && (
                      <div className="alert alert-primary d-flex justify-content-between align-items-center mb-4">
                        <span>Ready to start the playoff auction?</span>
                        <button 
                          className="btn btn-primary"
                          onClick={startPlayoffAuction}
                        >
                          Start Playoff Auction
                        </button>
                      </div>
                    )}

                    {playoffAuctionStarted && (
                      <div className="alert alert-success d-flex justify-content-between align-items-center mb-4">
                        {isAuctionComplete ? (
                          <>
                            <span>The playoff auction has ended!</span>
                            <button 
                              className="btn btn-primary"
                              onClick={() => setShowAuction(true)}
                            >
                              View Auction Results
                            </button>
                          </>
                        ) : (
                          <>
                            <span>The playoff auction is in progress!</span>
                            <div>
                              {isCommissioner && (
                                <button 
                                  className="btn btn-warning me-2"
                                  onClick={handleRestartAuction}
                                >
                                  Restart Auction
                                </button>
                              )}
                              {isInPlayoffs && !showAuction && (
                                <button 
                                  className="btn btn-success"
                                  onClick={() => setShowAuction(true)}
                                >
                                  Join Auction
                                </button>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </div>

        {showAuction && (
          <AuctionDialog
            league={league}
            players={regionalsPlayers}
            teams={Object.values(teams)}
            onClose={() => setShowAuction(false)}
            isPlayoffs={true}
            user={user}
            isCommissioner={isCommissioner}
            calculateTeamTotal={calculateTeamTotal}
            POINTS_PER_PLAYOFF_DOLLAR={POINTS_PER_PLAYOFF_DOLLAR}
          />
        )}
      </div>
    </div>
  );
};

export default PlayoffsTab; 
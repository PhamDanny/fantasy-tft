import React, { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type {
  League,
  Player,
  Team,
  TeamLineup,
  LeagueSettings,
} from "../../types";
import { User } from "firebase/auth";
import InviteDialog from "../../components/dialogs/InviteDialog";
import LeagueChat from "../../components/chat/LeagueChat";

interface StandingsTabProps {
  league: League;
  players: Record<string, Player>;
  user: User;
  teams: Record<string, Team>;
}

const StandingsTab: React.FC<StandingsTabProps> = ({
  league,
  players,
  user,
  teams,
}) => {
  const [expandedTeams, setExpandedTeams] = useState<Record<string, boolean>>(
    {}
  );
  const [showInviteDialog, setShowInviteDialog] = useState(false);

  const toggleTeamExpanded = (teamId: string) => {
    setExpandedTeams((prev) => ({
      ...prev,
      [teamId]: !prev[teamId],
    }));
  };

  const isLeagueAtCapacity = () => {
    return Object.keys(teams).length >= league.settings.teamsLimit;
  };

  const getEmptyLineup = (settings: LeagueSettings): TeamLineup => ({
    captains: Array(settings.captainSlots).fill(null),
    naSlots: Array(settings.naSlots).fill(null),
    brLatamSlots: Array(settings.brLatamSlots).fill(null),
    flexSlots: Array(settings.flexSlots).fill(null),
    bench: [],
  });

  const getTeamLineup = (team: Team, cupNumber: number): TeamLineup => {
    const cupKey = `cup${cupNumber}` as keyof typeof team.cupLineups;
    return team.cupLineups[cupKey] || getEmptyLineup(league.settings);
  };

  const getPlayerCupScore = (
    player: Player,
    cupNumber: number,
    isCaptain: boolean
  ): number => {
    const cupKey = `cup${cupNumber}` as keyof typeof player.scores;
    const baseScore = player.scores[cupKey] ?? 0;
    return isCaptain ? baseScore * 1.5 : baseScore;
  };

  const calculateTeamCupScore = (team: Team, cupNumber: number): number => {
    const lineup = getTeamLineup(team, cupNumber);
    let totalScore = 0;

    // Calculate captain scores
    lineup.captains.forEach((playerId) => {
      if (playerId && players[playerId]) {
        totalScore += getPlayerCupScore(players[playerId], cupNumber, true);
      }
    });

    // Calculate NA slot scores
    lineup.naSlots.forEach((playerId) => {
      if (playerId && players[playerId]) {
        totalScore += getPlayerCupScore(players[playerId], cupNumber, false);
      }
    });

    // Calculate BR/LATAM slot scores
    lineup.brLatamSlots.forEach((playerId) => {
      if (playerId && players[playerId]) {
        totalScore += getPlayerCupScore(players[playerId], cupNumber, false);
      }
    });

    // Calculate flex slot scores
    lineup.flexSlots.forEach((playerId) => {
      if (playerId && players[playerId]) {
        totalScore += getPlayerCupScore(players[playerId], cupNumber, false);
      }
    });

    return totalScore;
  };

  const getAllPlayerContributions = (team: Team) => {
    const allContributions = new Map<
      string,
      {
        cup1: number;
        cup2: number;
        cup3: number;
        total: number;
        isOnTeam: boolean;
      }
    >();

    // Initialize current roster
    team.roster.forEach((playerId) => {
      allContributions.set(playerId, {
        cup1: 0,
        cup2: 0,
        cup3: 0,
        total: 0,
        isOnTeam: true,
      });
    });

    // Add contributions from each cup
    [1, 2, 3].forEach((cupNumber) => {
      const lineup = getTeamLineup(team, cupNumber);

      // Process captains
      lineup.captains.forEach((playerId) => {
        if (playerId && players[playerId]) {
          const score = getPlayerCupScore(players[playerId], cupNumber, true);
          const existing = allContributions.get(playerId) || {
            cup1: 0,
            cup2: 0,
            cup3: 0,
            total: 0,
            isOnTeam: team.roster.includes(playerId),
          };
          const cupKey = `cup${cupNumber}` as "cup1" | "cup2" | "cup3";
          existing[cupKey] = score;
          existing.total += score;
          allContributions.set(playerId, existing);
        }
      });

      // Process other slots
      [...lineup.naSlots, ...lineup.brLatamSlots, ...lineup.flexSlots].forEach(
        (playerId) => {
          if (playerId && players[playerId]) {
            const score = getPlayerCupScore(
              players[playerId],
              cupNumber,
              false
            );
            const existing = allContributions.get(playerId) || {
              cup1: 0,
              cup2: 0,
              cup3: 0,
              total: 0,
              isOnTeam: team.roster.includes(playerId),
            };
            const cupKey = `cup${cupNumber}` as "cup1" | "cup2" | "cup3";
            existing[cupKey] = score;
            existing.total += score;
            allContributions.set(playerId, existing);
          }
        }
      );
    });

    return Array.from(allContributions.entries())
      .map(([playerId, data]) => ({
        playerId,
        ...data,
      }))
      .sort((a, b) => b.total - a.total);
  };

  const calculateTeamTotal = (team: Team): number => {
    return [1, 2, 3].reduce(
      (total, cupNumber) => total + calculateTeamCupScore(team, cupNumber),
      0
    );
  };

  // Sort teams by total score
  const sortedTeams = Object.entries(teams)
    .map(([teamId, team]) => ({
      teamId,
      team,
      cupScores: {
        cup1: calculateTeamCupScore(team, 1),
        cup2: calculateTeamCupScore(team, 2),
        cup3: calculateTeamCupScore(team, 3),
        total: calculateTeamTotal(team),
      },
    }))
    .sort((a, b) => b.cupScores.total - a.cupScores.total);

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

  return (
    <div className="row">
      <div className="col-md-8">
        <div className="mb-4">
          <h3 className="h5 mb-0">League Settings</h3>
          <div className="row">
            <div className="col-md-3 col-6">
              <div className="mb-2">
                Current Cup:{" "}
                {league.settings.currentCup === 0
                  ? "Preseason"
                  : league.settings.currentCup}
              </div>
              <div className="mb-2">
                Teams: {Object.keys(teams).length}/
                {league.settings.teamsLimit}
              </div>
            </div>
            <div className="col-md-3 col-6">
              <div className="mb-2">
                Captain Slots: {league.settings.captainSlots}
              </div>
              <div className="mb-2">NA Slots: {league.settings.naSlots}</div>
            </div>
            <div className="col-md-3 col-6">
              <div className="mb-2">
                BR/LATAM Slots: {league.settings.brLatamSlots}
              </div>
              <div className="mb-2">
                Flex Slots: {league.settings.flexSlots}
              </div>
            </div>
            <div className="col-md-3 col-6">
              <div className="mb-2">
                Bench Slots: {league.settings.benchSlots}
              </div>
              <div className="mb-2">
                Starting FAAB: ${league.settings.faabBudget}
              </div>
            </div>
          </div>

          {!isLeagueAtCapacity() && (
            <div className="row mb-4">
              <div className="col-12">
                <div className="card bg-light">
                  <div className="card-body text-center py-4">
                    <h4>Your league isn't full!</h4>
                    <p className="mb-4">
                      {league.settings.teamsLimit -
                        Object.keys(teams).length}{" "}
                      spots remaining - Get your friends in on the action and
                      build your Fantasy TFT community!
                    </p>
                    {league.commissioner === user.uid ? (
                      <button
                        className="btn btn-primary btn-lg px-4"
                        onClick={() => setShowInviteDialog(true)}
                      >
                        Invite Players
                      </button>
                    ) : (
                      <p className="text-muted">
                        Contact the commissioner to get an invite link for your
                        friends
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          <h3 className="h5 mb-3">Standings</h3>
          <div className="table-responsive">
            <table className="table table-hover">
              <thead className="table-light">
                <tr>
                  <th className="text-center" style={{ width: '60px' }}>Rank</th>
                  <th>Team</th>
                  {league.settings.currentCup >= 1 && (
                    <th className="text-center">Cup 1</th>
                  )}
                  {league.settings.currentCup >= 2 && (
                    <th className="text-center">Cup 2</th>
                  )}
                  {league.settings.currentCup >= 3 && (
                    <th className="text-center">Cup 3</th>
                  )}
                  <th className="text-center">Total</th>
                </tr>
              </thead>
              <tbody>
                {sortedTeams.map(({ teamId, team, cupScores }, index) => {
                  const isExpanded = expandedTeams[teamId];
                  const contributions = getAllPlayerContributions(team);
                  const rank = index + 1;
                  const isLastPlayoffTeam = league.settings.playoffs && 
                    rank === league.settings.playoffTeams;

                  return (
                    <React.Fragment key={teamId}>
                      <tr
                        className={`${
                          team.ownerID === user.uid ? "table-primary" : ""
                        } cursor-pointer`}
                        onClick={() => toggleTeamExpanded(teamId)}
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
                            {isExpanded ? (
                              <ChevronUp size={16} />
                            ) : (
                              <ChevronDown size={16} />
                            )}
                            <div>
                              <span className="fw-medium">{team.teamName}</span>
                              <div className="small text-muted">
                                FAAB: ${team.faabBudget}
                              </div>
                            </div>
                          </div>
                        </td>
                        {league.settings.currentCup >= 1 && (
                          <td className="text-center">
                            {typeof cupScores.cup1 === "number"
                              ? cupScores.cup1.toFixed(1)
                              : "-"}
                          </td>
                        )}
                        {league.settings.currentCup >= 2 && (
                          <td className="text-center">
                            {typeof cupScores.cup2 === "number"
                              ? cupScores.cup2.toFixed(1)
                              : "-"}
                          </td>
                        )}
                        {league.settings.currentCup >= 3 && (
                          <td className="text-center">
                            {typeof cupScores.cup3 === "number"
                              ? cupScores.cup3.toFixed(1)
                              : "-"}
                          </td>
                        )}
                        <td className="text-center fw-bold">
                          {typeof cupScores.total === "number"
                            ? cupScores.total.toFixed(1)
                            : "-"}
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr>
                          <td></td>
                          <td colSpan={league.settings.currentCup + 2}>
                            <div className="bg-light p-3">
                              <h6 className="mb-3">Player Contributions</h6>
                              <table className="table table-sm">
                                <thead>
                                  <tr>
                                    <th>Player</th>
                                    {league.settings.currentCup >= 1 && (
                                      <th className="text-center">Cup 1</th>
                                    )}
                                    {league.settings.currentCup >= 2 && (
                                      <th className="text-center">Cup 2</th>
                                    )}
                                    {league.settings.currentCup >= 3 && (
                                      <th className="text-center">Cup 3</th>
                                    )}
                                    <th className="text-center">Total</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {contributions.map((contribution) => {
                                    const player =
                                      players[contribution.playerId];
                                    if (!player) return null;

                                    return (
                                      <tr key={contribution.playerId}>
                                        <td>
                                          <div className="d-flex align-items-center gap-2">
                                            <div>
                                              <span>{player.name}</span>
                                              <small className="text-muted">
                                                ({player.region})
                                              </small>
                                              {!contribution.isOnTeam &&
                                                contribution.total > 0 && (
                                                  <span className="badge bg-danger">
                                                    Off Roster
                                                  </span>
                                                )}
                                            </div>
                                          </div>
                                        </td>
                                        {league.settings.currentCup >= 1 && (
                                          <td className="text-center">
                                            {contribution.cup1 > 0
                                              ? contribution.cup1.toFixed(1)
                                              : "-"}
                                          </td>
                                        )}
                                        {league.settings.currentCup >= 2 && (
                                          <td className="text-center">
                                            {contribution.cup2 > 0
                                              ? contribution.cup2.toFixed(1)
                                              : "-"}
                                          </td>
                                        )}
                                        {league.settings.currentCup >= 3 && (
                                          <td className="text-center">
                                            {contribution.cup3 > 0
                                              ? contribution.cup3.toFixed(1)
                                              : "-"}
                                          </td>
                                        )}
                                        <td className="text-center fw-bold">
                                          {contribution.total > 0
                                            ? contribution.total.toFixed(1)
                                            : "-"}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}

                      {/* Modified separator with text */}
                      {isLastPlayoffTeam && (
                        <tr className="playoff-separator">
                          <td colSpan={league.settings.currentCup + 3} className="p-0">
                            <div className="d-flex align-items-center gap-2 my-2">
                              <div className="border-bottom border-2 border-secondary flex-grow-1"></div>
                              <div className="text-muted small px-2">
                                Top {league.settings.playoffTeams} teams qualify for playoffs
                              </div>
                              <div className="border-bottom border-2 border-secondary flex-grow-1"></div>
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

      <div className="col-md-4">
        <LeagueChat
          league={league}
          userId={user.uid}
          userName={user.displayName || "Anonymous"}
          teams={teams}
          players={players}
        />
      </div>

      {showInviteDialog && (
        <InviteDialog
          league={league}
          show={showInviteDialog}
          onClose={() => setShowInviteDialog(false)}
        />
      )}
    </div>
  );
};

export default StandingsTab;

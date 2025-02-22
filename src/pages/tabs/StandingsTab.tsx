import React, { useState, useEffect } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type {
  League,
  Player,
  Team,
  TeamLineup
} from "../../types";
import { PLAYOFF_SCORES, getLeagueType } from "../../types";
import { User } from "firebase/auth";
import InviteDialog from "../../components/dialogs/InviteDialog";
import LeagueChat from "../../components/chat/LeagueChat";
import { getDoc, doc, updateDoc } from "firebase/firestore";
import { db } from "../../firebase/config";

interface StandingsTabProps {
  league: League;
  players: Record<string, Player>;
  user: User;
  teams: Record<string, Team>;
}

// Add type for cup scores at the top of the file
type CupScores = {
  cup1: number;
  cup2: number;
  cup3: number;
  total: number;
};

// Add helper function to get cup score safely
const getCupScore = (scores: CupScores, cupNumber: number): number | null => {
  const cupKey = `cup${cupNumber}` as keyof CupScores;
  return scores[cupKey];
};

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
  const [ownerNames, setOwnerNames] = useState<Record<string, string>>({});

  const toggleTeamExpanded = (teamId: string) => {
    setExpandedTeams((prev) => ({
      ...prev,
      [teamId]: !prev[teamId],
    }));
  };

  const isLeagueAtCapacity = () => {
    return Object.keys(teams).length >= league.settings.teamsLimit;
  };

  const getTeamLineup = (team: Team, cupNumber: number): TeamLineup => {
    const cupKey = `cup${cupNumber}` as keyof typeof team.cupLineups;
    const lineup = team.cupLineups[cupKey];

    if (!lineup) {
      return {
        captains: [],
        naSlots: [],
        brLatamSlots: [],
        flexSlots: [],
        bench: []
      };
    }

    return lineup;
  };

  const getPlayerCupScore = (player: Player, cupNumber: number, isCaptain: boolean) => {
    const cupKey = `cup${cupNumber}` as keyof typeof player.scores;
    const score = player.scores[cupKey] || 0;
    return isCaptain ? score * 1.5 : score;
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
            const score = getPlayerCupScore(players[playerId], cupNumber, false);
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

  const formatScore = (score: number): string => {
    return score % 1 === 0 ? score.toFixed(0) : score.toFixed(1);
  };

  // Add near the top with other checks
  const playoffAuctionStarted = league.settings.playoffSettings?.playoffAuctionStarted === true;
  const isAuctionComplete = playoffAuctionStarted && 
    Object.values(players)
      .filter(p => p.regionals?.qualified === true)
      .every(player => 
        Object.values(teams).some(team => team.playoffRoster?.includes(player.id))
      );

  // First, add a helper to determine which cup columns to show
  const shouldShowCupColumn = (cupNumber: number) => {
    // For single tournament leagues, only show the current cup
    if (getLeagueType(league) === 'single-tournament') {
      return cupNumber === league.settings.currentCup;
    }
    // For season-long leagues, show all cups up to current
    return league.settings.currentCup >= cupNumber;
  };

  useEffect(() => {
    const fetchDisplayNames = async () => {
      const names: Record<string, string> = {};
      const missingTeams: Team[] = [];
      
      // First use names from teams
      for (const team of Object.values(teams)) {
        if (team.ownerDisplayName) {
          names[team.ownerID] = team.ownerDisplayName;
        }
        if (team.coOwnerDisplayNames) {
          Object.assign(names, team.coOwnerDisplayNames);
        }
        
        // Check if we need to fetch owner name
        if ((!team.ownerDisplayName && team.ownerID) || // Only if ownerID exists
            (team.coOwners?.length && !team.coOwnerDisplayNames)) {
          missingTeams.push(team);
        }
      }

      // Only fetch missing names
      if (missingTeams.length > 0) {
        try {
          for (const team of missingTeams) {
            const updates: Partial<Team> = {};
            
            // Fetch owner name if missing and ownerID exists
            if (!team.ownerDisplayName && team.ownerID) {
              try {
                const ownerDoc = await getDoc(doc(db, "users", team.ownerID));
                if (ownerDoc.exists()) {
                  const displayName = ownerDoc.data().displayName;
                  names[team.ownerID] = displayName;
                  updates.ownerDisplayName = displayName;
                } else {
                  // User doesn't exist, use a fallback name
                  names[team.ownerID] = "Unknown User";
                  updates.ownerDisplayName = "Unknown User";
                }
              } catch (error) {
                console.error(`Error fetching owner ${team.ownerID}:`, error);
                names[team.ownerID] = "Unknown User";
              }
            }

            // Fetch co-owner names if missing
            if (team.coOwners?.length && !team.coOwnerDisplayNames) {
              const coOwnerNames: Record<string, string> = {};
              for (const coOwnerId of team.coOwners) {
                try {
                  const coOwnerDoc = await getDoc(doc(db, "users", coOwnerId));
                  if (coOwnerDoc.exists()) {
                    const displayName = coOwnerDoc.data().displayName;
                    names[coOwnerId] = displayName;
                    coOwnerNames[coOwnerId] = displayName;
                  } else {
                    names[coOwnerId] = "Unknown User";
                    coOwnerNames[coOwnerId] = "Unknown User";
                  }
                } catch (error) {
                  console.error(`Error fetching co-owner ${coOwnerId}:`, error);
                  names[coOwnerId] = "Unknown User";
                  coOwnerNames[coOwnerId] = "Unknown User";
                }
              }
              updates.coOwnerDisplayNames = coOwnerNames;
            }

            // Update team document if we have updates
            if (Object.keys(updates).length > 0) {
              try {
                await updateDoc(
                  doc(db, "leagues", league.id.toString(), "teams", team.teamId),
                  updates
                );
              } catch (error) {
                console.error(`Error updating team ${team.teamId}:`, error);
              }
            }
          }

          setOwnerNames(names);
        } catch (error) {
          console.error("Error in fetchDisplayNames:", error);
        }
      } else {
        setOwnerNames(names);
      }
    };

    fetchDisplayNames();
  }, [league.id, teams]);

  return (
    <div className="row">
      <div className="col-12 col-lg-8">
        {/* Add Playoff Championship section at the top */}
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
                    {Object.values(teams)
                      .filter(team => team.playoffRoster)
                      .map(team => ({
                        team,
                        retainedPoints: team.roster
                          .filter(id => team.playoffRoster?.includes(id))
                          .reduce((sum, id) => {
                            const player = players[id];
                            if (!player?.regionals?.placement) return sum;
                            return sum + PLAYOFF_SCORES[player.regionals.placement];
                          }, 0),
                        acquiredPoints: (team.playoffRoster || [])
                          .filter(id => !team.roster.includes(id))
                          .reduce((sum, id) => {
                            const player = players[id];
                            if (!player?.regionals?.placement) return sum;
                            return sum + PLAYOFF_SCORES[player.regionals.placement];
                          }, 0)
                      }))
                      .map(({ team, retainedPoints, acquiredPoints }) => ({
                        team,
                        retainedPoints,
                        acquiredPoints,
                        totalPoints: retainedPoints + acquiredPoints
                      }))
                      .sort((a, b) => b.totalPoints - a.totalPoints)
                      .map(({ team, totalPoints }, index) => {
                        const rank = index + 1;
                        return (
                          <tr key={team.teamId}>
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
                              <span className="h5 mb-0">{team.teamName}</span>
                            </td>
                            <td className="text-end">
                              <span className="h4 mb-0">{totalPoints}</span>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
              <div className="text-muted small mt-2">
                See Playoffs tab for detailed rosters, scoring, and auction results
              </div>
            </div>
          </div>
        )}

        {/* Only show league settings if playoffs haven't started */}
        {!playoffAuctionStarted && (
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
                  <div className="card">
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
          </div>
        )}

        <div className="card">
          <div className="card-header">
            <h4 className="h5 mb-0">
              {getLeagueType(league) === 'season-long' ? 'Regular Season Standings' : 'Standings'}
            </h4>
          </div>
          <div className="table-responsive">
            <table className="table table-hover">
              <thead className="table-secondary">
                <tr>
                  <th className="text-center" style={{ width: '60px' }}>Rank</th>
                  <th>Team</th>
                  {getLeagueType(league) === 'season-long' ? (
                    // Show all cups for season-long leagues
                    <>
                      {shouldShowCupColumn(1) && <th className="text-center">Cup 1</th>}
                      {shouldShowCupColumn(2) && <th className="text-center">Cup 2</th>}
                      {shouldShowCupColumn(3) && <th className="text-center">Cup 3</th>}
                    </>
                  ) : (
                    // Show only current cup for single tournament
                    <th className="text-center">Cup {league.settings.currentCup}</th>
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
                          team.ownerID === user.uid ? "table-info bg-opacity-50" : ""
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
                              {team.teamName !== ownerNames[team.ownerID] && (
                                <small className="text-muted ms-2">
                                  ({ownerNames[team.ownerID]})
                                </small>
                              )}
                              <div className={`small ${
                                team.ownerID === user.uid 
                                  ? "text-dark" 
                                  : "text-body-secondary"
                              }`}>
                                ${team.faabBudget}
                              </div>
                            </div>
                          </div>
                        </td>
                        {getLeagueType(league) === 'season-long' ? (
                          <>
                            {shouldShowCupColumn(1) && (
                              <td className="text-center">
                                {typeof cupScores.cup1 === "number" ? formatScore(cupScores.cup1) : "-"}
                              </td>
                            )}
                            {shouldShowCupColumn(2) && (
                              <td className="text-center">
                                {typeof cupScores.cup2 === "number" ? formatScore(cupScores.cup2) : "-"}
                              </td>
                            )}
                            {shouldShowCupColumn(3) && (
                              <td className="text-center">
                                {typeof cupScores.cup3 === "number" ? formatScore(cupScores.cup3) : "-"}
                              </td>
                            )}
                          </>
                        ) : (
                          <td className="text-center">
                            {(() => {
                              const score = getCupScore(cupScores, league.settings.currentCup);
                              return typeof score === "number" ? formatScore(score) : "-";
                            })()}
                          </td>
                        )}
                        <td className="text-center fw-bold">
                          {typeof cupScores.total === "number" ? formatScore(cupScores.total) : "-"}
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr>
                          <td></td>
                          <td colSpan={league.settings.currentCup + 2}>
                            <div className="table-secondary p-3">
                              <h6 className="mb-3 text-body">Player Contributions</h6>
                              <table className="table table-sm">
                                <thead>
                                  <tr>
                                    <th>Player</th>
                                    {getLeagueType(league) === 'season-long' ? (
                                      <>
                                        {shouldShowCupColumn(1) && <th className="text-center">Cup 1</th>}
                                        {shouldShowCupColumn(2) && <th className="text-center">Cup 2</th>}
                                        {shouldShowCupColumn(3) && <th className="text-center">Cup 3</th>}
                                      </>
                                    ) : (
                                      <th className="text-center">Cup {league.settings.currentCup}</th>
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
                                        {getLeagueType(league) === 'season-long' ? (
                                          <>
                                            {shouldShowCupColumn(1) && (
                                              <td className="text-center">
                                                {contribution.cup1 > 0
                                                  ? formatScore(contribution.cup1)
                                                  : "-"}
                                              </td>
                                            )}
                                            {shouldShowCupColumn(2) && (
                                              <td className="text-center">
                                                {contribution.cup2 > 0
                                                  ? formatScore(contribution.cup2)
                                                  : "-"}
                                              </td>
                                            )}
                                            {shouldShowCupColumn(3) && (
                                              <td className="text-center">
                                                {contribution.cup3 > 0
                                                  ? formatScore(contribution.cup3)
                                                  : "-"}
                                              </td>
                                            )}
                                          </>
                                        ) : (
                                          <td className="text-center">
                                            {contribution.total > 0
                                              ? formatScore(contribution.total)
                                              : "-"}
                                          </td>
                                        )}
                                        <td className="text-center fw-bold">
                                          {contribution.total > 0
                                            ? formatScore(contribution.total)
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

      <div className="col-12 col-lg-4 mt-3 mt-lg-0">
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

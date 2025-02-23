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

interface PlayoffTeamScore {
  teamId: string;
  team: Team;
  score: number;
}

const StandingsTab: React.FC<StandingsTabProps> = ({
  league,
  players,
  user,
  teams,
}) => {
  const [expandedTeams, setExpandedTeams] = useState<Record<string, boolean>>({});
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [ownerNames, setOwnerNames] = useState<Record<string, string>>({});
  const isRegionals = getLeagueType(league) === 'regionals';
  const [standingsView, setStandingsView] = useState<'regular' | 'playoffs'>('regular');
  const playoffAuctionStarted = league.settings.playoffSettings?.playoffAuctionStarted === true;
  const showPlayoffStandings = !isRegionals && 
    league.settings.playoffs === true && 
    playoffAuctionStarted;

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
    if (getLeagueType(league) === 'regionals') {
      // For regionals, use placement to determine score
      const placement = player.regionals?.placement;
      if (placement && placement in PLAYOFF_SCORES) {
        const score = PLAYOFF_SCORES[placement];
        return isCaptain ? score * 1.5 : score;
      }
      return 0;
    }

    // Regular cup scoring
    const cupKey = `cup${cupNumber}` as keyof typeof player.scores;
    const score = player.scores[cupKey] || 0;
    return isCaptain ? score * 1.5 : score;
  };

  const calculateTeamCupScore = (team: Team, cupNumber: number): number => {
    if (getLeagueType(league) === 'regionals') {
      // For regionals, ignore cupNumber and only use regionals lineup and placements
      const lineup = team.regionalsLineup || {
        captains: [],
        naSlots: [],
        brLatamSlots: [],
        flexSlots: [],
        bench: [],
        locked: false
      };
      let totalScore = 0;

      // Calculate captain scores
      lineup.captains.forEach((playerId) => {
        if (playerId && players[playerId]) {
          const placement = players[playerId].regionals?.placement;
          if (placement && placement in PLAYOFF_SCORES) {
            totalScore += PLAYOFF_SCORES[placement] * 1.5; // Apply captain multiplier
          }
        }
      });

      // Calculate other slot scores
      [...lineup.naSlots, ...lineup.brLatamSlots, ...lineup.flexSlots].forEach((playerId) => {
        if (playerId && players[playerId]) {
          const placement = players[playerId].regionals?.placement;
          if (placement && placement in PLAYOFF_SCORES) {
            totalScore += PLAYOFF_SCORES[placement];
          }
        }
      });

      return totalScore;
    }

    // Regular cup scoring logic
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

    if (getLeagueType(league) === 'regionals') {
      // For regionals leagues, use regionals lineup and placements
      const lineup = team.regionalsLineup || {
        captains: [],
        naSlots: [],
        brLatamSlots: [],
        flexSlots: [],
        bench: []
      };

      // Process captains (1.5x multiplier)
      lineup.captains.forEach((playerId) => {
        if (playerId && players[playerId]) {
          const placement = players[playerId].regionals?.placement;
          if (placement && placement in PLAYOFF_SCORES) {
            const score = PLAYOFF_SCORES[placement] * 1.5;  // Apply captain multiplier
            const existing = allContributions.get(playerId) || {
              cup1: 0,
              cup2: 0,
              cup3: 0,
              total: 0,
              isOnTeam: team.roster.includes(playerId),
            };
            existing.total = score;
            allContributions.set(playerId, existing);
          }
        }
      });

      // Process other slots (no multiplier)
      [...lineup.naSlots, ...lineup.brLatamSlots, ...lineup.flexSlots].forEach((playerId) => {
        if (playerId && players[playerId]) {
          const placement = players[playerId].regionals?.placement;
          if (placement && placement in PLAYOFF_SCORES) {
            const score = PLAYOFF_SCORES[placement];
            const existing = allContributions.get(playerId) || {
              cup1: 0,
              cup2: 0,
              cup3: 0,
              total: 0,
              isOnTeam: team.roster.includes(playerId),
            };
            existing.total = score;
            allContributions.set(playerId, existing);
          }
        }
      });
    } else {
      // Regular league scoring logic
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
        [...lineup.naSlots, ...lineup.brLatamSlots, ...lineup.flexSlots].forEach((playerId) => {
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
        });
      });
    }

    return Array.from(allContributions.entries())
      .map(([playerId, data]) => ({
        playerId,
        ...data,
      }))
      .sort((a, b) => b.total - a.total);
  };

  const calculatePlayoffScore = (team: Team): number => {
    // Get the playoff lineup
    const lineup = team.playoffLineup || {
      captains: [],
      naSlots: [],
      brLatamSlots: [],
      flexSlots: [],
      bench: []
    };

    let totalScore = 0;

    // Calculate scores for all active slots
    const allSlots = [
      ...lineup.captains.map(id => ({ id, isCaptain: true })),
      ...lineup.naSlots.map(id => ({ id, isCaptain: false })),
      ...lineup.brLatamSlots.map(id => ({ id, isCaptain: false })),
      ...lineup.flexSlots.map(id => ({ id, isCaptain: false }))
    ];

    allSlots.forEach(({ id, isCaptain }) => {
      if (id && players[id]) {
        const player = players[id];
        // Check if player has a valid placement that maps to a score
        if (player.regionals?.placement && PLAYOFF_SCORES[player.regionals.placement]) {
          const baseScore = PLAYOFF_SCORES[player.regionals.placement];
          totalScore += isCaptain ? baseScore * 1.5 : baseScore;
        }
      }
    });

    return totalScore;
  };

  // Create sorted teams array with scores
  const sortedTeams = Object.entries(teams)
    .map(([teamId, team]) => {
      let cupScores;
      
      if (getLeagueType(league) === 'regionals') {
        // For regionals, only calculate the score once and use it as total
        const regionalsScore = calculateTeamCupScore(team, 0);
        cupScores = {
          cup1: 0,
          cup2: 0,
          cup3: 0,
          total: regionalsScore
        };
      } else {
        // Regular league scoring - sum up all cups
        const cup1Score = calculateTeamCupScore(team, 1);
        const cup2Score = calculateTeamCupScore(team, 2);
        const cup3Score = calculateTeamCupScore(team, 3);
        cupScores = {
          cup1: cup1Score,
          cup2: cup2Score,
          cup3: cup3Score,
          total: cup1Score + cup2Score + cup3Score
        };
      }

      return { teamId, team, cupScores };
    })
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
    const lastDigit = rank % 10;
    const lastTwoDigits = rank % 100;

    // Special case for 11th, 12th, 13th
    if (lastTwoDigits >= 11 && lastTwoDigits <= 13) {
      return `${rank}th`;
    }

    // For other numbers, check the last digit
    switch (lastDigit) {
      case 1:
        return `${rank}st`;
      case 2:
        return `${rank}nd`;
      case 3:
        return `${rank}rd`;
      default:
        return `${rank}th`;
    }
  };

  const formatScore = (score: number): string => {
    return score % 1 === 0 ? score.toFixed(0) : score.toFixed(1);
  };

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

  const calculateRegularSeasonScore = (team: Team): number => {
    const cup1Score = calculateTeamCupScore(team, 1);
    const cup2Score = calculateTeamCupScore(team, 2);
    const cup3Score = calculateTeamCupScore(team, 3);
    return cup1Score + cup2Score + cup3Score;
  };

  // Update getPlayoffContributions to properly calculate scores
  const getPlayoffContributions = (team: Team) => {
    const contributions = new Map<string, {
      total: number;
      isOnTeam: boolean;
    }>();

    // First add all playoff roster players with 0 score
    team.playoffRoster?.forEach(playerId => {
      if (players[playerId]) {
        const player = players[playerId];
        const placement = player.regionals?.placement;
        const score = placement && PLAYOFF_SCORES[placement] ? PLAYOFF_SCORES[placement] : 0;
        
        contributions.set(playerId, {
          total: score,
          isOnTeam: true
        });
      }
    });

    // Then update scores based on lineup positions (for captain bonus)
    const lineup = team.playoffLineup || {
      captains: [],
      naSlots: [],
      brLatamSlots: [],
      flexSlots: [],
      bench: []
    };

    const allSlots = [
      ...lineup.captains.map(id => ({ id, isCaptain: true })),
      ...lineup.naSlots.map(id => ({ id, isCaptain: false })),
      ...lineup.brLatamSlots.map(id => ({ id, isCaptain: false })),
      ...lineup.flexSlots.map(id => ({ id, isCaptain: false }))
    ];

    allSlots.forEach(({ id, isCaptain }) => {
      if (id && players[id]) {
        const player = players[id];
        if (player.regionals?.placement && PLAYOFF_SCORES[player.regionals.placement]) {
          const baseScore = PLAYOFF_SCORES[player.regionals.placement];
          contributions.set(id, {
            total: isCaptain ? baseScore * 1.5 : baseScore,
            isOnTeam: team.playoffRoster?.includes(id) || false
          });
        }
      }
    });

    return Array.from(contributions.entries())
      .map(([playerId, data]) => ({
        playerId,
        ...data,
        cup1: 0,
        cup2: 0,
        cup3: 0
      }))
      .sort((a, b) => b.total - a.total);
  };

  return (
    <div className="row">
      <div className="col-12 col-lg-8">
        {!isLeagueAtCapacity() && league.commissioner === user.uid && (
          <div className="alert alert-info mb-4 d-flex justify-content-between align-items-center">
            <div>
              <strong>Your league isn't full!</strong> Invite more players to join.
            </div>
            <button
              className="btn btn-primary btn-sm"
              onClick={() => setShowInviteDialog(true)}
            >
              Create Invite
            </button>
          </div>
        )}

        {showPlayoffStandings && (
          <ul className="nav nav-tabs mb-4">
            <li className="nav-item">
              <button
                className={`nav-link ${standingsView === 'regular' ? 'active' : ''}`}
                onClick={() => setStandingsView('regular')}
              >
                Regular Season
              </button>
            </li>
            <li className="nav-item">
              <button
                className={`nav-link ${standingsView === 'playoffs' ? 'active' : ''}`}
                onClick={() => setStandingsView('playoffs')}
              >
                Playoff Standings
              </button>
            </li>
          </ul>
        )}

        <div className="card">
          <div className="card-header">
            <h4 className="h5 mb-0">
              {showPlayoffStandings ? 
                (standingsView === 'playoffs' ? 'Playoff Standings' : 'Regular Season Standings') : 
                'Standings'
              }
            </h4>
          </div>
          <div className="table-responsive">
            <table className="table table-hover">
              <thead>
                <tr>
                  <th className="text-center" style={{ width: '60px' }}>Rank</th>
                  <th>Team</th>
                  {showPlayoffStandings && standingsView === 'playoffs' ? (
                    <th className="text-center">Playoff Score</th>
                  ) : getLeagueType(league) === 'regionals' ? (
                    <th className="text-center">Total Score</th>
                  ) : (
                    <>
                      {shouldShowCupColumn(1) && <th className="text-center">Cup 1</th>}
                      {shouldShowCupColumn(2) && <th className="text-center">Cup 2</th>}
                      {shouldShowCupColumn(3) && <th className="text-center">Cup 3</th>}
                      <th className="text-center">Total Score</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {(showPlayoffStandings && standingsView === 'playoffs' ? 
                  Object.entries(teams)
                    .map(([teamId, team]) => ({
                      teamId,
                      team,
                      regularSeasonScore: calculateRegularSeasonScore(team)
                    }))
                    .sort((a, b) => b.regularSeasonScore - a.regularSeasonScore)
                    .slice(0, league.settings.playoffTeams)
                    .filter(({ team }) => team.playoffRoster && team.playoffRoster.length > 0)
                    .map(({ teamId, team, regularSeasonScore }): PlayoffTeamScore & { regularSeasonScore: number } => ({
                      teamId,
                      team,
                      score: calculatePlayoffScore(team),
                      regularSeasonScore
                    }))
                    .sort((a, b) => b.score === a.score 
                      ? b.regularSeasonScore - a.regularSeasonScore 
                      : b.score - a.score)
                  : sortedTeams
                ).map((teamScore) => {
                  const { teamId, team } = teamScore;
                  const score = 'score' in teamScore ? teamScore.score : teamScore.cupScores.total;
                  const cupScores = 'cupScores' in teamScore ? teamScore.cupScores : null;
                  
                  // Calculate rank based on the current view
                  const rank = showPlayoffStandings && standingsView === 'playoffs' 
                    ? (Object.entries(teams)
                        // First filter for teams that qualified and have playoff rosters
                        .filter(([_, t]) => t.playoffRoster && t.playoffRoster.length > 0)
                        .map(([id, t]) => ({
                          id,
                          score: calculatePlayoffScore(t),
                          regularSeasonScore: calculateRegularSeasonScore(t)  // Add regular season score
                        }))
                        // Sort by playoff score first, then regular season score
                        .sort((a, b) => b.score === a.score 
                          ? b.regularSeasonScore - a.regularSeasonScore 
                          : b.score - a.score)
                        .findIndex(t => t.id === teamId) + 1)
                    : sortedTeams.findIndex(t => t.teamId === teamId) + 1;

                  const isExpanded = expandedTeams[teamId];
                  const contributions = getAllPlayerContributions(team);
                  
                  // Only show playoff separator in regular season view
                  const isLastPlayoffTeam = !isRegionals && 
                    league.settings.playoffs && 
                    rank === league.settings.playoffTeams &&
                    (!showPlayoffStandings || standingsView === 'regular');

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
                              {/* Only show FAAB in regular season view */}
                              {(!showPlayoffStandings || standingsView === 'regular') && (
                                <div className={`small ${
                                  team.ownerID === user.uid 
                                    ? "text-dark" 
                                    : "text-body-secondary"
                                }`}>
                                  ${team.faabBudget}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        {showPlayoffStandings && standingsView === 'playoffs' ? (
                          <td className="text-center fw-bold">
                            {typeof score === "number" ? formatScore(score) : "-"}
                          </td>
                        ) : getLeagueType(league) === 'regionals' ? (
                          <td className="text-center fw-bold">
                            {typeof score === "number" ? formatScore(score) : "-"}
                          </td>
                        ) : (
                          <>
                            {shouldShowCupColumn(1) && cupScores && (
                              <td className="text-center">
                                {typeof cupScores.cup1 === "number" ? formatScore(cupScores.cup1) : "-"}
                              </td>
                            )}
                            {shouldShowCupColumn(2) && cupScores && (
                              <td className="text-center">
                                {typeof cupScores.cup2 === "number" ? formatScore(cupScores.cup2) : "-"}
                              </td>
                            )}
                            {shouldShowCupColumn(3) && cupScores && (
                              <td className="text-center">
                                {typeof cupScores.cup3 === "number" ? formatScore(cupScores.cup3) : "-"}
                              </td>
                            )}
                            <td className="text-center fw-bold">
                              {typeof score === "number" ? formatScore(score) : "-"}
                            </td>
                          </>
                        )}
                      </tr>

                      {isExpanded && (
                        <tr>
                          <td></td>
                          <td colSpan={getLeagueType(league) === 'regionals' ? 2 : league.settings.currentCup + 2}>
                            <div className="table-secondary p-3">
                              <h6 className="mb-3 text-body">Player Contributions</h6>
                              <table className="table table-sm">
                                <thead>
                                  <tr>
                                    <th>Player</th>
                                    {showPlayoffStandings && standingsView === 'playoffs' ? (
                                      <th className="text-center">Playoff Score</th>
                                    ) : getLeagueType(league) === 'regionals' ? (
                                      <th className="text-center">Total</th>
                                    ) : (
                                      <>
                                        {shouldShowCupColumn(1) && <th className="text-center">Cup 1</th>}
                                        {shouldShowCupColumn(2) && <th className="text-center">Cup 2</th>}
                                        {shouldShowCupColumn(3) && <th className="text-center">Cup 3</th>}
                                        <th className="text-center">Total</th>
                                      </>
                                    )}
                                  </tr>
                                </thead>
                                <tbody>
                                  {(showPlayoffStandings && standingsView === 'playoffs' 
                                    ? getPlayoffContributions(team)
                                    : contributions
                                  ).map((contribution) => {
                                    const player = players[contribution.playerId];
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
                                              {!contribution.isOnTeam && contribution.total > 0 && (
                                                <span className="badge bg-danger">Off Roster</span>
                                              )}
                                            </div>
                                          </div>
                                        </td>
                                        {showPlayoffStandings && standingsView === 'playoffs' ? (
                                          <td className="text-center fw-bold">
                                            {contribution.total > 0 ? formatScore(contribution.total) : "-"}
                                          </td>
                                        ) : getLeagueType(league) === 'regionals' ? (
                                          <td className="text-center fw-bold">
                                            {contribution.total > 0 ? formatScore(contribution.total) : "-"}
                                          </td>
                                        ) : (
                                          <>
                                            {shouldShowCupColumn(1) && (
                                              <td className="text-center">
                                                {contribution.cup1 > 0 ? formatScore(contribution.cup1) : "-"}
                                              </td>
                                            )}
                                            {shouldShowCupColumn(2) && (
                                              <td className="text-center">
                                                {contribution.cup2 > 0 ? formatScore(contribution.cup2) : "-"}
                                              </td>
                                            )}
                                            {shouldShowCupColumn(3) && (
                                              <td className="text-center">
                                                {contribution.cup3 > 0 ? formatScore(contribution.cup3) : "-"}
                                              </td>
                                            )}
                                            <td className="text-center fw-bold">
                                              {contribution.total > 0 ? formatScore(contribution.total) : "-"}
                                            </td>
                                          </>
                                        )}
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

        {/* Show scoring table below standings for regionals */}
        {isRegionals && (
          <div className="card mt-4">
            <div className="card-header">
              <h5 className="mb-0">Regionals Scoring System</h5>
            </div>
            <div className="card-body">
              <div className="row">
                {[0, 1, 2, 3].map(columnIndex => (
                  <div key={columnIndex} className="col-md-3">
                    <div className="table-responsive">
                      <table className="table table-sm">
                        <thead>
                          <tr>
                            <th>Place</th>
                            <th className="text-end">Pts</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Array.from({ length: 8 }, (_, i) => i + 1 + (columnIndex * 8)).map(placement => (
                            <tr key={placement}>
                              <td>{formatRank(placement)}</td>
                              <td className="text-end">{PLAYOFF_SCORES[placement]}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
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

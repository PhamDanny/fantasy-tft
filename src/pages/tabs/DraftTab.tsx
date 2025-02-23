import React, { useState, useEffect } from 'react';
import type { League, Player, Team, DraftPick } from '../../types';
import { doc, updateDoc, writeBatch, onSnapshot, getDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../firebase/auth';
import InviteDialog from '../../components/dialogs/InviteDialog';
import { getLeagueType, getAvailablePlayers } from '../../types';
import TeamDisplay from '../../components/TeamDisplay';

interface DraftTabProps {
  league: League;
  players: Record<string, Player>;
  teams: Record<string, Team>;
}

const DraftTab: React.FC<DraftTabProps> = ({ league, players, teams }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draftOrder, setDraftOrder] = useState<string[]>(() => {
    if (league.settings.draftOrder?.length > 0) {
      const allTeamIds = Object.keys(teams);
      const missingTeams = allTeamIds.filter(id => !league.settings.draftOrder.includes(id));
      return [...league.settings.draftOrder, ...missingTeams];
    }
    return Object.keys(teams);
  });
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [user, setUser] = useState<any>(null);
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [localTeams, setLocalTeams] = useState(teams);

  useEffect(() => {
    const unsubscribe = useAuth((authUser) => {
      setUser(authUser);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(db, 'leagues', league.id.toString()),
      (snapshot) => {
        if (snapshot.exists()) {
          const leagueData = snapshot.data();
          setLocalTeams(teams);
          
          if (leagueData.settings?.draftOrder?.length > 0) {
            const allTeamIds = Object.keys(teams);
            const currentDraftOrder = leagueData.settings.draftOrder;
            const missingTeams = allTeamIds.filter(id => !currentDraftOrder.includes(id));
            
            if (missingTeams.length > 0 && !leagueData.settings.draftStarted) {
              const updatedDraftOrder = [...currentDraftOrder, ...missingTeams];
              setDraftOrder(updatedDraftOrder);
              
              // Update Firestore
              void updateDoc(doc(db, 'leagues', league.id.toString()), {
                'settings.draftOrder': updatedDraftOrder
              });
            } else {
              setDraftOrder(currentDraftOrder);
            }
          } else {
            setDraftOrder(Object.keys(teams));
          }
        }
      },
      (error) => {
        console.error("Error listening to league updates:", error);
        setError("Failed to get real-time updates");
      }
    );

    return () => unsubscribe();
  }, [league.id, teams]);

  // Filter players to only show current set players and regionals players if applicable
  const currentSetPlayers = Object.values(players)
    .filter(player => {
      // Extract set number from "Set 13" -> 13
      const setNumber = parseInt(league.season.replace('Set ', ''));
      return player.set === setNumber;
    })
    .reduce((acc, player) => {
      acc[player.id] = player;
      return acc;
    }, {} as Record<string, Player>);

  // Further filter for regionals if needed
  const availablePlayers = getAvailablePlayers(currentSetPlayers, getLeagueType(league));

  const isCommissioner = user?.uid === league.commissioner;

  // Calculate total rounds based on roster slots
  const totalRounds = 
    league.settings.captainSlots +
    league.settings.naSlots +
    league.settings.brLatamSlots +
    league.settings.flexSlots +
    league.settings.benchSlots;

  // If draft is complete, show results
  if (league.phase !== 'drafting') {
    return (
      <div className="card">
        <div className="card-header">
          <h4 className="h5 mb-0">Draft Results</h4>
        </div>
        <div className="card-body">
          <div className="table-responsive">
            <table className="table table-bordered table-sm">
              <thead>
                <tr>
                  <th style={{ width: '60px' }}>Rd</th>
                  {draftOrder.map((teamId) => (
                    <th key={teamId}>
                      <TeamDisplay team={localTeams[teamId]} />
                    </th>
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
                      const pick = league.picks?.find((p: DraftPick) => 
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
                                ['LATAM', 'LAS', 'LAN'].includes(player.region) ? 'bg-warning bg-opacity-10' :
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
      </div>
    );
  }

  // Pre-draft lobby
  const handleStartDraft = async () => {
    const currentTeamCount = Object.keys(localTeams).length;
    
    if (currentTeamCount < league.settings.teamsLimit) {
      if (!window.confirm(
        `League is not full (${currentTeamCount}/${league.settings.teamsLimit} teams). ` +
        `Starting the draft will reduce the league size to ${currentTeamCount} teams. Continue?`
      )) {
        return;
      }
    }

    if (!window.confirm('Are you sure you want to start the draft? This cannot be undone.')) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const allTeamIds = Object.keys(localTeams);
      const updatedDraftOrder = [...draftOrder];
      
      allTeamIds.forEach(teamId => {
        if (!updatedDraftOrder.includes(teamId)) {
          updatedDraftOrder.push(teamId);
        }
      });

      const finalDraftOrder = updatedDraftOrder.filter(teamId => allTeamIds.includes(teamId));

      await updateDoc(doc(db, 'leagues', league.id.toString()), {
        'settings.draftOrder': finalDraftOrder,
        'settings.draftStarted': true,
        'settings.teamsLimit': currentTeamCount,
        currentPick: 0,
        currentRound: 1,
      });

      setDraftOrder(finalDraftOrder);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start draft');
    } finally {
      setLoading(false);
    }
  };

  const handleRandomizeOrder = async () => {
    setLoading(true);
    try {
      const shuffled = [...Object.keys(localTeams)]
        .sort(() => Math.random() - 0.5);
      
      // Update local state
      setDraftOrder(shuffled);

      // Persist to Firestore
      await updateDoc(doc(db, 'leagues', league.id.toString()), {
        'settings.draftOrder': shuffled
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to randomize draft order');
      // Revert local state on error
      setDraftOrder(league.settings.draftOrder || []);
    } finally {
      setLoading(false);
    }
  };

  const handleMoveTeam = async (teamId: string, direction: 'up' | 'down') => {
    const currentIndex = draftOrder.indexOf(teamId);
    if (currentIndex === -1) return;

    setLoading(true);
    try {
      const newOrder = [...draftOrder];
      const newIndex = direction === 'up' 
        ? Math.max(0, currentIndex - 1)
        : Math.min(draftOrder.length - 1, currentIndex + 1);

      [newOrder[currentIndex], newOrder[newIndex]] = 
      [newOrder[newIndex], newOrder[currentIndex]];

      // Update local state
      setDraftOrder(newOrder);

      // Persist to Firestore
      await updateDoc(doc(db, 'leagues', league.id.toString()), {
        'settings.draftOrder': newOrder
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update draft order');
      // Revert local state on error
      setDraftOrder(league.settings.draftOrder || []);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveTeam = async (teamId: string, teamName: string) => {
    if (!window.confirm(`Are you sure you want to remove ${teamName} from the league?`)) return;

    setLoading(true);
    setError(null);

    try {
      const teamRef = doc(db, 'leagues', league.id.toString(), 'teams', teamId);
      const teamDoc = await getDoc(teamRef);
      
      if (!teamDoc.exists()) {
        throw new Error('Team not found');
      }

      const team = teamDoc.data() as Team;
      const userIds = [team.ownerID, ...(team.coOwners || [])];

      // Create batch for atomic updates
      const batch = writeBatch(db);
      const leagueRef = doc(db, 'leagues', league.id.toString());

      // First update the league document with new draft order and transaction
      const updatedDraftOrder = draftOrder.filter(id => id !== teamId);
      const transaction = {
        id: crypto.randomUUID(),
        type: 'commissioner' as const,
        timestamp: new Date().toISOString(),
        teamIds: [teamId],
        adds: {},
        drops: { [teamId]: team.roster || [] },
        metadata: {
          type: 'commissioner',
          action: 'member_removed',
          commissioner: league.commissioner,
          reason: 'Kicked by commissioner',
          teamName: team.teamName,
          playerNames: team.roster?.reduce((acc, playerId) => ({
            ...acc,
            [playerId]: { 
              name: players?.[playerId]?.name || 'Unknown Player',
              region: players?.[playerId]?.region || 'Unknown Region'
            }
          }), {})
        }
      };

      batch.update(leagueRef, {
        transactions: [...(league.transactions || []), transaction],
        'settings.draftOrder': updatedDraftOrder
      });

      // Update all affected users (owner and co-owners)
      await Promise.all(userIds.map(async (userId) => {
        if (!userId) return;
        const userRef = doc(db, 'users', userId);
        const userDoc = await getDoc(userRef);
        if (userDoc.exists()) {
          const userData = userDoc.data();
          batch.update(userRef, {
            leagues: userData.leagues.filter((id: string) => id !== league.id.toString())
          });
        }
      }));

      // Delete the team document
      batch.delete(teamRef);

      // Commit all changes atomically
      await batch.commit();

      // Update local state after successful commit
      const newTeams = { ...localTeams };
      delete newTeams[teamId];
      setLocalTeams(newTeams);
      setDraftOrder(updatedDraftOrder);

    } catch (err) {
      setError('Failed to remove team: ' + (err instanceof Error ? err.message : 'Unknown error'));
      console.error('Error removing team:', err);
    } finally {
      setLoading(false);
    }
  };

  // Add helper function to get qualifier points (sum of all cup scores)
  const getQualifierPoints = (player: Player): number => {
    if (!player.scores) return 0;
    return player.scores.cup1 + player.scores.cup2 + player.scores.cup3;
  };

  if (!league.settings.draftStarted) {
    return (
      <div className="row">
        <div className="col-md-8">
          <div className="card mb-4">
            <div className="card-header">
              <h4 className="h5 mb-0">Pre-Draft Lobby</h4>
            </div>
            <div className="card-body">
              <div className="alert alert-info">
                {isCommissioner 
                  ? "Set the draft order and start when ready."
                  : "Waiting for the commissioner to start the draft..."}
              </div>

              <div className="d-flex justify-content-between align-items-center mb-4">
                <h5>Teams ({Object.keys(localTeams).length}/{league.settings.teamsLimit})</h5>
                {isCommissioner && Object.keys(localTeams).length >= 2 && (
                  <div className="btn-group">
                    <button 
                      className="btn btn-outline-primary"
                      onClick={handleRandomizeOrder}
                      disabled={loading}
                    >
                      Randomize Order
                    </button>
                    <button
                      className="btn btn-primary"
                      onClick={handleStartDraft}
                      disabled={loading || draftOrder.length < 2}
                    >
                      Start Draft
                    </button>
                  </div>
                )}
              </div>

              {/* Add draft order display */}
              <div className="mb-4">
                <h6 className="mb-3">Draft Order</h6>
                <div className="list-group">
                  {draftOrder.map((teamId, index) => (
                    <div key={teamId} className="list-group-item d-flex justify-content-between align-items-center">
                      <div>
                        <span className="badge bg-secondary me-2">#{index + 1}</span>
                        <TeamDisplay team={localTeams[teamId]} />
                        {localTeams[teamId]?.ownerID === user?.uid && (
                          <span className="badge bg-primary ms-2">Your Team</span>
                        )}
                      </div>
                      {isCommissioner && (
                        <div>
                          <button
                            className="btn btn-sm btn-outline-secondary me-1"
                            onClick={() => handleMoveTeam(teamId, 'up')}
                            disabled={index === 0}
                          >
                            ↑
                          </button>
                          <button
                            className="btn btn-sm btn-outline-secondary"
                            onClick={() => handleMoveTeam(teamId, 'down')}
                            disabled={index === draftOrder.length - 1}
                          >
                            ↓
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {error && <div className="alert alert-danger">{error}</div>}
            </div>
          </div>

          {/* Draft Settings Preview */}
          <div className="card">
            <div className="card-header">
              <h4 className="h5 mb-0">Draft Settings</h4>
            </div>
            <div className="card-body">
              <div className="row">
                <div className="col-md-6">
                  <h6>Roster Slots</h6>
                  <p>Captain Slots: {league.settings.captainSlots}</p>
                  <p>NA Slots: {league.settings.naSlots}</p>
                  <p>BR/LATAM Slots: {league.settings.brLatamSlots}</p>
                  <p>Flex Slots: {league.settings.flexSlots}</p>
                  <p>Bench Slots: {league.settings.benchSlots}</p>
                </div>
                <div className="col-md-6">
                  <h6>League Settings</h6>
                  <p>League Type: {getLeagueType(league) === 'season-long' ? 'Full Season' : 'Single Tournament'}</p>
                  <p>Teams: {Object.keys(localTeams).length}/{league.settings.teamsLimit}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Add Invites Section */}
        <div className="col-md-4">
          <div className="card">
            <div className="card-header">
              <h4 className="h5 mb-0">Team Management</h4>
            </div>
            <div className="card-body">
              {/* Team Progress */}
              <div className="mb-4">
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <h6 className="mb-0">Teams</h6>
                  <span className="text-muted">
                    {Object.keys(localTeams).length}/{league.settings.teamsLimit}
                  </span>
                </div>
                <div className="progress">
                  <div 
                    className="progress-bar" 
                    role="progressbar"
                    style={{ 
                      width: `${(Object.keys(localTeams).length / league.settings.teamsLimit) * 100}%` 
                    }}
                    aria-valuenow={Object.keys(localTeams).length}
                    aria-valuemin={0}
                    aria-valuemax={league.settings.teamsLimit}
                  />
                </div>
              </div>

              {/* Invite Section */}
              <div>
                <h6 className="mb-3">Invite Players</h6>
                {Object.keys(localTeams).length < league.settings.teamsLimit ? (
                  <>
                    <button
                      className="btn btn-primary w-100"
                      onClick={() => setShowInviteDialog(true)}
                    >
                      Generate Invite Link
                    </button>
                    <small className="text-muted d-block mb-3">
                      Generate a link to invite players to join your league
                    </small>
                  </>
                ) : (
                  <div className="alert alert-info mb-0">
                    League is full! No more teams can join.
                  </div>
                )}
              </div>

              {/* Team List */}
              <div className="mt-4">
                <h6 className="mb-3">Current Teams</h6>
                <div className="list-group list-group-flush">
                  {Object.entries(localTeams).map(([teamId, team]) => (
                    <div 
                      key={teamId}
                      className="list-group-item d-flex justify-content-between align-items-center p-2"
                    >
                      <div>
                        <div>{<TeamDisplay team={team} />}</div>
                        <small className="text-muted">
                          {team.ownerID === user?.uid ? 'You' : 'Owner'}
                          {team.coOwners?.length ? 
                            ` + ${team.coOwners.length} co-owner${team.coOwners.length > 1 ? 's' : ''}` 
                            : ''}
                        </small>
                      </div>
                      {isCommissioner && team.ownerID !== user?.uid && (
                        <button
                          className="btn btn-outline-danger btn-sm"
                          onClick={() => handleRemoveTeam(teamId, team.teamName)}
                          disabled={loading}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Invite Dialog */}
        {showInviteDialog && (
          <InviteDialog
            league={league}
            show={showInviteDialog}
            onClose={() => setShowInviteDialog(false)}
          />
        )}
      </div>
    );
  }

  // Active draft
  const isUsersTurn = user && league.settings.draftOrder[league.currentPick ?? 0] === 
    Object.values(localTeams).find(team => team.ownerID === user.uid)?.teamId;

  const handleMakePick = async (playerId: string) => {
    if (!user || !isUsersTurn) return;

    try {
      // Get current team and pick info
      const currentTeamId = league.settings.draftOrder[league.currentPick ?? 0];
      const currentTeam = localTeams[currentTeamId];
      const currentRound = league.currentRound ?? 1;
      const currentPick = league.currentPick ?? 0;

      // Calculate next pick for snake draft
      const totalTeams = league.settings.draftOrder.length;
      const isEvenRound = currentRound % 2 === 0;
      let nextPick = currentPick;
      let nextRound = currentRound;

      if (isEvenRound) {
        nextPick--;  // Move backwards
        if (nextPick < 0) {
          nextRound++;
          nextPick = 0;  // Start at beginning for odd rounds
        }
      } else {
        nextPick++;  // Move forwards
        if (nextPick >= totalTeams) {
          nextRound++;
          nextPick = totalTeams - 1;  // Start at end for even rounds
        }
      }

      const batch = writeBatch(db);
      const leagueRef = doc(db, 'leagues', league.id.toString());
      const teamRef = doc(db, 'leagues', league.id.toString(), 'teams', currentTeam.teamId);

      // Get current team's roster
      const teamDoc = await getDoc(teamRef);
      const currentRoster = teamDoc.exists() ? teamDoc.data().roster || [] : [];

      // Add new pick to roster (append, don't overwrite)
      const updatedRoster = [...currentRoster, playerId];

      // Update team document
      batch.update(teamRef, {
        roster: updatedRoster  // Use the combined roster array
      });

      // Add pick to league's picks array
      const picks = league.picks || [];
      picks.push({
        teamId: currentTeam.teamId,
        playerId,
        round: currentRound,
        pick: currentPick,
        timestamp: new Date().toISOString()
      });

      // If this was the last pick, transition to in_season
      if (nextRound > totalRounds) {
        const cupDoc = await getDoc(doc(db, 'globalSettings', 'currentCup'));
        const globalCup = cupDoc.exists() ? cupDoc.data()?.currentCup : 1;

        batch.update(leagueRef, {
          picks,
          phase: 'in_season',
          'settings.currentCup': globalCup,  // Use global cup value instead of hardcoding to 1
          currentPick: nextPick,
          currentRound: nextRound,
        });
      } else {
        batch.update(leagueRef, {
          picks,
          currentPick: nextPick,
          currentRound: nextRound,
        });
      }

      await batch.commit();
      setSelectedPlayer(null);
      setSearchTerm('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to make pick');
    }
  };

  return (
    <div>
      {/* Available Players Section - Full Width */}
      {league.settings.draftStarted && (
        <div className="card mb-4">
          <div className="card-header">
            <div className="d-flex justify-content-between align-items-center">
              <div>
                <h5 className="mb-0">Available Players</h5>
                <small className={`d-block mt-1 ${isUsersTurn ? 'text-success fw-bold' : 'text-muted'}`}>
                  {isUsersTurn 
                    ? "Your Turn to Pick! Select a player then click the Draft button." 
                    : league.currentPick !== undefined && league.currentRound !== undefined
                      ? `Currently Picking: ${teams[draftOrder[league.currentPick]]?.teamName || 'Loading...'}`
                      : 'Draft not started'
                  }
                </small>
              </div>
              <div className="input-group" style={{ maxWidth: '200px' }}>
                <input
                  type="text"
                  className="form-control form-control-sm"
                  placeholder="Search players..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
          </div>
          <div className="card-body p-0" style={{ maxHeight: '300px', overflowY: 'auto' }}>
            <div className="list-group list-group-flush">
              {Object.values(availablePlayers)
                .filter(player => 
                  !league.picks?.some((pick: DraftPick) => pick.playerId === player.id) &&
                  (searchTerm === '' || 
                   (String(player.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                    String(player.region || '').toLowerCase().includes(searchTerm.toLowerCase())))
                )
                .sort((a, b) => {
                  if (getLeagueType(league) === 'regionals') {
                    // Sort by qualifier points descending for regionals leagues
                    return getQualifierPoints(b) - getQualifierPoints(a);
                  }
                  // Default alphabetical sort for other leagues
                  const nameA = String(a.name || '');
                  const nameB = String(b.name || '');
                  return nameA.localeCompare(nameB);
                })
                .map(player => (
                  <div
                    key={player.id}
                    className={`list-group-item ${
                      selectedPlayer === player.id ? 'active text-body' : ''
                    } ${
                      player.region === 'NA' ? 'bg-primary bg-opacity-10' :
                      player.region === 'BR' ? 'bg-success bg-opacity-10' :
                      ['LATAM', 'LAS', 'LAN'].includes(player.region) ? 'bg-warning bg-opacity-10' :
                      ''
                    } ${isUsersTurn ? 'cursor-pointer' : ''}`}
                    onClick={() => isUsersTurn ? setSelectedPlayer(player.id) : null}
                    role="button"
                    style={{ cursor: isUsersTurn ? 'pointer' : 'default' }}
                  >
                    <div className="d-flex justify-content-between align-items-center">
                      <div>
                        <span>{player.name}</span>
                        <small className="text-muted">
                          {" "}({player.region})
                          {getLeagueType(league) === 'regionals' && 
                            ` - ${getQualifierPoints(player)} QP`
                          }
                        </small>
                      </div>
                      {selectedPlayer === player.id && isUsersTurn && (
                        <button
                          className="btn btn-success btn-sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMakePick(player.id);
                          }}
                        >
                          Draft
                        </button>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* Draft Board - Full Width */}
      <div className="card">
        <div className="card-header">
          <h4 className="h5 mb-0">Draft Board</h4>
        </div>
        <div className="card-body">
      <div className="table-responsive">
        <table className="table table-bordered table-sm">
          <thead>
            <tr>
              <th style={{ width: '60px' }}>Rd</th>
              {draftOrder.map((teamId) => (
                    <th key={teamId}>
                      <TeamDisplay team={localTeams[teamId]} />
                    </th>
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
                      const pick = league.picks?.find((p: DraftPick) => 
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
                            ['LATAM', 'LAS', 'LAN'].includes(player.region) ? 'bg-warning bg-opacity-10' :
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
      </div>
    </div>
  );
};

export default DraftTab;

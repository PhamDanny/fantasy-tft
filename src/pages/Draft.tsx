import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, collection, getDocs, updateDoc, arrayUnion, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../firebase/auth';
import type { Draft, Player, DraftPick } from '../types';
import ConvertDraftToLeagueDialog from '../components/dialogs/ConvertDraftToLeagueDialog';
import JoinDraftDialog from '../components/dialogs/JoinDraftDialog';
import InviteDraftDialog from '../components/dialogs/InviteDraftDialog';

const Draft = () => {
  const { draftId } = useParams();
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [players, setPlayers] = useState<Record<string, Player>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
  const [draftOrder, setDraftOrder] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  // Load draft data
  useEffect(() => {
    const unsubscribe = useAuth((authUser) => {
      setUser(authUser);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const loadDraft = () => {
      if (!draftId) return;
      
      // Create real-time listener for draft updates
      const unsubscribe = onSnapshot(
        doc(db, 'drafts', draftId),
        (docSnapshot) => {
          if (docSnapshot.exists()) {
            setDraft({ id: docSnapshot.id, ...docSnapshot.data() } as Draft);
          } else {
            setError('Draft not found');
          }
          setLoading(false);
        },
        (err) => {
          setError(err instanceof Error ? err.message : 'Failed to load draft');
          setLoading(false);
        }
      );

      return unsubscribe;
    };

    const loadPlayers = async () => {
      try {
        const playersRef = collection(db, 'players');
        const querySnapshot = await getDocs(playersRef);
        const playersData: Record<string, Player> = {};
        querySnapshot.forEach((doc) => {
          playersData[doc.id] = { id: doc.id, ...doc.data() } as Player;
        });
        setPlayers(playersData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load players');
      }
    };

    loadPlayers();
    return loadDraft();
  }, [draftId]);

  const handleMakePick = async (playerId: string) => {
    if (!draft || !user || !draftId) return;

    try {
      const currentTeamId = draft.settings.draftOrder[draft.currentPick];
      const pick: DraftPick = {
        teamId: currentTeamId,
        playerId,
        round: draft.currentRound,
        pick: draft.currentPick,
        timestamp: new Date().toISOString(),
      };

      // Calculate next pick for snake draft
      const totalTeams = draft.settings.draftOrder.length;
      const isEvenRound = draft.currentRound % 2 === 0;
      let nextPick = draft.currentPick;
      let nextRound = draft.currentRound;

      // In odd rounds (1,3,5...) we go left to right
      // In even rounds (2,4,6...) we go right to left
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

      // Calculate total roster slots for draft length
      const totalRosterSlots = 
        draft.settings.captainSlots +
        draft.settings.naSlots +
        draft.settings.brLatamSlots +
        draft.settings.flexSlots +
        draft.settings.benchSlots;

      // Total rounds is just the total slots - no division by number of teams
      const totalRounds = totalRosterSlots;

      // Update draft with new pick and update team's roster
      const draftRef = doc(db, 'drafts', draftId);
      await updateDoc(draftRef, {
        picks: arrayUnion(pick),
        currentPick: nextPick,
        currentRound: nextRound,
        status: nextRound > totalRounds  // Changed back to > since rounds start at 1
          ? 'completed' 
          : 'in_progress',
        [`teams.${currentTeamId}.roster`]: arrayUnion(playerId)
      });

      setSelectedPlayer(null);
      setSearchTerm('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to make pick');
    }
  };

  // Add function to handle starting the draft
  const handleStartDraft = async () => {
    if (!draft || !user || !draftId) return;

    try {
      // If no manual order set, use team join order
      const finalOrder = draftOrder.length > 0 
        ? draftOrder 
        : Object.entries(draft.teams)
            .sort((a, b) => a[1].teamId.localeCompare(b[1].teamId))
            .map(([_, team]) => team.teamId);

      const draftRef = doc(db, 'drafts', draftId);
      await updateDoc(draftRef, {
        'settings.draftOrder': finalOrder,
        status: 'in_progress',
        currentRound: 1,
        currentPick: 0,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start draft');
    }
  };

  const handleRandomizeOrder = () => {
    const teams = Object.values(draft?.teams || {});
    const shuffled = [...teams]
      .sort(() => Math.random() - 0.5)
      .map(team => team.teamId);
    setDraftOrder(shuffled);
  };

  const handleMoveTeam = (teamId: string, direction: 'up' | 'down') => {
    const currentIndex = draftOrder.indexOf(teamId);
    if (currentIndex === -1) return;

    const newOrder = [...draftOrder];
    const newIndex = direction === 'up' 
      ? Math.max(0, currentIndex - 1)
      : Math.min(draftOrder.length - 1, currentIndex + 1);

    [newOrder[currentIndex], newOrder[newIndex]] = 
    [newOrder[newIndex], newOrder[currentIndex]];

    setDraftOrder(newOrder);
  };

  if (loading) {
    return <div className="p-4">Loading...</div>;
  }

  if (error) {
    return <div className="p-4 text-danger">Error: {error}</div>;
  }

  if (!draft) {
    return <div className="p-4">Draft not found</div>;
  }

  const isUsersTurn = user && draft.settings.draftOrder[draft.currentPick] === 
    Object.values(draft.teams).find(team => team.ownerID === user.uid)?.teamId;
  const isCommissioner = user && draft.commissioner === user.uid;

  // Show draft setup if draft is pending
  if (draft.status === 'pending') {
    return (
      <div className="container mt-4">
        <div className="d-flex justify-content-between align-items-center mb-4">
          <h2>{draft.name}</h2>
          <div className="d-flex gap-2">
            {user && !isCommissioner && <JoinDraftDialog draft={draft} userId={user.uid} />}
            {isCommissioner && <InviteDraftDialog draft={draft} />}
          </div>
        </div>

        <div className="row">
          <div className="col-md-8">
            <div className="card">
              <div className="card-body">
                <h5 className="card-title">Draft Status: Not Started</h5>
                <p className="card-text">
                  {Object.keys(draft.teams).length} / {draft.settings.teamsLimit} teams have joined
                </p>
                {isCommissioner && Object.keys(draft.teams).length >= 2 && (
                  <div className="mt-4">
                    <h6>Draft Order</h6>
                    <div className="d-flex gap-2 mb-3">
                      <button 
                        className="btn btn-outline-primary"
                        onClick={handleRandomizeOrder}
                      >
                        Randomize Order
                      </button>
                      <button
                        className="btn btn-primary"
                        onClick={handleStartDraft}
                      >
                        Start Draft
                      </button>
                    </div>
                    <div className="list-group">
                      {(draftOrder.length > 0 ? draftOrder : Object.keys(draft.teams)).map((teamId, index) => (
                        <div
                          key={teamId}
                          className="list-group-item d-flex justify-content-between align-items-center"
                        >
                          <span>
                            {index + 1}. {draft.teams[teamId].teamName}
                          </span>
                          {draftOrder.length > 0 && (
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
                )}
                {!isCommissioner && (
                  <p className="text-muted">
                    Waiting for the commissioner to start the draft...
                  </p>
                )}
              </div>
            </div>

            <div className="card mt-4">
              <div className="card-header">
                <h5 className="card-title mb-0">Draft Settings</h5>
              </div>
              <div className="card-body">
                <div className="row">
                  <div className="col-md-6">
                    <p><strong>Draft Type:</strong> {draft.settings.draftType === 'snake' ? 'Snake Draft' : 'Auction Draft'}</p>
                    <p><strong>Season:</strong> {draft.season}</p>
                  </div>
                  <div className="col-md-6">
                    <p><strong>Captain Slots:</strong> {draft.settings.captainSlots}</p>
                    <p><strong>NA Slots:</strong> {draft.settings.naSlots}</p>
                    <p><strong>BR/LATAM Slots:</strong> {draft.settings.brLatamSlots}</p>
                    <p><strong>Flex Slots:</strong> {draft.settings.flexSlots}</p>
                    <p><strong>Bench Slots:</strong> {draft.settings.benchSlots}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="col-md-4">
            <div className="card">
              <div className="card-header">
                <h5 className="card-title mb-0">Teams</h5>
              </div>
              <div className="card-body">
                <div className="list-group">
                  {Object.values(draft.teams).map((team) => (
                    <div key={team.teamId} className="list-group-item">
                      {team.teamName}
                      {team.ownerID === draft.commissioner && (
                        <span className="badge bg-primary ms-2">Commissioner</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // If draft order is not set up yet, show a message
  if (!draft.settings.draftOrder || draft.settings.draftOrder.length === 0) {
    return (
      <div className="container mt-4">
        <div className="alert alert-info">
          <h4 className="alert-heading">Draft Not Started</h4>
          <p>The draft order hasn't been set up yet. Please wait for the commissioner to set up the draft order and start the draft.</p>
        </div>
      </div>
    );
  }

  const currentTeam = draft.teams[draft.settings.draftOrder[draft.currentPick]];

  return (
    <div className="container-fluid mt-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2>{draft.name}</h2>
        {isCommissioner && draft.status === 'completed' && (
          <ConvertDraftToLeagueDialog 
            draft={draft} 
            onLeagueCreated={(leagueId) => navigate(`/leagues/${leagueId}`)}
          />
        )}
      </div>

      <div className="mb-4">
        <div className="d-flex justify-content-between align-items-center">
          {draft.status !== 'completed' ? (
            <div>
              <span className="me-3">
                Round {draft.currentRound} 
                <span className="ms-2 text-muted">
                  {draft.currentRound % 2 === 0 ? '←' : '→'}
                </span>
              </span>
              <span className="me-3">Pick {draft.currentPick + 1}</span>
              <span>Current Team: {currentTeam?.teamName}</span>
            </div>
          ) : (
            <div>Draft Complete</div>
          )}
          {isUsersTurn && draft.status === 'in_progress' && (
            <div className="alert alert-success mb-0">
              It's your turn to pick!
            </div>
          )}
        </div>
      </div>

      {/* Available Players Section - Only show if draft is in progress */}
      {draft.status === 'in_progress' && (
        <div className="mb-4">
          <div className="row justify-content-center">
            <div className="col-md-6">
              <div className="card">
                <div className="card-header d-flex justify-content-between align-items-center">
                  <h5 className="mb-0">Available Players</h5>
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
                <div className="card-body p-0" style={{ maxHeight: '300px', overflowY: 'auto' }}>
                  <div className="list-group list-group-flush">
                    {Object.values(players)
                      .filter(player => 
                        !draft.picks.some(pick => pick.playerId === player.id) &&
                        (searchTerm === '' || player.name.toLowerCase().includes(searchTerm.toLowerCase()))
                      )
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map(player => (
                        <div  // Changed from button to div if not user's turn
                          key={player.id}
                          className={`list-group-item ${!isUsersTurn ? '' : 'list-group-item-action'} d-flex justify-content-between align-items-center ${
                            selectedPlayer === player.id ? 'active text-dark' : ''
                          } ${
                            player.region === 'NA' ? 'bg-primary bg-opacity-10' :
                            player.region === 'BR' ? 'bg-success bg-opacity-10' :
                            ['LATAM'].includes(player.region) ? 'bg-warning bg-opacity-10' :
                            ''
                          }`}
                          onClick={isUsersTurn ? () => setSelectedPlayer(player.id) : undefined}
                          role={isUsersTurn ? 'button' : undefined}
                          style={{ cursor: isUsersTurn ? 'pointer' : 'default' }}
                        >
                          <div>
                            <span className={`fw-bold ${selectedPlayer === player.id ? 'text-dark' : ''}`}>
                              {player.name}
                            </span>
                            <small className={`ms-2 ${selectedPlayer === player.id ? 'text-muted' : ''}`}>
                              ({player.region})
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
                      ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Draft Board */}
      <div className="table-responsive">
        <table className="table table-bordered table-sm">
          <thead>
            <tr>
              <th style={{ width: '60px' }}>Rd</th>
              {draft.settings.draftOrder.map((teamId) => (
                <th key={teamId}>{draft.teams[teamId].teamName}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ 
              length: draft.settings.captainSlots +
                      draft.settings.naSlots +
                      draft.settings.brLatamSlots +
                      draft.settings.flexSlots +
                      draft.settings.benchSlots
            }, (_, round) => (
              <tr key={round}>
                <td className="text-center">
                  {round + 1}
                  <span className="ms-2 text-muted">
                    {(round + 1) % 2 === 0 ? '←' : '→'}
                  </span>
                </td>
                {draft.settings.draftOrder.map((teamId) => {
                  const pick = draft.picks.find(p => 
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

export default Draft;
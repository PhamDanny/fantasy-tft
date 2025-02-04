import React, { useState, useEffect } from 'react';
import type { League, Player, Team, PlayoffNomination, AuctionLogEntry } from '../../types';
import { doc, updateDoc, arrayUnion, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { User } from 'firebase/auth';

interface AuctionDialogProps {
  league: League;
  players: Player[];
  teams: Team[];
  onClose: () => void;
  isPlayoffs?: boolean;
  user: User;
  isCommissioner?: boolean;
  calculateTeamTotal?: (team: Team) => number;
  POINTS_PER_PLAYOFF_DOLLAR?: number;
}

const AuctionDialog: React.FC<AuctionDialogProps> = ({
  league,
  players,
  teams,
  onClose,
  isPlayoffs = false,
  user,
  isCommissioner,
  calculateTeamTotal,
  POINTS_PER_PLAYOFF_DOLLAR,
}) => {
  const [nomination, setNomination] = useState<PlayoffNomination | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [bidAmount, setBidAmount] = useState<number>(1);
  const [nominationOrder, setNominationOrder] = useState<string[]>([]);
  const [currentNominator, setCurrentNominator] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    // Sort teams by regular season points at the start
    if (!league.settings.playoffSettings?.currentNominator) {
      // Sort teams by their playoff dollars (which is based on regular season points)
      const sortedTeams = [...teams].sort((a, b) => 
        (b.playoffDollars || 0) - (a.playoffDollars || 0)
      );
      const order = sortedTeams.map(team => team.teamId);
      setNominationOrder(order);
      
      // Set initial nominator in Firebase
      updateDoc(doc(db, "leagues", league.id.toString()), {
        "settings.playoffSettings.currentNominator": order[0]
      });
    }
  }, [teams]);

  const getTeamBudget = (team: Team) => {
    // For playoffs, use the stored playoffDollars value
    if (isPlayoffs) {
      return team.playoffDollars ?? 0;
    }
    // For regular auction, use FAAB
    return team.faabBudget ?? 0;
  };

  const handleNominate = async (playerId: string) => {
    const nomination: PlayoffNomination = {
      playerId,
      nominator: currentNominator,
      currentBid: {
        teamId: currentNominator,
        amount: 0,
        timestamp: new Date().toISOString()
      },
      passedTeams: [],
      status: 'bidding'
    };

    await updateDoc(doc(db, "leagues", league.id.toString()), {
      "settings.playoffSettings.currentNomination": nomination
    });
  };

  // Subscribe to both nomination and nominator changes
  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, "leagues", league.id.toString()), (doc) => {
      const leagueData = doc.data();
      const settings = leagueData?.settings?.playoffSettings;
      
      // Always set nomination state, even when null
      const newNomination = settings?.currentNomination || null;
      setNomination(newNomination);
      
      if (settings?.currentNominator) {
        setCurrentNominator(settings.currentNominator);
      }
      if (settings?.nominationOrder) {
        setNominationOrder(settings.nominationOrder);
      }
    });

    return () => unsubscribe();
  }, [league.id]);

  const handleBid = async (teamId: string, amount: number) => {
    if (!nomination) return;
    const team = teams.find(t => t.teamId === teamId);
    
    if (!team) return;
    if (nomination.passedTeams.includes(teamId)) {
      setErrorMessage(`You have passed on this player and cannot rejoin the bidding`);
      return;
    }
    if (amount > getTeamBudget(team)) {
      setErrorMessage(`Bid of $${amount} exceeds your budget of $${getTeamBudget(team)}`);
      return;
    }
    if (amount <= (nomination.currentBid?.amount || 0)) {
      setErrorMessage(`Bid must be higher than current bid of $${nomination.currentBid?.amount}`);
      return;
    }

    // Clear any previous error
    setErrorMessage(null);

    // Update the nomination in Firebase
    await updateDoc(doc(db, "leagues", league.id.toString()), {
      "settings.playoffSettings.currentNomination": {
        ...nomination,
        currentBid: {
          teamId,
          amount,
          timestamp: new Date().toISOString()
        },
        passedTeams: [] // Reset passed teams after new bid
      }
    });
  };

  const handlePass = async (teamId: string) => {
    if (!nomination) return;

    const updatedPassedTeams = [...nomination.passedTeams, teamId];
    
    // Get all teams that haven't passed and aren't the highest bidder
    const teamsStillBidding = teams
      .map(t => t.teamId)
      .filter(id => {
        const hasNotPassed = !updatedPassedTeams.includes(id);
        const isNotHighestBidder = id !== (nomination?.currentBid?.teamId ?? null);
        return hasNotPassed && isNotHighestBidder;
      });

    // Check if we have a winner
    const hasWinner = (teamsStillBidding.length === 0 && nomination?.currentBid) || 
      (nomination?.currentBid && 
       teams.length === updatedPassedTeams.length + 1 && 
       !updatedPassedTeams.includes(nomination?.currentBid?.teamId ?? ''));
    
    if (hasWinner && nomination?.currentBid) {
      const winningTeam = teams.find(t => t.teamId === nomination?.currentBid?.teamId);
      if (!winningTeam) return;

      const updateField = isPlayoffs ? 'playoffRoster' : 'roster';
      const budgetField = isPlayoffs ? 'playoffDollars' : 'faabBudget';

      // First update the winning team
      await updateDoc(doc(db, 'leagues', league.id.toString(), 'teams', winningTeam.teamId), {
        [updateField]: arrayUnion(nomination.playerId),
        [budgetField]: getTeamBudget(winningTeam) - nomination?.currentBid?.amount,
        playoffBids: {
          ...(winningTeam.playoffBids || {}),
          [nomination.playerId]: nomination?.currentBid?.amount
        }
      });

      // Use the stored nomination order
      const currentIndex = nominationOrder.indexOf(currentNominator);
      const nextIndex = (currentIndex + 1) % nominationOrder.length;
      const nextNominator = nominationOrder[nextIndex];

      // Update league state - preserve existing playoff settings
      const currentSettings = league.settings.playoffSettings || {
        captainSlots: 1,
        naSlots: 1,
        brLatamSlots: 1,
        flexSlots: 3,
        playoffAuctionStarted: true
      };

      const newLogEntry: AuctionLogEntry = {
        timestamp: new Date().toISOString(),
        teamId: nomination.currentBid.teamId,
        playerId: nomination.playerId,
        amount: nomination.currentBid.amount
      };

      const newSettings = {
        ...currentSettings,
        currentNomination: null,
        currentNominator: nextNominator,
        auctionLog: [...(currentSettings.auctionLog || []), newLogEntry]
      };

      await updateDoc(doc(db, "leagues", league.id.toString()), {
        "settings.playoffSettings": newSettings
      });
    } else {
      // Just update passed teams
      await updateDoc(doc(db, "leagues", league.id.toString()), {
        "settings.playoffSettings.currentNomination": {
          ...nomination,
          passedTeams: updatedPassedTeams
        }
      });
    }
  };

  // Get available players (exclude retained players in playoffs)
  const availablePlayers = isPlayoffs 
    ? players.filter(player => 
        !teams.some(team => team.playoffRoster?.includes(player.id)) &&
        player.regionals?.qualified
      )
    : players.filter(player => 
        !teams.some(team => team.roster.includes(player.id))
      );

  // Get current nominator's turn
  const currentNominatorTeam = teams.find(t => t.teamId === currentNominator);
  const isMyTurn = currentNominatorTeam?.ownerID === user?.uid || 
                   currentNominatorTeam?.coOwners?.includes(user?.uid);

  const nominatedPlayer = players.find(p => p.id === nomination?.playerId);

  // Add restart function
  const handleRestartAuction = async () => {
    if (!window.confirm('Are you sure you want to restart the auction? This will reset all bids and rosters.')) {
      return;
    }
    if (!calculateTeamTotal || !POINTS_PER_PLAYOFF_DOLLAR) {
      console.error('Missing required functions for restart');
      return;
    }

    // Reset nomination state
    await updateDoc(doc(db, "leagues", league.id.toString()), {
      "settings.playoffSettings.currentNomination": null
    });

    // Reset all teams' playoff dollars and rosters
    for (const team of teams) {
      const regularSeasonPoints = calculateTeamTotal(team);
      const playoffDollars = Math.floor(regularSeasonPoints / POINTS_PER_PLAYOFF_DOLLAR);
      const retainedPlayerIds = team.roster.filter(id => 
        players.find(p => p.id === id)?.regionals?.qualified
      );
      
      await updateDoc(doc(db, "leagues", league.id.toString(), "teams", team.teamId), {
        playoffDollars: playoffDollars,
        playoffRoster: retainedPlayerIds
      });
    }

    setNomination(null);
    setCurrentNominator(nominationOrder[0]);
  };

  // Add useEffect to update bidAmount when current bid changes
  useEffect(() => {
    if (nomination?.currentBid) {
      setBidAmount(nomination.currentBid.amount + 1);
    } else {
      setBidAmount(1);
    }
  }, [nomination?.currentBid?.amount]);

  // Add reset bid function
  const handleResetBid = async () => {
    if (!nomination || !window.confirm('Reset this nomination? All bids will be cleared.')) {
      return;
    }

    await updateDoc(doc(db, "leagues", league.id.toString()), {
      "settings.playoffSettings.currentNomination": {
        ...nomination,
        currentBid: {
          teamId: nomination.nominator,
          amount: 0,
          timestamp: new Date().toISOString()
        },
        passedTeams: []
      }
    });
  };

  // Add auto-pass when budget is exceeded
  useEffect(() => {
    if (!nomination?.currentBid) return;

    teams.forEach(async (team) => {
      const hasPassed = nomination.passedTeams.includes(team.teamId);
      const isHighestBidder = nomination.currentBid &&
        team.teamId === nomination.currentBid.teamId;
      const budget = getTeamBudget(team);

      if (!hasPassed && !isHighestBidder && nomination.currentBid && budget <= nomination.currentBid.amount) {
        await handlePass(team.teamId);
      }
    });
  }, [nomination?.currentBid?.amount]);

  return (
    <div className="modal fade show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="modal-dialog modal-xl modal-dialog-scrollable" style={{ maxWidth: '1200px' }}>
        <div className="modal-content d-flex flex-row">
          <div className="flex-grow-1">
            <div className="modal-header">
              <h5 className="modal-title">
                {isPlayoffs ? "Playoff Auction" : "Auction Draft"}
                {currentNominatorTeam && (
                  <span className="ms-2 text-muted">
                    {isMyTurn 
                      ? "Your turn to nominate"
                      : `${currentNominatorTeam.teamName}'s turn to nominate`
                    }
                  </span>
                )}
              </h5>
              <div>
                {isCommissioner && (
                  <button 
                    className="btn btn-warning btn-sm me-2"
                    onClick={handleRestartAuction}
                  >
                    Restart Auction
                  </button>
                )}
                <button type="button" className="btn-close" onClick={onClose}></button>
              </div>
            </div>
            <div className="modal-body">
              {errorMessage && (
                <div className="alert alert-danger mb-3">
                  {errorMessage}
                </div>
              )}
              {nomination ? (
                <div className="mb-4">
                  <div className="card">
                    <div className="card-header d-flex justify-content-between align-items-center">
                      <h6 className="mb-0">Current Auction</h6>
                      {isCommissioner && (
                        <button 
                          className="btn btn-warning btn-sm"
                          onClick={handleResetBid}
                        >
                          Reset Bid
                        </button>
                      )}
                    </div>
                    <div className="card-body p-3">
                      <div className="d-flex justify-content-between align-items-start">
                        <div>
                          <h5 className="mb-1">{nominatedPlayer?.name}</h5>
                          <small className="text-muted">{nominatedPlayer?.region}</small>
                        </div>
                        <div className="text-end">
                          {nomination.currentBid && (
                            <>
                              <div className="h4 mb-0">${nomination.currentBid.amount}</div>
                              <small className="text-muted">
                                Current Bid: {teams.find(t => t.teamId === nomination.currentBid?.teamId)?.teamName}
                              </small>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="row g-2">
                        {teams.map(team => {
                          const budget = getTeamBudget(team);
                          const currentBid = nomination?.currentBid;
                          const canBid = currentBid ? budget > currentBid.amount : true;
                          const hasPassed = nomination?.passedTeams?.includes(team.teamId) ?? false;
                          const isHighestBidder = currentBid?.teamId === team.teamId;
                          const isMyTeam = team.ownerID === user?.uid || team.coOwners?.includes(user?.uid);

                          return (
                            <div key={team.teamId} className="col-md-6">
                              <div className={`card ${hasPassed ? 'bg-light' : ''}`}>
                                <div className="card-body p-2">
                                  <div className="d-flex justify-content-between align-items-center">
                                    <div>
                                      <h6 className="mb-0">{team.teamName}</h6>
                                      <div className="text-muted mb-2">Budget: ${budget}</div>
                                    </div>
                                    <div style={{ minWidth: '200px' }}>
                                      {isMyTeam ? (
                                        hasPassed ? (
                                          <span className="badge bg-secondary">Passed</span>
                                        ) : isHighestBidder ? (
                                          <span className="badge bg-success">Highest Bidder</span>
                                        ) : (
                                          <div className="d-flex gap-2">
                                            <input
                                              type="number"
                                              className="form-control form-control-sm"
                                              style={{ width: '80px' }}
                                              value={bidAmount}
                                              onChange={(e) => setBidAmount(Math.max(1, parseInt(e.target.value) || 0))}
                                              min={(currentBid?.amount || 0) + 1}
                                              max={budget}
                                              disabled={!canBid}
                                            />
                                            <button
                                              className="btn btn-sm btn-primary"
                                              onClick={() => handleBid(team.teamId, bidAmount)}
                                              disabled={!canBid}
                                            >
                                              Bid
                                            </button>
                                            <button
                                              className="btn btn-sm btn-secondary"
                                              onClick={() => handlePass(team.teamId)}
                                            >
                                              Pass
                                            </button>
                                          </div>
                                        )
                                      ) : (
                                        <div>
                                          {hasPassed && <span className="badge bg-secondary">Passed</span>}
                                          {isHighestBidder && <span className="badge bg-success">Highest Bidder</span>}
                                          {!hasPassed && !isHighestBidder && (
                                            <span className="text-muted">Awaiting action...</span>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div className="mb-3">
                    <h6>
                      {availablePlayers.length === 0 ? (
                        <div className="alert alert-success">
                          Auction complete! All available players have been drafted.
                          <button 
                            className="btn btn-primary ms-3"
                            onClick={onClose}
                          >
                            Close Auction
                          </button>
                        </div>
                      ) : isMyTurn ? (
                        "Your turn to nominate"
                      ) : (
                        `Current Nominator: ${currentNominatorTeam?.teamName}`
                      )}
                    </h6>
                  </div>
                  {availablePlayers.length > 0 && (
                    <>
                      <div className="mb-3">
                        <input
                          type="text"
                          className="form-control"
                          placeholder="Search players..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          disabled={!isMyTurn}
                        />
                      </div>
                      <div className="list-group">
                        {availablePlayers
                          .filter(p => 
                            p.name.toLowerCase().includes(searchTerm.toLowerCase())
                          )
                          .map(player => (
                            <button
                              key={player.id}
                              className="list-group-item list-group-item-action d-flex justify-content-between align-items-center"
                              onClick={() => handleNominate(player.id)}
                              disabled={!isMyTurn}
                            >
                              <div>
                                <span>{player.name}</span>
                                <small className="text-muted ms-2">({player.region})</small>
                              </div>
                            </button>
                          ))}
                      </div>
                    </>
                  )}
                  {!isMyTurn && (
                    <div className="text-muted mt-2">
                      Waiting for {currentNominatorTeam?.teamName} to nominate...
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="border-start" style={{ width: '350px' }}>
            <div className="p-3">
              <h6 className="mb-3">Auction History</h6>
              <div className="overflow-auto" style={{ maxHeight: 'calc(100vh - 200px)' }}>
                {league.settings.playoffSettings?.auctionLog?.slice().reverse().map((entry, i) => {
                  const team = teams.find(t => t.teamId === entry.teamId);
                  const player = players.find(p => p.id === entry.playerId);
                  return (
                    <div key={i} className="mb-2 small">
                      <div className="fw-bold">{team?.teamName}</div>
                      <div>Won {player?.name} for ${entry.amount}</div>
                      <div className="text-muted">
                        {new Date(entry.timestamp).toLocaleTimeString()}
                      </div>
                    </div>
                  );
                })}
                {!league.settings.playoffSettings?.auctionLog?.length && (
                  <div className="text-muted">No auction history yet</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuctionDialog; 
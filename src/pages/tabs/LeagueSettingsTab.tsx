import React, { useState } from "react";
import { doc, updateDoc, runTransaction, serverTimestamp, collection, getDocs } from "firebase/firestore";
import { db } from "../../firebase/config";
import type { League, LeagueSettings, Team } from "../../types";
import InviteDialog from '../../components/dialogs/InviteDialog';
import CommissionerTeamEditDialog from "../../components/dialogs/CommissionerTeamEditDialog";
import { processWaivers } from '../../utils/waiverUtils';

interface LeagueSettingsTabProps {
  league: League;
  isCommissioner: boolean;
  leagueId: number;
  teams: Record<string, Team>;
}

interface UserData {
  displayName: string;
  leagues: string[];
}

interface LeagueMemberRowProps {
  teamId: string;
  team: Team;
  onEditRoster: (teamId: string) => void;
  onRemoveOwner: (teamId: string, team: Team) => void;
  onRemoveCoOwner: (teamId: string, team: Team, coOwnerId: string) => void;
}

const LeagueMemberRow: React.FC<LeagueMemberRowProps> = ({
  teamId,
  team,
  onEditRoster,
  onRemoveOwner,
}) => (
  <div className="border-bottom">
    <div className="d-flex align-items-center p-3">
      <div className="flex-grow-1">
        <strong>{team.teamName}</strong>
      </div>
      <button
        className="btn btn-sm btn-primary me-2"
        onClick={() => onEditRoster(teamId)}
      >
        Edit Roster
      </button>
      <button
        className="btn btn-sm btn-danger"
        onClick={() => onRemoveOwner(teamId, team)}
      >
        Kick
      </button>
    </div>
    {team.coOwners && team.coOwners.length > 0 && (
      <div className="small text-muted px-3 pb-2">
        Co-owners: {team.coOwners.length}
      </div>
    )}
  </div>
);

const LeagueSettingsTab: React.FC<LeagueSettingsTabProps> = ({
  league,
  isCommissioner,
  leagueId,
  teams,
}) => {
  // Initialize settings with defaults for playoffs if not set
  const defaultSettings = {
    ...league.settings,
    playoffs: league.settings.playoffs ?? true,
    playoffTeams: league.settings.playoffTeams ?? 4,
    waiversEnabled: league.settings.waiversEnabled ?? true,
  };

  const [settings, setSettings] = useState<LeagueSettings>(defaultSettings);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);

  // Add playoff settings to the state
  const [playoffSettings, setPlayoffSettings] = useState({
    captainSlots: league.settings.playoffSettings?.captainSlots ?? 1,
    naSlots: league.settings.playoffSettings?.naSlots ?? 1,
    brLatamSlots: league.settings.playoffSettings?.brLatamSlots ?? 1,
    flexSlots: league.settings.playoffSettings?.flexSlots ?? 3,
  });

  const playoffsStarted = league.settings.playoffSettings?.playoffAuctionStarted === true;

  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  if (!isCommissioner) {
    return (
      <div className="row">
        <div className="col-md-8">
          <div className="card">
            <div className="card-header">
              <h4 className="h5 mb-0">League Settings</h4>
            </div>
            <div className="card-body">
              <h5 className="mb-3">Roster Settings</h5>
              <div className="row mb-4">
                <div className="col-md-6">
                  <div className="mb-3">
                    <label className="form-label">Captain Slots</label>
                    <p className="mb-1">{league.settings.captainSlots}</p>
                    <small className="text-muted">Players get 1.5x points in captain slots</small>
                  </div>

                  <div className="mb-3">
                    <label className="form-label">NA Player Slots</label>
                    <p>{league.settings.naSlots}</p>
                  </div>

                  <div className="mb-3">
                    <label className="form-label">BR/LATAM Player Slots</label>
                    <p>{league.settings.brLatamSlots}</p>
                  </div>
                </div>

                <div className="col-md-6">
                  <div className="mb-3">
                    <label className="form-label">Flex Slots</label>
                    <p className="mb-1">{league.settings.flexSlots}</p>
                    <small className="text-muted">Can be filled by any player</small>
                  </div>

                  <div className="mb-3">
                    <label className="form-label">Teams Limit</label>
                    <p>{league.settings.teamsLimit}</p>
                  </div>
                </div>
              </div>

              <h5 className="mb-3">Playoff Settings</h5>
              <div className="mb-4">
                <p>Playoffs: {league.settings.playoffs ? 'Enabled' : 'Disabled'}</p>
                {league.settings.playoffs && (
                  <>
                    <p>Number of Playoff Teams: {league.settings.playoffTeams}</p>
                    <h6 className="mb-2">Playoff Roster Configuration</h6>
                    <p>Captain Slots: {league.settings.playoffSettings?.captainSlots}</p>
                    <p>NA Slots: {league.settings.playoffSettings?.naSlots}</p>
                    <p>BR/LATAM Slots: {league.settings.playoffSettings?.brLatamSlots}</p>
                    <p>Flex Slots: {league.settings.playoffSettings?.flexSlots}</p>
                  </>
                )}
              </div>

              <h5 className="mb-3">Financial Settings</h5>
              <div className="mb-4">
                <label className="form-label">Starting FAAB Budget</label>
                <p>{league.settings.faabBudget}</p>
              </div>

              <h5 className="mb-3">Waiver Settings</h5>
              <div className="mb-4">
                <p>Waivers: {league.settings.waiversEnabled ? 'Enabled' : 'Disabled'}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="col-md-4">
          <div className="card">
            <div className="card-header">
              <h4 className="h5 mb-0">Season Progress</h4>
            </div>
            <div className="card-body">
              <p>Current Cup: {league.settings.currentCup === 0 ? "Preseason" : league.settings.currentCup}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const handleSettingChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    field: keyof LeagueSettings
  ) => {
    const value = parseInt(e.target.value) || 0;
    setSettings((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const validateSettings = (): boolean => {
    if (settings.teamsLimit < Object.keys(teams).length) {
      setError("Teams limit cannot be less than current number of teams");
      return false;
    }

    if (
      settings.captainSlots < 0 ||
      settings.naSlots < 0 ||
      settings.brLatamSlots < 0 ||
      settings.flexSlots < 0
    ) {
      setError("Slot numbers cannot be negative");
      return false;
    }

    const totalStartingSlots =
      settings.captainSlots +
      settings.naSlots +
      settings.brLatamSlots +
      settings.flexSlots;

    if (totalStartingSlots === 0) {
      setError("There must be at least one starting slot");
      return false;
    }

    if (totalStartingSlots > 20) {
      setError("Total number of starting slots cannot exceed 20");
      return false;
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!validateSettings()) {
      return;
    }

    setLoading(true);

    try {
      await updateDoc(doc(db, "leagues", leagueId.toString()), {
        settings: {
          ...settings,
          playoffSettings: playoffSettings
        },
      });

      setSuccess("League settings updated successfully");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update settings");
    } finally {
      setLoading(false);
    }
  };

  const advanceCup = async () => {
    if (settings.currentCup >= 3) {
      setError("Season is already complete");
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const newCup = settings.currentCup + 1;
      await updateDoc(doc(db, "leagues", leagueId.toString()), {
        "settings.currentCup": newCup,
      });

      setSettings((prev) => ({
        ...prev,
        currentCup: newCup,
      }));

      setSuccess(`Advanced to Cup ${newCup}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to advance cup");
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveOwner = async (teamId: string, team: Team) => {
    if (!window.confirm(`Are you sure you want to kick the owner of ${team.teamName} from the league? This cannot be undone.`)) {
      return;
    }

    setLoading(true);
    try {
      await runTransaction(db, async (transaction) => {
        const userDoc = await transaction.get(doc(db, "users", team.ownerID));
        const userData = userDoc.data() as UserData | undefined;
        const userName = userData?.displayName || "Unknown User";
        const leagueRef = doc(db, "leagues", leagueId.toString());
        
        let chatMessage = '';
        
        if (!team.coOwners || team.coOwners.length === 0) {
          // Delete the team document first
          const teamRef = doc(db, "leagues", leagueId.toString(), "teams", teamId);
          transaction.delete(teamRef);
          
          chatMessage = `${userName} was kicked from the league. Their team was disbanded. `;
        } else {
          const newOwner = team.coOwners[Math.floor(Math.random() * team.coOwners.length)];
          const newOwnerDoc = await transaction.get(doc(db, "users", newOwner));
          const newOwnerData = newOwnerDoc.data() as UserData | undefined;
          const newOwnerName = newOwnerData?.displayName || "Unknown User";
          const updatedCoOwners = team.coOwners.filter(id => id !== newOwner);

          // Update the team document
          const teamRef = doc(db, "leagues", leagueId.toString(), "teams", teamId);
          transaction.update(teamRef, {
            ownerID: newOwner,
            coOwners: updatedCoOwners
          });
          
          chatMessage = `${userName} was kicked from the league. ${newOwnerName} is now the owner of team.`;
        }

        // Update user's leagues array
        const userRef = doc(db, "users", team.ownerID);
        const userLeagues = userData?.leagues || [];
        transaction.update(userRef, {
          leagues: userLeagues.filter((id: string) => id !== leagueId.toString())
        });

        // Add to transaction history
        const transactionDoc = {
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          teamIds: [teamId],
          adds: {},
          drops: {},
          type: 'commissioner' as const,
          metadata: {
            reason: `${userName} was removed from the league`,
            action: 'member_removed' as const,
            commissioner: league.commissioner
          }
        };

        transaction.update(leagueRef, {
          transactions: [...(league.transactions || []), transactionDoc]
        });

        // Create chat message last
        const chatRef = doc(db, "leagues", leagueId.toString(), "chat", `${Date.now()}-${crypto.randomUUID()}`);
        transaction.set(chatRef, {
          userId: "system",
          userName: "System",
          content: chatMessage,
          timestamp: serverTimestamp(),
          type: "system"
        });
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove member");
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveCoOwner = async (teamId: string, team: Team, coOwnerId: string) => {
    if (!window.confirm(`Are you sure you want to remove this co-owner from ${team.teamName}?`)) {
      return;
    }

    setLoading(true);
    try {
      await runTransaction(db, async (transaction) => {
        const userDoc = await transaction.get(doc(db, "users", coOwnerId));
        const userData = userDoc.data() as UserData | undefined;
        const userName = userData?.displayName || "Unknown User";
        const leagueRef = doc(db, "leagues", leagueId.toString());

        // Update the team document first
        const teamRef = doc(db, "leagues", leagueId.toString(), "teams", teamId);
        const updatedCoOwners = team.coOwners.filter(id => id !== coOwnerId);
        transaction.update(teamRef, {
          coOwners: updatedCoOwners
        });

        // Update user's leagues array
        const userRef = doc(db, "users", coOwnerId);
        const userLeagues = userData?.leagues || [];
        transaction.update(userRef, {
          leagues: userLeagues.filter((id: string) => id !== leagueId.toString())
        });

        // Add to transaction history
        const transactionDoc = {
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          teamIds: [teamId],
          adds: {},
          drops: {},
          type: 'commissioner' as const,
          metadata: {
            reason: `${userName} was removed as co-owner`,
            action: 'member_removed' as const,
            commissioner: league.commissioner
          }
        };

        transaction.update(leagueRef, {
          transactions: [...(league.transactions || []), transactionDoc]
        });

        // Create chat message last
        const chatRef = doc(db, "leagues", leagueId.toString(), "chat", `${Date.now()}-${crypto.randomUUID()}`);
        transaction.set(chatRef, {
          userId: "system",
          userName: "System",
          content: `${userName} has been removed as co-owner of team "${team.teamName}".`,
          timestamp: serverTimestamp(),
          type: "system"
        });
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove co-owner");
    } finally {
      setLoading(false);
    }
  };

  const handleEditRoster = (teamId: string) => {
    setSelectedTeamId(teamId);
  };

  const getTotalPlayoffSlots = () => {
    const slotsPerTeam = 
      playoffSettings.captainSlots + 
      playoffSettings.naSlots + 
      playoffSettings.brLatamSlots + 
      playoffSettings.flexSlots;
    return slotsPerTeam * settings.playoffTeams;
  };

  const handleDeleteLeague = async () => {
    if (deleteConfirmation !== league.name) {
      setError("League name doesn't match");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await runTransaction(db, async (transaction) => {
        // READS FIRST
        // Get all team documents
        const teamsRef = collection(db, "leagues", leagueId.toString(), "teams");
        const teamsSnapshot = await getDocs(teamsRef);

        // Get all chat documents
        const chatRef = collection(db, "leagues", leagueId.toString(), "chat");
        const chatSnapshot = await getDocs(chatRef);

        // Get all user documents that need updating
        const userDocs = await Promise.all(
          Object.values(teams).flatMap(team => [
            team.ownerID,
            ...(team.coOwners || [])
          ]).map(async userId => {
            const userRef = doc(db, "users", userId);
            const userDoc = await transaction.get(userRef);
            return { ref: userRef, data: userDoc };
          })
        );

        // WRITES SECOND
        // Delete all team documents
        teamsSnapshot.forEach(doc => {
          transaction.delete(doc.ref);
        });

        // Delete all chat documents
        chatSnapshot.forEach(doc => {
          transaction.delete(doc.ref);
        });

        // Update all user documents
        userDocs.forEach(({ ref, data }) => {
          const userData = data.data() as { leagues: string[] } | undefined;
          if (userData) {
            transaction.update(ref, {
              leagues: userData.leagues.filter(id => id !== leagueId.toString())
            });
          }
        });

        // Finally delete the league document
        const leagueRef = doc(db, "leagues", leagueId.toString());
        transaction.delete(leagueRef);
      });

      // Redirect to home page after successful deletion
      window.location.href = '/';
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete league");
      setLoading(false);
    }
  };

  return (
    <>
      <div className="row">
        <div className="col-md-8">
          <div className="card">
            <div className="card-header">
              <h4 className="h5 mb-0">League Settings</h4>
            </div>
            <div className="card-body">
              {error && <div className="alert alert-danger">{error}</div>}
              {success && <div className="alert alert-success">{success}</div>}

              <form onSubmit={handleSubmit}>
                <h5 className="mb-3">Roster Settings</h5>

                <div className="row mb-4">
                  <div className="col-md-6">
                    <div className="mb-3">
                      <label className="form-label">Captain Slots</label>
                      <input
                        type="number"
                        className="form-control"
                        value={settings.captainSlots}
                        onChange={(e) => handleSettingChange(e, "captainSlots")}
                        min="0"
                        disabled={loading}
                      />
                      <small className="text-muted">
                        Players get 1.5x points in captain slots
                      </small>
                    </div>

                    <div className="mb-3">
                      <label className="form-label">NA Player Slots</label>
                      <input
                        type="number"
                        className="form-control"
                        value={settings.naSlots}
                        onChange={(e) => handleSettingChange(e, "naSlots")}
                        min="0"
                        disabled={loading}
                      />
                    </div>

                    <div className="mb-3">
                      <label className="form-label">
                        BR/LATAM Player Slots
                      </label>
                      <input
                        type="number"
                        className="form-control"
                        value={settings.brLatamSlots}
                        onChange={(e) => handleSettingChange(e, "brLatamSlots")}
                        min="0"
                        disabled={loading}
                      />
                    </div>
                  </div>

                  <div className="col-md-6">
                    <div className="mb-3">
                      <label className="form-label">Flex Slots</label>
                      <input
                        type="number"
                        className="form-control"
                        value={settings.flexSlots}
                        onChange={(e) => handleSettingChange(e, "flexSlots")}
                        min="0"
                        disabled={loading}
                      />
                      <small className="text-muted">
                        Can be filled by any player
                      </small>
                    </div>

                    <div className="mb-3">
                      <label className="form-label">Teams Limit</label>
                      <input
                        type="number"
                        className="form-control"
                        value={settings.teamsLimit}
                        onChange={(e) => handleSettingChange(e, "teamsLimit")}
                        min={Object.keys(teams).length}
                        disabled={loading}
                      />
                    </div>
                  </div>
                </div>

                {/* Move playoff settings to a dedicated card */}
                <div className="card mb-4">
                  <div className="card-header">
                    <h5 className="mb-0">Playoff Settings</h5>
                  </div>
                  <div className="card-body">
                    <div className="form-check form-switch mb-3">
                      <input
                        className="form-check-input"
                        type="checkbox"
                        id="playoffsEnabled"
                        checked={settings.playoffs}
                        onChange={(e) => {
                          setSettings((prev) => ({
                            ...prev,
                            playoffs: e.target.checked,
                          }));
                        }}
                        disabled={loading || playoffsStarted}
                      />
                      <label className="form-check-label" htmlFor="playoffsEnabled">
                        Enable Playoffs
                      </label>
                      {playoffsStarted && (
                        <small className="text-muted d-block">
                          Playoffs cannot be disabled once the playoff auction has started.
                        </small>
                      )}
                    </div>

                    {settings.playoffs && (
                      <>
                        <div className="mb-3">
                          <label className="form-label">Number of Playoff Teams</label>
                          <input
                            type="number"
                            className="form-control"
                            value={settings.playoffTeams}
                            onChange={(e) => {
                              const value = parseInt(e.target.value) || 2;
                              const maxTeams = Object.keys(teams).length;
                              setSettings((prev) => ({
                                ...prev,
                                playoffTeams: Math.min(
                                  Math.max(2, value),
                                  maxTeams
                                ),
                              }));
                            }}
                            min={2}
                            max={Object.keys(teams).length}
                            disabled={loading || playoffsStarted}
                          />
                          <small className="text-muted">
                            Min: 2, Max: {Object.keys(teams).length} teams
                          </small>
                        </div>

                        <h6 className="mb-3">Playoff Roster Configuration</h6>
                        <div className="row g-3">
                          <div className="col-md-6">
                            <label className="form-label">Captain Slots</label>
                            <input
                              type="number"
                              className="form-control"
                              value={playoffSettings.captainSlots}
                              onChange={(e) => setPlayoffSettings(prev => ({
                                ...prev,
                                captainSlots: parseInt(e.target.value) || 0
                              }))}
                              min="0"
                              disabled={loading || playoffsStarted}
                            />
                          </div>

                          <div className="col-md-6">
                            <label className="form-label">NA Slots</label>
                            <input
                              type="number"
                              className="form-control"
                              value={playoffSettings.naSlots}
                              onChange={(e) => setPlayoffSettings(prev => ({
                                ...prev,
                                naSlots: parseInt(e.target.value) || 0
                              }))}
                              min="0"
                              disabled={loading || playoffsStarted}
                            />
                          </div>

                          <div className="col-md-6">
                            <label className="form-label">BR/LATAM Slots</label>
                            <input
                              type="number"
                              className="form-control"
                              value={playoffSettings.brLatamSlots}
                              onChange={(e) => setPlayoffSettings(prev => ({
                                ...prev,
                                brLatamSlots: parseInt(e.target.value) || 0
                              }))}
                              min="0"
                              disabled={loading || playoffsStarted}
                            />
                          </div>

                          <div className="col-md-6">
                            <label className="form-label">Flex Slots</label>
                            <input
                              type="number"
                              className="form-control"
                              value={playoffSettings.flexSlots}
                              onChange={(e) => setPlayoffSettings(prev => ({
                                ...prev,
                                flexSlots: parseInt(e.target.value) || 0
                              }))}
                              min="0"
                              disabled={loading || playoffsStarted}
                            />
                          </div>
                        </div>

                        {getTotalPlayoffSlots() > 32 && (
                          <div className="alert alert-warning mt-3">
                            Warning: The current configuration requires {getTotalPlayoffSlots()} total roster slots, 
                            but only 32 players qualify for regionals. Some teams may not be able to fill all roster slots.
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>

                <h5 className="mb-3">Financial Settings</h5>
                <div className="mb-4">
                  <label className="form-label">Starting FAAB Budget</label>
                  <input
                    type="number"
                    className="form-control"
                    value={settings.faabBudget}
                    onChange={(e) => handleSettingChange(e, "faabBudget")}
                    min="0"
                    disabled={loading}
                  />
                  <small className="text-muted">
                    Free Agent Acquisition Budget for new teams
                  </small>
                </div>

                <h5 className="mb-3">Waiver Settings</h5>
                <div className="mb-4">
                  <div className="form-check form-switch mb-3">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      id="waiversEnabled"
                      checked={settings.waiversEnabled}
                      onChange={(e) => {
                        setSettings((prev) => ({
                          ...prev,
                          waiversEnabled: e.target.checked,
                        }));
                      }}
                      disabled={loading}
                    />
                    <label className="form-check-label" htmlFor="waiversEnabled">
                      Enable Waivers
                    </label>
                  </div>
                  <small className="text-muted d-block mb-3">
                    When disabled, players can be added instantly as free agents
                  </small>

                  {settings.waiversEnabled && (
                    <button
                      className="btn btn-warning"
                      onClick={() => {
                        if (window.confirm('Are you sure you want to process all pending waiver claims?')) {
                          setLoading(true);
                          processWaivers(leagueId.toString())
                            .then(() => {
                              setSuccess('Waivers processed successfully');
                            })
                            .catch((err) => {
                              setError(err instanceof Error ? err.message : 'Failed to process waivers');
                            })
                            .finally(() => setLoading(false));
                        }
                      }}
                      disabled={loading}
                    >
                      Process Waivers
                    </button>
                  )}
                </div>

                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={loading}
                >
                  {loading ? "Saving..." : "Save Settings"}
                </button>

                {isCommissioner && (
                  <div className="mt-5 pt-3 border-top">
                    {!showDeleteConfirm ? (
                      <button 
                        type="button"
                        className="btn btn-outline-danger"
                        onClick={() => setShowDeleteConfirm(true)}
                        disabled={loading}
                      >
                        Delete League
                      </button>
                    ) : (
                      <div>
                        <p className="text-danger">
                          This action cannot be undone. Please type <strong>{league.name}</strong> to confirm.
                        </p>
                        <div className="mb-3">
                          <input
                            type="text"
                            className="form-control"
                            value={deleteConfirmation}
                            onChange={(e) => setDeleteConfirmation(e.target.value)}
                            placeholder="Type league name to confirm"
                          />
                        </div>
                        <div className="d-flex gap-2">
                          <button
                            type="button"
                            className="btn btn-danger"
                            onClick={handleDeleteLeague}
                            disabled={loading || deleteConfirmation !== league.name}
                          >
                            {loading ? "Deleting..." : "Confirm Delete"}
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => {
                              setShowDeleteConfirm(false);
                              setDeleteConfirmation('');
                            }}
                            disabled={loading}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </form>
            </div>
          </div>
        </div>

        <div className="col-md-4">
          <div className="card mb-3">
            <div className="card-header">
              <h4 className="h5 mb-0">Season Progress</h4>
            </div>
            <div className="card-body">
              <p className="mb-3">
                Current Cup:{" "}
                {settings.currentCup === 0 ? "Preseason" : settings.currentCup}
              </p>

              {settings.currentCup < 3 && (
                <>
                  <button
                    className="btn btn-warning w-100"
                    onClick={advanceCup}
                    disabled={loading}
                  >
                    {loading
                      ? "Processing..."
                      : `Advance to Cup ${settings.currentCup + 1}`}
                  </button>
                  <small className="text-muted d-block mt-2">
                    Warning: This will lock all teams' Cup{" "}
                    {settings.currentCup + 1} lineups
                  </small>
                </>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h4 className="h5 mb-0">Manage League Members</h4>
            </div>
            <div className="card-body p-0">
              {Object.entries(teams).map(([teamId, team]) => (
                <LeagueMemberRow
                  key={teamId}
                  teamId={teamId}
                  team={team}
                  onEditRoster={handleEditRoster}
                  onRemoveOwner={handleRemoveOwner}
                  onRemoveCoOwner={handleRemoveCoOwner}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Team Editor Dialog */}
      {selectedTeamId && (
        <CommissionerTeamEditDialog 
          league={league}
          leagueId={leagueId}
          teamId={selectedTeamId}
          onClose={() => setSelectedTeamId(null)}
        />
      )}

      {/* Invite Dialog */}
      <InviteDialog 
        league={league}
        show={showInviteDialog}
        onClose={() => setShowInviteDialog(false)}
      />
    </>
  );
};

export default LeagueSettingsTab;

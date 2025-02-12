import React, { useState } from "react";
import { doc, updateDoc, getDoc, runTransaction, collection, getDocs } from "firebase/firestore";
import { db } from "../../firebase/config";
import type { League, Team, LeagueSettings } from "../../types";
import InviteDialog from '../../components/dialogs/InviteDialog';
import CommissionerTeamEditDialog from "../../components/dialogs/CommissionerTeamEditDialog";
import { processWaivers } from '../../utils/waiverUtils';
import { getLeagueType } from "../../types";
import TeamDisplay from '../../components/TeamDisplay';

interface LeagueSettingsTabProps {
  league: League;
  isCommissioner: boolean;
  leagueId: number;
  teams: Record<string, Team>;
}

interface LeagueMemberRowProps {
  teamId: string;
  team: Team;
  onEditRoster: (teamId: string) => void;
  onRemoveOwner: (teamId: string, team: Team) => void;
  onRemoveCoOwner: (teamId: string, coOwnerId: string) => void;
}

const LeagueMemberRow: React.FC<LeagueMemberRowProps> = ({
  teamId,
  team,
  onEditRoster,
  onRemoveOwner,
  onRemoveCoOwner,
}) => (
  <div className="border-bottom">
    <div className="d-flex align-items-center p-3">
      <div className="flex-grow-1">
        <strong><TeamDisplay team={team} /></strong>
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
        {team.coOwners.map(coOwnerId => (
          <button
            key={coOwnerId}
            className="btn btn-sm btn-outline-danger ms-2"
            onClick={() => onRemoveCoOwner(teamId, coOwnerId)}
          >
            Remove
          </button>
        ))}
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
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Add playoff settings to the state
  const [playoffSettings] = useState({
    captainSlots: league.settings.playoffSettings?.captainSlots ?? 1,
    naSlots: league.settings.playoffSettings?.naSlots ?? 1,
    brLatamSlots: league.settings.playoffSettings?.brLatamSlots ?? 1,
    flexSlots: league.settings.playoffSettings?.flexSlots ?? 3,
  });

  const handleRemoveOwner = async (teamId: string) => {
    if (!window.confirm('Are you sure you want to remove this team?')) return;

    try {
      await updateDoc(doc(db, 'leagues', leagueId.toString(), 'teams', teamId), {
        ownerID: null,
        coOwners: []
      });
    } catch (err) {
      setError('Failed to remove owner');
    }
  };

  const handleRemoveCoOwner = async (teamId: string, coOwnerId: string) => {
    if (!window.confirm('Are you sure you want to remove this co-owner?')) return;

    try {
      const teamRef = doc(db, 'leagues', leagueId.toString(), 'teams', teamId);
      const teamDoc = await getDoc(teamRef);
      if (teamDoc.exists()) {
        const team = teamDoc.data() as Team;
        await updateDoc(teamRef, {
          coOwners: team.coOwners.filter(id => id !== coOwnerId)
        });
      }
    } catch (err) {
      setError('Failed to remove co-owner');
    }
  };

  const handleSettingChange = (e: React.ChangeEvent<HTMLInputElement>, setting: string) => {
    if (!isCommissioner) return;
    
    const value = e.target.type === 'checkbox' ? e.target.checked : parseInt(e.target.value);
    
    setSettings((prev: LeagueSettings) => ({
      ...prev,
      [setting]: value,
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

  // Add the league deletion function
  const handleDeleteLeague = async () => {
    if (deleteConfirmation !== league.name) {
      setError("League name doesn't match");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await runTransaction(db, async (transaction) => {
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

  if (!isCommissioner) {
    return (
      <div className="alert alert-danger">
        You must be the commissioner to access league settings.
      </div>
    );
  }

  return (
    <>
      <div className="row">
        {/* Left Column - Settings */}
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
                      <label className="form-label">BR/LATAM Player Slots</label>
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

                {/* Only show these settings for season-long leagues */}
                {getLeagueType(league) === 'season-long' ? (
                  <>
                    <div className="card mb-4">
                      <div className="card-header">
                        <h5 className="mb-0">Financial Settings</h5>
                      </div>
                      <div className="card-body">
                        <div className="mb-3">
                          <label className="form-label">FAAB Budget</label>
                          <input
                            type="number"
                            className="form-control"
                            value={settings.faabBudget}
                            onChange={(e) => handleSettingChange(e, "faabBudget")}
                            min="0"
                            disabled={loading}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="card mb-4">
                      <div className="card-header">
                        <h5 className="mb-0">Playoff Settings</h5>
                      </div>
                      <div className="card-body">
                        {league.settings.currentCup === 4 && (
                          <div className="alert alert-warning mb-3">
                            Playoff settings cannot be changed once the playoff phase has started.
                          </div>
                        )}
                        <div className="form-check form-switch">
                          <input
                            className="form-check-input"
                            type="checkbox"
                            id="playoffsEnabled"
                            checked={settings.playoffs}
                            onChange={e => handleSettingChange(e, "playoffs")}
                            disabled={league.settings.currentCup === 4}
                          />
                          <label className="form-check-label" htmlFor="playoffsEnabled">
                            Enable Playoffs
                          </label>
                        </div>

                        {settings.playoffs && (
                          <div className="mb-3">
                            <label className="form-label">Number of Playoff Teams</label>
                            <input
                              type="number"
                              className="form-control"
                              value={settings.playoffTeams}
                              onChange={(e) => handleSettingChange(e, "playoffTeams")}
                              min="2"
                              max={settings.teamsLimit}
                              disabled={loading}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                ) : null}

                {/* Only show waiver settings for season-long leagues */}
                {getLeagueType(league) === 'season-long' && (
                  <>
                    <h5 className="mb-3">Waiver Settings</h5>
                    <div className="mb-4">
                      <div className="form-check form-switch mb-3">
                        <input
                          className="form-check-input"
                          type="checkbox"
                          id="waiversEnabled"
                          checked={settings.waiversEnabled}
                          onChange={(e) => {
                            setSettings((prev: LeagueSettings) => ({
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
                          type="button"
                          className="btn btn-warning"
                          onClick={() => {
                            if (window.confirm('Process all pending waiver claims?')) {
                              setLoading(true);
                              processWaivers(leagueId.toString())
                                .then(() => setSuccess('Waivers processed successfully'))
                                .catch((err) => setError(err instanceof Error ? err.message : 'Failed to process waivers'))
                                .finally(() => setLoading(false));
                            }
                          }}
                          disabled={loading}
                        >
                          Process Waivers
                        </button>
                      )}
                    </div>
                  </>
                )}

                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={loading}
                >
                  {loading ? "Saving..." : "Save Settings"}
                </button>

                {/* League Deletion Section */}
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
              </form>
            </div>
          </div>
        </div>

        {/* Right Column - League Members and Season Progress */}
        <div className="col-md-4">
          <div className="card">
            <div className="card-header d-flex justify-content-between align-items-center">
              <h4 className="h5 mb-0">League Members</h4>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => setShowInviteDialog(true)}
              >
                Send Invite
              </button>
            </div>
            <div className="card-body p-0">
              {Object.entries(teams).map(([teamId, team]) => (
                <LeagueMemberRow
                  key={teamId}
                  teamId={teamId}
                  team={team}
                  onEditRoster={() => setSelectedTeamId(teamId)}
                  onRemoveOwner={handleRemoveOwner}
                  onRemoveCoOwner={handleRemoveCoOwner}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Dialogs */}
      {selectedTeamId && (
        <CommissionerTeamEditDialog 
          league={league}
          leagueId={leagueId}
          teamId={selectedTeamId}
          onClose={() => setSelectedTeamId(null)}
        />
      )}

      <InviteDialog 
        league={league}
        show={showInviteDialog}
        onClose={() => setShowInviteDialog(false)}
      />
    </>
  );
};

export default LeagueSettingsTab;

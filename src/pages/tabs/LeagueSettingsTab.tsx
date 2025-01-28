import React, { useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../../firebase/config";
import type { League, LeagueSettings } from "../../types";
import TeamEditor from "../../components/dialogs/TeamEditorDialog";

interface LeagueSettingsTabProps {
  league: League;
  isCommissioner: boolean;
  leagueId: number;
}

const LeagueSettingsTab: React.FC<LeagueSettingsTabProps> = ({
  league,
  isCommissioner,
  leagueId,
}) => {
  // Initialize settings with defaults for playoffs if not set
  const defaultSettings = {
    ...league.settings,
    playoffs: league.settings.playoffs ?? true,
    playoffTeams: league.settings.playoffTeams ?? 4,
  };

  const [settings, setSettings] = useState<LeagueSettings>(defaultSettings);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (!isCommissioner) {
    return (
      <div className="alert alert-warning">
        Only the league commissioner can access these settings.
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
    // Basic validation rules
    if (settings.teamsLimit < Object.keys(league.teams).length) {
      setError("Teams limit cannot be less than current number of teams");
      return false;
    }

    if (
      settings.captainSlots < 0 ||
      settings.naSlots < 0 ||
      settings.brLatamSlots < 0 ||
      settings.flexSlots < 0 ||
      settings.benchSlots < 0
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
        settings: settings,
      });

      setSuccess("League settings updated successfully");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to update settings"
      );
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
                      <label className="form-label">Bench Slots</label>
                      <input
                        type="number"
                        className="form-control"
                        value={settings.benchSlots}
                        onChange={(e) => handleSettingChange(e, "benchSlots")}
                        min="0"
                        disabled={loading}
                      />
                    </div>

                    <div className="mb-3">
                      <label className="form-label">Teams Limit</label>
                      <input
                        type="number"
                        className="form-control"
                        value={settings.teamsLimit}
                        onChange={(e) => handleSettingChange(e, "teamsLimit")}
                        min={Object.keys(league.teams).length}
                        disabled={loading}
                      />
                    </div>
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

                <h5 className="mb-3">Playoff Settings</h5>
                <div className="mb-4">
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
                      disabled={loading}
                    />
                    <label
                      className="form-check-label"
                      htmlFor="playoffsEnabled"
                    >
                      Enable Playoffs
                    </label>
                  </div>

                  {settings.playoffs && (
                    <div className="mb-3">
                      <label className="form-label">
                        Number of Playoff Teams
                      </label>
                      <input
                        type="number"
                        className="form-control"
                        value={settings.playoffTeams}
                        onChange={(e) => {
                          const value = parseInt(e.target.value) || 2;
                          const maxTeams = Object.keys(league.teams).length;
                          setSettings((prev) => ({
                            ...prev,
                            playoffTeams: Math.min(
                              Math.max(2, value),
                              maxTeams
                            ),
                          }));
                        }}
                        min={2}
                        max={Object.keys(league.teams).length}
                        disabled={loading}
                      />
                      <small className="text-muted">
                        Min: 2, Max: {Object.keys(league.teams).length} teams
                      </small>
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={loading}
                >
                  {loading ? "Saving..." : "Save Settings"}
                </button>
              </form>
            </div>
          </div>
        </div>

        <div className="col-md-4">
          <div className="card">
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
        </div>
      </div>

      {/* Team Editor Section */}
      <TeamEditor league={league} leagueId={leagueId} />
    </>
  );
};

export default LeagueSettingsTab;

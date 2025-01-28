import React, { useState } from "react";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { db } from "../../firebase/config";
import { addUserToLeague } from "../../firebase/queries";
import type { LeagueSettings, CupLineup } from "../../types";

const generateEmptyLineup = (settings: LeagueSettings): CupLineup => {
  return {
    captains: Array(settings.captainSlots).fill(null),
    naSlots: Array(settings.naSlots).fill(null),
    brLatamSlots: Array(settings.brLatamSlots).fill(null),
    flexSlots: Array(settings.flexSlots).fill(null),
    bench: [],
    locked: false,
  };
};

const CreateLeagueDialog = ({
  userId,
  onLeagueCreated,
}: {
  userId: string;
  onLeagueCreated?: () => void;
}) => {
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formState, setFormState] = useState({
    name: "",
    season: "Set 13",
    settings: {
      captainSlots: 1,
      naSlots: 5,
      brLatamSlots: 1,
      flexSlots: 3,
      benchSlots: 3,
      teamsLimit: 12,
      faabBudget: 100,
      currentCup: 0,
      playoffs: false,
      playoffTeams: 4,
    },
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    if (name.startsWith("settings.")) {
      const settingName = name.split(".")[1];
      setFormState((prev) => ({
        ...prev,
        settings: {
          ...prev.settings,
          [settingName]: parseInt(value) || 0,
        },
      }));
    } else {
      setFormState((prev) => ({
        ...prev,
        [name]: value,
      }));
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);

    try {
      // Get user's display name from their document
      const userDoc = await getDoc(doc(db, "users", userId));
      const userName = userDoc.exists()
        ? userDoc.data().displayName
        : "New Team";

      // Generate a new league ID
      const leagueId = Date.now();
      const teamId = `team_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;

      // Create the commissioner's team
      const commissionerTeam = {
        teamId,
        ownerID: userId,
        coOwners: [],
        teamName: userName,
        roster: [],
        cupLineups: {
          cup1: generateEmptyLineup(formState.settings),
          cup2: generateEmptyLineup(formState.settings),
          cup3: generateEmptyLineup(formState.settings),
        },
        faabBudget: formState.settings.faabBudget,
        pendingBids: [],
      };

      // Create the league document without the teams field
      const leagueData = {
        id: leagueId,
        name: formState.name,
        creationDate: new Date().toISOString(),
        season: formState.season,
        settings: formState.settings,
        commissioner: userId,
        transactions: [],
      };

      // Create the league document
      await setDoc(doc(db, "leagues", leagueId.toString()), leagueData);

      // Create the team as a subcollection document
      await setDoc(
        doc(db, "leagues", leagueId.toString(), "teams", teamId),
        commissionerTeam
      );

      // Add league to user's leagues
      await addUserToLeague(userId, leagueId.toString());

      // Close the dialog and reset form
      setShow(false);
      onLeagueCreated?.();
      setFormState({
        name: "",
        season: "Set 13",
        settings: {
          captainSlots: 1,
          naSlots: 5,
          brLatamSlots: 1,
          flexSlots: 3,
          benchSlots: 3,
          teamsLimit: 12,
          faabBudget: 100,
          currentCup: 0,
          playoffs: false,
          playoffTeams: 4,
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create league");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button className="btn btn-primary w-100" onClick={() => setShow(true)}>
        Create New League
      </button>

      {show && (
        <div
          className="modal fade show d-block"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
        >
          <div className="modal-dialog modal-lg">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Create New League</h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => setShow(false)}
                  aria-label="Close"
                ></button>
              </div>

              <div className="modal-body">
                {error && <div className="alert alert-danger">{error}</div>}

                <div className="mb-3">
                  <label className="form-label">League Name</label>
                  <input
                    type="text"
                    className="form-control"
                    name="name"
                    value={formState.name}
                    onChange={handleInputChange}
                    placeholder="Enter league name"
                  />
                </div>

                <div className="mb-3">
                  <label className="form-label">Teams</label>
                  <input
                    type="number"
                    className="form-control"
                    name="settings.teamsLimit"
                    value={formState.settings.teamsLimit}
                    onChange={handleInputChange}
                    min="2"
                  />
                </div>

                <div className="mb-3">
                  <label className="form-label">Set</label>
                  <select
                    className="form-select"
                    name="season"
                    value={formState.season}
                    onChange={(e) =>
                      setFormState((prev) => ({
                        ...prev,
                        season: e.target.value,
                      }))
                    }
                  >
                    <option value="Set 13">Set 13</option>
                    <option value="Set 14">Set 14</option>
                    <option value="Set 15">Set 15</option>
                    <option value="Set 16">Set 16</option>
                  </select>
                </div>

                <h6 className="mb-3">Roster Settings</h6>
                <div className="row g-3 mb-4">
                  <div className="col-md-6">
                    <label className="form-label">Captain Slots</label>
                    <input
                      type="number"
                      className="form-control"
                      name="settings.captainSlots"
                      value={formState.settings.captainSlots}
                      onChange={handleInputChange}
                      min="0"
                    />
                    <small className="text-muted">
                      Players get 1.5x points in captain slots
                    </small>
                  </div>

                  <div className="col-md-6">
                    <label className="form-label">NA Slots</label>
                    <input
                      type="number"
                      className="form-control"
                      name="settings.naSlots"
                      value={formState.settings.naSlots}
                      onChange={handleInputChange}
                      min="0"
                    />
                  </div>

                  <div className="col-md-6">
                    <label className="form-label">BR/LATAM Slots</label>
                    <input
                      type="number"
                      className="form-control"
                      name="settings.brLatamSlots"
                      value={formState.settings.brLatamSlots}
                      onChange={handleInputChange}
                      min="0"
                    />
                  </div>

                  <div className="col-md-6">
                    <label className="form-label">Flex Slots</label>
                    <input
                      type="number"
                      className="form-control"
                      name="settings.flexSlots"
                      value={formState.settings.flexSlots}
                      onChange={handleInputChange}
                      min="0"
                    />
                    <small className="text-muted">
                      Can be filled by any player
                    </small>
                  </div>

                  <div className="col-md-6">
                    <label className="form-label">Bench Slots</label>
                    <input
                      type="number"
                      className="form-control"
                      name="settings.benchSlots"
                      value={formState.settings.benchSlots}
                      onChange={handleInputChange}
                      min="0"
                    />
                  </div>

                  <div className="col-md-6">
                    <label className="form-label">Starting FAAB Budget</label>
                    <input
                      type="number"
                      className="form-control"
                      name="settings.faabBudget"
                      value={formState.settings.faabBudget}
                      onChange={handleInputChange}
                      min="0"
                    />
                  </div>
                </div>

                <h6 className="mb-3">Playoff Settings</h6>
                <div className="row g-3 mb-4">
                  <div className="col-md-6">
                    <div className="form-check form-switch">
                      <input
                        className="form-check-input"
                        type="checkbox"
                        id="playoffsEnabled"
                        checked={formState.settings.playoffs}
                        onChange={(e) =>
                          setFormState((prev) => ({
                            ...prev,
                            settings: {
                              ...prev.settings,
                              playoffs: e.target.checked,
                            },
                          }))
                        }
                      />
                      <label
                        className="form-check-label"
                        htmlFor="playoffsEnabled"
                      >
                        Enable Playoffs
                      </label>
                    </div>
                  </div>

                  {formState.settings.playoffs && (
                    <div className="col-md-6">
                      <label className="form-label">
                        Number of Playoff Teams
                      </label>
                      <input
                        type="number"
                        className="form-control"
                        name="settings.playoffTeams"
                        value={formState.settings.playoffTeams}
                        onChange={handleInputChange}
                        min="2"
                        max={formState.settings.teamsLimit}
                      />
                      <small className="text-muted">
                        Must be between 2 and total number of teams
                      </small>
                    </div>
                  )}
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShow(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleSubmit}
                  disabled={loading || !formState.name}
                >
                  {loading ? "Creating..." : "Create League"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default CreateLeagueDialog;

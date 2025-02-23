import React, { useState, useEffect } from "react";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { db } from "../../firebase/config";
import { addUserToLeague } from "../../firebase/queries";
import type { LeagueSettings, CupLineup, LeagueType, LeaguePhase } from "../../types";
import { Plus, Minus } from 'lucide-react';
import { isRegionalsPhase } from "../../types";

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

// Add a type for slot settings
type SlotSetting = "captainSlots" | "naSlots" | "brLatamSlots" | "flexSlots";

// Helper function to check if a setting is a slot setting
const isSlotSetting = (setting: string): setting is SlotSetting => {
  return ["captainSlots", "naSlots", "brLatamSlots", "flexSlots"].includes(
    setting
  );
};

// Add interface for form settings
interface FormSettings {
  captainSlots: number;
  naSlots: number;
  brLatamSlots: number;
  flexSlots: number;
  benchSlots: number;
  teamsLimit: number;
  faabBudget: number;
  currentCup: number;
  playoffs: boolean;
  playoffTeams: number;
  tradingEnabled: boolean;
  freeAgencyEnabled: boolean;
  waiversEnabled: boolean;
}

interface FormState {
  name: string;
  type: LeagueType;
  settings: FormSettings;
}

const CreateLeagueDialog: React.FC<{
  userId: string;
  onLeagueCreated?: () => void;
}> = ({
  userId,
  onLeagueCreated,
}) => {
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentCup, setCurrentCup] = useState<number>(1);
  
  // Keep formState non-nullable with initial values
  const [formState, setFormState] = useState<FormState>({
    name: "",
    type: "season-long",
    settings: {
      captainSlots: 1,
      naSlots: 5,
      brLatamSlots: 1,
      flexSlots: 3,
      benchSlots: 3,
      teamsLimit: 12,
      faabBudget: 1000,
      currentCup: 0,
      playoffs: false,
      playoffTeams: 4,
      tradingEnabled: true,
      freeAgencyEnabled: true,
      waiversEnabled: true,
    },
  });

  // Update form state when we get the current cup
  useEffect(() => {
    const fetchCurrentCup = async () => {
      const cupDoc = await getDoc(doc(db, 'globalSettings', 'currentCup'));
      if (cupDoc.exists()) {
        const cup = cupDoc.data()?.currentCup || 1;
        setCurrentCup(cup);
        
        // If we're in regionals phase, update the form state
        if (isRegionalsPhase(cup)) {
          setFormState(prev => ({
            ...prev,
            type: 'regionals',
            settings: {
              ...prev.settings,
              captainSlots: 1,
              naSlots: 0,
              brLatamSlots: 0,
              flexSlots: 3,
              benchSlots: 0,
              faabBudget: 0,
              currentCup: cup,
              playoffs: false,
              waiversEnabled: false,
            }
          }));
        }
      }
    };
    fetchCurrentCup();
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    if (name.startsWith("settings.")) {
      const settingName = name.split(".")[1] as keyof typeof formState.settings;

      // Handle numeric slot settings
      if (isSlotSetting(settingName)) {
        const currentValue = formState.settings[settingName];
        const validatedValue = validateSlotInput(
          value,
          currentValue,
          settingName
        );
        setFormState((prev) => ({
          ...prev,
          settings: {
            ...prev.settings,
            [settingName]: validatedValue,
          },
        }));
      }
      // Handle boolean settings
      else if (settingName === "playoffs") {
        setFormState((prev) => ({
          ...prev,
          settings: {
            ...prev.settings,
            [settingName]: e.target.checked,
          },
        }));
      }
      // Handle other numeric settings
      else {
        setFormState((prev) => ({
          ...prev,
          settings: {
            ...prev.settings,
            [settingName]: parseInt(value) || 0,
          },
        }));
      }
    } else {
      setFormState((prev) => ({
        ...prev,
        [name]: value,
      }));
    }
  };

  const handleTypeChange = (newType: LeagueType) => {
    setFormState(prev => ({
      ...prev,
      type: newType,
      settings: {
        ...prev.settings,
        // Set appropriate defaults based on league type
        ...(newType === 'single-tournament' ? {
          captainSlots: 1,
          naSlots: 1,
          brLatamSlots: 1,
          flexSlots: 2,
          benchSlots: 0,
          waiversEnabled: false,
          faabBudget: 0,
          playoffs: false,
          playoffTeams: 4,
          tradingEnabled: prev.settings.tradingEnabled,
          freeAgencyEnabled: prev.settings.freeAgencyEnabled,
        } : newType === 'regionals' ? {
          captainSlots: 1,
          naSlots: 0,
          brLatamSlots: 0,
          flexSlots: 3,
          benchSlots: 0,
          waiversEnabled: false,
          faabBudget: 0,
          playoffs: false,
          playoffTeams: 4,
          tradingEnabled: prev.settings.tradingEnabled,
          freeAgencyEnabled: prev.settings.freeAgencyEnabled,
        } : {
          // Full season defaults
          captainSlots: 1,
          naSlots: 5,
          brLatamSlots: 1,
          flexSlots: 3,
          benchSlots: 3,
          waiversEnabled: true,
          faabBudget: 1000,
          playoffs: prev.settings.playoffs,
          playoffTeams: prev.settings.playoffTeams,
          tradingEnabled: prev.settings.tradingEnabled,
          freeAgencyEnabled: prev.settings.freeAgencyEnabled,
        })
      }
    }));
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);

    try {
      // Calculate total starting slots
      const totalStartingSlots = 
        Number(formState.settings.captainSlots) +
        Number(formState.settings.naSlots) +
        Number(formState.settings.brLatamSlots) +
        Number(formState.settings.flexSlots);

      if (totalStartingSlots > 20) {
        throw new Error('Total number of starting slots cannot exceed 20');
      }

      // Get current cup and set from global settings
      const [cupDoc, currentSetDoc] = await Promise.all([
        getDoc(doc(db, 'globalSettings', 'currentCup')),
        getDoc(doc(db, 'globalSettings', 'currentSet'))
      ]);

      const globalCup = cupDoc.exists() ? cupDoc.data()?.currentCup : 1;
      const currentSet = currentSetDoc.exists() ? currentSetDoc.data()?.set : "Set 13";

      // Force regionals league type during Cup 4
      if (isRegionalsPhase(globalCup)) {
        formState.type = 'regionals';
      }

      // Use the current cup for all leagues
      const settings = {
        ...formState.settings,
        currentCup: globalCup,
      };

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
          cup1: generateEmptyLineup(settings),
          cup2: generateEmptyLineup(settings),
          cup3: generateEmptyLineup(settings),
        },
        faabBudget: settings.faabBudget,
        pendingBids: [],
      };

      // Create the league document
      const leagueData = {
        id: leagueId,
        name: formState.name,
        creationDate: new Date().toISOString(),
        season: currentSet,
        type: formState.type as LeagueType,
        leagueType: formState.type as LeagueType,
        phase: 'drafting' as LeaguePhase,
        settings: {
          ...formState.settings,
          currentCup: globalCup,
        },
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
        type: "season-long" as LeagueType,
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
          tradingEnabled: true,
          freeAgencyEnabled: true,
          waiversEnabled: true,
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create league');
    } finally {
      setLoading(false);
    }
  };

  // Update the validateSlotInput function to ensure we're working with numbers
  const validateSlotInput = (
    value: string,
    currentValue: number,
    field: SlotSetting
  ): number => {
    const newValue = parseInt(value) || 0;
    const otherSlots = (
      Number(formState.settings.captainSlots) +
      Number(formState.settings.naSlots) +
      Number(formState.settings.brLatamSlots) +
      Number(formState.settings.flexSlots) -
      Number(formState.settings[field])
    );

    if (otherSlots + newValue > 20) {
      return currentValue;
    }
    return newValue;
  };

  const updateSlotCount = (
    slotType: keyof typeof formState.settings,
    increment: boolean,
    setFormState: React.Dispatch<React.SetStateAction<typeof formState>>
  ) => {
    setFormState(prev => ({
      ...prev,
      settings: {
        ...prev.settings,
        [slotType]: Math.min(
          slotType === 'benchSlots' ? Infinity : 10,
          Math.max(0, Number(prev.settings[slotType]) + (increment ? 1 : -1))
        )
      }
    }));
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
                  <label className="form-label">League Type</label>
                  {isRegionalsPhase(currentCup) ? (
                    <>
                      <input 
                        type="text" 
                        className="form-control" 
                        value="Regionals League" 
                        disabled 
                      />
                      <small className="text-muted">
                        During Regionals (Americas Golden Spatula), only Regionals leagues can be created. 
                        These leagues are restricted to players who have qualified for Regionals.
                      </small>
                    </>
                  ) : (
                    <>
                      <select
                        className="form-select"
                        value={formState.type}
                        onChange={(e) => handleTypeChange(e.target.value as LeagueType)}
                      >
                        <option value="season-long">Full Season</option>
                        <option value="single-tournament">Single Tournament</option>
                      </select>
                      <small className="text-muted">
                        {formState.type === 'season-long' 
                          ? 'Compete over the entire TFT set. Carefully manage your lineup, make trades, and pick up free agents to try and come out on top at the end!'
                          : 'Draft a team and score based on just the results of the upcoming tournament. No long term commitment!'}
                      </small>
                    </>
                  )}
                </div>

                <div className="mb-3">
                  <div className="form-check">
                    <input
                      type="checkbox"
                      className="form-check-input"
                      id="tradingEnabled"
                      name="settings.tradingEnabled"
                      checked={formState.settings.tradingEnabled}
                      onChange={(e) => setFormState(prev => ({
                        ...prev,
                        settings: {
                          ...prev.settings,
                          tradingEnabled: e.target.checked
                        }
                      }))}
                    />
                    <label className="form-check-label" htmlFor="tradingEnabled">
                      Enable Trading
                    </label>
                  </div>
                  <small className="text-muted d-block mt-1">
                    Allow team owners to propose and accept trades with other teams.
                  </small>
                </div>

                <div className="mb-3">
                  <div className="form-check">
                    <input
                      type="checkbox"
                      className="form-check-input"
                      id="freeAgencyEnabled"
                      name="settings.freeAgencyEnabled"
                      checked={formState.settings.freeAgencyEnabled}
                      onChange={(e) => setFormState(prev => ({
                        ...prev,
                        settings: {
                          ...prev.settings,
                          freeAgencyEnabled: e.target.checked
                        }
                      }))}
                    />
                    <label className="form-check-label" htmlFor="freeAgencyEnabled">
                      Enable Free Agency
                    </label>
                  </div>
                  <small className="text-muted d-block mt-1">
                    Allow teams to add un-owned players to their roster. You can have a FAAB bidding system, or simply do first come first served.
                    In Single Tournament leagues, FAAB is disabled (all Free Agents are first come first served).
                  </small>
                </div>

                {formState.type === 'season-long' && (
                  <div className="mb-3">
                    <div className="form-check">
                      <input
                        type="checkbox"
                        className="form-check-input"
                        id="playoffs"
                        name="settings.playoffs"
                        checked={formState.settings.playoffs}
                        onChange={(e) => setFormState(prev => ({
                          ...prev,
                          settings: {
                            ...prev.settings,
                            playoffs: e.target.checked
                          }
                        }))}
                      />
                      <label className="form-check-label" htmlFor="playoffs">
                        Enable Playoffs
                      </label>
                    </div>
                    <small className="text-muted d-block mt-1">
                      After the final Tactician's Cup, top teams compete based on the results of the Americas Golden Spatula (Regionals).
                      If this option is not enabled, the winner will be determined by the standings at the end of the last Tactician's Cup instead.
                    </small>
                    
                    {formState.settings.playoffs && (
                      <div className="mt-2">
                        <label className="form-label">Number of Playoff Teams</label>
                        <input
                          type="number"
                          className="form-control"
                          name="settings.playoffTeams"
                          value={formState.settings.playoffTeams}
                          onChange={handleInputChange}
                          min="2"
                          max={formState.settings.teamsLimit}
                        />
                      </div>
                    )}
                  </div>
                )}

                <h6 className="mb-3">Roster Settings</h6>
                <div className="row g-3 mb-4">
                  <div className="col-md-6">
                    <div className="d-flex align-items-center justify-content-between mb-2">
                      <label className="form-label mb-0">Captain Slots</label>
                      <div className="input-group" style={{ width: 'auto' }}>
                        <button
                          type="button"
                          className="btn btn-outline-secondary"
                          onClick={() => updateSlotCount('captainSlots', false, setFormState)}
                        >
                          <Minus size={16} />
                        </button>
                        <span className="input-group-text" style={{ minWidth: '40px' }}>
                          {formState.settings.captainSlots}
                        </span>
                        <button
                          type="button"
                          className="btn btn-outline-secondary"
                          onClick={() => updateSlotCount('captainSlots', true, setFormState)}
                        >
                          <Plus size={16} />
                        </button>
                      </div>
                    </div>
                    <small className="text-muted">
                      Can be filled by a player from any region, and boosts their score by 1.5x
                    </small>
                  </div>

                  <div className="col-md-6">
                    <div className="d-flex align-items-center justify-content-between mb-2">
                      <label className="form-label mb-0">NA Slots</label>
                      <div className="input-group" style={{ width: 'auto' }}>
                        <button
                          type="button"
                          className="btn btn-outline-secondary"
                          onClick={() => updateSlotCount('naSlots', false, setFormState)}
                        >
                          <Minus size={16} />
                        </button>
                        <span className="input-group-text" style={{ minWidth: '40px' }}>
                          {formState.settings.naSlots}
                        </span>
                        <button
                          type="button"
                          className="btn btn-outline-secondary"
                          onClick={() => updateSlotCount('naSlots', true, setFormState)}
                        >
                          <Plus size={16} />
                        </button>
                      </div>
                    </div>
                    <small className="text-muted">
                      Must be filled by an NA player
                    </small>
                  </div>

                  <div className="col-md-6">
                    <div className="d-flex align-items-center justify-content-between mb-2">
                      <label className="form-label mb-0">BR/LATAM Slots</label>
                      <div className="input-group" style={{ width: 'auto' }}>
                        <button
                          type="button"
                          className="btn btn-outline-secondary"
                          onClick={() => updateSlotCount('brLatamSlots', false, setFormState)}
                        >
                          <Minus size={16} />
                        </button>
                        <span className="input-group-text" style={{ minWidth: '40px' }}>
                          {formState.settings.brLatamSlots}
                        </span>
                        <button
                          type="button"
                          className="btn btn-outline-secondary"
                          onClick={() => updateSlotCount('brLatamSlots', true, setFormState)}
                        >
                          <Plus size={16} />
                        </button>
                      </div>
                    </div>
                    <small className="text-muted">
                      Must be filled by a BR/LATAM player
                    </small>
                  </div>

                  <div className="col-md-6">
                    <div className="d-flex align-items-center justify-content-between mb-2">
                      <label className="form-label mb-0">Flex Slots</label>
                      <div className="input-group" style={{ width: 'auto' }}>
                        <button
                          type="button"
                          className="btn btn-outline-secondary"
                          onClick={() => updateSlotCount('flexSlots', false, setFormState)}
                        >
                          <Minus size={16} />
                        </button>
                        <span className="input-group-text" style={{ minWidth: '40px' }}>
                          {formState.settings.flexSlots}
                        </span>
                        <button
                          type="button"
                          className="btn btn-outline-secondary"
                          onClick={() => updateSlotCount('flexSlots', true, setFormState)}
                        >
                          <Plus size={16} />
                        </button>
                      </div>
                    </div>
                    <small className="text-muted">
                      Can be filled by a player from any region
                    </small>
                  </div>

                  <div className="col-md-6">
                    <div className="d-flex align-items-center justify-content-between mb-2">
                      <label className="form-label mb-0">Bench Slots</label>
                      <div className="input-group" style={{ width: 'auto' }}>
                        <button
                          type="button"
                          className="btn btn-outline-secondary"
                          onClick={() => updateSlotCount('benchSlots', false, setFormState)}
                        >
                          <Minus size={16} />
                        </button>
                        <span className="input-group-text" style={{ minWidth: '40px' }}>
                          {formState.settings.benchSlots}
                        </span>
                        <button
                          type="button"
                          className="btn btn-outline-secondary"
                          onClick={() => updateSlotCount('benchSlots', true, setFormState)}
                        >
                          <Plus size={16} />
                        </button>
                      </div>
                    </div>
                    <small className="text-muted">
                      Bench slots allow you to store players for the future, but they do not score any points.
                      Not recommended for Single Tournament or Regionals Leagues.
                    </small>
                  </div>

                  {/* Only show FAAB for season-long leagues with free agency enabled */}
                  {formState.type === 'season-long' && formState.settings.freeAgencyEnabled && (
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
                      <small className="text-muted">
                        Free Agent Acquisition Budget (FAAB) is used to bid on available players. 
                        All teams start with the same budget and must manage it throughout the season.
                      </small>
                    </div>
                  )}
                </div>

                {/* Add total slots counter and error message above the footer */}
                <div className="modal-footer">
                  {error && <div className="alert alert-danger mb-3">{error}</div>}
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
        </div>
      )}
    </>
  );
};

export default CreateLeagueDialog;

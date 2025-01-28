import type { LeagueSettings, Team } from "../types";

export const getTotalRosterLimit = (settings: LeagueSettings): number => {
  return (
    settings.captainSlots +
    settings.naSlots +
    settings.brLatamSlots +
    settings.flexSlots +
    settings.benchSlots
  );
};

export const isRosterAtCapacity = (team: Team, settings: LeagueSettings): boolean => {
  return team.roster.length >= getTotalRosterLimit(settings);
};

export const getRosterSpotsAvailable = (team: Team, settings: LeagueSettings): number => {
  const limit = getTotalRosterLimit(settings);
  return Math.max(0, limit - team.roster.length);
};
import { playerById } from '../data/teams';
import type { TeamDef } from '../data/types';
import { load, save } from './storage';

const KEY = 'nba-legends:dream-teams';

export const MIN_ROSTER = 5;
export const MAX_ROSTER = 13;

export interface DreamTeam {
  id: string;
  name: string;
  abbr: string;
  primary: string;
  secondary: string;
  playerIds: string[]; // first 5 are starters
}

export function listDreamTeams(): DreamTeam[] {
  return load<DreamTeam[]>(KEY, []);
}

export function saveDreamTeam(team: DreamTeam): void {
  const all = listDreamTeams();
  const i = all.findIndex((t) => t.id === team.id);
  if (i >= 0) all[i] = team;
  else all.push(team);
  save(KEY, all);
}

export function deleteDreamTeam(id: string): void {
  save(
    KEY,
    listDreamTeams().filter((t) => t.id !== id),
  );
}

export function newDreamTeamId(): string {
  return `dream-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function abbrFromName(name: string): string {
  const letters = name.replace(/[^A-Za-z ]/g, '').trim();
  const words = letters.split(/\s+/).filter(Boolean);
  const a = words.length >= 2 ? words.map((w) => w[0]).join('') : letters;
  return (a || 'DRM').slice(0, 3).toUpperCase();
}

/** Turn a saved dream team into a playable team. Unknown player ids are skipped. */
export function dreamToTeamDef(d: DreamTeam): TeamDef {
  const players = d.playerIds.map(playerById).filter((p): p is NonNullable<typeof p> => !!p);
  return {
    id: d.id,
    label: d.name,
    name: d.name,
    season: 'Dream Team',
    abbr: d.abbr,
    primary: d.primary,
    secondary: d.secondary,
    players,
    dream: true,
  };
}

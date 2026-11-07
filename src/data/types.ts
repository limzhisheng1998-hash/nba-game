export type Position = 'PG' | 'SG' | 'SF' | 'PF' | 'C';

/** All ratings are 25–99, like 2K attributes. */
export interface Ratings {
  inside: number; // layups, dunks, close shots
  mid: number; // mid-range jumpers
  three: number;
  ft: number;
  pass: number;
  handle: number;
  speed: number;
  strength: number;
  perD: number; // perimeter defense
  intD: number; // interior defense
  steal: number;
  block: number;
  reb: number;
  stamina: number;
}

export interface PlayerDef {
  id: string; // unique: `${teamId}:${slug}`
  name: string;
  pos: Position;
  num: string;
  ovr: number;
  heightIn: number;
  r: Ratings;
  teamId: string; // legendary team the card comes from
  era: string; // e.g. "'98 Bulls"
}

export interface TeamDef {
  id: string;
  label: string; // "'98 Bulls"
  name: string; // "Chicago Bulls"
  season: string; // "1997-98"
  abbr: string; // "CHI"
  primary: string;
  secondary: string;
  players: PlayerDef[]; // first 5 are starters
  dream?: boolean;
}

export type Difficulty = 'rookie' | 'pro' | 'allstar' | 'superstar' | 'hof';
export type QuarterMinutes = 3 | 5 | 10;

export interface Settings {
  difficulty: Difficulty;
  quarterMinutes: QuarterMinutes;
  autoSubs: boolean;
  shotMeter: boolean;
}

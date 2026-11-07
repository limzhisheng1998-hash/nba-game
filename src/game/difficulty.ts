import type { Difficulty } from '../data/types';

export interface DifficultyParams {
  label: string;
  /** Added to the user's make chance. */
  userShot: number;
  /** Added to the AI's make chance. */
  aiShot: number;
  /** Width of the green release window on the shot meter (0–1 of meter). */
  green: number;
  /** Seconds between AI ball-handler decisions (lower = smarter/faster). */
  aiReact: number;
  /** AI on-ball steal aggression (0–1). */
  aiSteal: number;
  /** Chance an AI defender rotates to help on a drive (0–1). */
  aiHelp: number;
  /** How often AI defenders get called for fouls (multiplier). */
  aiFoul: number;
  /** AI movement speed multiplier. */
  aiSpeed: number;
  /** AI block / contest effectiveness multiplier. */
  aiBlock: number;
}

export const DIFFICULTIES: Record<Difficulty, DifficultyParams> = {
  rookie: { label: 'Rookie', userShot: 0.1, aiShot: -0.1, green: 0.17, aiReact: 0.95, aiSteal: 0.2, aiHelp: 0.2, aiFoul: 1.5, aiSpeed: 0.88, aiBlock: 0.55 },
  pro: { label: 'Pro', userShot: 0.05, aiShot: -0.05, green: 0.14, aiReact: 0.75, aiSteal: 0.4, aiHelp: 0.4, aiFoul: 1.25, aiSpeed: 0.94, aiBlock: 0.75 },
  allstar: { label: 'All-Star', userShot: 0, aiShot: 0, green: 0.11, aiReact: 0.55, aiSteal: 0.6, aiHelp: 0.6, aiFoul: 1.0, aiSpeed: 1.0, aiBlock: 1.0 },
  superstar: { label: 'Superstar', userShot: -0.04, aiShot: 0.03, green: 0.085, aiReact: 0.4, aiSteal: 0.8, aiHelp: 0.8, aiFoul: 0.85, aiSpeed: 1.03, aiBlock: 1.15 },
  hof: { label: 'Hall of Fame', userShot: -0.08, aiShot: 0.06, green: 0.065, aiReact: 0.28, aiSteal: 1.0, aiHelp: 1.0, aiFoul: 0.7, aiSpeed: 1.06, aiBlock: 1.3 },
};

export const DIFFICULTY_ORDER: Difficulty[] = ['rookie', 'pro', 'allstar', 'superstar', 'hof'];

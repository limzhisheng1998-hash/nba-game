import type { Settings } from '../data/types';
import { load, save } from './storage';

const KEY = 'nba-legends:settings';

export const DEFAULT_SETTINGS: Settings = {
  difficulty: 'pro',
  quarterMinutes: 3,
  autoSubs: true,
  shotMeter: true,
};

export function loadSettings(): Settings {
  return { ...DEFAULT_SETTINGS, ...load<Partial<Settings>>(KEY, {}) };
}

export function saveSettings(s: Settings): void {
  save(KEY, s);
}

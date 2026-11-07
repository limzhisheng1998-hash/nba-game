import { describe, expect, it } from 'vitest';
import { TEAMS } from '../src/data/teams';
import type { Settings } from '../src/data/types';
import { Game, NO_INPUT } from '../src/game/game';

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const settings: Settings = { difficulty: 'allstar', quarterMinutes: 3, autoSubs: true, shotMeter: true };

function simulate(seed: number, s: Settings = settings) {
  const g = new Game(TEAMS[2], TEAMS[9], s, { userAI: true, rng: seeded(seed) });
  let steps = 0;
  const maxSteps = 60 * 60 * 60; // an hour of game time is a hang
  while (g.phase !== 'final' && steps < maxSteps) {
    if (g.phase === 'break') g.continueAfterBreak();
    g.step(1 / 60, NO_INPUT);
    steps++;
  }
  return { g, steps };
}

describe('full game simulation', () => {
  it('plays a 3-minute-quarter game to a final with realistic-ish scoring', () => {
    for (const seed of [1, 2, 3]) {
      const { g } = simulate(seed);
      expect(g.phase).toBe('final');
      expect(g.quarter).toBeGreaterThanOrEqual(4);
      const [a, b] = g.teams.map((t) => t.score);
      expect(a).not.toBe(b);
      // 12 minutes of real-time play: expect a reasonable amount of scoring.
      expect(a + b).toBeGreaterThan(20);
      expect(a + b).toBeLessThan(260);
    }
  });

  it('plays a 2-minute-quarter game with the new teams', () => {
    const ids = TEAMS.map((t) => t.id);
    const g = new Game(TEAMS[ids.indexOf('hou18')], TEAMS[ids.indexOf('sas14')], { ...settings, quarterMinutes: 2 }, { userAI: true, rng: seeded(5) });
    for (let n = 0; n < 60 * 60 * 30 && g.phase !== 'final'; n++) {
      if (g.phase === 'break') g.continueAfterBreak();
      g.step(1 / 60, NO_INPUT);
    }
    expect(g.phase).toBe('final');
    expect(g.teams[0].score + g.teams[1].score).toBeGreaterThan(10);
  });

  it('keeps box score consistent with the scoreboard', () => {
    const { g } = simulate(7);
    for (const t of g.teams) {
      const pts = t.roster.reduce((s, p) => s + p.line.pts, 0);
      expect(pts).toBe(t.score);
      const q = t.quarterScores.reduce((s, x) => s + x, 0);
      expect(q).toBe(t.score);
      for (const p of t.roster) {
        expect(p.line.fgm).toBeLessThanOrEqual(p.line.fga);
        expect(p.line.tpm).toBeLessThanOrEqual(p.line.tpa);
        expect(p.line.ftm).toBeLessThanOrEqual(p.line.fta);
        expect(p.line.pts).toBe(2 * (p.line.fgm - p.line.tpm) + 3 * p.line.tpm + p.line.ftm);
      }
    }
  });

  it('always has exactly 5 players on the court per team', () => {
    const { g } = simulate(11);
    for (const t of g.teams) {
      expect(t.court).toHaveLength(5);
      expect(new Set(t.court).size).toBe(5);
      expect(t.roster.filter((p) => p.onCourt)).toHaveLength(5);
    }
  });

  it('quarter length setting controls the game clock', () => {
    const g = new Game(TEAMS[0], TEAMS[1], { ...settings, quarterMinutes: 10 }, { userAI: true });
    expect(g.clock).toBe(600);
    const g5 = new Game(TEAMS[0], TEAMS[1], { ...settings, quarterMinutes: 5 }, { userAI: true });
    expect(g5.clock).toBe(300);
    const g2 = new Game(TEAMS[0], TEAMS[1], { ...settings, quarterMinutes: 2 }, { userAI: true });
    expect(g2.clock).toBe(120);
  });

  it('teams swap baskets at halftime', () => {
    const g = new Game(TEAMS[2], TEAMS[9], settings, { userAI: true });
    expect(g.hoopX(0)).toBeGreaterThan(47);
    let sawQ3 = false;
    for (let n = 0; n < 60 * 60 * 60 && g.phase !== 'final'; n++) {
      if (g.phase === 'break') g.continueAfterBreak();
      if (g.quarter <= 2) expect(g.hoopX(0)).toBeGreaterThan(47);
      else {
        sawQ3 = true;
        expect(g.hoopX(0)).toBeLessThan(47);
        expect(g.hoopX(1)).toBeGreaterThan(47);
      }
      g.step(1 / 60, NO_INPUT);
    }
    expect(sawQ3).toBe(true);
    for (const t of g.teams) expect(t.roster.reduce((s, p) => s + p.line.pts, 0)).toBe(t.score);
  });
});

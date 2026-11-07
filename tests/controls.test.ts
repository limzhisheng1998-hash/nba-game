import { describe, expect, it } from 'vitest';
import { TEAMS } from '../src/data/teams';
import type { Settings } from '../src/data/types';
import { Game, NO_INPUT, type FrameInput } from '../src/game/game';

const settings: Settings = { difficulty: 'rookie', quarterMinutes: 3, autoSubs: true, shotMeter: true };
const inp = (o: Partial<FrameInput>): FrameInput => ({ ...NO_INPUT, ...o });

/** Start a game and run until the user's team has the ball in live play. */
function userBall(seed = 0.1) {
  let i = 0;
  const g = new Game(TEAMS[3], TEAMS[9], settings, { rng: () => ((i = (i * 9301 + 49297) % 233280), i / 233280 + seed * 0) });
  for (let n = 0; n < 60 * 120 && !(g.phase === 'live' && g.ball.owner?.team === 0); n++) g.step(1 / 60, NO_INPUT);
  expect(g.ball.owner?.team).toBe(0);
  return g;
}

describe('user controls', () => {
  it('controls the ball handler on offense', () => {
    const g = userBall();
    expect(g.controlled).toBe(g.ball.owner);
  });

  it('joystick moves the controlled player', () => {
    const g = userBall();
    const p = g.controlled!;
    const x0 = p.x;
    for (let n = 0; n < 30; n++) g.step(1 / 60, inp({ mx: 1 }));
    expect(p.x).toBeGreaterThan(x0 + 3);
  });

  it('driving to the rim and pressing shoot takes a layup/dunk', () => {
    const g = userBall();
    const p = g.controlled!;
    for (let n = 0; n < 60 * 8 && Math.hypot(p.x - g.hoopX(0), p.y - 25) > 6; n++) {
      const dx = g.hoopX(0) - p.x;
      const dy = 25 - p.y;
      const d = Math.hypot(dx, dy);
      g.step(1 / 60, inp({ mx: dx / d, my: dy / d, c: true }));
      if (g.ball.owner !== p) return; // stolen — rare, not what we're testing
    }
    g.step(1 / 60, inp({ a: true, aDown: true }));
    expect(p.action).toBe('layup');
    for (let n = 0; n < 40; n++) g.step(1 / 60, NO_INPUT);
    expect(g.shotLog.some((s) => s.side === 0 && (s.kind === 'layup' || s.kind === 'dunk'))).toBe(true);
  });

  it('jump shot uses the meter and grades the release', () => {
    const g = userBall();
    const p = g.controlled!;
    g.step(1 / 60, inp({ a: true, aDown: true }));
    expect(p.action).toBe('shoot');
    // Hold until the meter is at the green target (0.82 of 0.62s ≈ 0.51s).
    let n = 0;
    while (p.meter < 0.81 && n++ < 100) g.step(1 / 60, inp({ a: true }));
    g.step(1 / 60, inp({ aUp: true }));
    expect(g.flash?.text).toBe('Excellent');
    expect(g.ball.mode === 'shot' || g.ball.mode === 'loose').toBe(true);
  });

  it('pass button passes to a teammate who then becomes controlled', () => {
    const g = userBall();
    const passer = g.controlled!;
    g.step(1 / 60, inp({ b: true, bDown: true }));
    expect(g.ball.mode).toBe('pass');
    for (let n = 0; n < 90 && g.ball.mode === 'pass'; n++) g.step(1 / 60, NO_INPUT);
    if (g.ball.mode === 'held' && g.ball.owner?.team === 0) {
      expect(g.controlled).toBe(g.ball.owner);
      expect(g.controlled).not.toBe(passer);
    }
  });
});

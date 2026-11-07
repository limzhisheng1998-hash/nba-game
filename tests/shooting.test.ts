import { describe, expect, it } from 'vitest';
import { DIFFICULTIES, DIFFICULTY_ORDER } from '../src/game/difficulty';
import { isThree } from '../src/game/court';
import { METER_TARGET, gradeTiming, makeChance, freeThrowChance, type ShotInput } from '../src/game/shooting';

const base: ShotInput = { kind: 'three', distFt: 24, rating: 85, contestDist: 10, contestRating: 80, contestJump: false, moving: false, stamina: 1, timing: 'none', diffMod: 0 };

describe('shot model', () => {
  it('better shooters make more', () => {
    expect(makeChance({ ...base, rating: 95 })).toBeGreaterThan(makeChance({ ...base, rating: 60 }));
  });
  it('contests lower the chance', () => {
    const open = makeChance(base);
    expect(makeChance({ ...base, contestDist: 3.5 })).toBeLessThan(open);
    expect(makeChance({ ...base, contestDist: 1.5, contestJump: true })).toBeLessThan(makeChance({ ...base, contestDist: 3.5 }));
  });
  it('an excellent release on an open look is near-automatic', () => {
    expect(makeChance({ ...base, rating: 60, timing: 'excellent' })).toBeGreaterThanOrEqual(0.88);
  });
  it('bad timing hurts', () => {
    expect(makeChance({ ...base, timing: 'veryLate' })).toBeLessThan(makeChance(base) - 0.2);
  });
  it('fatigue hurts', () => {
    expect(makeChance({ ...base, stamina: 0.3 })).toBeLessThan(makeChance(base));
  });
  it('grades timing around the target', () => {
    expect(gradeTiming(METER_TARGET, 0.1)).toBe('excellent');
    expect(gradeTiming(METER_TARGET - 0.08, 0.1)).toBe('good');
    expect(gradeTiming(METER_TARGET - 0.18, 0.1)).toBe('slightlyEarly');
    expect(gradeTiming(METER_TARGET + 0.5, 0.1)).toBe('veryLate');
  });
  it('free throws track the FT rating', () => {
    expect(freeThrowChance(95, 'none', 0)).toBeGreaterThan(0.85);
    expect(freeThrowChance(50, 'none', 0)).toBeLessThan(0.65);
  });
});

describe('difficulty', () => {
  it('gets harder for the user at every step', () => {
    for (let i = 1; i < DIFFICULTY_ORDER.length; i++) {
      const a = DIFFICULTIES[DIFFICULTY_ORDER[i - 1]];
      const b = DIFFICULTIES[DIFFICULTY_ORDER[i]];
      expect(b.userShot).toBeLessThan(a.userShot);
      expect(b.aiShot).toBeGreaterThan(a.aiShot);
      expect(b.green).toBeLessThan(a.green);
      expect(b.aiReact).toBeLessThan(a.aiReact);
    }
  });
});

describe('court', () => {
  it('knows three-pointers', () => {
    expect(isThree(5.25 + 25, 25, 5.25)).toBe(true);
    expect(isThree(5.25 + 15, 25, 5.25)).toBe(false);
    expect(isThree(3, 1, 5.25)).toBe(true); // corner three
    expect(isThree(94 - 30, 25, 94 - 5.25)).toBe(true);
  });
});

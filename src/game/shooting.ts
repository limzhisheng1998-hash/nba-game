/** Pure shot-make model. No game state, so it is easy to unit test and tune. */

export type ShotKind = 'dunk' | 'layup' | 'close' | 'mid' | 'three';
export type TimingGrade = 'excellent' | 'good' | 'slightlyEarly' | 'slightlyLate' | 'veryEarly' | 'veryLate' | 'none';

export const TIMING_LABEL: Record<TimingGrade, string> = {
  excellent: 'Excellent',
  good: 'Good',
  slightlyEarly: 'Slightly Early',
  slightlyLate: 'Slightly Late',
  veryEarly: 'Very Early',
  veryLate: 'Very Late',
  none: '',
};

/** Shot meter target position (fraction of the meter). */
export const METER_TARGET = 0.82;

/**
 * Grade a release. `release` is how far the meter filled (0..~1.2),
 * `window` the green window width from difficulty (± window/2 is green).
 */
export function gradeTiming(release: number, window: number): TimingGrade {
  const d = release - METER_TARGET;
  const a = Math.abs(d);
  if (a <= window / 2) return 'excellent';
  if (a <= window) return 'good';
  if (a <= window * 2.2) return d < 0 ? 'slightlyEarly' : 'slightlyLate';
  return d < 0 ? 'veryEarly' : 'veryLate';
}

const TIMING_BONUS: Record<TimingGrade, number> = {
  excellent: 0.3,
  good: 0.06,
  slightlyEarly: -0.08,
  slightlyLate: -0.08,
  veryEarly: -0.28,
  veryLate: -0.28,
  none: 0,
};

export function shotKind(distFt: number, three: boolean, canDunk: boolean): ShotKind {
  if (three) return 'three';
  if (distFt < 4.5 && canDunk) return 'dunk';
  if (distFt < 6.5) return 'layup';
  if (distFt < 11) return 'close';
  return 'mid';
}

export interface ShotInput {
  kind: ShotKind;
  distFt: number;
  /** Shooter rating for this kind of shot (inside / mid / three). */
  rating: number;
  /** Distance to closest defender in feet (Infinity if none). */
  contestDist: number;
  /** Closest defender's relevant defense rating. */
  contestRating: number;
  /** Was the defender in the air (contesting)? */
  contestJump: boolean;
  moving: boolean;
  /** 0 (exhausted) .. 1 (fresh). */
  stamina: number;
  timing: TimingGrade;
  /** Difficulty modifier for this shooter's side. */
  diffMod: number;
}

export function makeChance(i: ShotInput): number {
  const r = i.rating;
  let p: number;
  switch (i.kind) {
    case 'dunk':
      p = 0.78 + (r - 50) * 0.004;
      break;
    case 'layup':
      p = 0.5 + (r - 50) * 0.0075;
      break;
    case 'close':
      p = 0.4 + (r - 50) * 0.0065;
      break;
    case 'mid':
      p = 0.3 + (r - 50) * 0.0058 - Math.max(0, i.distFt - 16) * 0.004;
      break;
    case 'three':
      p = 0.27 + (r - 50) * 0.0055 - Math.max(0, i.distFt - 25) * 0.03;
      break;
  }

  // Contest: closer and better defenders hurt more. Jumping contests hurt more.
  const dq = 0.55 + i.contestRating / 220; // ~0.8–1.0
  const jump = i.contestJump ? 1.35 : 1;
  const inside = i.kind === 'dunk' || i.kind === 'layup';
  if (i.contestDist < 2.5) p -= (inside ? 0.14 : 0.18) * dq * jump;
  else if (i.contestDist < 4.5) p -= (inside ? 0.07 : 0.1) * dq * jump;
  else if (i.contestDist < 6.5) p -= 0.05 * dq;

  if (i.moving && !inside) p -= 0.06;
  p -= (1 - i.stamina) * 0.14;

  if (!inside) p += TIMING_BONUS[i.timing];
  else if (i.timing !== 'none') p += TIMING_BONUS[i.timing] * 0.3;

  p += i.diffMod;
  // An excellent release on an open look is close to automatic, like a 2K "green".
  if (i.timing === 'excellent' && i.contestDist > 4.5) p = Math.max(p, 0.88);
  return Math.max(0.02, Math.min(0.97, p));
}

export function freeThrowChance(ft: number, timing: TimingGrade, diffMod: number): number {
  const p = 0.2 + ft * 0.0075 + TIMING_BONUS[timing] * 0.6 + diffMod * 0.5;
  return Math.max(0.05, Math.min(0.98, timing === 'excellent' ? Math.max(p, 0.95) : p));
}

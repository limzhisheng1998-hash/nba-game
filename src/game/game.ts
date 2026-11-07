import type { PlayerDef, Settings, TeamDef } from '../data/types';
import { COURT_L, COURT_W, FT_DIST, HOOP_OFFSET, LEFT_HOOP, RIGHT_HOOP, RIM_HEIGHT, dist, isThree } from './court';
import { DIFFICULTIES, type DifficultyParams } from './difficulty';
import {
  METER_TARGET,
  TIMING_LABEL,
  freeThrowChance,
  gradeTiming,
  makeChance,
  shotKind,
  type ShotKind,
  type TimingGrade,
} from './shooting';

export type Side = 0 | 1;
export type Phase = 'tipoff' | 'inbound' | 'live' | 'ft' | 'break' | 'final';

/** One frame of player input. Buttons: a = shoot/block, b = pass/steal, c = sprint, d = spin/switch. */
export interface FrameInput {
  mx: number;
  my: number;
  a: boolean;
  b: boolean;
  c: boolean;
  d: boolean;
  aDown: boolean;
  aUp: boolean;
  bDown: boolean;
  dDown: boolean;
}

export const NO_INPUT: FrameInput = { mx: 0, my: 0, a: false, b: false, c: false, d: false, aDown: false, aUp: false, bDown: false, dDown: false };

export interface Line {
  pts: number;
  reb: number;
  oreb: number;
  ast: number;
  stl: number;
  blk: number;
  fgm: number;
  fga: number;
  tpm: number;
  tpa: number;
  ftm: number;
  fta: number;
  tov: number;
  pf: number;
}

const emptyLine = (): Line => ({ pts: 0, reb: 0, oreb: 0, ast: 0, stl: 0, blk: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, tov: 0, pf: 0 });

type Action = 'none' | 'shoot' | 'layup' | 'jump' | 'stunned' | 'spin' | 'ftshoot';

export class Player {
  x = 0;
  y = 0;
  z = 0;
  vx = 0;
  vy = 0;
  vz = 0;
  dvx = 0;
  dvy = 0;
  faceX = 1;
  faceY = 0;
  sprint = false;
  stamina = 1;
  onCourt = false;
  slot = 0;
  fouls = 0;
  line = emptyLine();
  action: Action = 'none';
  actionT = 0;
  meter = 0;
  stealCd = 0;
  spinCd = 0;
  decideT = 0;
  holdT = 0;
  cutT = 0;
  cutX = 0;
  cutY = 0;
  screenT = 0;
  driveX = 0;
  driveY = 0;
  contestedShot = -1;
  constructor(
    public def: PlayerDef,
    public team: Side,
  ) {}
  get heightFt() {
    return this.def.heightIn / 12;
  }
  get r() {
    return this.def.r;
  }
}

interface ShotInfo {
  id: number;
  shooter: Player;
  sx: number;
  sy: number;
  sz: number;
  ex: number;
  ey: number;
  t: number;
  dur: number;
  arc: number;
  made: boolean;
  pts: 1 | 2 | 3;
  kind: ShotKind | 'ft';
  fouled: boolean;
  assist: Player | null;
  dropT: number;
}

interface PassInfo {
  from: Player;
  to: Player;
  sx: number;
  sy: number;
  ex: number;
  ey: number;
  t: number;
  dur: number;
  arc: number;
  intercept: boolean;
}

export type BallMode = 'held' | 'pass' | 'shot' | 'loose';

export class Ball {
  x = COURT_L / 2;
  y = COURT_W / 2;
  z = 3;
  vx = 0;
  vy = 0;
  vz = 0;
  mode: BallMode = 'held';
  owner: Player | null = null;
  lastTeam: Side = 0;
  fromShot: Player | null = null; // shooter, if this loose ball is a rebound
  shot: ShotInfo | null = null;
  pass: PassInfo | null = null;
}

export interface TeamRT {
  def: TeamDef;
  roster: Player[];
  court: Player[];
  starters: Player[];
  score: number;
  teamFouls: number;
  quarterScores: number[];
}

export interface Toast {
  text: string;
  color: string;
  t: number;
}

export interface GameOptions {
  rng?: () => number;
  /** Let the AI control the user's team too (attract mode / tests). */
  userAI?: boolean;
}

const GRAVITY = 32;
const METER_TIME = 0.62;

export class Game {
  teams: [TeamRT, TeamRT];
  ball = new Ball();
  phase: Phase = 'tipoff';
  phaseT = 1.6;
  quarter = 1;
  clock: number;
  shotClock = 24;
  offense: Side = 0;
  readonly user: Side = 0;
  controlled: Player | null = null;
  toasts: Toast[] = [];
  /** Every field-goal attempt, for shot charts and tuning. */
  shotLog: { side: Side; x: number; y: number; kind: ShotKind; chance: number; made: boolean; contest: number }[] = [];
  flash: { text: string; color: string; t: number } | null = null;
  time = 0;
  diff: DifficultyParams;
  quarterLen: number;
  tipWinner: Side = 0;
  private shotId = 0;
  private ft: { shooter: Player; left: number; waitT: number } | null = null;
  private lastPass: { passer: Player; to: Player; time: number } | null = null;
  private buzzer = false;
  private rng: () => number;
  userAI: boolean;

  constructor(
    home: TeamDef,
    away: TeamDef,
    public settings: Settings,
    opts: GameOptions = {},
  ) {
    this.rng = opts.rng ?? Math.random;
    this.userAI = !!opts.userAI;
    this.diff = DIFFICULTIES[settings.difficulty];
    this.quarterLen = settings.quarterMinutes * 60;
    this.clock = this.quarterLen;
    this.teams = [this.makeTeam(home, 0), this.makeTeam(away, 1)];
    this.placeFormation(true);
  }

  private makeTeam(def: TeamDef, side: Side): TeamRT {
    const roster = def.players.map((p) => new Player(p, side));
    const court = roster.slice(0, 5);
    court.forEach((p, i) => {
      p.onCourt = true;
      p.slot = i;
    });
    return { def, roster, court, starters: [...court], score: 0, teamFouls: 0, quarterScores: [0] };
  }

  // ---------- geometry helpers ----------

  hoopX(side: Side) {
    return side === 0 ? RIGHT_HOOP.x : LEFT_HOOP.x;
  }
  dir(side: Side) {
    return side === 0 ? 1 : -1;
  }
  /** Floor spots for the offense, in feet from the attacking baseline. */
  private spot(side: Side, slot: number) {
    const SPOTS = [
      { u: 31, y: 25 },
      { u: 24, y: 43.5 },
      { u: 24, y: 6.5 },
      { u: 4, y: 47.3 },
      { u: 9, y: 17 },
    ];
    const s = SPOTS[slot];
    return { x: side === 0 ? COURT_L - s.u : s.u, y: s.y };
  }
  private opp(side: Side): Side {
    return side === 0 ? 1 : 0;
  }
  onCourt(): Player[] {
    return [...this.teams[0].court, ...this.teams[1].court];
  }
  isUserControlled(p: Player) {
    return !this.userAI && p === this.controlled;
  }
  private isAITeam(side: Side) {
    return this.userAI || side !== this.user;
  }

  toast(text: string, color = '#fff') {
    this.toasts.push({ text, color, t: 2.2 });
    if (this.toasts.length > 3) this.toasts.shift();
  }

  // ---------- main step ----------

  step(dt: number, inp: FrameInput = NO_INPUT) {
    if (this.phase === 'break' || this.phase === 'final') return;
    this.time += dt;
    for (const t of this.toasts) t.t -= dt;
    this.toasts = this.toasts.filter((t) => t.t > 0);
    if (this.flash && (this.flash.t -= dt) <= 0) this.flash = null;

    switch (this.phase) {
      case 'tipoff':
        this.phaseT -= dt;
        if (this.phaseT <= 0) this.doTipoff();
        break;
      case 'inbound':
        this.phaseT -= dt;
        this.updateControl(dt, inp, true);
        this.runAI(dt);
        if (this.phaseT <= 0) this.phase = 'live';
        break;
      case 'ft':
        this.updateFT(dt, inp);
        break;
      case 'live':
        this.updateLive(dt, inp);
        break;
    }
    const ph = this.phase as Phase;
    if (ph === 'break' || ph === 'final') return;
    this.integrate(dt);
    this.updateBall(dt);
    this.updateStamina(dt);
  }

  private updateLive(dt: number, inp: FrameInput) {
    if (this.clock > 0) {
      this.clock -= dt;
      if (this.clock <= 0) {
        this.clock = 0;
        this.buzzer = true;
      }
    }
    const b = this.ball;
    if (b.mode === 'held' || b.mode === 'pass') {
      this.shotClock -= dt;
      if (this.shotClock <= 0 && !this.buzzer) {
        this.shotClock = 0;
        const owner = b.owner ?? b.pass?.from;
        if (owner) owner.line.tov++;
        this.turnover('Shot clock violation');
        return;
      }
    }
    this.updateControl(dt, inp, false);
    this.runAI(dt);
    if (this.buzzer && this.phase === 'live' && b.mode !== 'shot') this.endQuarter();
  }

  // ---------- user control ----------

  private updateControl(dt: number, inp: FrameInput, inbound: boolean) {
    if (this.userAI) return;
    const side = this.user;
    const b = this.ball;
    const team = this.teams[side];
    if (b.mode === 'held' && b.owner && b.owner.team === side) this.controlled = b.owner;
    if (!this.controlled || !this.controlled.onCourt) this.controlled = this.nearestToBall(team.court);
    const userHasBall = b.mode === 'held' && b.owner?.team === side;
    if (inp.dDown && !userHasBall) this.switchPlayer();
    const p = this.controlled;

    // Movement
    const mag = Math.hypot(inp.mx, inp.my);
    p.sprint = inp.c && mag > 0.2;
    const sp = this.speedOf(p) * Math.min(1, mag);
    if (mag > 0.15) {
      p.dvx = (inp.mx / mag) * sp;
      p.dvy = (inp.my / mag) * sp;
    } else {
      p.dvx = 0;
      p.dvy = 0;
    }
    if (inbound && b.owner === p) {
      p.dvx = p.dvy = 0;
      return;
    }

    if (b.mode === 'held' && b.owner === p) {
      if (p.action === 'shoot') {
        p.meter += dt / METER_TIME;
        if (inp.aUp || !inp.a || p.meter >= 1.3) this.releaseShot(p, gradeTiming(p.meter, this.diff.green));
      } else if (p.action === 'none' || p.action === 'spin') {
        if (inp.aDown) this.startShot(p);
        else if (inp.bDown) {
          const target = this.aimPass(p, inp.mx, inp.my);
          if (target) this.passTo(p, target);
        } else if (inp.dDown) this.spin(p);
      }
    } else {
      if (inp.aDown) this.jump(p);
      if (inp.bDown) this.stealAttempt(p);
    }
  }

  private switchPlayer() {
    const team = this.teams[this.user].court;
    const b = this.ball;
    const sorted = [...team].sort((a, c) => dist(a.x, a.y, b.x, b.y) - dist(c.x, c.y, b.x, b.y));
    this.controlled = sorted[0] === this.controlled ? sorted[1] : sorted[0];
  }

  private nearestToBall(list: Player[]): Player {
    const b = this.ball;
    let best = list[0];
    let bd = Infinity;
    for (const p of list) {
      const d = dist(p.x, p.y, b.x, b.y);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return best;
  }

  private aimPass(p: Player, mx: number, my: number): Player | null {
    const mates = this.teams[p.team].court.filter((m) => m !== p);
    const mag = Math.hypot(mx, my);
    let best: Player | null = null;
    let bestScore = -Infinity;
    for (const m of mates) {
      const dx = m.x - p.x;
      const dy = m.y - p.y;
      const d = Math.hypot(dx, dy) || 1;
      let score: number;
      if (mag > 0.35) score = (dx * mx + dy * my) / (d * mag) - d / 150;
      else score = this.openness(m) / 10 - d / 60;
      if (score > bestScore) {
        bestScore = score;
        best = m;
      }
    }
    return best;
  }

  // ---------- actions ----------

  speedOf(p: Player) {
    let s = 13 + (p.r.speed - 50) * 0.12;
    if (p.sprint && p.stamina > 0.05) s *= 1.3;
    s *= 0.8 + 0.2 * p.stamina;
    if (this.ball.owner === p) s *= 0.92;
    if (p.action === 'spin') s *= 1.4;
    if (this.isAITeam(p.team) && p.team !== this.user) s *= this.diff.aiSpeed;
    return s;
  }

  private canDunk(p: Player) {
    return p.r.inside >= 72 && (p.def.heightIn >= 78 || (p.r.speed >= 88 && p.r.inside >= 90));
  }

  startShot(p: Player) {
    if (p.action === 'shoot' || p.action === 'layup' || p.z > 0) return;
    const hx = this.hoopX(p.team);
    const d = dist(p.x, p.y, hx, COURT_W / 2);
    if (d < 7.5) {
      p.action = 'layup';
      p.actionT = 0.42;
      p.vz = 11;
    } else {
      p.action = 'shoot';
      p.meter = 0;
      p.vz = 12;
      p.vx *= 0.3;
      p.vy *= 0.3;
    }
  }

  private releaseShot(p: Player, timing: TimingGrade) {
    const b = this.ball;
    if (b.owner !== p) return;
    const hx = this.hoopX(p.team);
    const hy = COURT_W / 2;
    const d = dist(p.x, p.y, hx, hy);
    const three = isThree(p.x, p.y, hx);
    const kind = p.action === 'layup' ? (d < 4.5 && this.canDunk(p) ? 'dunk' : 'layup') : shotKind(d, three, false);
    p.action = 'none';
    p.meter = 0;

    const rating = kind === 'three' ? p.r.three : kind === 'mid' ? p.r.mid : kind === 'close' ? (p.r.mid + p.r.inside) / 2 : p.r.inside;
    const inside = kind === 'dunk' || kind === 'layup';
    const defenders = this.teams[this.opp(p.team)].court;
    let closest: Player | null = null;
    let cd = Infinity;
    for (const df of defenders) {
      const dd = dist(df.x, df.y, p.x, p.y);
      if (dd < cd) {
        cd = dd;
        closest = df;
      }
    }
    const userShooter = !this.userAI && p.team === this.user;
    const diffMod = this.userAI ? 0 : userShooter ? this.diff.userShot : this.diff.aiShot;
    let chance = makeChance({
      kind,
      distFt: d,
      rating,
      contestDist: cd,
      contestRating: closest ? (inside ? closest.r.intD : closest.r.perD) : 50,
      contestJump: !!closest && closest.z > 0.5,
      moving: Math.hypot(p.vx, p.vy) > 5,
      stamina: p.stamina,
      timing: userShooter ? timing : 'none',
      diffMod,
    });

    if (userShooter && !inside && timing !== 'none') {
      const good = timing === 'excellent' || timing === 'good';
      this.flash = { text: TIMING_LABEL[timing], color: timing === 'excellent' ? '#3ddc84' : good ? '#ffd23f' : '#ff5a5a', t: 1.1 };
    }

    // Block?
    let blocker: Player | null = null;
    for (const df of defenders) {
      const dd = dist(df.x, df.y, p.x, p.y);
      if (dd < 3.6 && df.z > 0.6) {
        const aiMult = this.isAITeam(df.team) && df.team !== this.user ? this.diff.aiBlock : 1;
        const h = 1 + (df.def.heightIn - p.def.heightIn) / 20;
        const c = (df.r.block / 100) * (inside ? 0.26 : 0.1) * aiMult * h;
        if (this.rng() < c) {
          blocker = df;
          break;
        }
      }
    }

    // Shooting foul?
    let fouled = false;
    if (!blocker && closest && cd < 2.6) {
      const aiMult = this.isAITeam(closest.team) && closest.team !== this.user ? this.diff.aiFoul : 1;
      const c = 0.09 * (inside ? 1.5 : 0.7) * aiMult * (closest.z > 0.5 ? 1.3 : 1);
      if (this.rng() < c) {
        fouled = true;
        chance *= 0.45;
        this.commitFoul(closest, true);
      }
    }

    const made = !blocker && this.rng() < chance;
    this.shotLog.push({ side: p.team, x: p.x, y: p.y, kind, chance, made, contest: cd });
    const pts: 2 | 3 = three ? 3 : 2;
    const assist = this.lastPass && this.lastPass.to === p && this.time - this.lastPass.time < 4 ? this.lastPass.passer : null;
    b.owner = null;
    b.lastTeam = p.team;
    this.shotId++;

    if (blocker) {
      p.line.fga++;
      if (three) p.line.tpa++;
      blocker.line.blk++;
      this.toast(`BLOCKED by ${blocker.def.name}!`, '#ff5a5a');
      b.mode = 'loose';
      b.fromShot = p;
      b.lastTeam = blocker.team;
      const away = Math.atan2(p.y - blocker.y, p.x - blocker.x) + (this.rng() - 0.5) * 1.6;
      b.x = p.x;
      b.y = p.y;
      b.z = p.heightFt + 2;
      b.vx = Math.cos(away) * 16;
      b.vy = Math.sin(away) * 16;
      b.vz = 4;
      return;
    }

    b.mode = 'shot';
    b.shot = {
      id: this.shotId,
      shooter: p,
      sx: p.x,
      sy: p.y,
      sz: p.z + p.heightFt + 1,
      ex: hx,
      ey: hy,
      t: 0,
      dur: inside ? 0.42 : 0.7 + d * 0.013,
      arc: inside ? 1.5 : 4 + d * 0.22,
      made,
      pts,
      kind,
      fouled,
      assist,
      dropT: 0,
    };
  }

  private passTo(p: Player, to: Player) {
    const b = this.ball;
    const lead = 0.25;
    const ex = to.x + to.vx * lead;
    const ey = to.y + to.vy * lead;
    const d = dist(p.x, p.y, ex, ey);
    const info: PassInfo = { from: p, to, sx: p.x, sy: p.y, ex, ey, t: 0, dur: 0.12 + d / 42, arc: 1 + d * 0.05, intercept: false };

    // Interception check along the passing lane.
    for (const df of this.teams[this.opp(p.team)].court) {
      const lx = ex - p.x;
      const ly = ey - p.y;
      const len2 = lx * lx + ly * ly || 1;
      const t = ((df.x - p.x) * lx + (df.y - p.y) * ly) / len2;
      if (t < 0.15 || t > 0.9) continue;
      const px = p.x + lx * t;
      const py = p.y + ly * t;
      if (dist(df.x, df.y, px, py) > 2.2) continue;
      const aiMult = this.isAITeam(df.team) && df.team !== this.user ? 0.5 + 0.7 * this.diff.aiSteal : 0.8;
      const c = (df.r.steal / 100) * 0.4 * (1.35 - p.r.pass / 100) * aiMult;
      if (this.rng() < c) {
        info.to = df;
        info.ex = px;
        info.ey = py;
        info.dur *= t;
        info.intercept = true;
        break;
      }
    }
    b.mode = 'pass';
    b.owner = null;
    b.pass = info;
    b.lastTeam = p.team;
    p.holdT = 0;
    this.lastPass = { passer: p, to, time: this.time };
  }

  private spin(p: Player) {
    if (p.spinCd > 0 || p.z > 0) return;
    p.spinCd = 1.4;
    p.action = 'spin';
    p.actionT = 0.35;
    for (const df of this.teams[this.opp(p.team)].court) {
      if (dist(df.x, df.y, p.x, p.y) < 5 && df.action === 'none') {
        const c = Math.max(0.05, Math.min(0.5, 0.15 + (p.r.handle - df.r.perD) * 0.008));
        if (this.rng() < c) {
          df.action = 'stunned';
          df.actionT = 0.8;
          this.toast(`${p.def.name} broke ${df.def.name}'s ankles!`, '#ffd23f');
        }
        break;
      }
    }
  }

  jump(p: Player) {
    if (p.z > 0 || p.action !== 'none') return;
    p.action = 'jump';
    p.vz = 10 + Math.max(p.r.block, p.r.reb) * 0.025;
  }

  stealAttempt(p: Player) {
    if (p.stealCd > 0 || p.action !== 'none') return;
    p.stealCd = 0.9;
    const b = this.ball;
    const ai = this.isAITeam(p.team) && p.team !== this.user;
    if (b.mode === 'pass' && b.pass && dist(p.x, p.y, b.x, b.y) < 3.5 && b.pass.from.team !== p.team) {
      if (this.rng() < 0.35 + p.r.steal / 400) {
        b.pass.to = p;
        b.pass.ex = p.x;
        b.pass.ey = p.y;
        b.pass.intercept = true;
      }
      return;
    }
    const h = b.owner;
    if (b.mode !== 'held' || !h || h.team === p.team) return;
    const d = dist(p.x, p.y, h.x, h.y);
    if (d > 4.5) return;
    let c = Math.max(0.03, Math.min(0.35, 0.08 + (p.r.steal - h.r.handle) * 0.005));
    if (ai) c *= 0.6 + 0.6 * this.diff.aiSteal;
    if (d > 3) c *= 0.6;
    if (this.rng() < c) {
      p.line.stl++;
      h.line.tov++;
      this.toast(`STOLEN by ${p.def.name}!`, '#3ddc84');
      b.mode = 'loose';
      b.owner = null;
      b.fromShot = null;
      b.lastTeam = p.team;
      const ang = Math.atan2(p.y - h.y, p.x - h.x) + (this.rng() - 0.5) * 0.8;
      b.x = h.x;
      b.y = h.y;
      b.z = 2;
      b.vx = Math.cos(ang) * 9;
      b.vy = Math.sin(ang) * 9;
      b.vz = 3;
      h.action = 'none';
      return;
    }
    const foulRate = ai ? 0.12 * this.diff.aiFoul : 0.14;
    if (this.rng() < foulRate) {
      this.commitFoul(p, false);
      this.afterNonShootingFoul(h);
    }
  }

  private commitFoul(fouler: Player, shooting: boolean) {
    fouler.fouls++;
    fouler.line.pf++;
    this.teams[fouler.team].teamFouls++;
    this.toast(`${shooting ? 'Shooting foul' : 'Reach-in foul'} — ${fouler.def.name}`, '#ffd23f');
    if (fouler.fouls >= 6) this.toast(`${fouler.def.name} fouled out`, '#ff5a5a');
  }

  private afterNonShootingFoul(victim: Player) {
    const defSide = this.opp(victim.team);
    if (this.teams[defSide].teamFouls >= 5) {
      this.toast('Bonus — 2 free throws');
      this.startFT(victim, 2);
    } else {
      this.inbound(victim.team, 'side', Math.max(this.shotClock, 14));
    }
  }

  // ---------- AI ----------

  private runAI(dt: number) {
    for (const p of this.onCourt()) {
      p.stealCd = Math.max(0, p.stealCd - dt);
      p.spinCd = Math.max(0, p.spinCd - dt);
      if (p.action === 'stunned' || p.action === 'spin' || p.action === 'layup') {
        p.actionT -= dt;
        if (p.action === 'layup') {
          const hx = this.hoopX(p.team);
          const d = dist(p.x, p.y, hx, COURT_W / 2);
          if (d > 2) {
            p.dvx = ((hx - p.x) / d) * 8;
            p.dvy = ((COURT_W / 2 - p.y) / d) * 8;
          } else p.dvx = p.dvy = 0;
          if (p.actionT <= 0) this.releaseShot(p, 'none');
          continue;
        }
        if (p.actionT <= 0) p.action = 'none';
        if (p.action === 'stunned') {
          p.dvx = p.dvy = 0;
          continue;
        }
      }
      if (this.isUserControlled(p)) continue;
      if (this.phase === 'inbound' && this.ball.owner === p) {
        p.dvx = p.dvy = 0;
        continue;
      }
      const b = this.ball;
      if (b.mode === 'loose') this.reboundAI(p);
      else if (p.team === this.offense) this.offenseAI(p, dt);
      else this.defenseAI(p, dt);
    }
  }

  private moveTo(p: Player, tx: number, ty: number, sprint = false) {
    tx = Math.max(0.8, Math.min(COURT_L - 0.8, tx));
    ty = Math.max(0.8, Math.min(COURT_W - 0.8, ty));
    const dx = tx - p.x;
    const dy = ty - p.y;
    const d = Math.hypot(dx, dy);
    p.sprint = sprint && d > 6;
    if (d < 0.4) {
      p.dvx = p.dvy = 0;
      return;
    }
    const s = this.speedOf(p) * Math.min(1, d / 3);
    p.dvx = (dx / d) * s;
    p.dvy = (dy / d) * s;
  }

  private openness(p: Player): number {
    let m = Infinity;
    for (const df of this.teams[this.opp(p.team)].court) m = Math.min(m, dist(df.x, df.y, p.x, p.y));
    return m;
  }

  /** Expected points of a shot taken by p from (x, y) right now. */
  private shotValue(p: Player, x: number, y: number): number {
    const hx = this.hoopX(p.team);
    const d = dist(x, y, hx, COURT_W / 2);
    if (d > 30) return 0;
    const three = isThree(x, y, hx);
    const kind = d < 7.5 ? 'layup' : shotKind(d, three, false);
    const rating = kind === 'three' ? p.r.three : kind === 'mid' ? p.r.mid : kind === 'close' ? (p.r.mid + p.r.inside) / 2 : p.r.inside;
    let cd = Infinity;
    for (const df of this.teams[this.opp(p.team)].court) cd = Math.min(cd, dist(df.x, df.y, x, y));
    const chance = makeChance({
      kind,
      distFt: d,
      rating,
      contestDist: cd,
      contestRating: 75,
      contestJump: false,
      moving: false,
      stamina: p.stamina,
      timing: 'none',
      diffMod: 0,
    });
    return chance * (three ? 3 : 2);
  }

  private offenseAI(p: Player, dt: number) {
    const b = this.ball;
    if (b.mode === 'held' && b.owner === p) return this.handlerAI(p, dt);
    if (b.mode === 'pass' && b.pass?.to === p) return this.moveTo(p, b.pass.ex, b.pass.ey, true);
    if (b.mode === 'shot') {
      // Crash the glass with the bigs, the rest get back.
      if (p.slot === 4) return this.moveTo(p, this.hoopX(p.team) - this.dir(p.team) * 7, COURT_W / 2 + 4, true);
    }
    this.offBall(p, dt);
  }

  private offBall(p: Player, dt: number) {
    const side = p.team;
    const hx = this.hoopX(side);
    const handler = this.ball.owner ?? this.ball.pass?.to ?? null;
    let { x, y } = this.spot(side, p.slot);

    if (p.cutT > 0) {
      p.cutT -= dt;
      return this.moveTo(p, p.cutX, p.cutY, true);
    }
    if (p.screenT > 0 && handler && handler !== p) {
      p.screenT -= dt;
      const df = this.teams[this.opp(side)].court[handler.slot];
      const ang = Math.atan2(df.y - handler.y, df.x - handler.x) + Math.PI / 2;
      if (p.screenT <= 0) {
        p.cutT = 1.4;
        p.cutX = hx - this.dir(side) * 4;
        p.cutY = COURT_W / 2;
      }
      return this.moveTo(p, df.x + Math.cos(ang) * 2.2, df.y + Math.sin(ang) * 2.2, true);
    }
    if (handler && this.ball.mode === 'held' && this.phase === 'live') {
      const hd = dist(handler.x, handler.y, hx, COURT_W / 2);
      if (p.slot === 4 && hd > 20 && hd < 34 && this.rng() < dt * 0.12) p.screenT = 2.2;
      else if (p.slot <= 2 && this.rng() < dt * 0.06) {
        p.cutT = 1.4;
        p.cutX = hx - this.dir(side) * 5;
        p.cutY = COURT_W / 2 + (this.rng() - 0.5) * 10;
      }
      if (dist(x, y, handler.x, handler.y) < 9) y = COURT_W - y;
    }
    this.moveTo(p, x, y, dist(p.x, p.y, x, y) > 15);
  }

  private handlerAI(p: Player, dt: number) {
    if (p.action === 'shoot') {
      p.meter += dt / METER_TIME;
      p.dvx = p.dvy = 0;
      if (p.meter >= METER_TARGET) this.releaseShot(p, 'none');
      return;
    }
    if (p.action !== 'none' && p.action !== 'spin') return;
    p.holdT += dt;
    const side = p.team;
    const hx = this.hoopX(side);
    const hy = COURT_W / 2;
    const dH = dist(p.x, p.y, hx, hy);

    if (dH > 42) {
      const top = this.spot(side, 0);
      return this.moveTo(p, top.x, top.y, true);
    }
    p.decideT -= dt;
    if (p.decideT > 0) return this.moveTo(p, p.driveX, p.driveY, p.sprint);
    const react = this.isAITeam(side) && side !== this.user ? this.diff.aiReact : 0.55;
    p.decideT = react * (0.7 + this.rng() * 0.6);

    if (this.shotClock < 3.5 || (this.clock < 3 && this.clock > 0)) return this.startShot(p);
    if (dH < 7) return this.startShot(p);

    const value = this.shotValue(p, p.x, p.y);
    const open = this.openness(p);
    // Drive lane: is anyone guarding the path toward the rim?
    const lx = p.x + ((hx - p.x) / dH) * 6;
    const ly = p.y + ((hy - p.y) / dH) * 6;
    let laneD = Infinity;
    for (const df of this.teams[this.opp(side)].court) laneD = Math.min(laneD, dist(df.x, df.y, lx, ly));
    const laneOpen = laneD > 4;

    let best: Player | null = null;
    let bestV = -Infinity;
    for (const m of this.teams[side].court) {
      if (m === p) continue;
      const v = this.shotValue(m, m.x, m.y) + Math.min(this.openness(m), 10) * 0.02;
      if (v > bestV) {
        bestV = v;
        best = m;
      }
    }

    const r = this.rng();
    if (value > 1.0 && open > 4 && r < 0.85) return this.startShot(p);
    if (laneOpen && r < 0.45 + p.r.inside / 300) {
      p.driveX = hx - this.dir(side) * 2;
      p.driveY = hy + (this.rng() - 0.5) * 4;
      p.sprint = true;
      return this.moveTo(p, p.driveX, p.driveY, true);
    }
    if (best && (bestV > value + 0.15 || p.holdT > 5) && this.rng() < 0.75) return this.passTo(p, best);
    if (value > 0.9 && this.rng() < 0.5) return this.startShot(p);
    if (open < 3.5 && p.r.handle > 75 && this.rng() < 0.2) this.spin(p);
    // Probe: jab around the perimeter.
    const ang = this.rng() * Math.PI * 2;
    p.driveX = p.x + Math.cos(ang) * 6;
    p.driveY = p.y + Math.sin(ang) * 6;
    p.sprint = false;
    this.moveTo(p, p.driveX, p.driveY);
  }

  private defenseAI(p: Player, dt: number) {
    const b = this.ball;
    const offSide = this.opp(p.team);
    const man = this.teams[offSide].court[p.slot];
    const hx = this.hoopX(offSide);
    const hy = COURT_W / 2;
    const ai = this.isAITeam(p.team) && p.team !== this.user;
    const help = ai ? this.diff.aiHelp : 0.5;
    const blockMult = ai ? this.diff.aiBlock : 1;

    if (b.mode === 'shot' && b.shot && b.shot.kind !== 'ft') {
      // Box out: get between your man and the rim.
      const d = dist(man.x, man.y, hx, hy) || 1;
      return this.moveTo(p, hx + ((man.x - hx) / d) * Math.min(d, 6), hy + ((man.y - hy) / d) * Math.min(d, 6), true);
    }

    // Contest shooters.
    for (const o of this.teams[offSide].court) {
      if ((o.action === 'shoot' || o.action === 'layup') && b.owner === o) {
        const d = dist(p.x, p.y, o.x, o.y);
        if (o === man || d < 5) {
          if (d < 4 && p.contestedShot !== this.shotId && p.z === 0) {
            p.contestedShot = this.shotId;
            if (this.rng() < 0.55 * Math.min(1.2, blockMult)) this.jump(p);
          }
          // Close out to about an arm's length, between shooter and rim.
          // Better perimeter defenders close out tighter.
          const od = dist(o.x, o.y, hx, hy) || 1;
          const gap = o.action === 'layup' ? 1.5 : Math.max(2.2, 3.4 - (p.r.perD - 70) * 0.04);
          return this.moveTo(p, o.x + ((hx - o.x) / od) * gap, o.y + ((hy - o.y) / od) * gap, true);
        }
      }
    }

    const handler = b.mode === 'held' ? b.owner : null;
    const ballX = b.mode === 'pass' && b.pass ? b.pass.ex : b.x;
    const ballY = b.mode === 'pass' && b.pass ? b.pass.ey : b.y;

    if (handler && handler !== man) {
      // Help defense on drives.
      const hd = dist(handler.x, handler.y, hx, hy);
      const hisDef = this.teams[p.team].court[handler.slot];
      const beaten = dist(hisDef.x, hisDef.y, hx, hy) > hd + 1;
      if (hd < 15 && beaten && this.nearestHelper(p.team, handler) === p && this.rng() < help * 0.9 + 0.05) {
        return this.moveTo(p, handler.x + ((hx - handler.x) / hd) * 3, handler.y + ((hy - handler.y) / hd) * 3, true);
      }
    }

    const md = dist(man.x, man.y, hx, hy) || 1;
    let tx: number;
    let ty: number;
    if (man === handler) {
      // Give shooters a little more room on the perimeter, play tight inside.
      const gap = Math.min(md > 21 ? 4.4 : 3.2, md);
      tx = man.x + ((hx - man.x) / md) * gap;
      ty = man.y + ((hy - man.y) / md) * gap;
      if (dist(p.x, p.y, man.x, man.y) < 3.6) {
        const rate = ai ? 0.3 * this.diff.aiSteal : 0.1;
        if (this.rng() < dt * rate) this.stealAttempt(p);
      }
    } else {
      const off = Math.min(10, 3 + dist(man.x, man.y, ballX, ballY) * 0.2, md);
      tx = man.x + ((hx - man.x) / md) * off;
      ty = man.y + ((hy - man.y) / md) * off;
      tx += (ballX - tx) * 0.15 * help;
      ty += (ballY - ty) * 0.15 * help;
    }
    this.moveTo(p, tx, ty, dist(p.x, p.y, tx, ty) > 8);
  }

  private nearestHelper(side: Side, handler: Player): Player | null {
    let best: Player | null = null;
    let bd = Infinity;
    for (const p of this.teams[side].court) {
      if (p.slot === handler.slot) continue;
      const d = dist(p.x, p.y, handler.x, handler.y);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return best;
  }

  private reboundAI(p: Player) {
    const b = this.ball;
    const mates = [...this.teams[p.team].court].sort((a, c) => dist(a.x, a.y, b.x, b.y) - dist(c.x, c.y, b.x, b.y));
    const chasers = mates.slice(0, 2);
    if (chasers.includes(p)) {
      const lead = b.z > 3 ? 0.35 : 0.15;
      this.moveTo(p, b.x + b.vx * lead, b.y + b.vy * lead, true);
      if (b.z > p.heightFt + 1 && dist(p.x, p.y, b.x, b.y) < 3 && b.vz < 0 && this.rng() < 0.15) this.jump(p);
      return;
    }
    if (p.team === this.offense) {
      const s = this.spot(p.team, p.slot);
      this.moveTo(p, s.x, s.y);
    } else {
      const hx = this.hoopX(this.offense);
      this.moveTo(p, hx - this.dir(this.offense) * 12, COURT_W / 2 + (p.slot - 2) * 4);
    }
  }

  // ---------- physics ----------

  private integrate(dt: number) {
    const players = this.onCourt();
    for (const p of players) {
      if (this.phase === 'ft') {
        p.vx = p.vy = 0;
      } else if (p.z > 0) {
        p.vx *= 0.99;
        p.vy *= 0.99;
      } else {
        const k = Math.min(1, 9 * dt);
        p.vx += (p.dvx - p.vx) * k;
        p.vy += (p.dvy - p.vy) * k;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.x = Math.max(-2, Math.min(COURT_L + 2, p.x));
      p.y = Math.max(-2, Math.min(COURT_W + 2, p.y));
      if (p.z > 0 || p.vz > 0) {
        p.vz -= GRAVITY * dt;
        p.z += p.vz * dt;
        if (p.z <= 0) {
          p.z = 0;
          p.vz = 0;
          if (p.action === 'jump') p.action = 'none';
        }
      }
      const sp = Math.hypot(p.vx, p.vy);
      if (sp > 1) {
        p.faceX = p.vx / sp;
        p.faceY = p.vy / sp;
      }
    }
    // Simple body separation (this is also what makes screens work).
    for (let i = 0; i < players.length; i++) {
      for (let j = i + 1; j < players.length; j++) {
        const a = players[i];
        const c = players[j];
        const dx = c.x - a.x;
        const dy = c.y - a.y;
        const d = Math.hypot(dx, dy);
        if (d > 0.01 && d < 2) {
          const push = (2 - d) / 2;
          const wa = c.r.strength / (a.r.strength + c.r.strength);
          a.x -= (dx / d) * push * wa;
          a.y -= (dy / d) * push * wa;
          c.x += (dx / d) * push * (1 - wa);
          c.y += (dy / d) * push * (1 - wa);
        }
      }
    }
    // Ball handler stepping out of bounds.
    const o = this.ball.owner;
    if (this.phase === 'live' && this.ball.mode === 'held' && o && o.z === 0 && (o.x < -0.3 || o.x > COURT_L + 0.3 || o.y < -0.3 || o.y > COURT_W + 0.3)) {
      o.line.tov++;
      this.turnover(`${o.def.name} stepped out of bounds`);
    }
  }

  private updateBall(dt: number) {
    const b = this.ball;
    if (b.mode === 'held' && b.owner) {
      const o = b.owner;
      if (o.action === 'shoot' || o.action === 'layup' || o.action === 'ftshoot' || this.phase === 'ft') {
        b.x = o.x + o.faceX * 0.3;
        b.y = o.y;
        b.z = o.z + o.heightFt + 0.6;
      } else {
        b.x = o.x + o.faceX * 1.1;
        b.y = o.y + o.faceY * 0.6 + 0.4;
        b.z = Math.abs(Math.sin(this.time * 9)) * 2.6 + 0.3;
      }
      return;
    }
    if (b.mode === 'pass' && b.pass) {
      const ps = b.pass;
      ps.t += dt;
      const f = Math.min(1, ps.t / ps.dur);
      b.x = ps.sx + (ps.ex - ps.sx) * f;
      b.y = ps.sy + (ps.ey - ps.sy) * f;
      b.z = 4 + ps.arc * 4 * f * (1 - f);
      if (f >= 1) this.catchPass(ps);
      return;
    }
    if (b.mode === 'shot' && b.shot) {
      const s = b.shot;
      if (s.dropT > 0) {
        s.dropT -= dt;
        b.z = Math.max(1, b.z - dt * 24);
        if (s.dropT <= 0) this.scoreShot(s);
        return;
      }
      s.t += dt;
      const f = Math.min(1, s.t / s.dur);
      b.x = s.sx + (s.ex - s.sx) * f;
      b.y = s.sy + (s.ey - s.sy) * f;
      b.z = s.sz + (RIM_HEIGHT - s.sz) * f + s.arc * 4 * f * (1 - f);
      if (f >= 1) {
        if (s.made) s.dropT = 0.3;
        else this.missShot(s);
      }
      return;
    }
    if (b.mode === 'loose') {
      b.vz -= GRAVITY * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.z += b.vz * dt;
      if (b.z <= 0.4) {
        b.z = 0.4;
        if (b.vz < -3) {
          b.vz = -b.vz * 0.55;
          b.vx *= 0.8;
          b.vy *= 0.8;
        } else {
          b.vz = 0;
          const f = Math.max(0, 1 - 1.6 * dt);
          b.vx *= f;
          b.vy *= f;
        }
      }
      if (b.x < -0.5 || b.x > COURT_L + 0.5 || b.y < -0.5 || b.y > COURT_W + 0.5) {
        this.turnover('Out of bounds', b.lastTeam);
        return;
      }
      this.tryGrab();
    }
  }

  private tryGrab() {
    const b = this.ball;
    const cands: Player[] = [];
    for (const p of this.onCourt()) {
      if (p.action === 'stunned') continue;
      const reach = p.z + p.heightFt + 1.6;
      if (dist(p.x, p.y, b.x, b.y) < 2.3 && b.z < reach) cands.push(p);
    }
    if (!cands.length) return;
    let pick = cands[0];
    if (cands.length > 1) {
      // Defenders have inside position on rebounds.
      const w = cands.map((p) => p.r.reb + (p.z > 0.5 ? 25 : 0) + (p.def.heightIn - 78) * 2 + 10 + (b.fromShot && p.team !== b.fromShot.team ? 45 : 0));
      let roll = this.rng() * w.reduce((a, c) => a + c, 0);
      for (let i = 0; i < cands.length; i++) {
        roll -= w[i];
        if (roll <= 0) {
          pick = cands[i];
          break;
        }
      }
    }
    this.gainPossession(pick);
  }

  private gainPossession(p: Player) {
    const b = this.ball;
    if (b.fromShot) {
      p.line.reb++;
      if (p.team === b.fromShot.team) {
        p.line.oreb++;
        this.shotClock = Math.max(this.shotClock, 14);
      }
    }
    if (p.team !== this.offense) {
      this.offense = p.team;
      this.shotClock = 24;
      if (!this.userAI && p.team !== this.user) this.pickDefenderFor(p);
    } else if (b.fromShot && p.team === b.fromShot.team) {
      this.shotClock = 14;
    }
    b.fromShot = null;
    b.mode = 'held';
    b.owner = p;
    b.pass = null;
    b.shot = null;
    b.lastTeam = p.team;
    p.holdT = 0;
    p.decideT = 0.2;
    if (!this.userAI && p.team === this.user) this.controlled = p;
    for (const q of this.onCourt()) {
      q.cutT = 0;
      q.screenT = 0;
    }
  }

  private pickDefenderFor(handler: Player) {
    this.controlled = this.teams[this.user].court[handler.slot];
  }

  private catchPass(ps: PassInfo) {
    const b = this.ball;
    const r = ps.to;
    if (ps.intercept) {
      r.line.stl++;
      ps.from.line.tov++;
      this.toast(`Intercepted by ${r.def.name}!`, '#3ddc84');
      b.fromShot = null;
      this.gainPossession(r);
      return;
    }
    if (dist(r.x, r.y, b.x, b.y) < 3.5 && r.action !== 'stunned') {
      b.mode = 'held';
      b.owner = r;
      b.pass = null;
      r.holdT = 0;
      r.decideT = 0.15;
      if (!this.userAI && r.team === this.user) this.controlled = r;
      return;
    }
    // Bad pass — ball keeps going.
    b.mode = 'loose';
    b.fromShot = null;
    const d = dist(ps.sx, ps.sy, ps.ex, ps.ey) || 1;
    b.vx = ((ps.ex - ps.sx) / d) * 14;
    b.vy = ((ps.ey - ps.sy) / d) * 14;
    b.vz = 0;
    b.pass = null;
  }

  private scoreShot(s: ShotInfo) {
    const b = this.ball;
    const p = s.shooter;
    const team = this.teams[p.team];
    team.score += s.pts;
    team.quarterScores[team.quarterScores.length - 1] += s.pts;
    p.line.pts += s.pts;
    b.shot = null;
    if (s.kind === 'ft') {
      p.line.ftm++;
      p.line.fta++;
      this.afterFreeThrow(true);
      return;
    }
    p.line.fgm++;
    p.line.fga++;
    if (s.pts === 3) {
      p.line.tpm++;
      p.line.tpa++;
    }
    if (s.assist) s.assist.line.ast++;
    const verb = s.kind === 'dunk' ? 'slams it home' : s.pts === 3 ? 'drains a three' : s.kind === 'layup' ? 'lays it in' : 'scores';
    this.toast(`${p.def.name} ${verb}!`, s.pts === 3 ? '#ffd23f' : '#fff');
    if (s.fouled) {
      this.toast('AND ONE!', '#3ddc84');
      return this.startFT(p, 1);
    }
    if (this.clock <= 0) return this.endQuarter();
    this.inbound(this.opp(p.team), 'make');
  }

  private missShot(s: ShotInfo) {
    const b = this.ball;
    const p = s.shooter;
    b.shot = null;
    if (s.kind === 'ft') {
      p.line.fta++;
      if (this.ft && this.ft.left > 1) return this.afterFreeThrow(false);
      this.ft = null;
      this.phase = 'live';
    } else if (!s.fouled) {
      p.line.fga++;
      if (s.pts === 3) p.line.tpa++;
    }
    if (s.fouled && s.kind !== 'ft') return this.startFT(p, s.pts);

    // Rim out: bounce back toward the court.
    const courtward = -this.dir(p.team);
    const ang = (this.rng() - 0.5) * 2.6;
    const sp = 6 + this.rng() * 9 + (s.pts === 3 ? 4 : 0);
    b.mode = 'loose';
    b.fromShot = p;
    b.lastTeam = p.team;
    b.x = s.ex;
    b.y = s.ey;
    b.z = RIM_HEIGHT;
    b.vx = Math.cos(ang) * sp * courtward;
    b.vy = Math.sin(ang) * sp;
    b.vz = 7 + this.rng() * 6;
  }

  // ---------- dead balls ----------

  private turnover(reason: string, lastTouch?: Side) {
    const losing = lastTouch ?? this.offense;
    this.toast(reason, '#ff5a5a');
    this.inbound(this.opp(losing), 'side');
  }

  private inbound(side: Side, kind: 'make' | 'side' | 'start', shotClock = 24) {
    this.phase = 'inbound';
    this.phaseT = kind === 'make' ? 0.9 : 1.2;
    this.offense = side;
    this.shotClock = shotClock;
    this.lastPass = null;
    this.coach(0);
    this.coach(1);
    const team = this.teams[side];
    const h = team.court[0];
    const d = this.dir(side);
    if (kind === 'make') {
      h.x = d > 0 ? 6 : COURT_L - 6;
      h.y = COURT_W / 2 - 4;
    } else if (kind === 'side') {
      h.x = COURT_L / 2 + d * 6;
      h.y = 2;
    } else {
      h.x = COURT_L / 2 - d * 6;
      h.y = COURT_W / 2;
    }
    for (const p of this.onCourt()) {
      p.action = 'none';
      p.z = 0;
      p.vz = 0;
      p.cutT = 0;
      p.screenT = 0;
    }
    const b = this.ball;
    b.mode = 'held';
    b.owner = h;
    b.shot = null;
    b.pass = null;
    b.fromShot = null;
    b.lastTeam = side;
    h.holdT = 0;
    h.decideT = 0.3;
    if (!this.userAI) {
      if (side === this.user) this.controlled = h;
      else this.controlled = this.teams[this.user].court[0];
    }
  }

  private startFT(shooter: Player, n: number) {
    this.phase = 'ft';
    this.ft = { shooter, left: n, waitT: 1.3 };
    this.offense = shooter.team;
    this.coach(0, shooter);
    this.coach(1, shooter);
    const side = shooter.team;
    const d = this.dir(side);
    // Positions in feet from the attacking baseline.
    const place = (p: Player, u: number, y: number) => {
      p.x = d > 0 ? COURT_L - u : u;
      p.y = y;
    };
    place(shooter, HOOP_OFFSET + FT_DIST - 1.25, COURT_W / 2); // FT line is 19 ft from the baseline
    const defs = this.teams[this.opp(side)].court;
    const offs = this.teams[side].court.filter((p) => p !== shooter);
    place(defs[0], 7, 17);
    place(defs[1], 7, 33);
    place(offs[0], 11, 17);
    place(offs[1], 11, 33);
    place(defs[2], 14, 17);
    place(defs[3], 14, 33);
    place(defs[4], 28, 22);
    place(offs[2], 28, 30);
    place(offs[3], 34, 25);
    for (const p of this.onCourt()) {
      p.vx = p.vy = p.vz = p.z = 0;
      p.action = 'none';
      p.faceX = d;
      p.faceY = 0;
    }
    const b = this.ball;
    b.mode = 'held';
    b.owner = shooter;
    b.shot = null;
    b.pass = null;
    if (!this.userAI) this.controlled = side === this.user ? shooter : this.teams[this.user].court[0];
  }

  private updateFT(dt: number, inp: FrameInput) {
    const ft = this.ft;
    const b = this.ball;
    if (!ft || b.mode !== 'held' || b.owner !== ft.shooter) return;
    const p = ft.shooter;
    const userShoots = !this.userAI && p.team === this.user;
    if (userShoots) {
      if (p.action === 'ftshoot') {
        p.meter += dt / METER_TIME;
        if (inp.aUp || !inp.a || p.meter >= 1.3) this.shootFT(p, gradeTiming(p.meter, this.diff.green * 1.2));
      } else if (inp.aDown) {
        p.action = 'ftshoot';
        p.meter = 0;
      }
    } else {
      ft.waitT -= dt;
      if (ft.waitT <= 0) this.shootFT(p, 'none');
    }
  }

  private shootFT(p: Player, timing: TimingGrade) {
    const b = this.ball;
    const userShooter = !this.userAI && p.team === this.user;
    const mod = this.userAI ? 0 : userShooter ? this.diff.userShot : this.diff.aiShot;
    const made = this.rng() < freeThrowChance(p.r.ft, userShooter ? timing : 'none', mod);
    if (userShooter && timing !== 'none') {
      this.flash = { text: TIMING_LABEL[timing], color: timing === 'excellent' ? '#3ddc84' : timing === 'good' ? '#ffd23f' : '#ff5a5a', t: 1 };
    }
    p.action = 'none';
    p.meter = 0;
    b.owner = null;
    b.mode = 'shot';
    b.lastTeam = p.team;
    this.shotId++;
    b.shot = {
      id: this.shotId,
      shooter: p,
      sx: p.x,
      sy: p.y,
      sz: p.heightFt + 1,
      ex: this.hoopX(p.team),
      ey: COURT_W / 2,
      t: 0,
      dur: 0.85,
      arc: 4,
      made,
      pts: 1,
      kind: 'ft',
      fouled: false,
      assist: null,
      dropT: 0,
    };
  }

  private afterFreeThrow(made: boolean) {
    const ft = this.ft;
    if (!ft) return;
    ft.left--;
    if (ft.left > 0) {
      ft.waitT = 1;
      const b = this.ball;
      b.mode = 'held';
      b.owner = ft.shooter;
      return;
    }
    this.ft = null;
    if (made) {
      if (this.clock <= 0) return this.endQuarter();
      this.inbound(this.opp(ft.shooter.team), 'make');
    }
  }

  private doTipoff() {
    const c0 = this.teams[0].court[4];
    const c1 = this.teams[1].court[4];
    const w0 = c0.r.reb + c0.def.heightIn;
    const w1 = c1.r.reb + c1.def.heightIn;
    const winner: Side = this.rng() * (w0 + w1) < w0 ? 0 : 1;
    this.tipWinner = winner;
    this.toast(`${this.teams[winner].def.abbr} wins the tip`);
    this.inbound(winner, 'start');
    this.phase = 'live';
  }

  private endQuarter() {
    this.buzzer = false;
    const [a, c] = this.teams;
    if (this.quarter >= 4 && a.score !== c.score) {
      this.phase = 'final';
      return;
    }
    this.phase = 'break';
  }

  /** Called by the UI after the quarter-break screen. */
  continueAfterBreak() {
    if (this.phase !== 'break') return;
    this.quarter++;
    this.clock = this.quarter <= 4 ? this.quarterLen : this.quarterLen / 2;
    for (const t of this.teams) {
      t.teamFouls = 0;
      t.quarterScores.push(0);
      for (const p of t.roster) p.stamina = Math.min(1, p.stamina + 0.2);
    }
    const loser = this.opp(this.tipWinner);
    const side: Side = this.quarter === 2 || this.quarter === 3 ? loser : this.quarter === 4 ? this.tipWinner : this.rng() < 0.5 ? 0 : 1;
    this.placeFormation(false);
    this.inbound(side, 'start');
  }

  get periodLabel() {
    return this.quarter <= 4 ? `Q${this.quarter}` : this.quarter === 5 ? 'OT' : `${this.quarter - 4}OT`;
  }

  private placeFormation(tip: boolean) {
    for (const side of [0, 1] as Side[]) {
      const d = this.dir(side);
      this.teams[side].court.forEach((p, i) => {
        p.vx = p.vy = p.vz = p.z = 0;
        p.action = 'none';
        if (tip) {
          const slots = [
            [-8, 25],
            [-6, 12],
            [-6, 38],
            [-3, 18],
            [-1.5, 25],
          ];
          p.x = COURT_L / 2 + d * slots[i][0];
          p.y = slots[i][1];
        } else {
          const s = this.spot(this.opp(side), i);
          p.x = s.x;
          p.y = s.y;
        }
        p.faceX = d;
        p.faceY = 0;
      });
    }
    this.ball.mode = 'held';
    this.ball.owner = null;
    this.ball.x = COURT_L / 2;
    this.ball.y = COURT_W / 2;
    this.ball.z = 8;
  }

  // ---------- substitutions & stamina ----------

  private coach(side: Side, keep?: Player) {
    if (side === this.user && !this.userAI && !this.settings.autoSubs) {
      // Fouled-out players must still leave.
      this.teams[side].court.forEach((p, slot) => {
        if (p.fouls >= 6) {
          const sub = this.bestBench(side, p);
          if (sub) this.sub(side, slot, sub);
        }
      });
      return;
    }
    const team = this.teams[side];
    team.court.forEach((cur, slot) => {
      if (cur === keep) return;
      const starter = team.starters[slot];
      if (cur.fouls >= 6 || cur.stamina < 0.55) {
        const sub = this.bestBench(side, cur);
        if (sub) this.sub(side, slot, sub);
      } else if (cur !== starter && !starter.onCourt && starter.stamina > 0.85 && starter.fouls < 6) {
        this.sub(side, slot, starter);
      }
    });
  }

  private bestBench(side: Side, out: Player): Player | null {
    const order = ['PG', 'SG', 'SF', 'PF', 'C'];
    let best: Player | null = null;
    let bs = -Infinity;
    for (const p of this.teams[side].roster) {
      if (p.onCourt || p.fouls >= 6 || p.stamina < 0.65) continue;
      const gap = Math.abs(order.indexOf(p.def.pos) - order.indexOf(out.def.pos));
      const s = p.def.ovr + p.stamina * 10 - gap * 5;
      if (s > bs) {
        bs = s;
        best = p;
      }
    }
    return best;
  }

  /** Swap a bench player into a court slot. Used by the coach AI and manual subs. */
  sub(side: Side, slot: number, inP: Player) {
    const team = this.teams[side];
    const out = team.court[slot];
    if (inP.onCourt || out === inP) return;
    out.onCourt = false;
    inP.onCourt = true;
    inP.slot = slot;
    inP.x = out.x;
    inP.y = out.y;
    inP.vx = inP.vy = inP.z = inP.vz = 0;
    inP.action = 'none';
    team.court[slot] = inP;
    const b = this.ball;
    if (b.owner === out) b.owner = inP;
    if (b.pass && b.pass.to === out) b.pass.to = inP;
    if (this.controlled === out) this.controlled = inP;
    if (this.ft && this.ft.shooter === out) this.ft.shooter = inP;
    if (side === this.user && !this.userAI) this.toast(`Sub: ${inP.def.name} in for ${out.def.name}`, '#9ad');
  }

  private updateStamina(dt: number) {
    if (this.phase !== 'live') return;
    const scale = 12 / this.settings.quarterMinutes;
    for (const t of this.teams) {
      for (const p of t.roster) {
        if (p.onCourt) {
          const sprinting = p.sprint && Math.hypot(p.vx, p.vy) > 8;
          const drain = (0.001 + (sprinting ? 0.006 : 0)) * scale * (1.4 - p.r.stamina / 100);
          p.stamina = Math.max(0, p.stamina - drain * dt);
        } else {
          p.stamina = Math.min(1, p.stamina + 0.004 * scale * dt);
        }
      }
    }
  }

  // ---------- read-only helpers for the UI ----------

  get winner(): Side | null {
    if (this.phase !== 'final') return null;
    return this.teams[0].score > this.teams[1].score ? 0 : 1;
  }
}

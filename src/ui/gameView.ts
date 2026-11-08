import type { Settings, TeamDef } from '../data/types';
import { Game, type Player, type Side } from '../game/game';
import { TouchInput } from '../game/input';
import { Renderer, lastName } from '../game/render';
import { esc } from './util';

interface Callbacks {
  onQuit: () => void;
  onRematch: () => void;
}

/**
 * Reliable tap for overlay buttons. iOS Safari can drop or mis-target `click` inside the
 * rotated game container, so fire on pointerup (when the press started on this element),
 * fall back to click, and swallow the ghost click iOS sends right after.
 */
let lastTap = 0;
function onTap(el: Element, fn: () => void) {
  let down = false;
  el.addEventListener('pointerdown', () => (down = true));
  el.addEventListener('pointercancel', () => (down = false));
  el.addEventListener('pointerup', () => {
    if (!down) return;
    down = false;
    lastTap = Date.now();
    fn();
  });
  el.addEventListener('click', () => {
    if (Date.now() - lastTap < 450) return;
    lastTap = Date.now();
    fn();
  });
}

const STEP = 1 / 60;

export class GameView {
  game: Game;
  private renderer: Renderer;
  private input: TouchInput;
  private raf = 0;
  private last = 0;
  private acc = 0;
  private paused = false;
  private overlay: HTMLElement;
  private gameEl: HTMLElement;
  private shownPhase = '';
  private hudCache = '';
  private toastCache = '';
  private els: Record<string, HTMLElement> = {};
  private onResize = () => {
    this.applyOrientation();
    this.renderer.resize();
  };
  private onVis = () => {
    if (document.hidden && this.game.phase !== 'final' && this.game.phase !== 'break') this.pause();
  };

  constructor(
    private root: HTMLElement,
    home: TeamDef,
    away: TeamDef,
    settings: Settings,
    private cb: Callbacks,
  ) {
    document.body.classList.add('in-game');
    root.innerHTML = `
      <div class="game">
        <canvas class="court"></canvas>
        <div class="hud">
          <button class="pause-btn" aria-label="Pause">❚❚</button>
          <div class="scorebug">
            <span class="sb-team" style="--p:${home.primary};--s:${home.secondary}">${esc(home.abbr)}</span>
            <b class="sb-s0">0</b>
            <span class="sb-mid"><span class="sb-period">Q1</span><span class="sb-clock">0:00</span></span>
            <b class="sb-s1">0</b>
            <span class="sb-team" style="--p:${away.primary};--s:${away.secondary}">${esc(away.abbr)}</span>
            <span class="sb-shot">24</span>
          </div>
          <div class="sb-info"></div>
          <div class="toasts"></div>
        </div>
        <div class="controls"></div>
        <div class="overlay hidden"></div>
      </div>`;
    const q = (s: string) => root.querySelector(s) as HTMLElement;
    this.els = {
      s0: q('.sb-s0'),
      s1: q('.sb-s1'),
      period: q('.sb-period'),
      clock: q('.sb-clock'),
      shot: q('.sb-shot'),
      info: q('.sb-info'),
      toasts: q('.toasts'),
    };
    this.overlay = q('.overlay');
    this.overlay.addEventListener('pointerup', (e) => {
      if (e.target === this.overlay && this.backdropBack) this.backdropBack();
    });
    this.game = new Game(home, away, settings);
    this.gameEl = q('.game');
    this.input = new TouchInput(q('.controls'));
    this.applyOrientation();
    this.renderer = new Renderer(q('canvas.court') as HTMLCanvasElement);
    onTap(q('.pause-btn'), () => this.pause());
    window.addEventListener('resize', this.onResize);
    window.addEventListener('orientationchange', this.onResize);
    document.addEventListener('visibilitychange', this.onVis);
    this.raf = requestAnimationFrame(this.loop);
    // Expose for debugging / automated tests.
    (window as unknown as { __game: Game }).__game = this.game;
  }

  /**
   * If the phone is held upright (e.g. orientation lock is on), rotate the whole game
   * 90° so it plays sideways anyway. Turn the phone to the left (top of phone to the left).
   */
  private applyOrientation() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const rotated = h > w;
    const el = this.gameEl;
    el.classList.toggle('rotated', rotated);
    if (rotated) {
      el.style.width = `${h}px`;
      el.style.height = `${w}px`;
      el.style.transform = `translateX(${w}px) rotate(90deg)`;
    } else {
      el.style.width = el.style.height = el.style.transform = '';
    }
    this.input.rotated = rotated;
  }

  private loop = (t: number) => {
    const g = this.game;
    const dt = this.last ? Math.min(0.05, (t - this.last) / 1000) : 0;
    this.last = t;
    if (!this.paused) {
      this.acc += dt;
      while (this.acc >= STEP) {
        g.step(STEP, this.input.frame());
        this.acc -= STEP;
      }
    }
    const offense = g.offense === g.user && g.ball.mode !== 'loose';
    this.input.setMode(offense ? 'offense' : 'defense');
    this.renderer.draw(g);
    this.updateHud();
    if (g.phase !== this.shownPhase) {
      this.shownPhase = g.phase;
      if (g.phase === 'break') this.showBreak();
      if (g.phase === 'final') this.showFinal();
    }
    this.raf = requestAnimationFrame(this.loop);
  };

  private updateHud() {
    const g = this.game;
    const clock = fmtClock(g.clock);
    const shot = g.phase === 'live' || g.phase === 'inbound' ? String(Math.ceil(Math.min(g.shotClock, 24))) : '';
    const p = g.controlled;
    const info = p ? esc(lastName(p.def.name)) : '';
    const key = `${g.teams[0].score}|${g.teams[1].score}|${g.periodLabel}|${clock}|${shot}|${info}`;
    if (key !== this.hudCache) {
      this.hudCache = key;
      this.els.s0.textContent = String(g.teams[0].score);
      this.els.s1.textContent = String(g.teams[1].score);
      this.els.period.textContent = g.periodLabel;
      this.els.clock.textContent = clock;
      this.els.shot.textContent = shot;
      this.els.shot.classList.toggle('low', g.shotClock <= 5);
      this.els.info.innerHTML = info;
    }
    const tk = g.toasts.map((t) => t.text).join('|');
    if (tk !== this.toastCache) {
      this.toastCache = tk;
      this.els.toasts.innerHTML = g.toasts.map((t) => `<div style="color:${t.color}">${esc(t.text)}</div>`).join('');
    }
  }

  // ---------- overlays ----------

  /** Called when the dark backdrop around the panel is tapped (Box Score / Subs screens). */
  private backdropBack: (() => void) | null = null;

  private openOverlay(html: string, cls = '') {
    this.backdropBack = null;
    this.overlay.innerHTML = `<div class="panel ${cls}">${html}</div>`;
    this.overlay.classList.remove('hidden');
    this.input.reset();
    return this.overlay;
  }
  private closeOverlay() {
    this.overlay.classList.add('hidden');
    this.overlay.innerHTML = '';
  }

  pause() {
    if (this.paused || this.game.phase === 'final') return;
    this.paused = true;
    this.showPauseMenu();
  }

  private resume() {
    this.paused = false;
    this.closeOverlay();
    this.input.reset();
  }

  private showPauseMenu() {
    const o = this.openOverlay(`<h2>Paused</h2>${this.scoreLine()}
      <div class="menu-buttons">
        <button class="big" data-a="resume">Resume</button>
        <button class="big alt" data-a="subs">Substitutions</button>
        <button class="big alt" data-a="box">Box Score</button>
        <button class="big danger" data-a="quit">Quit Game</button>
      </div>`);
    onTap(o.querySelector('[data-a="resume"]')!, () => this.resume());
    onTap(o.querySelector('[data-a="subs"]')!, () => this.showSubs(() => this.showPauseMenu()));
    onTap(o.querySelector('[data-a="box"]')!, () => this.showBox(() => this.showPauseMenu()));
    onTap(o.querySelector('[data-a="quit"]')!, () => this.cb.onQuit());
  }

  private scoreLine() {
    const g = this.game;
    const [a, b] = g.teams;
    const qs = a.quarterScores.map((_, i) => (i < 4 ? `Q${i + 1}` : i === 4 ? 'OT' : `${i - 3}OT`));
    return `<table class="linescore"><tr><th></th>${qs.map((q) => `<th>${q}</th>`).join('')}<th>T</th></tr>
      ${[a, b].map((t) => `<tr><td>${esc(t.def.abbr)}</td>${t.quarterScores.map((s) => `<td>${s}</td>`).join('')}<td><b>${t.score}</b></td></tr>`).join('')}</table>`;
  }

  private showBreak() {
    const g = this.game;
    const title = g.quarter === 2 ? 'Halftime' : g.quarter >= 4 ? 'Overtime!' : `End of ${g.periodLabel}`;
    const o = this.openOverlay(`<h2>${title}</h2>${this.scoreLine()}
      <div class="menu-buttons">
        <button class="big" data-a="go">Continue</button>
        <button class="big alt" data-a="subs">Substitutions</button>
        <button class="big alt" data-a="box">Box Score</button>
      </div>`);
    onTap(o.querySelector('[data-a="go"]')!, () => {
      this.closeOverlay();
      g.continueAfterBreak();
    });
    onTap(o.querySelector('[data-a="subs"]')!, () => this.showSubs(() => this.showBreak()));
    onTap(o.querySelector('[data-a="box"]')!, () => this.showBox(() => this.showBreak()));
  }

  private showFinal() {
    const g = this.game;
    const w = g.winner ?? 0;
    const won = w === g.user;
    const o = this.openOverlay(`<h2 class="${won ? 'win' : 'loss'}">${won ? 'Victory!' : 'Defeat'}</h2>
      <p class="final-sub">${esc(g.teams[w].def.label)} win ${Math.max(g.teams[0].score, g.teams[1].score)}–${Math.min(g.teams[0].score, g.teams[1].score)}</p>
      ${this.scoreLine()}${this.playerOfGame()}
      <div class="menu-buttons">
        <button class="big" data-a="box">Box Score</button>
        <button class="big alt" data-a="again">Rematch</button>
        <button class="big alt" data-a="menu">Main Menu</button>
      </div>`);
    onTap(o.querySelector('[data-a="box"]')!, () => this.showBox(() => this.showFinal()));
    onTap(o.querySelector('[data-a="again"]')!, () => this.cb.onRematch());
    onTap(o.querySelector('[data-a="menu"]')!, () => this.cb.onQuit());
  }

  private playerOfGame() {
    const g = this.game;
    const w = g.winner ?? 0;
    const best = [...g.teams[w].roster].sort((a, b) => gameScore(b) - gameScore(a))[0];
    if (!best) return '';
    const l = best.line;
    return `<p class="pog">Player of the game: <b>${esc(best.def.name)}</b> — ${l.pts} PTS, ${l.reb} REB, ${l.ast} AST</p>`;
  }

  private showBox(back: () => void) {
    const g = this.game;
    let side: Side = 0;
    const render = () => {
      const o = this.openOverlay(`<div class="box-head">
          <button class="back">‹ Back</button>
          <div class="tabs">${g.teams.map((t, i) => `<button class="chip ${i === side ? 'on' : ''}" data-s="${i}">${esc(t.def.abbr)} ${t.score}</button>`).join('')}</div>
        </div>${boxScore(g, side)}`, 'box-panel');
      this.backdropBack = back;
      onTap(o.querySelector('.back')!, back);
      o.querySelectorAll<HTMLElement>('[data-s]').forEach((b) =>
        onTap(b, () => {
          side = Number(b.dataset.s) as Side;
          render();
        }),
      );
    };
    render();
  }

  private showSubs(back: () => void) {
    const g = this.game;
    const team = g.teams[g.user];
    let pick: number | null = null;
    const row = (p: Player, extra: string) => `<div class="sub-row ${extra}" data-id="${esc(p.def.id)}">
        <span class="sr-pos">${p.onCourt ? esc(['PG', 'SG', 'SF', 'PF', 'C'][p.slot]) : esc(p.def.pos)}</span>
        <span class="sr-name">${esc(p.def.name)}<small>${p.line.pts} pts · ${p.fouls} PF${p.fouls >= 6 ? ' · OUT' : ''}</small></span>
        <b>${p.def.ovr}</b></div>`;
    const render = () => {
      const bench = team.roster.filter((p) => !p.onCourt);
      const o = this.openOverlay(`<div class="box-head"><button class="back">‹ Back</button><h3>Substitutions</h3></div>
        <p class="hint">${pick === null ? 'Tap a player on the court, then a bench player to swap.' : `Choose who comes in for ${esc(team.court[pick].def.name)}.`}</p>
        <div class="subs">
          <div><h4>On court</h4>${team.court.map((p, i) => row(p, `court ${pick === i ? 'picked' : ''}`)).join('')}</div>
          <div><h4>Bench</h4>${bench.length ? bench.map((p) => row(p, `bench ${p.fouls >= 6 ? 'out' : ''}`)).join('') : '<p class="hint">No bench players.</p>'}</div>
        </div>
        <p class="hint">Players don't get tired. Fouled-out players are replaced automatically; any other change is up to you.</p>`);
      this.backdropBack = back;
      onTap(o.querySelector('.back')!, back);
      o.querySelectorAll<HTMLElement>('.sub-row.court').forEach((el, i) =>
        onTap(el, () => {
          pick = i;
          render();
        }),
      );
      o.querySelectorAll<HTMLElement>('.sub-row.bench').forEach((el) =>
        onTap(el, () => {
          if (pick === null) return;
          const p = team.roster.find((x) => x.def.id === el.dataset.id);
          if (!p || p.fouls >= 6) return;
          g.sub(g.user, pick, p);
          pick = null;
          render();
        }),
      );
    };
    render();
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.input.destroy();
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('orientationchange', this.onResize);
    document.removeEventListener('visibilitychange', this.onVis);
    document.body.classList.remove('in-game');
    this.root.innerHTML = '';
  }
}

function fmtClock(sec: number) {
  if (sec < 60) return sec.toFixed(1);
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function gameScore(p: Player) {
  const l = p.line;
  return l.pts + 0.4 * l.fgm - 0.7 * l.fga - 0.4 * (l.fta - l.ftm) + 0.7 * l.oreb + 0.3 * (l.reb - l.oreb) + l.stl + 0.7 * l.ast + 0.7 * l.blk - 0.4 * l.pf - l.tov;
}

function boxScore(g: Game, side: Side) {
  const t = g.teams[side];
  const rows = [...t.roster].sort((a, b) => Number(b.onCourt) - Number(a.onCourt) || b.line.pts - a.line.pts);
  const tot = rows.reduce(
    (s, p) => {
      for (const k of Object.keys(s) as (keyof typeof s)[]) s[k] += p.line[k];
      return s;
    },
    { pts: 0, reb: 0, oreb: 0, ast: 0, stl: 0, blk: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, tov: 0, pf: 0 },
  );
  const cells = (l: typeof tot) =>
    `<td><b>${l.pts}</b></td><td>${l.reb}</td><td>${l.ast}</td><td>${l.stl}</td><td>${l.blk}</td><td>${l.fgm}-${l.fga}</td><td>${l.tpm}-${l.tpa}</td><td>${l.ftm}-${l.fta}</td><td>${l.tov}</td><td>${l.pf}</td>`;
  return `<div class="box-wrap"><table class="box"><thead><tr><th>Player</th><th>PTS</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th><th>FG</th><th>3P</th><th>FT</th><th>TO</th><th>PF</th></tr></thead>
    <tbody>${rows.map((p) => `<tr class="${p.onCourt ? 'oc' : ''}"><td>${esc(p.def.name)}</td>${cells(p.line)}</tr>`).join('')}
    <tr class="tot"><td>Team</td>${cells(tot)}</tr></tbody></table></div>`;
}

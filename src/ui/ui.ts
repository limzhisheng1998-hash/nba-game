import { ALL_PLAYERS, TEAMS, playerById } from '../data/teams';
import type { PlayerDef, Position, Settings, TeamDef } from '../data/types';
import { DIFFICULTIES, DIFFICULTY_ORDER } from '../game/difficulty';
import {
  MAX_ROSTER,
  MIN_ROSTER,
  abbrFromName,
  deleteDreamTeam,
  dreamToTeamDef,
  listDreamTeams,
  newDreamTeamId,
  saveDreamTeam,
  type DreamTeam,
} from '../state/dreamTeams';
import { loadSettings, saveSettings } from '../state/settings';
import { GameView } from './gameView';
import { esc } from './util';

const app = () => document.getElementById('app')!;


export function teamOvr(t: TeamDef): number {
  const o = t.players.map((p) => p.ovr).sort((a, b) => b - a);
  if (!o.length) return 0;
  const top = o.slice(0, 5);
  const bench = o.slice(5, 8);
  const avg = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
  return Math.round(bench.length ? avg(top) * 0.8 + avg(bench) * 0.2 : avg(top));
}

function allTeams(): TeamDef[] {
  return [...TEAMS, ...listDreamTeams().map(dreamToTeamDef).filter((t) => t.players.length >= MIN_ROSTER)];
}

function setScreen(html: string, cls = '') {
  const root = app();
  root.className = `screen ${cls}`;
  root.innerHTML = html;
  root.scrollTop = 0;
  return root;
}

// ---------- Main menu ----------

export function showMainMenu() {
  const root = setScreen(
    `<div class="menu">
      <h1 class="logo">NBA <span>LEGENDS</span></h1>
      <p class="tag">Legendary teams. Your rules.</p>
      <div class="menu-buttons">
        <button class="big" data-go="play">Play Now</button>
        <button class="big alt" data-go="dream">Dream Team</button>
        <button class="big alt" data-go="settings">Settings</button>
      </div>
    </div>`,
    'center',
  );
  root.querySelector('[data-go="play"]')!.addEventListener('click', () => showTeamSelect('user'));
  root.querySelector('[data-go="dream"]')!.addEventListener('click', showDreamList);
  root.querySelector('[data-go="settings"]')!.addEventListener('click', () => showSettings());
}

// ---------- Team select ----------

let pickHome: TeamDef | null = null;

function teamCard(t: TeamDef, selected = false) {
  const stars = [...t.players].sort((a, b) => b.ovr - a.ovr).slice(0, 3);
  return `<button class="team-card ${selected ? 'selected' : ''}" data-team="${esc(t.id)}" style="--p:${t.primary};--s:${t.secondary}">
      <div class="tc-head"><span class="tc-abbr">${esc(t.abbr)}</span><span class="tc-ovr">${teamOvr(t)}</span></div>
      <div class="tc-label">${esc(t.label)}</div>
      <div class="tc-season">${esc(t.dream ? 'Dream Team' : t.season)}</div>
      <div class="tc-stars">${stars.map((p) => esc(p.name)).join('<br>')}</div>
    </button>`;
}

export function showTeamSelect(step: 'user' | 'opp') {
  const teams = allTeams();
  const title = step === 'user' ? 'Choose your team' : 'Choose your opponent';
  const root = setScreen(
    `<header class="bar"><button class="back">‹ Back</button><h2>${title}</h2>
      ${step === 'opp' ? '<button class="random">Random</button>' : '<span></span>'}</header>
     <div class="team-grid">${teams.map((t) => teamCard(t, step === 'opp' && t.id === pickHome?.id)).join('')}</div>`,
  );
  root.querySelector('.back')!.addEventListener('click', () => (step === 'user' ? showMainMenu() : showTeamSelect('user')));
  root.querySelector('.random')?.addEventListener('click', () => {
    const others = teams.filter((t) => t.id !== pickHome?.id);
    showPregame(pickHome!, others[Math.floor(Math.random() * others.length)]);
  });
  root.querySelectorAll<HTMLElement>('.team-card').forEach((el) =>
    el.addEventListener('click', () => {
      const t = teams.find((x) => x.id === el.dataset.team)!;
      if (step === 'user') {
        pickHome = t;
        showTeamSelect('opp');
      } else showPregame(pickHome!, t);
    }),
  );
}

// ---------- Pregame ----------

function chips<T extends string | number>(name: string, options: [T, string][], value: T) {
  return `<div class="chips" data-name="${name}">${options
    .map(([v, l]) => `<button class="chip ${v === value ? 'on' : ''}" data-v="${v}">${esc(l)}</button>`)
    .join('')}</div>`;
}

function bindChips(root: HTMLElement, s: Settings, onChange?: () => void) {
  root.querySelectorAll<HTMLElement>('.chips').forEach((group) => {
    group.querySelectorAll<HTMLElement>('.chip').forEach((chip) =>
      chip.addEventListener('click', () => {
        group.querySelectorAll('.chip').forEach((c) => c.classList.remove('on'));
        chip.classList.add('on');
        const name = group.dataset.name!;
        const v = chip.dataset.v!;
        if (name === 'difficulty') s.difficulty = v as Settings['difficulty'];
        if (name === 'quarter') s.quarterMinutes = Number(v) as Settings['quarterMinutes'];
        if (name === 'autoSubs') s.autoSubs = v === 'on';
        if (name === 'shotMeter') s.shotMeter = v === 'on';
        saveSettings(s);
        onChange?.();
      }),
    );
  });
}

function settingsFields(s: Settings, full: boolean) {
  return `
    <label>Difficulty</label>
    ${chips('difficulty', DIFFICULTY_ORDER.map((d) => [d, DIFFICULTIES[d].label] as [string, string]), s.difficulty)}
    <label>Quarter length</label>
    ${chips('quarter', [[3, '3 min'], [5, '5 min'], [10, '10 min']], s.quarterMinutes)}
    ${
      full
        ? `<label>Substitutions</label>${chips('autoSubs', [['on', 'Auto'], ['off', 'Manual']], s.autoSubs ? 'on' : 'off')}
           <label>Shot meter</label>${chips('shotMeter', [['on', 'On'], ['off', 'Off']], s.shotMeter ? 'on' : 'off')}`
        : ''
    }`;
}

function showPregame(home: TeamDef, away: TeamDef) {
  const s = loadSettings();
  const side = (t: TeamDef) => `<div class="pg-team" style="--p:${t.primary};--s:${t.secondary}">
      <div class="pg-abbr">${esc(t.abbr)}</div><div class="pg-label">${esc(t.label)}</div><div class="pg-ovr">OVR ${teamOvr(t)}</div>
      <ol class="pg-five">${t.players.slice(0, 5).map((p) => `<li>${esc(p.pos)} ${esc(p.name)}</li>`).join('')}</ol></div>`;
  const root = setScreen(
    `<header class="bar"><button class="back">‹ Back</button><h2>Matchup</h2><span></span></header>
     <div class="pregame">
       <div class="matchup">${side(home)}<div class="vs">VS</div>${side(away)}</div>
       <div class="pg-settings">${settingsFields(s, true)}
         <button class="big tip">Tip Off</button></div>
     </div>`,
  );
  bindChips(root, s);
  root.querySelector('.back')!.addEventListener('click', () => showTeamSelect('opp'));
  root.querySelector('.tip')!.addEventListener('click', () => startGame(home, away, s));
}

let current: GameView | null = null;

function startGame(home: TeamDef, away: TeamDef, s: Settings) {
  current?.destroy();
  const root = setScreen('', 'in-game');
  current = new GameView(root, home, away, { ...s }, {
    onQuit: () => {
      current?.destroy();
      current = null;
      showMainMenu();
    },
    onRematch: () => startGame(home, away, loadSettings()),
  });
}

// ---------- Settings ----------

export function showSettings() {
  const s = loadSettings();
  const root = setScreen(
    `<header class="bar"><button class="back">‹ Back</button><h2>Settings</h2><span></span></header>
     <div class="settings">${settingsFields(s, true)}
       <div class="how">
         <h3>How to play</h3>
         <p><b>Left thumb:</b> drag anywhere on the left side to move.</p>
         <p><b>Offense:</b> hold <b>SHOOT</b> to rise up and release when the meter hits the green zone. Near the rim it's an automatic layup or dunk. <b>PASS</b> goes to the teammate you're pushing toward (or the most open one). <b>SPIN</b> can break ankles. Hold <b>SPRINT</b> for speed, but it burns stamina.</p>
         <p><b>Defense:</b> <b>SWITCH</b> takes control of the defender closest to the ball. <b>STEAL</b> close to the ball handler (reaching can cost a foul). <b>BLOCK</b> jumps to contest shots and grab rebounds.</p>
       </div>
     </div>`,
  );
  bindChips(root, s);
  root.querySelector('.back')!.addEventListener('click', showMainMenu);
}

// ---------- Dream Team ----------

function showDreamList() {
  const list = listDreamTeams();
  const root = setScreen(
    `<header class="bar"><button class="back">‹ Back</button><h2>Dream Teams</h2><button class="new">+ New</button></header>
     <div class="dream-list">
       ${
         list.length
           ? list
               .map((d) => {
                 const t = dreamToTeamDef(d);
                 return `<div class="dream-row" style="--p:${d.primary};--s:${d.secondary}">
                   <span class="tc-abbr">${esc(d.abbr)}</span>
                   <div class="dr-main"><b>${esc(d.name)}</b><small>${t.players.length} players · OVR ${teamOvr(t)}</small>
                   <small>${t.players.slice(0, 5).map((p) => esc(p.name)).join(' · ')}</small></div>
                   <button class="edit" data-id="${esc(d.id)}">Edit</button>
                   <button class="del" data-id="${esc(d.id)}">Delete</button>
                 </div>`;
               })
               .join('')
           : `<p class="empty">No dream teams yet. Tap <b>+ New</b> and pick any legends you like — Jordan, Shaq, Curry, Bird, LeBron on one team. No limits.</p>`
       }
     </div>`,
  );
  root.querySelector('.back')!.addEventListener('click', showMainMenu);
  root.querySelector('.new')!.addEventListener('click', () =>
    showDreamEditor({ id: newDreamTeamId(), name: 'My Dream Team', abbr: 'MDT', primary: '#E56020', secondary: '#FFFFFF', playerIds: [] }),
  );
  root.querySelectorAll<HTMLElement>('.edit').forEach((b) =>
    b.addEventListener('click', () => {
      const d = listDreamTeams().find((x) => x.id === b.dataset.id);
      if (d) showDreamEditor({ ...d, playerIds: [...d.playerIds] });
    }),
  );
  root.querySelectorAll<HTMLElement>('.del').forEach((b) =>
    b.addEventListener('click', () => {
      if (confirm('Delete this dream team?')) {
        deleteDreamTeam(b.dataset.id!);
        showDreamList();
      }
    }),
  );
}

const SWATCHES = ['#CE1141', '#552583', '#FDB927', '#007A33', '#1D428A', '#FFC72C', '#98002E', '#000000', '#FFFFFF', '#E56020', '#00788C', '#C4CED4'];
const SORTS: [string, string, (p: PlayerDef) => number][] = [
  ['ovr', 'OVR', (p) => p.ovr],
  ['three', '3PT', (p) => p.r.three],
  ['inside', 'Inside', (p) => p.r.inside],
  ['mid', 'Mid', (p) => p.r.mid],
  ['def', 'Defense', (p) => (p.r.perD + p.r.intD) / 2],
  ['reb', 'Rebound', (p) => p.r.reb],
  ['speed', 'Speed', (p) => p.r.speed],
  ['pass', 'Passing', (p) => p.r.pass],
];

function showDreamEditor(d: DreamTeam) {
  const f = { pos: 'ALL' as Position | 'ALL', team: 'ALL', sort: 'ovr', q: '' };
  const root = setScreen(
    `<header class="bar"><button class="back">‹ Cancel</button><h2>Dream Team</h2><button class="save">Save</button></header>
     <div class="dream-editor">
       <section class="de-left">
         <input class="de-name" maxlength="24" value="${esc(d.name)}" aria-label="Team name">
         <div class="de-colors">
           <span>Jersey</span><div class="sw" data-k="primary">${SWATCHES.map((c) => `<i data-c="${c}" style="background:${c}"></i>`).join('')}</div>
           <span>Trim</span><div class="sw" data-k="secondary">${SWATCHES.map((c) => `<i data-c="${c}" style="background:${c}"></i>`).join('')}</div>
         </div>
         <div class="de-roster"></div>
       </section>
       <section class="de-right">
         <div class="de-filters">
           <input class="de-q" placeholder="Search legends" aria-label="Search">
           ${chips('pos', [['ALL', 'All'], ['PG', 'PG'], ['SG', 'SG'], ['SF', 'SF'], ['PF', 'PF'], ['C', 'C']], 'ALL')}
           <div class="de-selects">
             <select class="de-team"><option value="ALL">All teams</option>${TEAMS.map((t) => `<option value="${t.id}">${esc(t.label)}</option>`).join('')}</select>
             <select class="de-sort">${SORTS.map(([k, l]) => `<option value="${k}">Sort: ${l}</option>`).join('')}</select>
           </div>
         </div>
         <div class="de-pool"></div>
       </section>
     </div>`,
  );

  const renderSwatches = () => {
    root.querySelectorAll<HTMLElement>('.sw').forEach((sw) => {
      const k = sw.dataset.k as 'primary' | 'secondary';
      sw.querySelectorAll<HTMLElement>('i').forEach((i) => i.classList.toggle('on', i.dataset.c === d[k]));
    });
  };

  const renderRoster = () => {
    const el = root.querySelector('.de-roster')!;
    const players = d.playerIds.map(playerById).filter((p): p is PlayerDef => !!p);
    const t = dreamToTeamDef(d);
    el.innerHTML = `<div class="de-count" style="--p:${d.primary};--s:${d.secondary}"><span class="tc-abbr">${esc(abbrFromName(d.name))}</span>
        ${players.length}/${MAX_ROSTER} · OVR ${players.length ? teamOvr(t) : '–'}</div>
      ${players
        .map(
          (p, i) => `<div class="ro ${i < 5 ? 'starter' : ''}">
            <span class="ro-tag">${i < 5 ? 'S' : 'B'}</span>
            <span class="ro-name">${esc(p.name)} <small>${esc(p.pos)} · ${esc(p.era)}</small></span>
            <b>${p.ovr}</b>
            <button data-up="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Move up">▲</button>
            <button data-rm="${i}" aria-label="Remove">✕</button></div>`,
        )
        .join('')}
      ${players.length < MIN_ROSTER ? `<p class="hint">Add at least ${MIN_ROSTER} players. The first 5 are your starters.</p>` : '<p class="hint">Top 5 start. Use ▲ to change the lineup.</p>'}`;
    el.querySelectorAll<HTMLElement>('[data-rm]').forEach((b) =>
      b.addEventListener('click', () => {
        d.playerIds.splice(Number(b.dataset.rm), 1);
        renderRoster();
        renderPool();
      }),
    );
    el.querySelectorAll<HTMLElement>('[data-up]').forEach((b) =>
      b.addEventListener('click', () => {
        const i = Number(b.dataset.up);
        [d.playerIds[i - 1], d.playerIds[i]] = [d.playerIds[i], d.playerIds[i - 1]];
        renderRoster();
      }),
    );
    (root.querySelector('.save') as HTMLButtonElement).disabled = players.length < MIN_ROSTER;
  };

  const renderPool = () => {
    const sortFn = SORTS.find((s) => s[0] === f.sort)![2];
    const q = f.q.trim().toLowerCase();
    const pool = ALL_PLAYERS.filter(
      (p) => (f.pos === 'ALL' || p.pos === f.pos) && (f.team === 'ALL' || p.teamId === f.team) && (!q || p.name.toLowerCase().includes(q)),
    ).sort((a, b) => sortFn(b) - sortFn(a) || b.ovr - a.ovr);
    const full = d.playerIds.length >= MAX_ROSTER;
    root.querySelector('.de-pool')!.innerHTML = pool
      .map((p) => {
        const inTeam = d.playerIds.includes(p.id);
        return `<button class="pl ${inTeam ? 'in' : ''}" data-id="${esc(p.id)}" ${inTeam || full ? 'disabled' : ''}>
          <b class="pl-ovr">${p.ovr}</b>
          <span class="pl-name">${esc(p.name)}<small>${esc(p.pos)} · ${esc(p.era)}</small></span>
          <span class="pl-stats"><i>3PT ${p.r.three}</i><i>INS ${p.r.inside}</i><i>DEF ${Math.round((p.r.perD + p.r.intD) / 2)}</i><i>REB ${p.r.reb}</i></span>
          <span class="pl-add">${inTeam ? '✓' : '+'}</span></button>`;
      })
      .join('');
    root.querySelectorAll<HTMLElement>('.pl').forEach((b) =>
      b.addEventListener('click', () => {
        if (d.playerIds.length >= MAX_ROSTER || d.playerIds.includes(b.dataset.id!)) return;
        d.playerIds.push(b.dataset.id!);
        renderRoster();
        renderPool();
      }),
    );
  };

  root.querySelectorAll<HTMLElement>('.sw i').forEach((i) =>
    i.addEventListener('click', () => {
      const k = (i.parentElement as HTMLElement).dataset.k as 'primary' | 'secondary';
      d[k] = i.dataset.c!;
      renderSwatches();
      renderRoster();
    }),
  );
  root.querySelector<HTMLInputElement>('.de-name')!.addEventListener('input', (e) => {
    d.name = (e.target as HTMLInputElement).value;
    renderRoster();
  });
  root.querySelector<HTMLInputElement>('.de-q')!.addEventListener('input', (e) => {
    f.q = (e.target as HTMLInputElement).value;
    renderPool();
  });
  root.querySelectorAll<HTMLElement>('.chips[data-name="pos"] .chip').forEach((c) =>
    c.addEventListener('click', () => {
      root.querySelectorAll('.chips[data-name="pos"] .chip').forEach((x) => x.classList.remove('on'));
      c.classList.add('on');
      f.pos = c.dataset.v as Position | 'ALL';
      renderPool();
    }),
  );
  root.querySelector<HTMLSelectElement>('.de-team')!.addEventListener('change', (e) => {
    f.team = (e.target as HTMLSelectElement).value;
    renderPool();
  });
  root.querySelector<HTMLSelectElement>('.de-sort')!.addEventListener('change', (e) => {
    f.sort = (e.target as HTMLSelectElement).value;
    renderPool();
  });
  root.querySelector('.back')!.addEventListener('click', showDreamList);
  root.querySelector('.save')!.addEventListener('click', () => {
    if (d.playerIds.length < MIN_ROSTER) return;
    d.name = d.name.trim() || 'My Dream Team';
    d.abbr = abbrFromName(d.name);
    saveDreamTeam(d);
    showDreamList();
  });

  renderSwatches();
  renderRoster();
  renderPool();
}

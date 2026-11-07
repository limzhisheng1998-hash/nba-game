import { CORNER_X, CORNER_Y, COURT_L, COURT_W, HOOP_OFFSET, RIM_HEIGHT, THREE_R } from './court';
import type { Game, Player } from './game';
import { METER_TARGET } from './shooting';

/** Draws the game from a side-on "broadcast" angle: y is squashed, z (height) lifts things up. */
export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private s = 10; // px per foot
  private readonly k = 0.46; // depth squash
  private readonly zk = 0.62; // height scale
  private top = 0;
  private camX = COURT_L / 2;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D not supported');
    this.ctx = ctx;
    this.resize();
  }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = this.canvas.getBoundingClientRect();
    this.w = rect.width || window.innerWidth;
    this.h = rect.height || window.innerHeight;
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Fit the court depth (plus headroom for players/rims) into the screen height.
    // Headroom so players standing on the far sideline aren't cut off.
    const headroom = 7;
    const topUI = 46;
    this.s = Math.min(this.w / 46, (this.h - topUI - 8) / (COURT_W * this.k + headroom * this.zk));
    this.top = topUI + headroom * this.zk * this.s;
  }

  private X(x: number) {
    return (x - this.camX) * this.s + this.w / 2;
  }
  private Y(y: number, z = 0) {
    return this.top + y * this.s * this.k - z * this.s * this.zk;
  }

  private poly(pts: [number, number][], close = false) {
    const c = this.ctx;
    c.beginPath();
    pts.forEach(([x, y], i) => (i ? c.lineTo(this.X(x), this.Y(y)) : c.moveTo(this.X(x), this.Y(y))));
    if (close) c.closePath();
  }

  private arc(cx: number, cy: number, r: number, a0: number, a1: number, n = 40): [number, number][] {
    const pts: [number, number][] = [];
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
    return pts;
  }

  draw(g: Game) {
    const c = this.ctx;
    // Camera follows the ball.
    const half = this.w / (2 * this.s);
    const target = Math.max(half - 3, Math.min(COURT_L + 3 - half, g.ball.x));
    this.camX += (target - this.camX) * 0.12;

    c.fillStyle = '#101418';
    c.fillRect(0, 0, this.w, this.h);
    this.drawCourt(g);
    this.drawHoop(HOOP_OFFSET, -1);
    this.drawHoop(COURT_L - HOOP_OFFSET, 1);

    const players = g.onCourt().sort((a, b) => a.y - b.y);
    for (const p of players) this.drawShadow(p.x, p.y, 1.1);
    this.drawShadow(g.ball.x, g.ball.y, 0.45, 0.35);

    const ballDepth = g.ball.owner ? g.ball.owner.y + 0.01 : g.ball.y;
    let ballDrawn = false;
    for (const p of players) {
      if (!ballDrawn && p.y > ballDepth) {
        this.drawBall(g);
        ballDrawn = true;
      }
      this.drawPlayer(g, p);
    }
    if (!ballDrawn) this.drawBall(g);
    this.drawMeter(g);
    this.drawFlash(g);
  }

  private drawCourt(g: Game) {
    const c = this.ctx;
    const home = g.teams[0].def;
    // Floor
    const x0 = this.X(0);
    const x1 = this.X(COURT_L);
    const y0 = this.Y(0);
    const y1 = this.Y(COURT_W);
    c.fillStyle = '#2b1d14';
    c.fillRect(this.X(-6), this.Y(-4), this.X(COURT_L + 6) - this.X(-6), this.Y(COURT_W + 4) - this.Y(-4));
    const grad = c.createLinearGradient(0, y0, 0, y1);
    grad.addColorStop(0, '#c98b52');
    grad.addColorStop(1, '#e0a86c');
    c.fillStyle = grad;
    c.fillRect(x0, y0, x1 - x0, y1 - y0);
    // Board seams
    c.strokeStyle = 'rgba(120,70,30,0.18)';
    c.lineWidth = 1;
    for (let y = 2; y < COURT_W; y += 2) {
      c.beginPath();
      c.moveTo(x0, this.Y(y));
      c.lineTo(x1, this.Y(y));
      c.stroke();
    }
    // Paint
    for (const side of [0, 1]) {
      const bx = side === 0 ? 0 : COURT_L;
      const fx = side === 0 ? 19 : COURT_L - 19;
      this.poly([[bx, 17], [fx, 17], [fx, 33], [bx, 33]], true);
      c.fillStyle = side === 0 ? hexA(g.teams[1].def.primary, 0.55) : hexA(home.primary, 0.55);
      c.fill();
    }
    // Center logo
    this.poly(this.arc(COURT_L / 2, COURT_W / 2, 6, 0, Math.PI * 2), true);
    c.fillStyle = hexA(home.primary, 0.6);
    c.fill();
    c.fillStyle = hexA(home.secondary, 0.9);
    c.font = `900 ${Math.round(this.s * 2.6)}px system-ui, sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(home.abbr, this.X(COURT_L / 2), this.Y(COURT_W / 2));

    c.strokeStyle = 'rgba(255,255,255,0.9)';
    c.lineWidth = 2;
    this.poly([[0, 0], [COURT_L, 0], [COURT_L, COURT_W], [0, COURT_W]], true);
    c.stroke();
    this.poly([[COURT_L / 2, 0], [COURT_L / 2, COURT_W]]);
    c.stroke();
    this.poly(this.arc(COURT_L / 2, COURT_W / 2, 6, 0, Math.PI * 2), true);
    c.stroke();

    const a = Math.asin((COURT_W / 2 - CORNER_Y) / THREE_R);
    for (const side of [0, 1]) {
      const m = side === 0 ? 1 : -1;
      const bx = side === 0 ? 0 : COURT_L;
      const hx = side === 0 ? HOOP_OFFSET : COURT_L - HOOP_OFFSET;
      const fx = bx + m * 19;
      this.poly([[bx, 17], [fx, 17], [fx, 33], [bx, 33]]);
      c.stroke();
      // FT circle
      this.poly(this.arc(fx, COURT_W / 2, 6, 0, Math.PI * 2), true);
      c.stroke();
      // Three-point line
      const cx = bx + m * CORNER_X;
      const start = side === 0 ? -a : Math.PI + a;
      const end = side === 0 ? a : Math.PI - a;
      this.poly([[bx, CORNER_Y], [cx, CORNER_Y]]);
      c.stroke();
      this.poly([[bx, COURT_W - CORNER_Y], [cx, COURT_W - CORNER_Y]]);
      c.stroke();
      this.poly(this.arc(hx, COURT_W / 2, THREE_R, start, end));
      c.stroke();
      // Restricted area
      this.poly(this.arc(hx, COURT_W / 2, 4, side === 0 ? -Math.PI / 2 : Math.PI / 2, side === 0 ? Math.PI / 2 : (3 * Math.PI) / 2, 16));
      c.stroke();
    }
  }

  private drawHoop(hx: number, m: number) {
    const c = this.ctx;
    const bx = hx + m * 1.25; // backboard plane
    const y = COURT_W / 2;
    // Stanchion
    c.strokeStyle = '#555';
    c.lineWidth = Math.max(3, this.s * 0.35);
    c.beginPath();
    c.moveTo(this.X(bx + m * 4), this.Y(y, 0));
    c.lineTo(this.X(bx + m * 4), this.Y(y, 11));
    c.lineTo(this.X(bx), this.Y(y, 11));
    c.stroke();
    // Backboard (seen nearly edge-on from the side, drawn as a thin glass panel)
    c.fillStyle = 'rgba(220,235,255,0.55)';
    c.strokeStyle = '#fff';
    c.lineWidth = 1.5;
    const bw = this.s * 0.6;
    c.fillRect(this.X(bx) - bw / 2, this.Y(y, 13.5), bw, this.Y(y, 9.5) - this.Y(y, 13.5));
    c.strokeRect(this.X(bx) - bw / 2, this.Y(y, 13.5), bw, this.Y(y, 9.5) - this.Y(y, 13.5));
    // Rim
    c.strokeStyle = '#ff5a1f';
    c.lineWidth = 2.5;
    c.beginPath();
    c.ellipse(this.X(hx), this.Y(y, RIM_HEIGHT), 0.75 * this.s, 0.75 * this.s * this.k, 0, 0, Math.PI * 2);
    c.stroke();
    // Net
    c.strokeStyle = 'rgba(255,255,255,0.8)';
    c.lineWidth = 1;
    for (let i = -2; i <= 2; i++) {
      c.beginPath();
      c.moveTo(this.X(hx + i * 0.35), this.Y(y, RIM_HEIGHT));
      c.lineTo(this.X(hx + i * 0.2), this.Y(y, RIM_HEIGHT - 1.6));
      c.stroke();
    }
  }

  private drawShadow(x: number, y: number, r: number, a = 0.3) {
    const c = this.ctx;
    c.fillStyle = `rgba(0,0,0,${a})`;
    c.beginPath();
    c.ellipse(this.X(x), this.Y(y), r * this.s, r * this.s * this.k, 0, 0, Math.PI * 2);
    c.fill();
  }

  private drawPlayer(g: Game, p: Player) {
    const c = this.ctx;
    const team = g.teams[p.team].def;
    const x = this.X(p.x);
    const controlled = g.controlled === p && !g.userAI;
    if (controlled) {
      c.strokeStyle = '#ffd23f';
      c.lineWidth = 3;
      c.beginPath();
      c.ellipse(x, this.Y(p.y), 1.7 * this.s, 1.7 * this.s * this.k, 0, 0, Math.PI * 2);
      c.stroke();
    }
    const bodyH = p.heightFt * 0.78 * this.s * this.zk;
    const feet = this.Y(p.y, p.z);
    const bw = 1.75 * this.s;
    const headR = 0.55 * this.s;
    const wob = p.action === 'stunned' ? Math.sin(g.time * 30) * 2 : 0;
    // Body (jersey)
    c.fillStyle = team.primary;
    c.strokeStyle = team.secondary;
    c.lineWidth = 2;
    roundRect(c, x - bw / 2 + wob, feet - bodyH, bw, bodyH, bw * 0.35);
    c.fill();
    c.stroke();
    // Head
    c.beginPath();
    c.arc(x + wob, feet - bodyH - headR * 0.9, headR, 0, Math.PI * 2);
    c.fillStyle = team.secondary;
    c.fill();
    // Number
    c.fillStyle = team.secondary;
    c.font = `800 ${Math.round(this.s * 0.95)}px system-ui, sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(p.def.num, x + wob, feet - bodyH * 0.55);
    if (p.action === 'stunned') {
      c.fillStyle = '#ffd23f';
      c.fillText('✦ ✦', x, feet - bodyH - headR * 2.6);
    }
    if (controlled) {
      const ty = feet - bodyH - headR * 2.4;
      c.fillStyle = '#ffd23f';
      c.beginPath();
      c.moveTo(x - 6, ty - 8);
      c.lineTo(x + 6, ty - 8);
      c.lineTo(x, ty);
      c.closePath();
      c.fill();
      c.font = `700 ${Math.max(10, Math.round(this.s * 0.8))}px system-ui, sans-serif`;
      c.fillStyle = '#fff';
      c.fillText(lastName(p.def.name), x, ty - 16);
    }
  }

  private drawBall(g: Game) {
    const c = this.ctx;
    const b = g.ball;
    const x = this.X(b.x);
    const y = this.Y(b.y, b.z);
    const r = Math.max(3.5, 0.5 * this.s);
    c.fillStyle = '#e8702a';
    c.strokeStyle = '#3a1c08';
    c.lineWidth = 1.2;
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    c.beginPath();
    c.moveTo(x - r, y);
    c.lineTo(x + r, y);
    c.moveTo(x, y - r);
    c.lineTo(x, y + r);
    c.stroke();
  }

  private drawMeter(g: Game) {
    if (!g.settings.shotMeter || g.userAI) return;
    const p = g.controlled;
    if (!p || (p.action !== 'shoot' && p.action !== 'ftshoot')) return;
    const c = this.ctx;
    const h = 56;
    const w = 9;
    const x = this.X(p.x) + 1.6 * this.s;
    const yb = this.Y(p.y, p.z) - 8;
    const scale = 1.15; // meter shows 0..1.15
    c.fillStyle = 'rgba(0,0,0,0.6)';
    c.fillRect(x - 1, yb - h - 1, w + 2, h + 2);
    const win = g.diff.green * (p.action === 'ftshoot' ? 1.2 : 1);
    const gy0 = yb - ((METER_TARGET + win / 2) / scale) * h;
    const gy1 = yb - ((METER_TARGET - win / 2) / scale) * h;
    c.fillStyle = 'rgba(61,220,132,0.9)';
    c.fillRect(x, gy0, w, gy1 - gy0);
    const f = Math.min(p.meter, scale) / scale;
    c.fillStyle = '#fff';
    c.fillRect(x, yb - f * h, w, 3);
    c.fillStyle = 'rgba(255,255,255,0.35)';
    c.fillRect(x, yb - f * h, w, f * h);
  }

  private drawFlash(g: Game) {
    if (!g.flash) return;
    const c = this.ctx;
    c.font = `900 ${Math.round(Math.min(34, this.h * 0.08))}px system-ui, sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.lineWidth = 4;
    c.strokeStyle = 'rgba(0,0,0,0.7)';
    const y = this.h * 0.3;
    c.strokeText(g.flash.text.toUpperCase(), this.w / 2, y);
    c.fillStyle = g.flash.color;
    c.fillText(g.flash.text.toUpperCase(), this.w / 2, y);
  }
}

function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.lineTo(x + w - r, y);
  c.quadraticCurveTo(x + w, y, x + w, y + r);
  c.lineTo(x + w, y + h - r);
  c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  c.lineTo(x + r, y + h);
  c.quadraticCurveTo(x, y + h, x, y + h - r);
  c.lineTo(x, y + r);
  c.quadraticCurveTo(x, y, x + r, y);
  c.closePath();
}

function hexA(hex: string, a: number) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((ch) => ch + ch).join('') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export function lastName(name: string) {
  const parts = name.split(' ');
  return parts.length > 1 ? parts.slice(1).join(' ') : name;
}

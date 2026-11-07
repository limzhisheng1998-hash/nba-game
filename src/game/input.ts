import type { FrameInput } from './game';

type Btn = 'a' | 'b' | 'c' | 'd';

const LABELS: Record<'offense' | 'defense', Record<Btn, string>> = {
  offense: { a: 'SHOOT', b: 'PASS', c: 'SPRINT', d: 'SPIN' },
  defense: { a: 'BLOCK', b: 'STEAL', c: 'SPRINT', d: 'SWITCH' },
};

/**
 * On-screen touch controls: a floating joystick on the left half and four
 * buttons on the right. Uses pointer events so multi-touch works on iOS.
 * Keyboard (WASD/arrows + J K L Shift) is a dev-only fallback.
 */
export class TouchInput {
  private held: Record<Btn, boolean> = { a: false, b: false, c: false, d: false };
  private prev: Record<Btn, boolean> = { a: false, b: false, c: false, d: false };
  private mx = 0;
  private my = 0;
  private joyId: number | null = null;
  private joyX = 0;
  private joyY = 0;
  private keys = new Set<string>();
  private mode: 'offense' | 'defense' | null = null;
  private els: Record<Btn, HTMLElement>;
  private base: HTMLElement;
  private knob: HTMLElement;
  private zone: HTMLElement;
  private cleanup: (() => void)[] = [];

  constructor(root: HTMLElement) {
    root.insertAdjacentHTML(
      'beforeend',
      `<div class="joy-zone"><div class="joy-base"><div class="joy-knob"></div></div></div>
       <div class="pad">
         <button class="btn btn-d" data-b="d"></button>
         <button class="btn btn-c" data-b="c"></button>
         <button class="btn btn-b" data-b="b"></button>
         <button class="btn btn-a" data-b="a"></button>
       </div>`,
    );
    this.zone = root.querySelector('.joy-zone')!;
    this.base = root.querySelector('.joy-base')!;
    this.knob = root.querySelector('.joy-knob')!;
    this.els = {
      a: root.querySelector('.btn-a')!,
      b: root.querySelector('.btn-b')!,
      c: root.querySelector('.btn-c')!,
      d: root.querySelector('.btn-d')!,
    };
    this.setMode('offense');

    const R = 52;
    const on = <K extends keyof HTMLElementEventMap>(el: EventTarget, ev: K, fn: (e: HTMLElementEventMap[K]) => void) => {
      el.addEventListener(ev, fn as EventListener, { passive: false });
      this.cleanup.push(() => el.removeEventListener(ev, fn as EventListener));
    };

    on(this.zone, 'pointerdown', (e) => {
      e.preventDefault();
      if (this.joyId !== null) return;
      this.joyId = e.pointerId;
      this.zone.setPointerCapture?.(e.pointerId);
      const r = this.zone.getBoundingClientRect();
      this.joyX = e.clientX;
      this.joyY = e.clientY;
      this.base.style.left = `${e.clientX - r.left}px`;
      this.base.style.top = `${e.clientY - r.top}px`;
      this.base.classList.add('active');
      this.knob.style.transform = 'translate(-50%, -50%)';
    });
    on(this.zone, 'pointermove', (e) => {
      if (e.pointerId !== this.joyId) return;
      e.preventDefault();
      let dx = e.clientX - this.joyX;
      let dy = e.clientY - this.joyY;
      const d = Math.hypot(dx, dy);
      if (d > R) {
        dx = (dx / d) * R;
        dy = (dy / d) * R;
      }
      this.mx = dx / R;
      this.my = dy / R;
      this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    });
    const joyEnd = (e: PointerEvent) => {
      if (e.pointerId !== this.joyId) return;
      this.joyId = null;
      this.mx = this.my = 0;
      this.base.classList.remove('active');
      this.knob.style.transform = 'translate(-50%, -50%)';
    };
    on(this.zone, 'pointerup', joyEnd);
    on(this.zone, 'pointercancel', joyEnd);

    for (const b of ['a', 'b', 'c', 'd'] as Btn[]) {
      const el = this.els[b];
      on(el, 'pointerdown', (e) => {
        e.preventDefault();
        el.setPointerCapture?.(e.pointerId);
        this.held[b] = true;
        el.classList.add('down');
      });
      const up = () => {
        this.held[b] = false;
        el.classList.remove('down');
      };
      on(el, 'pointerup', up);
      on(el, 'pointercancel', up);
      on(el, 'lostpointercapture', up);
      on(el, 'contextmenu', (e) => e.preventDefault());
    }

    on(window, 'keydown', (e) => this.keys.add((e as KeyboardEvent).key.toLowerCase()));
    on(window, 'keyup', (e) => this.keys.delete((e as KeyboardEvent).key.toLowerCase()));
    on(window, 'blur', () => this.reset());
  }

  setMode(m: 'offense' | 'defense') {
    if (m === this.mode) return;
    this.mode = m;
    for (const b of ['a', 'b', 'c', 'd'] as Btn[]) this.els[b].textContent = LABELS[m][b];
    this.els.a.parentElement?.setAttribute('data-mode', m);
  }

  reset() {
    this.held = { a: false, b: false, c: false, d: false };
    this.mx = this.my = 0;
    this.joyId = null;
    this.keys.clear();
    this.base.classList.remove('active');
    Object.values(this.els).forEach((el) => el.classList.remove('down'));
  }

  /** Read one frame of input. Edge flags (aDown etc.) are true only on the first frame. */
  frame(): FrameInput {
    const k = this.keys;
    let mx = this.mx;
    let my = this.my;
    if (k.size) {
      const kx = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0);
      const ky = (k.has('s') || k.has('arrowdown') ? 1 : 0) - (k.has('w') || k.has('arrowup') ? 1 : 0);
      if (kx || ky) {
        const m = Math.hypot(kx, ky);
        mx = kx / m;
        my = ky / m;
      }
    }
    const cur: Record<Btn, boolean> = {
      a: this.held.a || k.has('j'),
      b: this.held.b || k.has('k'),
      c: this.held.c || k.has('shift'),
      d: this.held.d || k.has('l'),
    };
    const out: FrameInput = {
      mx,
      my,
      a: cur.a,
      b: cur.b,
      c: cur.c,
      d: cur.d,
      aDown: cur.a && !this.prev.a,
      aUp: !cur.a && this.prev.a,
      bDown: cur.b && !this.prev.b,
      dDown: cur.d && !this.prev.d,
    };
    this.prev = cur;
    return out;
  }

  destroy() {
    this.cleanup.forEach((f) => f());
  }
}

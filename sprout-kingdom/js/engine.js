// Engine core: fixed-timestep loop, input, camera, particles, save data.

// ---------------- input ----------------
const Input = {
  held: {}, pressed: {},
  _map: {
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
    ArrowUp: 'up', KeyW: 'up',
    ArrowDown: 'down', KeyS: 'down',
    KeyZ: 'jump', Space: 'jump',
    KeyX: 'run', ShiftLeft: 'run', ShiftRight: 'run',
    KeyC: 'spin',
    Enter: 'start',
    Escape: 'pause', KeyP: 'pause',
    KeyM: 'mute',
  },
  _padHeld: {},
  init() {
    addEventListener('keydown', (e) => {
      const a = this._map[e.code];
      if (a) {
        e.preventDefault();
        if (!this.held[a]) this.pressed[a] = true;
        this.held[a] = true;
      }
      AudioSys.unlock();
      Game.anyKey = true;
    });
    addEventListener('keyup', (e) => {
      const a = this._map[e.code];
      if (a) { this.held[a] = false; }
    });
    // a click focuses the page for gamepad play and satisfies the
    // browser's user-gesture requirement for audio
    addEventListener('pointerdown', () => { AudioSys.unlock(); });
    addEventListener('blur', () => { this.held = {}; });
  },
  // standard-mapping gamepad: dpad/stick move, A jumps, X/B run, LB/B spin,
  // Start = confirm/pause, Select = pause. Polled once per update tick.
  pollGamepad() {
    if (!navigator.getGamepads) return;
    let gp = null;
    for (const p of navigator.getGamepads()) if (p && p.connected) { gp = p; break; }
    if (!gp) return;
    const b = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed);
    const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
    const now = {
      left: b(14) || ax < -0.45,
      right: b(15) || ax > 0.45,
      up: b(12) || ay < -0.55,
      down: b(13) || ay > 0.55,
      jump: b(0),
      spin: b(1) || b(4),
      run: b(2) || b(3) || b(5),
      start: b(9),
      pause: b(8),
    };
    for (const a in now) {
      if (now[a] && !this._padHeld[a]) {
        this.pressed[a] = true;
        Game.anyKey = true;
        AudioSys.unlock();
      }
      if (now[a]) this.held[a] = true;
      else if (this._padHeld[a]) this.held[a] = false;
      this._padHeld[a] = now[a];
    }
  },
  // consume edge-triggered presses; called at the end of each update tick
  endFrame() { this.pressed = {}; },
};

// ---------------- camera ----------------
class Camera {
  constructor(levelW, levelH) {
    this.x = 0; this.y = 0;
    this.w = VIEW_W; this.h = VIEW_H;
    this.levelW = levelW; this.levelH = levelH;
    this.lookAhead = 0;
    this.groundY = 0;       // last grounded platform target
    this.shakeT = 0; this.shakeMag = 0;
    this.lockX = null;      // boss arenas lock scrolling
  }
  shake(frames, mag = 3) { this.shakeT = Math.max(this.shakeT, frames); this.shakeMag = mag; }
  follow(p, instant = false) {
    // horizontal: center + look-ahead in facing direction
    const targetLook = p.dir * 36 * Math.min(1, Math.abs(p.vx) / PHYS.maxRun + 0.25);
    this.lookAhead += (targetLook - this.lookAhead) * (instant ? 1 : 0.04);
    let tx = p.x + p.w / 2 - this.w / 2 + this.lookAhead;
    // vertical: platform snapping — track ground level, loose while airborne
    if (p.onGround || p.riding) this.groundY = p.y + p.h;
    let ty = this.groundY - this.h * 0.68;
    // if player strays near top/bottom of view, follow anyway
    const relY = p.y - this.y;
    if (relY < this.h * 0.22) ty = Math.min(ty, p.y - this.h * 0.22);
    if (relY > this.h * 0.78) ty = Math.max(ty, p.y - this.h * 0.78);
    if (instant) { this.x = tx; this.y = ty; this.groundY = p.y + p.h; }
    else {
      this.x += (tx - this.x) * 0.12;
      this.y += (ty - this.y) * 0.09;
    }
    if (this.lockX != null) this.x = this.lockX;
    this.x = Math.max(0, Math.min(this.levelW - this.w, this.x));
    this.y = Math.max(0, Math.min(this.levelH - this.h, this.y));
    if (this.levelH <= this.h) this.y = this.levelH - this.h;
  }
  offset() {
    let ox = 0, oy = 0;
    if (this.shakeT > 0) {
      this.shakeT--;
      const m = this.shakeMag * (this.shakeT / 12 + 0.3);
      ox = (Math.random() * 2 - 1) * m;
      oy = (Math.random() * 2 - 1) * m;
    }
    return { x: Math.round(this.x + ox), y: Math.round(this.y + oy) };
  }
}

// ---------------- particles ----------------
const Particles = {
  list: [],
  clear() { this.list = []; },
  spawn(x, y, opts = {}) {
    this.list.push({
      x, y,
      vx: opts.vx ?? (Math.random() * 2 - 1),
      vy: opts.vy ?? (-Math.random() * 2),
      g: opts.g ?? 0.12,
      life: opts.life ?? 30,
      maxLife: opts.life ?? 30,
      color: opts.color ?? '#fff',
      size: opts.size ?? 2,
      text: opts.text ?? null,
    });
  },
  burst(x, y, n, opts = {}) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.5;
      const sp = (opts.speed ?? 1.5) * (0.6 + Math.random() * 0.7);
      this.spawn(x, y, { ...opts, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 0.8 });
    }
  },
  score(x, y, amount) {
    this.spawn(x, y, { vx: 0, vy: -0.7, g: 0, life: 45, text: String(amount), color: '#fff' });
  },
  update() {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.x += p.vx; p.y += p.vy; p.vy += p.g;
      if (--p.life <= 0) this.list.splice(i, 1);
    }
  },
  draw(ctx, cam) {
    for (const p of this.list) {
      const a = Math.min(1, p.life / (p.maxLife * 0.4));
      ctx.globalAlpha = a;
      if (p.text) {
        drawText(ctx, p.text, p.x - cam.x - textWidth(p.text) / 2, p.y - cam.y, p.color, 1, '#00000080');
      } else {
        ctx.fillStyle = p.color;
        ctx.fillRect(Math.round(p.x - cam.x), Math.round(p.y - cam.y), p.size, p.size);
      }
      ctx.globalAlpha = 1;
    }
  },
};

// ---------------- save ----------------
const Save = {
  data: null,
  load() {
    try {
      this.data = JSON.parse(localStorage.getItem(SAVE_KEY)) || null;
    } catch (e) { this.data = null; }
    if (!this.data) {
      this.data = { levels: {}, unlocked: ['1-1'], highScore: 0, muted: false, seeds: [] };
    }
    if (!this.data.seeds) this.data.seeds = [];
    return this.data;
  },
  write() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.data)); } catch (e) { /* private mode */ }
  },
  levelRec(id) {
    if (!this.data.levels[id]) this.data.levels[id] = { clear: false, secret: false, stars: [false, false, false], bestTime: null };
    return this.data.levels[id];
  },
  unlock(id) {
    if (id && !this.data.unlocked.includes(id)) this.data.unlocked.push(id);
  },
  addSeed(tag) {
    if (!this.data.seeds.includes(tag)) this.data.seeds.push(tag);
  },
  reset() {
    this.data = { levels: {}, unlocked: ['1-1'], highScore: this.data.highScore, muted: this.data.muted, seeds: [] };
    this.write();
  },
};

// ---------------- helpers ----------------
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function lerp(a, b, t) { return a + (b - a) * t; }
function aabb(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
function fmtTime(sec) {
  sec = Math.max(0, Math.floor(sec));
  return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
}

// Draw a sprite canvas with its bottom-center anchored at (x, y), optionally flipped.
function drawSprite(ctx, img, x, y, flip = false, cam = { x: 0, y: 0 }, scaleY = 1, scaleX = 1) {
  const dx = Math.round(x - cam.x), dy = Math.round(y - cam.y);
  ctx.save();
  ctx.translate(dx, dy);
  if (flip) ctx.scale(-1, 1);
  ctx.scale(scaleX, scaleY);
  ctx.drawImage(img, Math.round(-img.width / 2), -img.height);
  ctx.restore();
}

// ---------------- game shell / loop ----------------
const Game = {
  canvas: null, ctx: null,
  state: null, // object with update()/draw()
  frame: 0,
  anyKey: false,
  _acc: 0, _last: 0,
  transition: null, // {t, dur, dir:'in'|'out', cb}

  init() {
    this.canvas = document.getElementById('game');
    this.ctx = this.canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    Input.init();
    Save.load();
    if (Save.data.muted) AudioSys.muted = true;
    this.resize();
    addEventListener('resize', () => this.resize());
    requestAnimationFrame((t) => { this._last = t; this._loop(t); });
  },

  resize() {
    const scale = Math.max(1, Math.floor(Math.min(innerWidth / VIEW_W, innerHeight / VIEW_H)));
    this.canvas.style.width = VIEW_W * scale + 'px';
    this.canvas.style.height = VIEW_H * scale + 'px';
  },

  setState(s) { this.state = s; },

  // Circle-wipe transition, then call cb, then wipe back in.
  // If a wipe is already running, the callback is queued (latest wins)
  // and starts once the current wipe finishes, instead of being dropped.
  _wipeQueued: null,
  wipe(cb) {
    if (this.transition) { this._wipeQueued = cb; return; }
    this.transition = { t: 0, dur: 22, phase: 'out', cb };
  },

  _loop(now) {
    requestAnimationFrame((t) => this._loop(t));
    let dt = now - this._last;
    this._last = now;
    if (dt > 100) dt = 100;
    this._acc += dt;
    const STEP = 1000 / 60;
    while (this._acc >= STEP) {
      this._acc -= STEP;
      this._update();
    }
    this._draw();
  },

  _update() {
    this.frame++;
    Input.pollGamepad();
    if (Input.pressed.mute) {
      const m = AudioSys.toggleMute();
      Save.data.muted = m; Save.write();
    }
    if (this.transition) {
      const tr = this.transition;
      tr.t++;
      if (tr.phase === 'out' && tr.t >= tr.dur) {
        tr.cb && tr.cb();
        tr.phase = 'in'; tr.t = 0;
      } else if (tr.phase === 'in' && tr.t >= tr.dur) {
        this.transition = null;
        if (this._wipeQueued) {
          const cb = this._wipeQueued;
          this._wipeQueued = null;
          this.wipe(cb);
        }
      }
      Input.endFrame();
      return; // freeze gameplay during wipe
    }
    if (this.state && this.state.update) this.state.update();
    Input.endFrame();
  },

  _draw() {
    const ctx = this.ctx;
    if (this.state && this.state.draw) this.state.draw(ctx);
    if (this.transition) {
      const tr = this.transition;
      const p = tr.t / tr.dur;
      const r = (tr.phase === 'out' ? 1 - p : p) * Math.hypot(VIEW_W, VIEW_H) * 0.6;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, VIEW_W, VIEW_H);
      ctx.arc(VIEW_W / 2, VIEW_H / 2, Math.max(0, r), 0, Math.PI * 2, true);
      ctx.fillStyle = '#1a0f08';
      ctx.fill('evenodd');
      ctx.restore();
    }
    // mute indicator
    if (AudioSys.muted) drawText(ctx, 'MUTE', VIEW_W - 30, VIEW_H - 10, '#ffffff90');
  },
};

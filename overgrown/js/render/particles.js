// Pooled particle system + world ambiance (pollen, fireflies, drips, fog,
// embers, wind streaks). Visual only; runs on render frames.

import { Container, Sprite } from 'pixi.js';
import { VIEW_W, VIEW_H } from '../config.js';
import { TEX } from './gfx.js';
import { makeRng, clamp } from '../core/math.js';

const MAX = 700;

export class Particles {
  constructor() {
    this.c = new Container();          // world space, normal blend
    this.add = new Container();        // world space, additive-ish (glows)
    this.pool = [];
    this.live = [];
    this.rng = makeRng(99);
    this.ambT = 0;
  }

  _get(addLayer) {
    let s = this.pool.pop();
    if (!s) {
      if (this.live.length >= MAX) return null;
      s = new Sprite();
      s.anchor.set(0.5);
    }
    (addLayer ? this.add : this.c).addChild(s);
    return s;
  }

  spawn(o) {
    const s = this._get(o.add);
    if (!s) return null;
    s.texture = o.tex || TEX.particles.dot;
    s.x = o.x; s.y = o.y;
    s.rotation = o.rot || 0;
    s.tint = o.tint ?? 0xffffff;
    s.alpha = o.alpha ?? 1;
    s.blendMode = o.add ? 'add' : 'normal';
    const scale = o.scale ?? 1;
    s.width = s.texture.width / 6 * scale;
    s.height = s.texture.height / 6 * scale;
    s.visible = true;
    this.live.push({
      s, vx: o.vx || 0, vy: o.vy || 0, g: o.g ?? 0, drag: o.drag ?? 0,
      life: o.life || 40, maxLife: o.life || 40,
      scale, scaleEnd: o.scaleEnd ?? scale,
      alpha: o.alpha ?? 1, alphaEnd: o.alphaEnd ?? 0,
      vrot: o.vrot || 0, sway: o.sway || 0, swayT: this.rng() * 6,
      texW: s.texture.width / 6, texH: s.texture.height / 6,
    });
    return s;
  }

  update(dt) {
    const live = this.live;
    for (let i = live.length - 1; i >= 0; i--) {
      const p = live[i];
      p.life -= dt;
      if (p.life <= 0) {
        p.s.visible = false;
        p.s.parent?.removeChild(p.s);
        this.pool.push(p.s);
        live.splice(i, 1);
        continue;
      }
      p.vy += p.g * dt;
      if (p.drag) { p.vx *= Math.pow(1 - p.drag, dt); p.vy *= Math.pow(1 - p.drag, dt); }
      if (p.sway) { p.swayT += dt * 0.1; p.vx += Math.sin(p.swayT) * p.sway * dt; }
      p.s.x += p.vx * dt;
      p.s.y += p.vy * dt;
      p.s.rotation += p.vrot * dt;
      const t = 1 - p.life / p.maxLife;
      const sc = p.scale + (p.scaleEnd - p.scale) * t;
      p.s.width = p.texW * sc; p.s.height = p.texH * sc;
      p.s.alpha = p.alpha + (p.alphaEnd - p.alpha) * t;
    }
  }

  clear() {
    for (const p of this.live) { p.s.visible = false; p.s.parent?.removeChild(p.s); this.pool.push(p.s); }
    this.live.length = 0;
  }

  // ------------------------------------------------------------- presets --
  dust(x, y, n = 4, dir = 0) {
    for (let i = 0; i < n; i++) {
      this.spawn({
        x: x + this.rng.range(-4, 4), y: y - this.rng() * 2,
        vx: dir * this.rng.range(0.2, 0.9) + this.rng.range(-0.4, 0.4),
        vy: this.rng.range(-0.7, -0.1), g: 0.01, drag: 0.06,
        life: this.rng.range(14, 26), scale: this.rng.range(0.7, 1.4), scaleEnd: 2,
        alpha: 0.5, tint: 0xcfc8b8,
      });
    }
  }

  burst(x, y, opts = {}) {
    const n = opts.n || 8;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + this.rng() * 0.6;
      const sp = (opts.speed || 1.6) * this.rng.range(0.5, 1.15);
      this.spawn({
        x, y, tex: opts.tex || TEX.particles.spark,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (opts.up || 0),
        g: opts.g ?? 0.06, drag: 0.04,
        life: opts.life || this.rng.range(16, 30),
        scale: opts.scale || this.rng.range(0.7, 1.2), scaleEnd: 0.3,
        tint: opts.tint ?? 0xffffff, add: opts.add,
        vrot: this.rng.range(-0.3, 0.3),
      });
    }
  }

  ring(x, y, opts = {}) {
    this.spawn({
      x, y, tex: TEX.particles.ring, add: true,
      life: opts.life || 14, scale: opts.scale || 0.5, scaleEnd: opts.scaleEnd || 3.2,
      alpha: opts.alpha ?? 0.9, tint: opts.tint ?? 0xffffff,
    });
  }

  sparkle(x, y, tint = 0xfff2b0, n = 6) {
    for (let i = 0; i < n; i++) {
      this.spawn({
        x: x + this.rng.range(-5, 5), y: y + this.rng.range(-5, 5),
        tex: TEX.particles.spark, add: true,
        vx: this.rng.range(-0.4, 0.4), vy: this.rng.range(-1.2, -0.3),
        life: this.rng.range(18, 34), scale: this.rng.range(0.5, 1), scaleEnd: 0.1,
        tint, vrot: 0.2,
      });
    }
  }

  debris(x, y, tint = 0xa9713b, n = 6) {
    for (let i = 0; i < n; i++) {
      this.spawn({
        x, y, tex: TEX.particles.debris,
        vx: this.rng.range(-1.6, 1.6), vy: this.rng.range(-2.6, -0.8),
        g: 0.16, life: this.rng.range(24, 44), scale: this.rng.range(0.7, 1.3), scaleEnd: 0.8,
        tint, vrot: this.rng.range(-0.4, 0.4), alphaEnd: 0.6,
      });
    }
  }

  splash(x, y, power = 2) {
    const n = Math.min(14, 4 + power * 3);
    for (let i = 0; i < n; i++) {
      this.spawn({
        x: x + this.rng.range(-5, 5), y,
        tex: TEX.particles.drip,
        vx: this.rng.range(-1.2, 1.2), vy: this.rng.range(-2.6, -1) * (0.5 + power * 0.25),
        g: 0.18, life: this.rng.range(18, 34), scale: this.rng.range(0.7, 1.2), scaleEnd: 0.5,
        alpha: 0.9,
      });
    }
    this.ring(x, y, { scale: 0.3, scaleEnd: 1.6, life: 12, tint: 0xbfe8ff, alpha: 0.6 });
  }

  petals(x, y, n = 10, tint = 0xffc3dd) {
    for (let i = 0; i < n; i++) {
      this.spawn({
        x: x + this.rng.range(-6, 6), y: y + this.rng.range(-4, 4),
        tex: TEX.particles.petal,
        vx: this.rng.range(-1.4, 1.4), vy: this.rng.range(-2.2, -0.6),
        g: 0.035, drag: 0.02, sway: 0.06,
        life: this.rng.range(30, 60), scale: this.rng.range(0.8, 1.3), scaleEnd: 0.9,
        tint, vrot: this.rng.range(-0.2, 0.2), alphaEnd: 0,
      });
    }
  }

  // --------------------------------------------------------- world ambiance --
  ambient(worldIdx, world, camX, camY, dt, dark) {
    this.ambT += dt;
    const r = this.rng;
    const every = (n) => this.ambT % n < dt;
    const vx0 = camX - VIEW_W / 2, vy0 = camY - VIEW_H / 2;
    if (worldIdx === 0) {
      if (every(9)) this.spawn({    // drifting pollen
        x: vx0 + r() * VIEW_W, y: vy0 + r() * VIEW_H, tex: TEX.particles.dot, add: true,
        vx: r.range(0.05, 0.3), vy: r.range(-0.12, 0.1), sway: 0.02,
        life: 160, scale: r.range(0.3, 0.7), scaleEnd: 0.3, alpha: 0.5, alphaEnd: 0, tint: 0xfff2b0,
      });
      if (every(34)) this.spawn({   // falling leaf
        x: vx0 + r() * VIEW_W, y: vy0 - 10, tex: TEX.particles.leaf,
        vx: r.range(-0.3, 0.1), vy: r.range(0.25, 0.5), sway: 0.05,
        life: 300, scale: r.range(0.8, 1.2), scaleEnd: 1, alpha: 0.9, alphaEnd: 0.5,
        vrot: r.range(-0.06, 0.06),
      });
    } else if (worldIdx === 1) {
      if (every(16)) this.spawn({   // dust motes
        x: vx0 + r() * VIEW_W, y: vy0 + r() * VIEW_H, tex: TEX.particles.dot,
        vx: r.range(-0.06, 0.06), vy: r.range(-0.05, 0.06),
        life: 200, scale: 0.35, scaleEnd: 0.35, alpha: 0.3, alphaEnd: 0, tint: 0x9fd8d0, add: true,
      });
      if (every(50)) {              // cave drip
        const dx = vx0 + r() * VIEW_W;
        this.spawn({
          x: dx, y: vy0 + r() * 40, tex: TEX.particles.drip,
          vx: 0, vy: 0.4, g: 0.16, life: 60, scale: 1, alpha: 0.85, alphaEnd: 0.85,
        });
      }
      if (every(70)) this.spawn({   // firefly
        x: vx0 + r() * VIEW_W, y: vy0 + VIEW_H * 0.4 + r() * VIEW_H * 0.5,
        tex: TEX.particles.dot, add: true,
        vx: r.range(-0.15, 0.15), vy: r.range(-0.1, 0.1), sway: 0.04,
        life: 260, scale: 0.5, scaleEnd: 0.4, alpha: 0.9, alphaEnd: 0, tint: 0xaaf0c0,
      });
    } else if (worldIdx === 2) {
      const wind = world.wind ? world.wind.current : 0.4;
      if (every(5)) this.spawn({    // streaming cloud fog flecks
        x: wind > 0 ? vx0 - 20 : vx0 + VIEW_W + 20, y: vy0 + r() * VIEW_H,
        tex: TEX.particles.streak,
        vx: wind * r.range(2.2, 4), vy: r.range(-0.08, 0.08),
        life: 120, scale: r.range(0.8, 1.6), scaleEnd: 1.2, alpha: 0.5, alphaEnd: 0,
      });
      if (every(20)) this.spawn({   // fog puff
        x: vx0 + r() * VIEW_W, y: vy0 + r() * VIEW_H, tex: TEX.particles.dot,
        vx: wind * 1.4, vy: 0, life: 140, scale: 5, scaleEnd: 8, alpha: 0.12, alphaEnd: 0, tint: 0xffffff,
      });
    } else if (worldIdx === 3) {
      if (every(7)) this.spawn({    // rising embers
        x: vx0 + r() * VIEW_W, y: vy0 + VIEW_H + 8, tex: TEX.particles.ember, add: true,
        vx: r.range(-0.2, 0.2), vy: r.range(-0.7, -0.3), sway: 0.05,
        life: 180, scale: r.range(0.6, 1.3), scaleEnd: 0.3, alpha: 0.95, alphaEnd: 0,
      });
      if (every(40)) this.spawn({   // thorn debris flake
        x: vx0 + r() * VIEW_W, y: vy0 - 8, tex: TEX.particles.debris,
        vx: r.range(-0.2, 0.2), vy: r.range(0.3, 0.7), life: 240, scale: 0.7, scaleEnd: 0.7,
        tint: 0x4a2018, alpha: 0.8, alphaEnd: 0.4, vrot: 0.05,
      });
    }
    // underwater bubbles near player
    const p = world.player;
    if (p.swim && every(14)) {
      this.spawn({
        x: p.x + r.range(-4, 4), y: p.y - 14, tex: TEX.particles.bubble,
        vx: r.range(-0.1, 0.1), vy: r.range(-0.5, -0.25), sway: 0.05,
        life: 50, scale: r.range(0.5, 1), scaleEnd: 1.1, alpha: 0.8, alphaEnd: 0,
      });
    }
  }
}

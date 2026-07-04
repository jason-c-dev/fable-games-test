// Renderer: owns the PIXI stage tree, syncs sim state to views each frame
// with interpolation, and turns sim events into particles/flashes/shake.
// Audio subscribes to the same event stream via onEvent.

import { Container, Sprite, Graphics, Text, Rectangle } from 'pixi.js';
import { VIEW_W, VIEW_H, TILE, T, COMBAT as C } from '../config.js';
import { TEX, PAL, glowTex } from './gfx.js';
import { PipRig, makeEnemyView } from './rigs.js';
import { Background } from './background.js';
import { TileMapView } from './tilemap.js';
import { Particles } from './particles.js';
import { Lighting } from './lighting.js';
import { PostFX } from './postfx.js';
import { lerp, clamp, makeRng } from '../core/math.js';

function makeHintText(str) {
  const t = new Text({
    text: str,
    style: {
      fontFamily: 'Trebuchet MS, Verdana, sans-serif',
      fontSize: 6.5,
      fontWeight: '900',
      fill: 0xfff8e0,
      stroke: { color: 0x2a3a24, width: 1.5 },
      letterSpacing: 0.4,
    },
  });
  t.anchor.set(0.5);
  t.alpha = 0.92;
  return t;
}

export class Renderer {
  constructor(app) {
    this.app = app;
    this.rng = makeRng(7);

    this.stageRoot = new Container();       // scaled+centred 512x288 space
    app.stage.addChild(this.stageRoot);

    this.bgRoot = new Container();          // screen space (parallax inside)
    this.viewRoot = new Container();        // world space (camera)
    this.overlayRoot = new Container();     // screen space (lighting, hud)
    this.stageRoot.addChild(this.bgRoot, this.viewRoot, this.overlayRoot);

    this.bg = new Background();
    this.bgRoot.addChild(this.bg.c);

    this.postfx = new PostFX();
    if (this.postfx.filters) {
      // grade applies to the whole scene (bg + world), not the HUD
      this.gradeGroup = new Container();
      this.stageRoot.removeChild(this.bgRoot, this.viewRoot);
      this.gradeGroup.addChild(this.bgRoot, this.viewRoot);
      this.stageRoot.addChildAt(this.gradeGroup, 0);
      this.gradeGroup.filters = this.postfx.filters;
      this.gradeGroup.filterArea = new Rectangle(0, 0, VIEW_W, VIEW_H);
    }

    // clip everything to the 512x288 letterbox: world sprites extend past
    // the view and would otherwise draw raw (ungraded) outside the box
    this.stageMask = new Graphics().rect(0, 0, VIEW_W, VIEW_H).fill(0xffffff);
    this.stageRoot.addChild(this.stageMask);
    this.stageRoot.mask = this.stageMask;

    // world-space layers
    this.tilemap = null;
    this.staticGlows = new Container();
    this.entityC = new Container();
    this.pipLayer = new Container();
    this.particles = new Particles();
    this.beamG = new Graphics();
    this.beamG.blendMode = 'add';
    this.laserG = new Graphics();
    this.laserG.blendMode = 'add';
    this.lavaG = new Graphics();

    this.lighting = new Lighting(app);
    this.overlayRoot.addChild(this.lighting.out);

    this.pip = new PipRig();
    this.pipLayer.addChild(this.pip.root);

    this.views = new Map();                 // entity id -> view
    this.input = null;                      // set by main; used for hint prompts
    this.hintsC = new Container();
    this.hintDefs = [];
    this._hintDevice = null;
    this.ghosts = [];
    this.ghostT = 0;
    this.shakePower = 0;
    this.kickX = 0; this.kickY = 0;
    this.shakeScale = 1;                    // settings: screen-shake intensity
    this.onEvent = null;                    // audio hook
    this.popups = [];
    this.worldIdx = 0;
    this.frame = 0;

    this.letterbox();
  }

  letterbox() {
    const resize = () => {
      // renderer.screen is always CSS pixels regardless of devicePixelRatio;
      // renderer.width already includes resolution on some paths, so never
      // divide by it here (that halves the layout on Retina displays)
      const w = this.app.renderer.screen.width;
      const h = this.app.renderer.screen.height;
      const s = Math.min(w / VIEW_W, h / VIEW_H);
      this.stageRoot.scale.set(s);
      this.stageRoot.position.set((w - VIEW_W * s) / 2, (h - VIEW_H * s) / 2);
      if (this.gradeGroup) {
        // filterArea is in the filtered container's local space
        this.gradeGroup.filterArea = new Rectangle(0, 0, VIEW_W, VIEW_H);
      }
    };
    this.app.renderer.on('resize', resize);
    resize();
  }

  loadLevel(world, worldIdx) {
    this.worldIdx = worldIdx;
    this.bg.setWorld(worldIdx);
    this.postfx.setWorld(worldIdx);
    this.viewRoot.removeChildren();
    this.views.clear();
    this.particles.clear();
    for (const g of this.ghosts) g.sprite.destroy({ texture: true });
    this.ghosts = [];

    this.tilemap = new TileMapView(worldIdx);
    this.tilemap.build(world);
    this.buildStaticGlows(world);

    this.hintDefs = world.def.hints || [];
    this.buildHints();

    this.viewRoot.addChild(
      this.staticGlows,
      this.tilemap.c,
      this.hintsC,
      this.entityC,
      this.pipLayer,
      this.particles.c,
      this.beamG,
      this.laserG,
      this.particles.add,
      this.tilemap.waterC,
      this.lavaG,
    );
    this.entityC.removeChildren();
  }

  // in-world tutorial signs; {action} placeholders resolve to live prompts
  hintText(t) {
    const pad = this.input?.lastDevice === 'pad';
    return t.replace(/\{(\w+)\}/g, (_, a) => {
      if (a === 'move') return pad ? 'STICK' : 'ARROWS/WASD';
      return this.input ? this.input.promptFor(a) : a.toUpperCase();
    });
  }

  buildHints() {
    this.hintsC.removeChildren();
    this._hintDevice = this.input?.lastDevice || 'kb';
    for (const h of this.hintDefs) {
      const t = makeHintText(this.hintText(h.text));
      t.position.set(h.tx * TILE + 8, h.ty * TILE);
      this.hintsC.addChild(t);
    }
  }

  buildStaticGlows(world) {
    this.staticGlows.removeChildren();
    const add = (x, y, r, tint, alpha) => {
      const s = new Sprite(TEX.glow);
      s.anchor.set(0.5);
      s.blendMode = 'add';
      s.position.set(x, y);
      s.width = r * 2; s.height = r * 2;
      s.tint = tint; s.alpha = alpha;
      this.staticGlows.addChild(s);
      return s;
    };
    for (const ln of world.room.lanterns || []) {
      add(ln.x * TILE + 8, ln.y * TILE + 9, 30, 0xffb347, 0.4);
    }
  }

  view(e, world) {
    let v = this.views.get(e.id);
    if (!v) {
      v = this.makeView(e);
      this.views.set(e.id, v);
      this.entityC.addChild(v.c);
    }
    return v;
  }

  makeView(e) {
    const name = e.constructor.name;
    if (name === 'Coin') {
      const v = { c: new Container(), t: e.bobT || 0 };
      const s = new Sprite(TEX.items.coin);
      s.anchor.set(0.5, 1); s.width = 10; s.height = 12;
      const gl = new Sprite(TEX.glowSmall);
      gl.anchor.set(0.5); gl.blendMode = 'add'; gl.tint = 0xffd24a; gl.alpha = 0.35;
      gl.width = 18; gl.height = 18; gl.y = -6;
      v.c.addChild(gl, s);
      v.update = (e2, w2, dt) => {
        v.t += dt;
        s.scale.x = Math.sin(v.t * 0.11) * (s.scale.y);
        s.y = Math.sin(v.t * 0.07) * 1.4;
        gl.y = -6 + s.y;
      };
      return v;
    }
    if (name === 'DewStar') {
      const v = { c: new Container(), t: 0 };
      const gl = new Sprite(TEX.glow);
      gl.anchor.set(0.5); gl.blendMode = 'add'; gl.tint = 0x9fe8ff; gl.alpha = 0.4;
      gl.width = 34; gl.height = 34; gl.y = -7;
      const s = new Sprite(TEX.items.star);
      s.anchor.set(0.5, 1); s.width = 14; s.height = 14;
      v.c.addChild(gl, s);
      v.update = (e2, w2, dt) => {
        v.t += dt;
        s.y = Math.sin(v.t * 0.06) * 2;
        s.rotation = Math.sin(v.t * 0.045) * 0.2;
        gl.alpha = 0.3 + Math.sin(v.t * 0.13) * 0.12;
        gl.y = -7 + s.y;
        if (this.frame % 20 === 0) this.particles.sparkle(e2.x, e2.y - 8, 0xbdf3ff, 1);
      };
      return v;
    }
    if (name === 'Pickup') {
      const texMap = { fruit: TEX.items.fruit, glider: TEX.items.glider, clover: TEX.items.clover, sapdrop: TEX.items.sapdrop, beam: TEX.items.beamlance };
      const v = { c: new Container(), t: 0 };
      const s = new Sprite(texMap[e.kind] || TEX.items.fruit);
      s.anchor.set(0.5, 1);
      s.width = s.texture.width / 6; s.height = s.texture.height / 6;
      const gl = new Sprite(TEX.glowSmall);
      gl.anchor.set(0.5); gl.blendMode = 'add'; gl.alpha = 0.4; gl.width = 20; gl.height = 20; gl.y = -5;
      gl.tint = e.kind === 'fruit' ? 0xffa03c : e.kind === 'sapdrop' ? 0xa8e05a : 0xffffff;
      v.c.addChild(gl, s);
      v.update = (e2, w2, dt) => { v.t += dt; s.rotation = Math.sin(v.t * 0.08) * 0.12; };
      return v;
    }
    if (name === 'BlockCoin') {
      const v = { c: new Container() };
      const s = new Sprite(TEX.items.coin);
      s.anchor.set(0.5, 1); s.width = 10; s.height = 12;
      v.c.addChild(s);
      v.update = (e2, w2, dt) => { s.rotation += 0.3 * dt; };
      return v;
    }
    if (name === 'Projectile') {
      const v = { c: new Container(), t: 0 };
      const g = new Graphics();
      if (e.kind === 'rock') {
        g.circle(0, -4, 4.4).fill(0x8d7f63);
        g.circle(-1.2, -5.2, 1.4).fill({ color: 0xffffff, alpha: 0.25 });
        g.circle(0, -4, 4.4).stroke({ width: 0.8, color: 0x4c443a });
      } else if (e.kind === 'feather') {
        g.ellipse(0, -3, 4.4, 1.9).fill(0xf0ead8);
        g.moveTo(-3.4, -3).lineTo(3.4, -3).stroke({ width: 0.5, color: 0xb4a488 });
      } else if (e.kind === 'shockwave') {
        g.moveTo(-5, 0).quadraticCurveTo(0, -9, 5, 0).fill({ color: 0xff9d5c, alpha: 0.9 });
        g.moveTo(-3, 0).quadraticCurveTo(0, -6, 3, 0).fill({ color: 0xfff2b0, alpha: 0.9 });
      } else if (e.kind === 'burr') {
        g.circle(0, -4, 3).fill(0x7e3f9e);
        for (let i = 0; i < 6; i++) {
          const a = i / 6 * Math.PI * 2;
          g.moveTo(Math.cos(a) * 2.4, -4 + Math.sin(a) * 2.4)
            .lineTo(Math.cos(a) * 4.4, -4 + Math.sin(a) * 4.4)
            .stroke({ width: 1, color: 0x5c2f73 });
        }
      } else {
        g.ellipse(0, -4, 4, 3).fill(0x8fce58);
        g.ellipse(-1, -5, 1.4, 1).fill(0xd6f0a0);
      }
      const gl = new Sprite(TEX.glowSmall);
      gl.anchor.set(0.5); gl.blendMode = 'add'; gl.alpha = 0.5; gl.width = 14; gl.height = 14; gl.y = -4;
      v.c.addChild(gl, g);
      v.update = (e2, w2, dt) => {
        v.t += dt;
        g.rotation += 0.2 * dt;
        gl.tint = e2.friendly ? 0xaaffcc : 0xffd0a0;
      };
      return v;
    }
    // enemies + moss + dummy
    return makeEnemyView(e);
  }

  // ---------------------------------------------------------------- draw --
  draw(world, alpha, dt) {
    this.frame++;
    const p = world.player;

    // hint prompts follow the active input device
    if (this.hintDefs.length && this.input && this.input.lastDevice !== this._hintDevice) {
      this.buildHints();
    }

    // camera (interpolated + shake + kick)
    const camX = lerp(world.pCamX, world.camX, alpha);
    const camY = lerp(world.pCamY, world.camY, alpha);
    this.shakePower = Math.max(0, this.shakePower - 0.4 * dt);
    this.kickX *= Math.pow(0.85, dt); this.kickY *= Math.pow(0.85, dt);
    const sp = this.shakePower * this.shakeScale;
    const shx = (this.rng() - 0.5) * 2 * sp + this.kickX;
    const shy = (this.rng() - 0.5) * 2 * sp + this.kickY;
    this.viewRoot.position.set(Math.round((-camX + VIEW_W / 2 + shx) * 2) / 2, Math.round((-camY + VIEW_H / 2 + shy) * 2) / 2);

    this.bg.update(camX, camY, this.frame);
    this.tilemap.update(world, this.frame);

    // pip
    const px = lerp(p.px, p.x, alpha), py = lerp(p.py, p.y, alpha);
    this.pip.root.position.set(px, py);
    this.pip.root.visible = !(p.state === 'dead' && world.deathT < 40);
    this.pip.update(p, world, dt);

    // dash ghosts
    if (p.state === 'dash') {
      this.ghostT -= dt;
      if (this.ghostT <= 0) {
        this.ghostT = 2;
        try {
          const tex = this.app.renderer.generateTexture(this.pip.root);
          const g = new Sprite(tex);
          g.anchor.set(0.5, 1);
          g.position.set(px, py + 0);
          g.scale.x = p.facing;
          g.tint = 0x9fffc8;
          g.alpha = 0.45;
          this.pipLayer.addChildAt(g, 0);
          this.ghosts.push({ sprite: g, life: 12 });
        } catch (err) { /* snapshot is cosmetic */ }
      }
    }
    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      const g = this.ghosts[i];
      g.life -= dt;
      g.sprite.alpha = Math.max(0, g.life / 12) * 0.45;
      if (g.life <= 0) {
        g.sprite.destroy({ texture: true });
        this.ghosts.splice(i, 1);
      }
    }

    // entities
    const seen = new Set();
    for (const e of world.entities) {
      if (e.removed) continue;
      seen.add(e.id);
      const v = this.view(e, world);
      const ex = lerp(e.px, e.x, alpha), ey = lerp(e.py, e.y, alpha);
      v.c.position.set(ex, ey);
      v.c.visible = e.active || !e.isEnemy;
      v.update(e, world, dt);
    }
    for (const [id, v] of this.views) {
      if (!seen.has(id)) { this.entityC.removeChild(v.c); v.c.destroy({ children: true }); this.views.delete(id); }
    }

    this.drawBeam(world, px, py, p);
    this.drawLasers(world);
    this.drawLava(world, camX, camY);

    // charge glow on Pip
    if (p.charged || p.chargeT > 12) {
      const amt = p.charged ? 0.8 : p.chargeT / this.chargeNeedSafe(p) * 0.5;
      if (this.frame % 4 === 0) this.particles.sparkle(px + p.facing * 6, py - 10, 0xffd76e, 1);
    }
    if (p.beamCharge > 6) {
      this.particles.spawn({
        x: px + p.facing * 8 + this.rng.range(-8, 8), y: py - 10 + this.rng.range(-8, 8),
        tex: TEX.particles.spark, add: true, tint: 0xfff2b0,
        vx: (px + p.facing * 8 - (px + p.facing * 8 + this.rng.range(-10, 10))) * 0.1, vy: 0,
        life: 8, scale: 0.6, scaleEnd: 0.2,
      });
    }

    // heal channel motes
    if (p.state === 'heal' && this.frame % 3 === 0) {
      this.particles.spawn({
        x: px + this.rng.range(-8, 8), y: py, tex: TEX.particles.dot, add: true,
        vx: 0, vy: -0.8, life: 24, scale: 0.7, scaleEnd: 0.2, tint: 0xa8e05a,
      });
    }

    // events -> fx/audio
    for (const ev of world.events) this.handleEvent(ev, world);
    world.events.length = 0;

    // ambiance + particles
    this.particles.ambient(this.worldIdx, world, camX, camY, dt, world.darkness);
    this.particles.update(dt);
    this.lighting.update(world, camX, camY, this.frame);
    this.postfx.update(dt);

    // popups
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const pop = this.popups[i];
      pop.life -= dt;
      pop.t.y -= 0.5 * dt;
      pop.t.alpha = Math.min(1, pop.life / 20);
      if (pop.life <= 0) { pop.t.destroy(); this.popups.splice(i, 1); }
    }
  }

  chargeNeedSafe(p) { try { return p.chargeNeed; } catch { return 38; } }

  drawBeam(world, px, py, p) {
    const g = this.beamG;
    g.clear();
    if (p.beamCharge > 4) {
      const r = 2 + (p.beamCharge / 30) * 5;
      g.circle(px + p.facing * 8, py - p.h * 0.55, r).fill({ color: 0xfff2b0, alpha: 0.7 });
    }
    if (world.beamSegs) {
      const pulse = 1 + Math.sin(this.frame * 0.7) * 0.2;
      for (const s of world.beamSegs) {
        g.moveTo(s.x1, s.y1).lineTo(s.x2, s.y2).stroke({ width: 7 * pulse, color: 0xffb347, alpha: 0.25 });
        g.moveTo(s.x1, s.y1).lineTo(s.x2, s.y2).stroke({ width: 3.5 * pulse, color: 0xffd76e, alpha: 0.7 });
        g.moveTo(s.x1, s.y1).lineTo(s.x2, s.y2).stroke({ width: 1.4, color: 0xfffbe8, alpha: 1 });
      }
      const last = world.beamSegs[world.beamSegs.length - 1];
      g.circle(last.x2, last.y2, 4 + Math.sin(this.frame) * 1.2).fill({ color: 0xfffbe8, alpha: 0.9 });
      if (this.frame % 2 === 0) this.particles.sparkle(last.x2, last.y2, 0xffd76e, 1);
    }
  }

  drawLasers(world) {
    const g = this.laserG;
    g.clear();
    for (const e of world.entities) {
      if (e.removed || e.dying) continue;
      if (e.beamSeg && e.constructor.name !== 'Glintwing') {
        const s = e.beamSeg;
        g.moveTo(s.x1, s.y1).lineTo(s.x2, s.y2).stroke({ width: 6, color: 0xffb347, alpha: 0.3 });
        g.moveTo(s.x1, s.y1).lineTo(s.x2, s.y2).stroke({ width: 2, color: 0xfff2b0, alpha: 0.95 });
        continue;
      }
      if (e.constructor.name !== 'Glintwing') continue;
      if (e.mode === 'aim') {
        const p2 = world.player;
        const d = Math.hypot(p2.x - e.x, p2.y - e.y) || 1;
        const ex = e.x + (p2.x - e.x) / d * 300, ey = e.y + (p2.y - 8 - e.y) / d * 300;
        g.moveTo(e.x, e.y - 4).lineTo(ex, ey).stroke({ width: 0.8, color: 0xff5c5c, alpha: 0.25 + (this.frame % 8 < 4 ? 0.2 : 0) });
      } else if (e.beamSeg) {
        const s = e.beamSeg;
        g.moveTo(s.x1, s.y1).lineTo(s.x2, s.y2).stroke({ width: 5, color: 0xff5c3c, alpha: 0.3 });
        g.moveTo(s.x1, s.y1).lineTo(s.x2, s.y2).stroke({ width: 1.6, color: 0xffd0c0, alpha: 0.95 });
      }
    }
  }

  drawLava(world, camX, camY) {
    const g = this.lavaG;
    g.clear();
    if (!world.lava) return;
    const y = world.lava.y;
    if (y > camY + VIEW_H / 2 + 40) return;
    const x0 = camX - VIEW_W / 2 - 8, x1 = camX + VIEW_W / 2 + 8;
    // molten thorn tide: layered waves
    g.moveTo(x0, y + 6);
    for (let x = x0; x <= x1; x += 8) g.lineTo(x, y + Math.sin(x * 0.08 + this.frame * 0.1) * 2.4);
    g.lineTo(x1, camY + VIEW_H / 2 + 60).lineTo(x0, camY + VIEW_H / 2 + 60).closePath();
    g.fill({ color: 0x8a2c1a, alpha: 0.94 });
    g.moveTo(x0, y + 4);
    for (let x = x0; x <= x1; x += 8) g.lineTo(x, y - 1 + Math.sin(x * 0.08 + this.frame * 0.1) * 2.4);
    g.stroke({ width: 2.6, color: 0xff9d3c, alpha: 0.9 });
    if (this.frame % 3 === 0) {
      this.particles.spawn({
        x: camX + this.rng.range(-VIEW_W / 2, VIEW_W / 2), y: y + 2,
        tex: TEX.particles.ember, add: true,
        vx: this.rng.range(-0.3, 0.3), vy: this.rng.range(-1.4, -0.6),
        life: 40, scale: this.rng.range(0.6, 1.2), scaleEnd: 0.2,
      });
    }
  }

  slashArc(x, y, facing, kind) {
    // crescent flash for sword readability
    const g = new Graphics();
    const big = kind === 'slash3' || kind === 'spin';
    const r = kind === 'spin' ? 30 : big ? 26 : 21;
    if (kind === 'spin') {
      g.circle(0, 0, r).stroke({ width: 5, color: 0xd8ffe0, alpha: 0.85 });
      g.circle(0, 0, r - 4).stroke({ width: 2, color: 0xffffff, alpha: 0.9 });
    } else {
      const a0 = kind === 'up' ? -2.6 : -1.15, a1 = kind === 'up' ? -0.5 : 1.05;
      g.arc(0, 0, r, a0, a1).stroke({ width: 5.5, color: 0xd8ffe0, alpha: 0.8 });
      g.arc(0, 0, r - 4, a0 + 0.15, a1 - 0.15).stroke({ width: 2, color: 0xffffff, alpha: 0.95 });
      g.scale.x = facing;
    }
    g.blendMode = 'add';
    g.position.set(x, y);
    this.particles.add.addChild(g);
    const arc = { g, life: 7 };
    const tick = () => {
      arc.life--;
      g.alpha = arc.life / 7;
      g.scale.set(g.scale.x < 0 ? -(1 + (7 - arc.life) * 0.06) : 1 + (7 - arc.life) * 0.06, 1 + (7 - arc.life) * 0.06);
      if (arc.life <= 0) { g.destroy(); this.app.ticker.remove(tick); }
    };
    this.app.ticker.add(tick);
  }

  popup(x, y, str, tint = 0xffffff) {
    if (this.popups.length > 12) return;
    const t = new Text({
      text: str,
      style: {
        fontFamily: 'Trebuchet MS, Verdana, sans-serif', fontSize: 6, fontWeight: '900',
        fill: tint, stroke: { color: 0x1a2418, width: 1.6 },
      },
    });
    t.anchor.set(0.5);
    t.position.set(x, y - 14);
    this.viewRoot.addChild(t);
    this.popups.push({ t, life: 40 });
  }

  // --------------------------------------------------------------- events --
  handleEvent(ev, world) {
    const P = this.particles;
    if (this.onEvent) this.onEvent(ev, world);
    switch (ev.t) {
      case 'jump': P.dust(ev.x, ev.y + 9, 4); break;
      case 'land': P.dust(ev.x, ev.y + 9, Math.min(9, 2 + ev.power * 1.5)); break;
      case 'skid': P.dust(ev.x, ev.y + 9, 2); break;
      case 'dash': P.burst(ev.x, ev.y, { n: 6, tex: TEX.particles.dot, tint: 0x9fffc8, speed: 1, add: true, g: 0 }); break;
      case 'dashrefresh': P.sparkle(ev.x, ev.y + 6, 0x9fffc8, 2); break;
      case 'walljump': P.dust(ev.x + ev.dir * -6, ev.y, 5, ev.dir); break;
      case 'wallgrab': P.dust(ev.x, ev.y, 2); break;
      case 'wallslidefx': P.spawn({ x: ev.x + (ev.dir || 1) * 5, y: ev.y + 6, tex: TEX.particles.fleck, vx: -(ev.dir || 1) * 0.3, vy: -0.4, life: 12, scale: 0.5, tint: 0xcccccc }); break;
      case 'ledgegrab': P.dust(ev.x, ev.y - 6, 3); break;
      case 'plungestart': P.ring(ev.x, ev.y, { scale: 0.8, scaleEnd: 0.2, life: 8, tint: 0xd8ffe0 }); break;
      case 'plungeland': P.dust(ev.x, ev.y + 9, 10); P.ring(ev.x, ev.y + 6, { scaleEnd: 2.4, tint: 0xffffff }); this.shake(2); break;
      case 'pogo': P.ring(ev.x, ev.y + 8, { scale: 0.4, scaleEnd: 1.6, life: 10, tint: 0xd8ffe0 }); break;
      case 'spring': P.petals(ev.x, ev.y + 6, 8, 0xff8fc0); break;
      case 'swing': this.slashArc(ev.x, ev.y, ev.facing, ev.kind); break;
      case 'spin': this.slashArc(ev.x, ev.y, 1, 'spin'); break;
      case 'slashhit':
        P.burst(ev.x, ev.y, { n: ev.heavy ? 10 : 6, speed: ev.heavy ? 2.4 : 1.6, tint: 0xfff2b0, add: true });
        this.kick(2 * (ev.heavy ? 1.6 : 1), 0);
        break;
      case 'clang':
        P.burst(ev.x, ev.y, { n: 5, speed: 1.8, tint: 0xcfd8ff, add: true });
        this.popup(ev.x, ev.y, 'CLANG', 0xcfd8ff);
        break;
      case 'enemyhit': P.burst(ev.x, ev.y, { n: 4, speed: 1.2, tint: 0xffe0c0 }); break;
      case 'enemydie': P.burst(ev.x, ev.y, { n: 10, speed: 2, tint: 0xffffff, up: 1 }); P.ring(ev.x, ev.y, {}); break;
      case 'stomp': P.dust(ev.x, ev.y, 6); if (ev.chain > 1) this.popup(ev.x, ev.y, 'x' + ev.chain, 0xffd76e); break;
      case 'parrystart': P.sparkle(ev.x, ev.y, 0xcfe8ff, 2); break;
      case 'parry':
        P.ring(ev.x, ev.y, { scale: 0.3, scaleEnd: 3.4, life: 16, tint: 0xcfe8ff });
        P.burst(ev.x, ev.y, { n: 12, speed: 2.6, tint: 0xffffff, add: true });
        this.postfx.flash([0.85, 0.95, 1], 0.35);
        this.shake(2);
        break;
      case 'parryreflect': P.sparkle(ev.x, ev.y, 0xcfe8ff, 5); break;
      case 'deflect': P.sparkle(ev.x, ev.y, 0xfff2b0, 3); break;
      case 'hurt':
        P.burst(ev.x, ev.y, { n: 8, speed: 2, tint: 0xff8080 });
        this.postfx.flash([1, 0.25, 0.2], 0.4);
        this.kick(0, 3);
        break;
      case 'hazard': this.postfx.flash([1, 0.3, 0.2], 0.35); break;
      case 'safereturn': P.burst(ev.x, ev.y - 8, { n: 8, tex: TEX.particles.dot, tint: 0xffffff, speed: 1.2, g: 0 }); break;
      case 'die': P.burst(ev.x, ev.y - 8, { n: 16, speed: 3, tint: 0xff8080 }); this.shake(4); break;
      case 'respawn': P.ring(ev.x, ev.y - 8, { tint: 0xd8ffe0 }); break;
      case 'coin': P.sparkle(ev.x, ev.y, 0xffd24a, 4); this.popup(ev.x, ev.y, '100', 0xffd24a); break;
      case 'star':
        P.ring(ev.x, ev.y, { scaleEnd: 4, life: 20, tint: 0x9fe8ff });
        P.sparkle(ev.x, ev.y, 0xbdf3ff, 14);
        this.popup(ev.x, ev.y, 'DEW STAR!', 0x9fe8ff);
        break;
      case 'fruit': P.sparkle(ev.x, ev.y, 0xffa03c, 6); this.popup(ev.x, ev.y, '+♥', 0xff8090); break;
      case 'relic': P.ring(ev.x, ev.y, { scaleEnd: 3, tint: 0xffd76e }); this.popup(ev.x, ev.y, 'GLIDER CAP!', 0xffd76e); break;
      case 'relicbeam':
        P.ring(ev.x, ev.y, { scale: 0.4, scaleEnd: 6, life: 26, tint: 0xffd76e });
        P.sparkle(ev.x, ev.y, 0xfff2b0, 16);
        this.popup(ev.x, ev.y - 6, 'SUNBEAM LANCE!', 0xffd76e);
        this.postfx.flash([1, 0.95, 0.8], 0.4);
        break;
      case 'oneup': this.popup(ev.x, ev.y, '1UP!', 0x8fce58); P.sparkle(ev.x, ev.y, 0x8fce58, 8); break;
      case 'sappickup': P.sparkle(ev.x, ev.y, 0xa8e05a, 3); break;
      case 'blockbump': P.sparkle(ev.x, ev.y - 8, 0xfff2b0, 3); this.tilemap.bump(Math.floor(ev.x / 16), Math.floor((ev.y - 8) / 16)); break;
      case 'brickbreak': P.debris(ev.x, ev.y, PAL[this.worldIdx] ? 0xa9713b : 0xa9713b, 8); this.kick(0, 1.5); break;
      case 'shellstun': P.dust(ev.x, ev.y, 5); break;
      case 'shellkick': case 'shellbounce': P.burst(ev.x, ev.y, { n: 4, speed: 1.4, tint: 0xffc0a0 }); break;
      case 'shellchain': this.popup(ev.x, ev.y, 'CHAIN!', 0xffd76e); break;
      case 'ricochet': P.ring(ev.x, ev.y, { tint: 0xcfe8ff }); this.popup(ev.x, ev.y, 'RICOCHET!', 0xcfe8ff); break;
      case 'shieldbreak': P.burst(ev.x, ev.y, { n: 10, speed: 2.2, tint: 0xaab8d6 }); this.popup(ev.x, ev.y, 'BREAK!', 0xaab8d6); break;
      case 'enemyparry': P.sparkle(ev.x, ev.y, 0xcfd8ff, 4); break;
      case 'duelwindup': case 'glint': P.sparkle(ev.x, ev.y - 6, 0xfff2b0, 3); break;
      case 'stagger': P.spawn({ x: ev.x, y: ev.y - 14, tex: TEX.particles.spark, tint: 0xffd76e, vy: -0.4, life: 20, scale: 0.8, add: true }); break;
      case 'wisplit': P.sparkle(ev.x, ev.y, 0xffd76e, 6); break;
      case 'burst':
        P.petals(ev.x, ev.y, 22, 0xffc3dd);
        P.ring(ev.x, ev.y, { scale: 0.4, scaleEnd: 8, life: 22, tint: 0xffc3dd });
        this.postfx.flash([1, 0.9, 0.95], 0.4);
        this.shake(4);
        break;
      case 'bloomfang': P.petals(ev.x, ev.y, 10); P.ring(ev.x, ev.y, { scaleEnd: 3 }); break;
      case 'healstart': break;
      case 'heal': P.sparkle(ev.x, ev.y, 0xa8e05a, 10); this.popup(ev.x, ev.y, '+♥', 0xa8e05a); break;
      case 'healcancel': break;
      case 'splash': P.splash(ev.x, ev.y + 6, ev.power); break;
      case 'stroke': break;
      case 'waterleap': P.splash(ev.x, ev.y + 10, 3); break;
      case 'beamready': P.sparkle(ev.x, ev.y, 0xfff2b0, 4); break;
      case 'beamfire': this.kick(-2, 0); break;
      case 'overheat': P.burst(ev.x, ev.y, { n: 8, tex: TEX.particles.dot, tint: 0xff6b3d, speed: 0.8, up: 0.6 }); this.popup(ev.x, ev.y, 'OVERHEAT!', 0xff6b3d); break;
      case 'crystal': P.sparkle(ev.x, ev.y, 0xffe9a0, 8); P.ring(ev.x, ev.y, { tint: 0xffe9a0 }); break;
      case 'gateopen': this.popup(world.player.x, world.player.y - 24, 'THE WAY OPENS', 0x9fe8ff); break;
      case 'crumble': break;
      case 'crumblego': P.debris(ev.x, ev.y, 0x8d7f63, 5); break;
      case 'checkpoint':
        P.petals(ev.x, ev.y, 12, 0x8fce58);
        this.popup(ev.x, ev.y - 6, 'CHECKPOINT', 0x8fce58);
        break;
      case 'goal': P.petals(ev.x, ev.y - 10, 24, 0xffd76e); break;
      case 'mount': P.dust(ev.x, ev.y, 4); break;
      case 'chomp': P.burst(ev.x, ev.y, { n: 5, tint: 0x8fce58 }); break;
      case 'mossflee': this.popup(ev.x, ev.y - 10, '!', 0xff8080); break;
      case 'updraftfx':
        P.spawn({ x: ev.x + this.rng.range(-6, 6), y: ev.y + 10, tex: TEX.particles.streak, rot: -Math.PI / 2, vx: 0, vy: -2.4, life: 16, scale: 0.7, alpha: 0.5 });
        break;
      case 'shake': this.shake(ev.power); break;
      case 'bossdead': this.postfx.flash([1, 1, 1], 0.5); this.shake(6); break;
      case 'bossroar': this.shake(4); this.popup(ev.x, ev.y - 30, ev.name || 'BOSS', 0xff9d5c); break;
      case 'bossglint': P.sparkle(ev.x, ev.y, 0xfff2b0, 6); break;
      case 'bosshit': P.burst(ev.x, ev.y, { n: 8, speed: 2, tint: 0xffd0a0 }); this.kick(2, 1); break;
      case 'bossphase': this.postfx.flash([1, 0.6, 0.4], 0.3); this.shake(4); break;
      case 'bossstun': P.burst(ev.x, ev.y, { n: 10, speed: 2, tint: 0xffe0a0 }); break;
      case 'bossslam': P.dust(ev.x, ev.y, 14); P.ring(ev.x, ev.y, { scaleEnd: 4 }); break;
      case 'bossleap': case 'bosscrouch': P.dust(ev.x, ev.y + 6, 5); break;
      case 'bossburst': P.burst(ev.x + this.rng.range(-14, 14), ev.y - this.rng.range(0, 20), { n: 9, speed: 2.4, tint: 0xfff2b0, add: true }); this.shake(2); break;
      case 'dirttrail': P.spawn({ x: ev.x + this.rng.range(-8, 8), y: ev.y, tex: TEX.particles.debris, vx: this.rng.range(-0.5, 0.5), vy: this.rng.range(-1.6, -0.6), g: 0.14, life: 22, scale: 0.9, tint: 0x8a6a48 }); break;
      case 'bossduel': this.popup(ev.x, ev.y - 34, 'TO THE DUEL', 0xff9d5c); this.postfx.flash([1, 0.7, 0.5], 0.35); this.shake(3); break;
      case 'bosswhip': case 'bosslunge': case 'bosssummon': P.dust(ev.x, ev.y, 4); break;
      case 'brambledown':
        this.postfx.flash([1, 1, 1], 0.7);
        this.shake(8);
        P.ring(ev.x, ev.y - 16, { scale: 0.5, scaleEnd: 10, life: 40, tint: 0xffd76e });
        P.petals(ev.x, ev.y - 10, 30, 0xffd76e);
        break;
      case 'emergewind': P.dust(ev.x, ev.y, 8); this.shake(1.5); break;
      case 'grubemerge': P.debris(ev.x, ev.y, 0x8a6a48, 12); this.shake(3); break;
      case 'grubspit': P.dust(ev.x, ev.y - 10, 3); break;
      case 'grubdive': P.dust(ev.x, ev.y, 8); break;
      case 'featherfan': P.burst(ev.x, ev.y - 8, { n: 6, tex: TEX.particles.dot, tint: 0xffffff, speed: 1 }); break;
      case 'gust': this.popup(ev.x, ev.y - 26, 'GUST!', 0xcfe8ff); break;
      case 'projbreak': P.burst(ev.x, ev.y, { n: 3, speed: 0.8, tint: 0xd0c0a0 }); break;
      case 'lob': case 'burr': case 'podarm': case 'swoop': case 'dronelaser': break;
      default: break;
    }
  }

  shake(n) { this.shakePower = Math.max(this.shakePower, n * 0.7); }
  kick(x, y) { this.kickX += x * this.shakeScale; this.kickY += y * this.shakeScale; }
}

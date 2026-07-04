// Dynamic 2D lighting: a darkness overlay rendered to a small RT each frame
// with light sprites punched out via 'erase' blending, plus warm additive
// glows for emissive sources (drawn by the renderer under the overlay).

import { Container, Sprite, Graphics, RenderTexture } from 'pixi.js';
import { VIEW_W, VIEW_H, TILE, T } from '../config.js';
import { TEX, glowTex } from './gfx.js';

export class Lighting {
  constructor(app) {
    this.app = app;
    this.rt = RenderTexture.create({ width: VIEW_W, height: VIEW_H, resolution: 2 });
    this.scene = new Container();                    // offscreen: dark + holes
    this.darkG = new Graphics();
    this.scene.addChild(this.darkG);
    this.holes = [];
    this.holePool = [];
    this.out = new Sprite(this.rt);                  // screen-space overlay
    this.out.width = VIEW_W; this.out.height = VIEW_H;
    this.enabled = false;
    this.softTex = glowTex(32, [['0', 'rgba(255,255,255,1)'], ['0.5', 'rgba(255,255,255,0.85)'], ['1', 'rgba(255,255,255,0)']]);
  }

  hole(x, y, r, alpha = 1) {
    let s = this.holePool.pop();
    if (!s) {
      s = new Sprite(this.softTex);
      s.anchor.set(0.5);
      s.blendMode = 'erase';
    }
    s.texture = this.softTex;
    s.position.set(x, y);
    s.width = r * 2; s.height = r * 2;
    s.alpha = alpha;
    this.scene.addChild(s);
    this.holes.push(s);
  }

  update(world, camX, camY, frame) {
    const dark = world.darkness || 0;
    this.enabled = dark > 0;
    this.out.visible = this.enabled;
    if (!this.enabled) return;

    // reset holes
    for (const h of this.holes) { this.scene.removeChild(h); this.holePool.push(h); }
    this.holes.length = 0;

    this.darkG.clear();
    this.darkG.rect(0, 0, VIEW_W, VIEW_H).fill({ color: 0x06080f, alpha: dark });

    const toView = (wx, wy) => [wx - camX + VIEW_W / 2, wy - camY + VIEW_H / 2];
    const flick = (n) => 1 + Math.sin(frame * 0.11 + n * 3.7) * 0.05;

    // player glow
    const p = world.player;
    const [px, py] = toView(p.x, p.y - p.h / 2);
    this.hole(px, py, 44 * flick(0), 0.98);

    // lanterns
    for (const ln of world.room.lanterns || []) {
      const [lx, ly] = toView(ln.x * TILE + 8, ln.y * TILE + 9);
      if (lx < -80 || lx > VIEW_W + 80 || ly < -80 || ly > VIEW_H + 80) continue;
      this.hole(lx, ly, 58 * flick(ln.x), 1);
    }
    // lit crystals
    for (const [key, v] of world.crystalLit) {
      const [cx, cy] = toView(v.x * TILE + 8, v.y * TILE + 8);
      this.hole(cx, cy, 52, 1);
    }
    // beam light
    if (world.beamSegs) {
      for (const seg of world.beamSegs) {
        const steps = Math.max(1, Math.ceil(Math.hypot(seg.x2 - seg.x1, seg.y2 - seg.y1) / 24));
        for (let i = 0; i <= steps; i++) {
          const [bx, by] = toView(seg.x1 + (seg.x2 - seg.x1) * i / steps, seg.y1 + (seg.y2 - seg.y1) * i / steps);
          this.hole(bx, by, 26, 0.9);
        }
      }
    }
    // lit wisps + glowing projectiles
    for (const e of world.entities) {
      if (e.removed) continue;
      if (e.constructor.name === 'Wisp') {
        const [wx, wy] = toView(e.x, e.y - 6);
        this.hole(wx, wy, e.litT > 0 ? 40 : 20, 0.8);
      } else if (e.isProjectile) {
        const [wx, wy] = toView(e.x, e.y - 4);
        this.hole(wx, wy, 14, 0.7);
      }
    }
    // thorn tide glow
    if (world.lava) {
      const [, ly] = toView(0, world.lava.y);
      if (ly < VIEW_H + 60) {
        for (let sx = 10; sx < VIEW_W; sx += 44) this.hole(sx, ly + 16, 46, 0.55);
      }
    }

    this.app.renderer.render({ container: this.scene, target: this.rt, clear: true });
  }
}

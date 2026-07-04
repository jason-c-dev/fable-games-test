// Parallax backgrounds: sky gradient + sun + 4 generated tiling depth layers
// per world, with atmospheric fade baked into the layer colors.

import { Container, Sprite, TilingSprite } from 'pixi.js';
import { VIEW_W, VIEW_H } from '../config.js';
import { cnv, toTex, lin, rad, blob, PAL, lighten, shade } from './gfx.js';
import { makeRng } from '../core/math.js';

const LAYER_W = 512;

function skyTex(world) {
  const p = PAL[world];
  const [c, x] = cnv(VIEW_W / 2, VIEW_H / 2);
  x.fillStyle = lin(x, 0, 0, 0, VIEW_H / 2, p.sky);
  x.fillRect(0, 0, VIEW_W / 2, VIEW_H / 2);
  return toTex(c);
}

function sunTex(world) {
  const p = PAL[world];
  const [c, x] = cnv(120, 120);
  const r = world === 2 ? 58 : 34;
  x.fillStyle = rad(x, 60, 60, r + 22, [['0', p.sun], ['0.55', p.sun + ''], ['1', 'rgba(255,255,255,0)']].map(([a, b], i) => i === 1 ? [a, hexA(p.sun, 0.5)] : [a, i === 0 ? p.sun : 'rgba(255,244,200,0)']));
  x.fillRect(0, 0, 120, 120);
  x.fillStyle = p.sun;
  x.beginPath(); x.arc(60, 60, r * 0.62, 0, 7); x.fill();
  return toTex(c);
}
function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// silhouette layer generators (seamless: shapes drawn tri-tiled)
function layerTex(world, depth) {   // depth 0 = far ... 3 = fore
  const p = PAL[world];
  const col = [p.far, p.mid, p.near, p.fore][depth];
  const H = bandH(world);
  // canvas is 2px taller than the sampled band: TilingSprite wraps UVs with
  // fract(), and linear filtering would bleed the opaque bottom row into the
  // transparent top edge (a hard line across the sky) without the padding.
  const [c, x] = cnv(LAYER_W, H + 2);
  const rng = makeRng(world * 100 + depth * 7 + 5);
  const drawAll = (fn) => { for (const off of [-LAYER_W, 0, LAYER_W]) fn(off); };

  if (world === 0) {
    // meadow: rolling hills + stalks/trees
    const baseY = H - 20 - depth * 14;
    x.fillStyle = col;
    x.beginPath(); x.moveTo(0, H);
    const pts = 8;
    const hs = Array.from({ length: pts + 1 }, () => rng() * (26 + depth * 12));
    hs[pts] = hs[0];
    for (let i = 0; i <= pts * 2; i++) {
      const xx = (i / (pts * 2)) * LAYER_W;
      const idx = i / 2;
      const h0 = hs[Math.floor(idx) % pts], h1 = hs[Math.ceil(idx) % pts];
      const t = idx % 1;
      x.lineTo(xx, baseY - (h0 + (h1 - h0) * t) + Math.sin(i * 1.7) * 4);
    }
    x.lineTo(LAYER_W, H); x.closePath(); x.fill();
    if (depth >= 1) {
      drawAll((off) => {
        for (let i = 0; i < 4 + depth * 2; i++) {
          const tx2 = off + rng() * LAYER_W, ty2 = baseY - rng() * 10;
          const s = 6 + rng() * 10 + depth * 5;
          x.fillStyle = shade(col, -0.12);
          x.beginPath(); x.moveTo(tx2 - 1.2, ty2); x.lineTo(tx2 + 1.2, ty2); x.lineTo(tx2 + 0.6, ty2 - s * 0.55); x.closePath(); x.fill();
          blob(x, tx2, ty2 - s * 0.72, s * 0.42, s * 0.4, 8, 0.18, i * 31 + depth); x.fill();
        }
      });
    }
  } else if (world === 1) {
    // cavern: stalactite curtains from above + rock heaps below
    x.fillStyle = col;
    drawAll((off) => {
      let xx = 0;
      while (xx < LAYER_W) {
        const w2 = 14 + rng() * 30;
        const len = 20 + rng() * (46 + depth * 26);
        x.beginPath();
        x.moveTo(off + xx, 0);
        x.quadraticCurveTo(off + xx + w2 * 0.5, len * (0.75 + rng() * 0.5), off + xx + w2 * 0.55, len);
        x.quadraticCurveTo(off + xx + w2 * 0.62, len * 0.6, off + xx + w2, 0);
        x.closePath(); x.fill();
        xx += w2 * (0.65 + rng() * 0.4);
      }
    });
    x.beginPath(); x.moveTo(0, H);
    for (let i = 0; i <= 16; i++) x.lineTo((i / 16) * LAYER_W, H - 14 - Math.abs(Math.sin(i * 2.3 + world)) * (16 + depth * 10));
    x.lineTo(LAYER_W, H); x.closePath(); x.fill();
    if (depth >= 2) {
      // glow mushrooms
      drawAll((off) => {
        for (let i = 0; i < 5; i++) {
          const mx = off + rng() * LAYER_W, my = H - 16 - rng() * 8;
          x.fillStyle = 'rgba(120,240,220,0.5)';
          x.beginPath(); x.arc(mx, my, 2.2 + rng() * 1.6, Math.PI, 0); x.fill();
        }
      });
    }
  } else if (world === 2) {
    // cloudline: banks of cumulus
    drawAll((off) => {
      for (let i = 0; i < 5 + depth; i++) {
        const cx2 = off + rng() * LAYER_W;
        const cy2 = H - 30 - rng() * (60 - depth * 8);
        const s = 22 + rng() * 26 + depth * 8;
        x.fillStyle = i % 2 ? col : lighten(col, 0.12);
        blob(x, cx2, cy2, s, s * 0.42, 9, 0.16, i * 17 + depth * 3);
        x.fill();
      }
    });
  } else {
    // bramble keep: thorn spires and battlements
    x.fillStyle = col;
    drawAll((off) => {
      let xx = 0;
      while (xx < LAYER_W) {
        const w2 = 20 + rng() * 26;
        const h2 = 34 + rng() * (56 + depth * 26);
        const bx = off + xx;
        x.beginPath();
        x.moveTo(bx, H); x.lineTo(bx + w2 * 0.12, H - h2);
        x.lineTo(bx + w2 * 0.3, H - h2 + 8); x.lineTo(bx + w2 * 0.5, H - h2 - 10 - rng() * 12);
        x.lineTo(bx + w2 * 0.7, H - h2 + 6); x.lineTo(bx + w2 * 0.88, H - h2 - 4);
        x.lineTo(bx + w2, H);
        x.closePath(); x.fill();
        // thorn hooks
        x.beginPath();
        x.moveTo(bx + w2 * 0.5, H - h2 - 8);
        x.quadraticCurveTo(bx + w2 * 0.5 + 10, H - h2 - 22, bx + w2 * 0.5 + 3, H - h2 - 26);
        x.quadraticCurveTo(bx + w2 * 0.5 + 7, H - h2 - 16, bx + w2 * 0.5 - 2, H - h2 - 8);
        x.closePath(); x.fill();
        xx += w2 * (0.8 + rng() * 0.5);
      }
    });
  }
  return toTex(c);
}

const FACTORS = [0.08, 0.2, 0.38, 0.6];
const bandH = (world) => world === 1 ? VIEW_H : 160;   // cavern fills the view

export class Background {
  constructor() {
    this.c = new Container();
    this.world = -1;
    this.layers = [];
    this.sky = null;
    this.sun = null;
    this._cache = {};
  }

  setWorld(world) {
    if (world === this.world) return;
    this.world = world;
    this.c.removeChildren();
    this.layers = [];
    const cache = this._cache[world] ||= {
      sky: skyTex(world),
      sun: sunTex(world),
      layers: [0, 1, 2, 3].map(d => layerTex(world, d)),
    };
    this.sky = new Sprite(cache.sky);
    this.sky.width = VIEW_W; this.sky.height = VIEW_H;
    this.c.addChild(this.sky);
    this.sun = new Sprite(cache.sun);
    this.sun.anchor.set(0.5);
    this.sun.width = 120; this.sun.height = 120;
    this.sun.position.set(world === 3 ? 396 : 116, 64);
    if (world === 1) this.sun.alpha = 0.25;
    this.c.addChild(this.sun);
    const bh = bandH(world);
    for (let d = 0; d < 4; d++) {
      const t = cache.layers[d];
      const ts = new TilingSprite({ texture: t, width: VIEW_W + 32, height: bh });
      ts.tileScale.set(1 / 6);           // canvas S=6
      ts.y = VIEW_H - bh + (d === 3 ? 26 : 0);
      ts.x = -16;
      this.c.addChild(ts);
      this.layers.push(ts);
    }
  }

  update(camX, camY, frame) {
    const bh = bandH(this.world);
    for (let d = 0; d < this.layers.length; d++) {
      const ts = this.layers[d];
      ts.tilePosition.x = -camX * FACTORS[d] - (this.world === 2 ? frame * (0.12 + d * 0.09) : 0);
      ts.y = VIEW_H - bh + (d === 3 ? 26 : 0) - (camY - 144) * FACTORS[d] * (bh === VIEW_H ? 0.12 : 0.35);
    }
  }
}

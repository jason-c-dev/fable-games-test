// Overworld: node-and-path map across the four worlds, snaking bottom to
// top. Secret exits open dashed shortcut paths. Also hosts shrine access.

import { Container, Graphics, Sprite } from 'pixi.js';
import { VIEW_W, VIEW_H, WORLD_NAMES } from '../config.js';
import { TEX, PAL, cnv, toTex, lin, rad, blob } from '../render/gfx.js';
import { makeText } from '../render/hud.js';
import { makeRng, clamp, lerp } from '../core/math.js';

export const MAP_NODES = [
  { id: '1-1', x: 56, y: 232, world: 0 },
  { id: '1-2', x: 112, y: 240, world: 0 },
  { id: '1-3', x: 166, y: 228, world: 0 },
  { id: '1-4', x: 222, y: 238, world: 0 },
  { id: '1-B', x: 276, y: 226, world: 0, boss: true },
  { id: 'shrine1', x: 344, y: 210, world: 0, shrine: true },
  { id: '2-1', x: 440, y: 186, world: 1 },
  { id: '2-2', x: 384, y: 176, world: 1 },
  { id: '2-3', x: 328, y: 184, world: 1 },
  { id: '2-4', x: 272, y: 172, world: 1 },
  { id: '2-B', x: 216, y: 180, world: 1, boss: true },
  { id: 'shrine2', x: 152, y: 158, world: 1, shrine: true },
  { id: '3-1', x: 92, y: 130, world: 2 },
  { id: '3-2', x: 148, y: 120, world: 2 },
  { id: '3-3', x: 204, y: 130, world: 2 },
  { id: '3-4', x: 260, y: 118, world: 2 },
  { id: '3-B', x: 316, y: 128, world: 2, boss: true },
  { id: 'shrine3', x: 376, y: 102, world: 2, shrine: true },
  { id: '4-1', x: 434, y: 74, world: 3 },
  { id: '4-2', x: 376, y: 64, world: 3 },
  { id: '4-3', x: 318, y: 72, world: 3 },
  { id: '4-4', x: 258, y: 62, world: 3 },
  { id: '4-B', x: 186, y: 58, world: 3, boss: true, keep: true },
];

const CHAIN = MAP_NODES.map(n => n.id);
export const MAP_EDGES = [];
for (let i = 0; i < CHAIN.length - 1; i++) MAP_EDGES.push({ a: CHAIN[i], b: CHAIN[i + 1] });
// secret shortcuts (unlocked by the secret exit of node `via`)
MAP_EDGES.push({ a: '1-2', b: '1-4', via: '1-2' });
MAP_EDGES.push({ a: '3-2', b: '3-B', via: '3-2' });

const nodeById = Object.fromEntries(MAP_NODES.map(n => [n.id, n]));

function mapBgTex() {
  const [c, x] = cnv(VIEW_W, VIEW_H);
  // layered kingdom vista: meadow bottom -> keep top
  const bands = [
    [PAL[3].sky[2][1], 0], [PAL[3].far, 0.18], [PAL[2].far, 0.36],
    [PAL[1].near, 0.55], [PAL[0].mid, 0.75], [PAL[0].groundTop, 0.95],
  ];
  const g = x.createLinearGradient(0, 0, 0, VIEW_H);
  g.addColorStop(0, '#2b1013');
  g.addColorStop(0.3, '#274a56');
  g.addColorStop(0.55, '#3f7457');
  g.addColorStop(0.8, '#6faf54');
  g.addColorStop(1, '#8fce58');
  x.fillStyle = g;
  x.fillRect(0, 0, VIEW_W, VIEW_H);
  const rng = makeRng(4242);
  // distant silhouettes per band
  x.fillStyle = 'rgba(30,20,26,0.35)';
  for (let i = 0; i < 8; i++) {
    const bx = rng() * VIEW_W, by = 40 + rng() * 30;
    x.beginPath(); x.moveTo(bx - 14, by + 22); x.lineTo(bx, by - 16 - rng() * 14); x.lineTo(bx + 12, by + 22); x.closePath(); x.fill();
  }
  x.fillStyle = 'rgba(255,255,255,0.5)';
  for (let i = 0; i < 6; i++) {
    blob(x, rng() * VIEW_W, 96 + rng() * 26, 26 + rng() * 22, 8, 9, 0.2, i * 3 + 1);
    x.fill();
  }
  x.fillStyle = 'rgba(20,40,60,0.3)';
  for (let i = 0; i < 10; i++) {
    blob(x, rng() * VIEW_W, 168 + rng() * 20, 16 + rng() * 14, 9, 8, 0.25, i * 7 + 3);
    x.fill();
  }
  x.fillStyle = 'rgba(60,110,50,0.5)';
  for (let i = 0; i < 14; i++) {
    const tx2 = rng() * VIEW_W, ty2 = 216 + rng() * 60;
    x.beginPath(); x.arc(tx2, ty2, 6 + rng() * 8, 0, 7); x.fill();
  }
  // soft vignette
  x.fillStyle = rad(x, VIEW_W / 2, VIEW_H / 2, VIEW_W * 0.72, [['0.6', 'rgba(0,0,0,0)'], ['1', 'rgba(10,6,4,0.55)']]);
  x.fillRect(0, 0, VIEW_W, VIEW_H);
  return toTex(c);
}

export class OverworldScreen {
  constructor(input, run) {
    this.c = new Container();
    this.input = input;
    this.run = run;
    this.t = 0;
    this.visible = false;
    this.onPick = null;              // cb(nodeId)
    this._built = false;
  }

  build() {
    if (this._built) return;
    this._built = true;
    const bg = new Sprite(mapBgTex());
    bg.width = VIEW_W; bg.height = VIEW_H;
    this.c.addChild(bg);

    this.pathG = new Graphics();
    this.c.addChild(this.pathG);

    this.nodeG = new Graphics();
    this.c.addChild(this.nodeG);

    this.starPips = new Graphics();
    this.c.addChild(this.starPips);

    // Pip token
    this.token = new Container();
    const tokenBody = new Sprite(TEX.items.heart);   // placeholder replaced below
    this.token.addChild(tokenBody);
    this.c.removeChild(this.token);
    this.tokenG = new Graphics();
    this.c.addChild(this.tokenG);

    this.banner = makeText('', 12, { anchor: [0.5, 0] });
    this.banner.position.set(VIEW_W / 2, 8);
    this.c.addChild(this.banner);

    this.subT = makeText('', 7, { anchor: [0.5, 0], fill: 0xd8e8c8 });
    this.subT.position.set(VIEW_W / 2, 24);
    this.c.addChild(this.subT);

    this.statT = makeText('', 8, { anchor: [0, 1] });
    this.statT.position.set(8, VIEW_H - 6);
    this.c.addChild(this.statT);

    this.hintT = makeText('', 7, { anchor: [1, 1], fill: 0xcfe8ff });
    this.hintT.position.set(VIEW_W - 8, VIEW_H - 6);
    this.c.addChild(this.hintT);

    this.tokenX = 56; this.tokenY = 232;
  }

  get pos() { return this.run.mapPos || '1-1'; }
  set pos(v) { this.run.mapPos = v; }

  availableEdges() {
    const un = new Set(this.run.unlocked);
    return MAP_EDGES.filter(e => {
      if (e.via && !(this.run.cleared[e.via]?.secret)) return false;
      return un.has(e.a) && un.has(e.b) && (e.a === this.pos || e.b === this.pos);
    }).map(e => ({ other: e.a === this.pos ? e.b : e.a, edge: e }));
  }

  step(inp) {
    this.t++;
    const cur = nodeById[this.pos];
    // token eases toward current node
    this.tokenX = lerp(this.tokenX, cur.x, 0.18);
    this.tokenY = lerp(this.tokenY, cur.y, 0.18);

    if (inp.pressed.left || inp.pressed.right || inp.pressed.up || inp.pressed.down) {
      const dx = (inp.pressed.right ? 1 : 0) - (inp.pressed.left ? 1 : 0);
      const dy = (inp.pressed.down ? 1 : 0) - (inp.pressed.up ? 1 : 0);
      let best = null, bestDot = 0.25;
      for (const { other } of this.availableEdges()) {
        const n = nodeById[other];
        const vx = n.x - cur.x, vy = n.y - cur.y;
        const len = Math.hypot(vx, vy) || 1;
        const dot = (vx * dx + vy * dy) / len;
        if (dot > bestDot) { bestDot = dot; best = other; }
      }
      if (best) this.pos = best;
    }
    if ((inp.pressed.confirm || inp.pressed.jump) && this.onPick) {
      const n = nodeById[this.pos];
      this.onPick(n);
    }
    this.draw();
  }

  draw() {
    const run = this.run;
    const un = new Set(run.unlocked);
    const g = this.pathG;
    g.clear();
    for (const e of MAP_EDGES) {
      if (e.via && !(run.cleared[e.via]?.secret)) continue;
      const a = nodeById[e.a], b = nodeById[e.b];
      const known = un.has(e.a) && un.has(e.b);
      const half = un.has(e.a) || un.has(e.b);
      if (!half) continue;
      const col = known ? 0xfff2c8 : 0x8a8a7a;
      const alpha = known ? 0.85 : 0.35;
      // dashed curve
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2 - 8;
      const segs = 14;
      for (let i = 0; i < segs; i += 2) {
        const t0 = i / segs, t1 = (i + 1) / segs;
        const p0 = qbez(a, { x: mx, y: my }, b, t0);
        const p1 = qbez(a, { x: mx, y: my }, b, t1);
        g.moveTo(p0.x, p0.y).lineTo(p1.x, p1.y).stroke({ width: e.via ? 1.4 : 2.2, color: col, alpha });
      }
    }

    const ng = this.nodeG;
    ng.clear();
    this.starPips.clear();
    for (const n of MAP_NODES) {
      if (!un.has(n.id)) {
        const nearEdge = MAP_EDGES.some(e => (e.a === n.id && un.has(e.b)) || (e.b === n.id && un.has(e.a)));
        if (!nearEdge) continue;
      }
      const unlocked = un.has(n.id);
      const cleared = !!run.cleared[n.id];
      const r = n.boss ? 9 : n.shrine ? 7 : 6.4;
      const col = !unlocked ? 0x555550 :
        n.shrine ? 0xc99df0 :
        n.boss ? 0xff6b5c :
        cleared ? 0x8fce58 : 0xffd76e;
      ng.circle(n.x, n.y, r + 1.6).fill({ color: 0x1a2418, alpha: 0.85 });
      ng.circle(n.x, n.y, r).fill({ color: col });
      ng.circle(n.x - r * 0.3, n.y - r * 0.35, r * 0.35).fill({ color: 0xffffff, alpha: 0.35 });
      if (n.boss && unlocked) {
        // little horns
        ng.moveTo(n.x - 5, n.y - r + 1).lineTo(n.x - 7.5, n.y - r - 4).lineTo(n.x - 2.5, n.y - r + 0.4).fill({ color: col });
        ng.moveTo(n.x + 5, n.y - r + 1).lineTo(n.x + 7.5, n.y - r - 4).lineTo(n.x + 2.5, n.y - r + 0.4).fill({ color: col });
      }
      if (cleared && !n.shrine) {
        ng.moveTo(n.x - 3, n.y).lineTo(n.x - 0.6, n.y + 2.6).lineTo(n.x + 3.4, n.y - 2.6)
          .stroke({ width: 1.6, color: 0x1a2418 });
      }
      // star pips
      if (!n.shrine && !n.boss && unlocked) {
        const got = run.stars[n.id]?.size || 0;
        for (let i = 0; i < 3; i++) {
          this.starPips.circle(n.x - 5 + i * 5, n.y + r + 4, 1.8)
            .fill({ color: i < got ? 0x9fe8ff : 0x223328, alpha: i < got ? 1 : 0.8 });
        }
      }
    }

    // token
    const tg = this.tokenG;
    tg.clear();
    const bob = Math.sin(this.t * 0.1) * 2;
    tg.ellipse(this.tokenX, this.tokenY - 1, 7, 2.4).fill({ color: 0x000000, alpha: 0.3 });
    tg.circle(this.tokenX, this.tokenY - 12 + bob, 5.4).fill({ color: 0xf6ecd4 });
    tg.moveTo(this.tokenX - 5, this.tokenY - 14 + bob)
      .quadraticCurveTo(this.tokenX, this.tokenY - 22 + bob, this.tokenX + 5.4, this.tokenY - 13.6 + bob)
      .quadraticCurveTo(this.tokenX, this.tokenY - 16.5 + bob, this.tokenX - 5, this.tokenY - 14 + bob)
      .fill({ color: 0x8fce58 });
    tg.circle(this.tokenX + 2, this.tokenY - 12.5 + bob, 1).fill({ color: 0x2b2b33 });

    const cur = nodeById[this.pos];
    this.banner.text = cur.shrine ? 'UPGRADE SHRINE' : WORLD_NAMES[cur.world];
    this.subT.text = cur.shrine ? 'spend dew stars' :
      cur.boss ? (cur.id === '4-B' ? 'BRAMBLE KEEP — THE GENERAL' : 'BOSS') :
      run.cleared[cur.id] ? `${cur.id} — best ${fmtTime(run.bestTimes[cur.id])}` : cur.id;
    this.statT.text = `PIP x${run.lives}   ✦${run.starsAvailable}/${run.starsCollected}   ¢${run.coins}`;
    this.hintT.text = un.has(this.pos) ? (cur.shrine ? 'ENTER: shrine' : 'ENTER: play') : '';
  }
}

function qbez(a, m, b, t) {
  const x = (1 - t) * (1 - t) * a.x + 2 * (1 - t) * t * m.x + t * t * b.x;
  const y = (1 - t) * (1 - t) * a.y + 2 * (1 - t) * t * m.y + t * t * b.y;
  return { x, y };
}

function fmtTime(f) {
  if (!f) return '—';
  const s = f / 60;
  return `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, '0')}`;
}

export { nodeById as MAP_NODE_BY_ID };

// Procedural art factory. Every texture in the game is drawn here at load
// time with Canvas 2D (gradients, curves, soft shadows) and handed to PIXI.
// Nothing external: no images, no fonts, no sprite sheets.
//
// Scale: S canvas px per sim px -> a 16px tile becomes a 96px texture,
// well above 2x display size on a 1080p window.

import { Texture } from 'pixi.js';
import { makeRng } from '../core/math.js';

export const S = 6;
const rng = makeRng(0xA11CE);

export function cnv(wSim, hSim) {
  const c = document.createElement('canvas');
  c.width = Math.max(2, Math.round(wSim * S));
  c.height = Math.max(2, Math.round(hSim * S));
  const x = c.getContext('2d');
  x.scale(S, S);                 // draw in sim units
  x.lineJoin = 'round';
  x.lineCap = 'round';
  return [c, x];
}
export const toTex = (c) => Texture.from(c);

export function lin(x, x0, y0, x1, y1, stops) {
  const g = x.createLinearGradient(x0, y0, x1, y1);
  for (const [p, col] of stops) g.addColorStop(p, col);
  return g;
}
export function rad(x, cx, cy, r, stops, r0 = 0) {
  const g = x.createRadialGradient(cx, cy, r0, cx, cy, r);
  for (const [p, col] of stops) g.addColorStop(p, col);
  return g;
}

// organic blob path through jittered ellipse points
export function blob(x, cx, cy, rx, ry, n = 8, jitter = 0.15, seed = 1) {
  const r2 = makeRng(seed * 7919 + 17);
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const j = 1 + (r2() - 0.5) * 2 * jitter;
    pts.push([cx + Math.cos(a) * rx * j, cy + Math.sin(a) * ry * j]);
  }
  x.beginPath();
  for (let i = 0; i < n; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[(i + 1) % n];
    const mx = (ax + bx) / 2, my = (ay + by) / 2;
    if (i === 0) x.moveTo(mx, my);
    const [nx2, ny2] = pts[(i + 1) % n];
    const [cx2, cy2] = pts[(i + 2) % n];
    x.quadraticCurveTo(nx2, ny2, (nx2 + cx2) / 2, (ny2 + cy2) / 2);
  }
  x.closePath();
}

export function grain(x, w, h, alpha = 0.05, n = 60, seed = 3) {
  const r2 = makeRng(seed * 104729 + 7);
  for (let i = 0; i < n; i++) {
    x.fillStyle = r2() > 0.5 ? `rgba(255,255,255,${alpha * r2()})` : `rgba(0,0,0,${alpha * r2()})`;
    const s = 0.4 + r2() * 1.1;
    x.fillRect(r2() * w, r2() * h, s, s);
  }
}

// ---------------------------------------------------------------- palettes --
export const PAL = [
  { // MEADOW — golden haze
    sky: [['0', '#ffe9b8'], ['0.45', '#bfe3a8'], ['1', '#7ec8c8']],
    sun: '#fff4cc',
    far: '#a8c98f', mid: '#79ab68', near: '#4c7f4a', fore: '#2f5d38',
    groundTop: '#8fce58', groundLip: '#c8f08c', groundMid: '#8a5a33', groundDark: '#6b421f',
    stone: '#b7a98c', stoneDark: '#8d7f63', brick: '#a9713b', block: '#f2b13d',
    platform: '#7ba24a', spike: '#4d6134', accent: '#ff9d5c', water: '#3f9ec9',
    lantern: '#ffd980',
  },
  { // CAVERN — cold teal depth
    sky: [['0', '#0e2233'], ['0.6', '#123240'], ['1', '#0a1a26']],
    sun: '#2b5f6e',
    far: '#17394a', mid: '#1d4a5c', near: '#26596b', fore: '#0c2530',
    groundTop: '#4d7f86', groundLip: '#7fd6c2', groundMid: '#365463', groundDark: '#22394a',
    stone: '#5d7787', stoneDark: '#41576a', brick: '#5e6c8a', block: '#5cc9d8',
    platform: '#4a7a8a', spike: '#31505c', accent: '#7fd6c2', water: '#1f6f96',
    lantern: '#ffca6e',
  },
  { // CLOUDLINE — blown-out white sun
    sky: [['0', '#ffffff'], ['0.35', '#dff2ff'], ['1', '#9fd3ef']],
    sun: '#ffffff',
    far: '#dcedf7', mid: '#c1dcee', near: '#a6c8e0', fore: '#8cb4d2',
    groundTop: '#f3f7fb', groundLip: '#ffffff', groundMid: '#c9d6e6', groundDark: '#a3b4c9',
    stone: '#e8eef5', stoneDark: '#b9c6d6', brick: '#d8c9a8', block: '#ffd76e',
    platform: '#cfe0ee', spike: '#93a7bd', accent: '#79c0f0', water: '#63b0d8',
    lantern: '#fff2b0',
  },
  { // BRAMBLE KEEP — oppressive red-brown
    sky: [['0', '#3d1611'], ['0.5', '#54201a'], ['1', '#20090c']],
    sun: '#b8462b',
    far: '#4a1d18', mid: '#5d2820', near: '#6e3226', fore: '#2b1010',
    groundTop: '#7a4030', groundLip: '#b06a3c', groundMid: '#552a20', groundDark: '#361712',
    stone: '#6e5548', stoneDark: '#4c382f', brick: '#844a33', block: '#e0913c',
    platform: '#6b4634', spike: '#3a1a20', accent: '#ff6b3d', water: '#5a3e8a',
    lantern: '#ff9d5c',
  },
];

// =========================================================== tile textures ==
function texGroundTop(p) {
  const [c, x] = cnv(16, 16);
  x.fillStyle = lin(x, 0, 0, 0, 16, [['0', p.groundTop], ['0.42', p.groundMid], ['1', p.groundDark]]);
  x.fillRect(0, 0, 16, 16);
  // soil speckle
  const r2 = makeRng(11);
  for (let i = 0; i < 12; i++) {
    x.fillStyle = `rgba(0,0,0,${0.06 + r2() * 0.08})`;
    x.beginPath(); x.arc(r2() * 16, 7 + r2() * 9, 0.5 + r2() * 1.1, 0, 7); x.fill();
  }
  // lip
  x.fillStyle = lin(x, 0, 0, 0, 5, [['0', p.groundLip], ['1', p.groundTop]]);
  x.beginPath();
  x.moveTo(0, 4.5);
  for (let i = 0; i <= 8; i++) x.lineTo(i * 2, 3.6 + Math.sin(i * 2.1) * 0.9);
  x.lineTo(16, 0); x.lineTo(0, 0);
  x.closePath(); x.fill();
  // blades
  x.strokeStyle = p.groundLip; x.lineWidth = 0.7;
  for (let i = 0; i < 5; i++) {
    const bx = 1.5 + i * 3.4 + r2() * 1.4;
    x.beginPath(); x.moveTo(bx, 3.6);
    x.quadraticCurveTo(bx + (r2() - 0.5) * 2, 1.2, bx + (r2() - 0.5) * 3, -0.4 + r2());
    x.stroke();
  }
  x.fillStyle = 'rgba(255,255,255,0.13)';
  x.fillRect(0, 0, 16, 0.9);
  grain(x, 16, 16, 0.05, 40, 5);
  return toTex(c);
}

function texGroundInner(p) {
  const [c, x] = cnv(16, 16);
  x.fillStyle = lin(x, 0, 0, 0, 16, [['0', p.groundMid], ['1', p.groundDark]]);
  x.fillRect(0, 0, 16, 16);
  const r2 = makeRng(23);
  for (let i = 0; i < 10; i++) {
    x.fillStyle = `rgba(0,0,0,${0.05 + r2() * 0.09})`;
    blob(x, r2() * 16, r2() * 16, 1 + r2() * 2, 0.8 + r2() * 1.4, 6, 0.3, i + 40);
    x.fill();
  }
  // faint root strands
  x.strokeStyle = 'rgba(0,0,0,0.12)'; x.lineWidth = 0.5;
  for (let i = 0; i < 3; i++) {
    x.beginPath(); x.moveTo(r2() * 16, 0);
    x.bezierCurveTo(r2() * 16, 5, r2() * 16, 10, r2() * 16, 16);
    x.stroke();
  }
  grain(x, 16, 16, 0.05, 40, 9);
  return toTex(c);
}

function texStone(p) {
  const [c, x] = cnv(16, 16);
  // chunky squared block with a bevel — tiles into clean masonry
  x.fillStyle = lin(x, 0, 0, 0, 16, [['0', lighten(p.stone, 0.08)], ['0.55', p.stone], ['1', p.stoneDark]]);
  rr(x, 0.5, 0.5, 15, 15, 2.2); x.fill();
  x.strokeStyle = 'rgba(0,0,0,0.32)'; x.lineWidth = 0.9;
  rr(x, 0.5, 0.5, 15, 15, 2.2); x.stroke();
  // bevel: top-left light, bottom-right dark
  x.strokeStyle = 'rgba(255,255,255,0.28)'; x.lineWidth = 1;
  x.beginPath(); x.moveTo(1.6, 13.6); x.lineTo(1.6, 2.6); x.quadraticCurveTo(1.6, 1.6, 2.8, 1.6); x.lineTo(13.4, 1.6); x.stroke();
  x.strokeStyle = 'rgba(0,0,0,0.22)'; x.lineWidth = 1;
  x.beginPath(); x.moveTo(14.4, 2.8); x.lineTo(14.4, 13.2); x.quadraticCurveTo(14.4, 14.4, 13, 14.4); x.lineTo(2.6, 14.4); x.stroke();
  // facet cracks
  x.strokeStyle = 'rgba(0,0,0,0.16)'; x.lineWidth = 0.5;
  x.beginPath(); x.moveTo(9.5, 4); x.lineTo(11.2, 7.8); x.lineTo(9.8, 11.4); x.stroke();
  x.beginPath(); x.moveTo(4.2, 6.4); x.lineTo(6, 8.4); x.stroke();
  x.fillStyle = 'rgba(255,255,255,0.14)';
  x.beginPath(); x.ellipse(5.6, 4.4, 2.8, 1.2, -0.3, 0, 7); x.fill();
  grain(x, 16, 16, 0.05, 26, 13);
  return toTex(c);
}

function texBrick(p) {
  const [c, x] = cnv(16, 16);
  x.fillStyle = lin(x, 0, 0, 0, 16, [['0', p.brick], ['1', shade(p.brick, -0.35)]]);
  rr(x, 0.8, 0.8, 14.4, 14.4, 2.4); x.fill();
  x.strokeStyle = 'rgba(0,0,0,0.3)'; x.lineWidth = 0.7;
  rr(x, 0.8, 0.8, 14.4, 14.4, 2.4); x.stroke();
  // woven root pattern
  x.strokeStyle = 'rgba(0,0,0,0.22)'; x.lineWidth = 1;
  x.beginPath(); x.moveTo(0.8, 8); x.quadraticCurveTo(8, 6.4, 15.2, 8); x.stroke();
  x.beginPath(); x.moveTo(8, 0.8); x.quadraticCurveTo(6.6, 8, 8, 15.2); x.stroke();
  x.fillStyle = 'rgba(255,255,255,0.16)';
  x.fillRect(1.4, 1.3, 13, 1.2);
  grain(x, 16, 16, 0.05, 26, 17);
  return toTex(c);
}

function texItemBlock(p, sym, symCol = '#7e4c12') {
  const [c, x] = cnv(16, 16);
  x.fillStyle = lin(x, 0, 0, 0, 16, [['0', lighten(p.block, 0.25)], ['0.5', p.block], ['1', shade(p.block, -0.3)]]);
  rr(x, 0.8, 0.8, 14.4, 14.4, 3.4); x.fill();
  x.strokeStyle = 'rgba(0,0,0,0.28)'; x.lineWidth = 0.8;
  rr(x, 0.8, 0.8, 14.4, 14.4, 3.4); x.stroke();
  x.fillStyle = 'rgba(255,255,255,0.35)';
  x.beginPath(); x.ellipse(5, 3.6, 3.4, 1.4, -0.35, 0, 7); x.fill();
  x.fillStyle = symCol;
  x.font = 'bold 10px Trebuchet MS, sans-serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.shadowColor = 'rgba(255,255,255,0.7)'; x.shadowBlur = 3;
  x.fillText(sym, 8, 8.6);
  x.shadowBlur = 0;
  return toTex(c);
}

function texUsed(p) {
  const [c, x] = cnv(16, 16);
  x.fillStyle = lin(x, 0, 0, 0, 16, [['0', p.stoneDark], ['1', shade(p.stoneDark, -0.3)]]);
  rr(x, 0.8, 0.8, 14.4, 14.4, 3.4); x.fill();
  x.strokeStyle = 'rgba(0,0,0,0.3)'; x.lineWidth = 0.8;
  rr(x, 0.8, 0.8, 14.4, 14.4, 3.4); x.stroke();
  x.fillStyle = 'rgba(0,0,0,0.25)';
  x.beginPath(); x.arc(8, 8, 2.6, 0, 7); x.fill();
  return toTex(c);
}

function texPlatform(p) {
  const [c, x] = cnv(16, 8);
  x.fillStyle = lin(x, 0, 0, 0, 6, [['0', lighten(p.platform, 0.3)], ['1', shade(p.platform, -0.2)]]);
  rr(x, 0, 0.6, 16, 4.6, 2); x.fill();
  x.strokeStyle = 'rgba(0,0,0,0.22)'; x.lineWidth = 0.6;
  rr(x, 0, 0.6, 16, 4.6, 2); x.stroke();
  // leaf ribs
  x.strokeStyle = 'rgba(255,255,255,0.25)'; x.lineWidth = 0.5;
  for (let i = 0; i < 4; i++) {
    x.beginPath(); x.moveTo(2 + i * 4, 1.2); x.lineTo(3.4 + i * 4, 4.6); x.stroke();
  }
  x.fillStyle = 'rgba(255,255,255,0.3)'; x.fillRect(0.5, 0.8, 15, 0.7);
  return toTex(c);
}

function texSpikes(p) {
  const [c, x] = cnv(16, 16);
  const n = 4;
  for (let i = 0; i < n; i++) {
    const bx = i * 4 + 2;
    x.fillStyle = lin(x, bx - 2, 16, bx + 2, 4, [['0', shade(p.spike, -0.25)], ['0.5', p.spike], ['1', lighten(p.spike, 0.35)]]);
    x.beginPath();
    x.moveTo(bx - 2, 16.2);
    x.quadraticCurveTo(bx - 1.4, 8, bx + (i % 2 ? 0.6 : -0.4), 2.5 + (i % 2) * 1.6);
    x.quadraticCurveTo(bx + 1.5, 8, bx + 2, 16.2);
    x.closePath(); x.fill();
    x.strokeStyle = 'rgba(255,255,255,0.25)'; x.lineWidth = 0.4;
    x.beginPath(); x.moveTo(bx - 1.1, 13); x.quadraticCurveTo(bx - 0.7, 8, bx + (i % 2 ? 0.4 : -0.5), 3.6 + (i % 2) * 1.4); x.stroke();
  }
  return toTex(c);
}

function texCrumble(p) {
  const [c, x] = cnv(16, 16);
  x.fillStyle = lin(x, 0, 0, 0, 10, [['0', p.stone], ['1', p.stoneDark]]);
  rr(x, 0.4, 0.8, 15.2, 8.4, 2); x.fill();
  x.strokeStyle = 'rgba(0,0,0,0.35)'; x.lineWidth = 0.6;
  rr(x, 0.4, 0.8, 15.2, 8.4, 2); x.stroke();
  x.beginPath(); x.moveTo(4.5, 1); x.lineTo(6, 5); x.lineTo(4.8, 9);
  x.moveTo(10.5, 1); x.lineTo(9.4, 4.6); x.lineTo(11, 9);
  x.stroke();
  // dangling pebbles
  x.fillStyle = p.stoneDark;
  x.beginPath(); x.arc(5, 10.4, 1, 0, 7); x.arc(11, 10, 0.8, 0, 7); x.fill();
  x.fillStyle = 'rgba(255,255,255,0.2)'; x.fillRect(0.8, 1.1, 14.2, 0.8);
  return toTex(c);
}

function texLantern(p) {
  const [c, x] = cnv(16, 16);
  // hanger
  x.strokeStyle = '#3a3126'; x.lineWidth = 0.8;
  x.beginPath(); x.moveTo(8, 0); x.lineTo(8, 3); x.stroke();
  // glass bulb
  x.fillStyle = rad(x, 8, 9, 6, [['0', '#fff6d8'], ['0.45', p.lantern], ['1', 'rgba(150,90,20,0.9)']]);
  blob(x, 8, 9, 4.6, 5.2, 8, 0.05, 31); x.fill();
  x.strokeStyle = 'rgba(60,40,10,0.6)'; x.lineWidth = 0.6;
  blob(x, 8, 9, 4.6, 5.2, 8, 0.05, 31); x.stroke();
  x.fillStyle = 'rgba(255,255,255,0.5)';
  x.beginPath(); x.ellipse(6.4, 6.6, 1.6, 2.2, -0.4, 0, 7); x.fill();
  return toTex(c);
}

function texDoor(p) {
  const [c, x] = cnv(16, 16);
  x.fillStyle = shade(p.groundDark, -0.25);
  x.beginPath(); x.moveTo(2, 16); x.lineTo(2, 8);
  x.quadraticCurveTo(2, 2.5, 8, 2.5);
  x.quadraticCurveTo(14, 2.5, 14, 8); x.lineTo(14, 16);
  x.closePath(); x.fill();
  x.fillStyle = rad(x, 8, 11, 7, [['0', '#050608'], ['1', 'rgba(5,6,8,0)']]);
  x.beginPath(); x.ellipse(8, 11.5, 4.4, 4.5, 0, 0, 7); x.fill();
  x.strokeStyle = lighten(p.groundMid, 0.2); x.lineWidth = 1.1;
  x.beginPath(); x.moveTo(2, 16); x.lineTo(2, 8);
  x.quadraticCurveTo(2, 2.5, 8, 2.5);
  x.quadraticCurveTo(14, 2.5, 14, 8); x.lineTo(14, 16);
  x.stroke();
  return toTex(c);
}

function texGoal(p, secret = false) {
  const [c, x] = cnv(16, 32);
  const col = secret ? '#c76bd6' : p.accent;
  // pole
  x.fillStyle = lin(x, 6.6, 0, 8.6, 0, [['0', '#e8e2ce'], ['1', '#a89f84']]);
  rr(x, 6.9, 2, 2.2, 30, 1); x.fill();
  // banner
  x.fillStyle = lin(x, 9, 3, 16, 8, [['0', lighten(col, 0.25)], ['1', shade(col, -0.15)]]);
  x.beginPath(); x.moveTo(9, 3); x.lineTo(16, 5.4); x.lineTo(9, 8.4); x.closePath(); x.fill();
  x.strokeStyle = 'rgba(0,0,0,0.25)'; x.lineWidth = 0.5;
  x.beginPath(); x.moveTo(9, 3); x.lineTo(16, 5.4); x.lineTo(9, 8.4); x.closePath(); x.stroke();
  // finial
  x.fillStyle = rad(x, 8, 2, 2.4, [['0', '#fff'], ['1', col]]);
  x.beginPath(); x.arc(8, 2, 1.9, 0, 7); x.fill();
  return toTex(c);
}

function texThorn(p) {
  const [c, x] = cnv(16, 16);
  x.fillStyle = lin(x, 0, 4, 0, 16, [['0', '#ff9a4d'], ['0.35', '#c2482a'], ['1', '#571c16']]);
  x.beginPath(); x.moveTo(0, 6);
  for (let i = 0; i <= 8; i++) x.lineTo(i * 2, 5 + Math.sin(i * 1.9) * 1.6);
  x.lineTo(16, 16); x.lineTo(0, 16); x.closePath(); x.fill();
  // crust cracks glowing
  x.strokeStyle = 'rgba(255,190,90,0.8)'; x.lineWidth = 0.5;
  x.beginPath(); x.moveTo(3, 9); x.lineTo(5.5, 12); x.moveTo(11, 8); x.lineTo(9.6, 12.4); x.stroke();
  // thorn tips poking through
  x.fillStyle = '#2e1216';
  for (const [bx, ph] of [[2.5, 0], [7.5, 1], [12.5, 0.4]]) {
    x.beginPath(); x.moveTo(bx - 1.4, 8 + ph);
    x.quadraticCurveTo(bx, 2.6 + ph, bx + 0.4, 1.8 + ph);
    x.quadraticCurveTo(bx + 1, 5 + ph, bx + 1.6, 8.5 + ph);
    x.closePath(); x.fill();
  }
  return toTex(c);
}

function texMirror(p, flip) {
  const [c, x] = cnv(16, 16);
  x.fillStyle = lin(x, 0, 0, 16, 16, [['0', p.stone], ['1', p.stoneDark]]);
  rr(x, 0.6, 0.6, 14.8, 14.8, 2); x.fill();
  x.save();
  if (flip) { x.translate(16, 0); x.scale(-1, 1); }
  // polished face along the diagonal '/'
  const g = lin(x, 2, 14, 14, 2, [['0', '#dffbff'], ['0.5', '#8fd8ea'], ['1', '#eafcff']]);
  x.fillStyle = g;
  x.beginPath(); x.moveTo(1.4, 14.6); x.lineTo(4.4, 14.6); x.lineTo(14.6, 4.4); x.lineTo(14.6, 1.4); x.lineTo(11.6, 1.4); x.lineTo(1.4, 11.6); x.closePath();
  x.fill();
  x.strokeStyle = 'rgba(255,255,255,0.75)'; x.lineWidth = 0.7;
  x.beginPath(); x.moveTo(2.2, 13.4); x.lineTo(13.4, 2.2); x.stroke();
  x.restore();
  x.strokeStyle = 'rgba(0,0,0,0.3)'; x.lineWidth = 0.7;
  rr(x, 0.6, 0.6, 14.8, 14.8, 2); x.stroke();
  return toTex(c);
}

function texCrystal(p, lit = false) {
  const [c, x] = cnv(16, 16);
  const base = lit ? '#ffe9a0' : '#8fd8ea';
  const deep = lit ? '#e8a33d' : '#3f7f9e';
  x.fillStyle = lin(x, 0, 0, 0, 16, [['0', p.stoneDark], ['1', shade(p.stoneDark, -0.3)]]);
  rr(x, 1, 10.5, 14, 5, 1.6); x.fill();
  // gem facets
  x.fillStyle = lin(x, 4, 2, 12, 12, [['0', '#ffffff'], ['0.35', base], ['1', deep]]);
  x.beginPath();
  x.moveTo(8, 0.8); x.lineTo(12.6, 5.4); x.lineTo(11.2, 11.4); x.lineTo(4.8, 11.4); x.lineTo(3.4, 5.4);
  x.closePath(); x.fill();
  x.strokeStyle = lit ? 'rgba(255,220,120,0.9)' : 'rgba(255,255,255,0.5)';
  x.lineWidth = 0.6;
  x.beginPath(); x.moveTo(8, 0.8); x.lineTo(8, 11.4); x.moveTo(3.4, 5.4); x.lineTo(8, 7); x.lineTo(12.6, 5.4); x.stroke();
  if (lit) {
    x.fillStyle = 'rgba(255,235,160,0.35)';
    x.beginPath(); x.arc(8, 7, 7.4, 0, 7); x.fill();
  }
  return toTex(c);
}

function texGate(p) {
  const [c, x] = cnv(16, 16);
  // vine portcullis
  x.strokeStyle = lin(x, 0, 0, 0, 16, [['0', lighten(p.fore, 0.35)], ['1', p.fore]]);
  x.lineWidth = 2.2;
  for (const gx of [3.2, 8, 12.8]) {
    x.beginPath(); x.moveTo(gx + Math.sin(gx) * 0.6, -0.5);
    x.quadraticCurveTo(gx + 1.2, 8, gx - 0.6, 16.5);
    x.stroke();
  }
  x.lineWidth = 1.4;
  x.beginPath(); x.moveTo(-0.5, 5); x.quadraticCurveTo(8, 6.4, 16.5, 4.6); x.stroke();
  x.beginPath(); x.moveTo(-0.5, 11); x.quadraticCurveTo(8, 12.2, 16.5, 10.6); x.stroke();
  // thorns
  x.fillStyle = shade(p.fore, -0.2);
  for (const [tx2, ty2] of [[4.6, 3], [9.4, 8.6], [13.6, 13]]) {
    x.beginPath(); x.moveTo(tx2, ty2); x.lineTo(tx2 + 2.2, ty2 - 1); x.lineTo(tx2 + 0.6, ty2 + 1.4); x.closePath(); x.fill();
  }
  return toTex(c);
}

function texSpring(p) {
  const [c, x] = cnv(16, 16);
  // bounce bloom: fat flower pad
  x.fillStyle = lin(x, 0, 8, 0, 16, [['0', '#3f8a46'], ['1', '#2a5e33']]);
  rr(x, 5.6, 9, 4.8, 7, 1.6); x.fill();
  x.fillStyle = lin(x, 0, 2, 0, 10, [['0', '#ffd3e8'], ['0.6', '#ff8fc0'], ['1', '#d6558f']]);
  blob(x, 8, 7, 6.4, 3.6, 9, 0.12, 77); x.fill();
  x.fillStyle = 'rgba(255,255,255,0.5)';
  x.beginPath(); x.ellipse(5.6, 5.6, 2.6, 1.1, -0.3, 0, 7); x.fill();
  x.fillStyle = '#ffe066';
  x.beginPath(); x.arc(8, 6.8, 1.5, 0, 7); x.fill();
  return toTex(c);
}

function texUpdraft() {
  const [c, x] = cnv(16, 16);
  x.strokeStyle = 'rgba(255,255,255,0.14)';
  x.lineWidth = 1;
  for (const off of [3, 8.5, 13]) {
    x.beginPath();
    x.moveTo(off, 16);
    x.quadraticCurveTo(off + 1.6, 10, off - 0.8, 5);
    x.quadraticCurveTo(off - 1.6, 2, off + 0.6, 0);
    x.stroke();
  }
  return toTex(c);
}

// ============================================================ shared bits ==
export function rr(x, rx, ry, w, h, r) {
  x.beginPath();
  x.moveTo(rx + r, ry);
  x.arcTo(rx + w, ry, rx + w, ry + h, r);
  x.arcTo(rx + w, ry + h, rx, ry + h, r);
  x.arcTo(rx, ry + h, rx, ry, r);
  x.arcTo(rx, ry, rx + w, ry, r);
  x.closePath();
}

export function shade(hex, amt) { return adjust(hex, amt); }
export function lighten(hex, amt) { return adjust(hex, amt); }
function adjust(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (amt >= 0) { r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt; }
  else { r *= 1 + amt; g *= 1 + amt; b *= 1 + amt; }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

export function glowTex(rSim = 24, stops = [['0', 'rgba(255,255,255,1)'], ['0.4', 'rgba(255,255,255,0.5)'], ['1', 'rgba(255,255,255,0)']]) {
  const [c, x] = cnv(rSim * 2, rSim * 2);
  x.fillStyle = rad(x, rSim, rSim, rSim, stops);
  x.fillRect(0, 0, rSim * 2, rSim * 2);
  return toTex(c);
}

// ============================================================== particles ==
function particleTextures() {
  const t = {};
  { // soft dot
    const [c, x] = cnv(6, 6);
    x.fillStyle = rad(x, 3, 3, 3, [['0', 'rgba(255,255,255,1)'], ['0.6', 'rgba(255,255,255,0.7)'], ['1', 'rgba(255,255,255,0)']]);
    x.fillRect(0, 0, 6, 6);
    t.dot = toTex(c);
  }
  { // hard fleck
    const [c, x] = cnv(4, 4);
    x.fillStyle = '#ffffff';
    x.beginPath(); x.arc(2, 2, 1.6, 0, 7); x.fill();
    t.fleck = toTex(c);
  }
  { // leaf
    const [c, x] = cnv(8, 8);
    x.fillStyle = '#bde26e';
    x.beginPath(); x.moveTo(1, 6.5);
    x.quadraticCurveTo(1.5, 1.5, 7, 1);
    x.quadraticCurveTo(6.5, 6, 1, 6.5);
    x.closePath(); x.fill();
    x.strokeStyle = 'rgba(70,110,30,0.7)'; x.lineWidth = 0.5;
    x.beginPath(); x.moveTo(1.6, 6); x.quadraticCurveTo(4, 4, 6.6, 1.4); x.stroke();
    t.leaf = toTex(c);
  }
  { // petal
    const [c, x] = cnv(6, 6);
    x.fillStyle = '#ffc3dd';
    x.beginPath(); x.ellipse(3, 3, 2.6, 1.4, 0.6, 0, 7); x.fill();
    t.petal = toTex(c);
  }
  { // ring (expanding shockwave)
    const [c, x] = cnv(24, 24);
    x.strokeStyle = 'rgba(255,255,255,0.9)'; x.lineWidth = 1.6;
    x.beginPath(); x.arc(12, 12, 10, 0, 7); x.stroke();
    x.strokeStyle = 'rgba(255,255,255,0.3)'; x.lineWidth = 3.2;
    x.beginPath(); x.arc(12, 12, 10, 0, 7); x.stroke();
    t.ring = toTex(c);
  }
  { // spark (diamond)
    const [c, x] = cnv(8, 8);
    x.fillStyle = '#ffffff';
    x.beginPath(); x.moveTo(4, 0.4); x.lineTo(5.4, 4); x.lineTo(4, 7.6); x.lineTo(2.6, 4); x.closePath(); x.fill();
    t.spark = toTex(c);
  }
  { // debris chunk
    const [c, x] = cnv(6, 6);
    x.fillStyle = '#9a6a3c';
    blob(x, 3, 3, 2.4, 2.2, 6, 0.25, 91); x.fill();
    x.fillStyle = 'rgba(255,255,255,0.25)'; x.fillRect(1, 1, 3, 1);
    t.debris = toTex(c);
  }
  { // bubble
    const [c, x] = cnv(6, 6);
    x.strokeStyle = 'rgba(255,255,255,0.8)'; x.lineWidth = 0.5;
    x.beginPath(); x.arc(3, 3, 2.2, 0, 7); x.stroke();
    x.fillStyle = 'rgba(255,255,255,0.7)';
    x.beginPath(); x.arc(2.2, 2.2, 0.6, 0, 7); x.fill();
    t.bubble = toTex(c);
  }
  { // streak (wind line)
    const [c, x] = cnv(20, 3);
    x.fillStyle = lin(x, 0, 0, 20, 0, [['0', 'rgba(255,255,255,0)'], ['0.5', 'rgba(255,255,255,0.55)'], ['1', 'rgba(255,255,255,0)']]);
    x.fillRect(0, 0.7, 20, 1.6);
    t.streak = toTex(c);
  }
  { // drip
    const [c, x] = cnv(4, 7);
    x.fillStyle = 'rgba(160,220,255,0.9)';
    x.beginPath(); x.moveTo(2, 0.4);
    x.quadraticCurveTo(3.4, 3.6, 3.2, 5);
    x.arc(2, 5.2, 1.3, -0.3, Math.PI + 0.3);
    x.quadraticCurveTo(0.6, 3.6, 2, 0.4);
    x.closePath(); x.fill();
    t.drip = toTex(c);
  }
  { // ember
    const [c, x] = cnv(5, 5);
    x.fillStyle = rad(x, 2.5, 2.5, 2.5, [['0', '#fff3c0'], ['0.45', '#ff9d3c'], ['1', 'rgba(200,60,20,0)']]);
    x.fillRect(0, 0, 5, 5);
    t.ember = toTex(c);
  }
  return t;
}

// ================================================================== items ==
function itemTextures(p) {
  const t = {};
  { // coin: golden dew droplet
    const [c, x] = cnv(10, 12);
    x.fillStyle = rad(x, 5, 7, 4.6, [['0', '#fff7d0'], ['0.5', '#ffd24a'], ['1', '#c98b1e']]);
    x.beginPath(); x.moveTo(5, 0.6);
    x.quadraticCurveTo(8.8, 4.6, 8.8, 7.4);
    x.arc(5, 7.4, 3.8, 0, Math.PI);
    x.quadraticCurveTo(1.2, 4.6, 5, 0.6);
    x.closePath(); x.fill();
    x.fillStyle = 'rgba(255,255,255,0.65)';
    x.beginPath(); x.ellipse(3.7, 5.6, 1.1, 1.9, -0.35, 0, 7); x.fill();
    t.coin = toTex(c);
  }
  { // dew star
    const [c, x] = cnv(14, 14);
    x.fillStyle = rad(x, 7, 7, 7, [['0', '#ffffff'], ['0.35', '#bdf3ff'], ['1', 'rgba(90,200,255,0)']]);
    x.fillRect(0, 0, 14, 14);
    x.fillStyle = lin(x, 3, 3, 11, 11, [['0', '#ffffff'], ['1', '#6fd9ff']]);
    star(x, 7, 7, 5, 2.3, 5); x.fill();
    x.strokeStyle = 'rgba(40,140,190,0.6)'; x.lineWidth = 0.5;
    star(x, 7, 7, 5, 2.3, 5); x.stroke();
    t.star = toTex(c);
  }
  { // sun fruit
    const [c, x] = cnv(12, 12);
    x.fillStyle = rad(x, 5, 5, 6.4, [['0', '#ffe08a'], ['0.45', '#ffa03c'], ['1', '#d05a1e']]);
    blob(x, 6, 7, 4.6, 4.2, 8, 0.06, 5); x.fill();
    x.fillStyle = 'rgba(255,255,255,0.5)';
    x.beginPath(); x.ellipse(4.2, 5, 1.6, 1, -0.5, 0, 7); x.fill();
    x.strokeStyle = '#3f7f2e'; x.lineWidth = 1;
    x.beginPath(); x.moveTo(6, 2.8); x.quadraticCurveTo(6.6, 1.2, 8, 0.8); x.stroke();
    x.fillStyle = '#5aa53c';
    x.beginPath(); x.ellipse(8.4, 1.4, 1.8, 0.9, 0.5, 0, 7); x.fill();
    t.fruit = toTex(c);
  }
  { // glider cap
    const [c, x] = cnv(14, 10);
    x.fillStyle = lin(x, 0, 0, 0, 7, [['0', '#ff8a4d'], ['1', '#c2482a']]);
    x.beginPath(); x.moveTo(1, 6.6);
    x.quadraticCurveTo(7, -2.4, 13, 6.6);
    x.quadraticCurveTo(7, 4.6, 1, 6.6);
    x.closePath(); x.fill();
    x.fillStyle = 'rgba(255,255,255,0.55)';
    for (const [dx2, dy2] of [[4, 3], [8.6, 2.2], [10.8, 4.2]]) {
      x.beginPath(); x.arc(dx2, dy2, 0.9, 0, 7); x.fill();
    }
    x.fillStyle = '#efe3c8';
    rr(x, 5.4, 6.2, 3.2, 2.6, 1); x.fill();
    t.glider = toTex(c);
  }
  { // clover
    const [c, x] = cnv(12, 12);
    x.fillStyle = '#57c14e';
    for (const [dx2, dy2] of [[3.6, 3.6], [8.4, 3.6], [3.6, 8], [8.4, 8]]) {
      x.beginPath(); x.arc(dx2, dy2, 2.6, 0, 7); x.fill();
    }
    x.fillStyle = 'rgba(255,255,255,0.3)';
    x.beginPath(); x.arc(3.2, 3, 1, 0, 7); x.fill();
    x.strokeStyle = '#2e7d32'; x.lineWidth = 0.8;
    x.beginPath(); x.moveTo(6, 7); x.quadraticCurveTo(6.6, 10, 6, 11.6); x.stroke();
    t.clover = toTex(c);
  }
  { // sap drop
    const [c, x] = cnv(8, 10);
    x.fillStyle = rad(x, 4, 6, 3.8, [['0', '#eaffc0'], ['0.5', '#a8e05a'], ['1', '#5f9e2e']]);
    x.beginPath(); x.moveTo(4, 0.6);
    x.quadraticCurveTo(7, 4, 7, 6.2);
    x.arc(4, 6.2, 3, 0, Math.PI);
    x.quadraticCurveTo(1, 4, 4, 0.6);
    x.closePath(); x.fill();
    t.sapdrop = toTex(c);
  }
  { // sunbeam lance
    const [c, x] = cnv(14, 16);
    x.strokeStyle = '#8a5a33'; x.lineWidth = 1.6;
    x.beginPath(); x.moveTo(4, 15); x.lineTo(9.5, 4.5); x.stroke();
    x.fillStyle = rad(x, 10, 3.5, 4.5, [['0', '#fff7d0'], ['0.5', '#ffd24a'], ['1', 'rgba(255,180,40,0)']]);
    x.beginPath(); x.arc(10, 3.5, 4.5, 0, 7); x.fill();
    star(x, 10, 3.5, 3, 1.3, 5);
    x.fillStyle = '#fff9e0'; x.fill();
    t.beamlance = toTex(c);
  }
  { // heart (HUD)
    const [c, x] = cnv(12, 11);
    heartPath(x, 6, 5.6, 5.2);
    x.fillStyle = lin(x, 2, 1, 10, 10, [['0', '#ff9db0'], ['0.45', '#f4485e'], ['1', '#b01e3c']]);
    x.fill();
    x.strokeStyle = 'rgba(90,10,30,0.7)'; x.lineWidth = 0.6;
    heartPath(x, 6, 5.6, 5.2); x.stroke();
    x.fillStyle = 'rgba(255,255,255,0.55)';
    x.beginPath(); x.ellipse(3.9, 3.3, 1.3, 0.8, -0.5, 0, 7); x.fill();
    t.heart = toTex(c);
  }
  { // empty heart
    const [c, x] = cnv(12, 11);
    heartPath(x, 6, 5.6, 5.2);
    x.fillStyle = 'rgba(20,16,28,0.55)'; x.fill();
    x.strokeStyle = 'rgba(255,255,255,0.35)'; x.lineWidth = 0.7;
    heartPath(x, 6, 5.6, 5.2); x.stroke();
    t.heartEmpty = toTex(c);
  }
  return t;
}

export function star(x, cx, cy, R, r, n) {
  x.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const rad2 = i % 2 === 0 ? R : r;
    const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
    const px = cx + Math.cos(a) * rad2, py = cy + Math.sin(a) * rad2;
    i === 0 ? x.moveTo(px, py) : x.lineTo(px, py);
  }
  x.closePath();
}

function heartPath(x, cx, cy, s) {
  x.beginPath();
  x.moveTo(cx, cy + s * 0.85);
  x.bezierCurveTo(cx - s * 1.25, cy - s * 0.1, cx - s * 0.6, cy - s * 0.95, cx, cy - s * 0.35);
  x.bezierCurveTo(cx + s * 0.6, cy - s * 0.95, cx + s * 1.25, cy - s * 0.1, cx, cy + s * 0.85);
  x.closePath();
}

// =============================================================== assemble ==
export const TEX = { world: [], items: null, particles: null, glow: null, glowSmall: null };

export function initGfx() {
  TEX.items = itemTextures(PAL[0]);
  TEX.particles = particleTextures();
  TEX.glow = glowTex(24);
  TEX.glowSmall = glowTex(10);
  for (let wi = 0; wi < 4; wi++) {
    const p = PAL[wi];
    TEX.world[wi] = {
      groundTop: texGroundTop(p),
      groundInner: texGroundInner(p),
      stone: texStone(p),
      brick: texBrick(p),
      platform: texPlatform(p),
      qcoin: texItemBlock(p, '?'),
      qfruit: texItemBlock(p, '♥', '#a03a2a'),
      qglider: texItemBlock(p, '☂', '#7e4c12'),
      qmoss: texItemBlock(p, '♦', '#2e6d38'),
      qclover: texItemBlock(p, '♣', '#2e6d38'),
      used: texUsed(p),
      spikes: texSpikes(p),
      crumble: texCrumble(p),
      lantern: texLantern(p),
      door: texDoor(p),
      goal: texGoal(p, false),
      goal2: texGoal(p, true),
      thorn: texThorn(p),
      mirrorA: texMirror(p, false),
      mirrorB: texMirror(p, true),
      crystal: texCrystal(p, false),
      crystalLit: texCrystal(p, true),
      gate: texGate(p),
      spring: texSpring(p),
      updraft: texUpdraft(),
    };
  }
  return TEX;
}

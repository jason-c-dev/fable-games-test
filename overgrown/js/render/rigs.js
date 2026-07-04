// Skeletal character rigs. Parts are code-drawn textures in a bone hierarchy
// of PIXI Containers. Poses are computed per-frame from sim state and eased
// toward with critically-damped smoothing, so every transition blends; sharp
// keyframed arcs are overlaid for sword swings. Secondary motion (cap leaf,
// antennae) runs on small spring sims.

import { Container, Sprite } from 'pixi.js';
import { cnv, toTex, lin, rad, rr, blob, shade, lighten, PAL } from './gfx.js';
import { clamp, lerp, EASE } from '../core/math.js';

// ---------------------------------------------------------------- helpers --
export function part(drawFn, w, h, ax = 0.5, ay = 0.5) {
  const [c, x] = cnv(w, h);
  drawFn(x, w, h);
  const s = new Sprite(toTex(c));
  s.anchor.set(ax, ay);
  s.width = w; s.height = h;
  // squash/stretch must be applied relative to this base scale — assigning
  // scale directly would blow the sprite back up to texture (6x) size
  s.baseSx = s.scale.x;
  s.baseSy = s.scale.y;
  s.sq = (sx, sy) => { s.scale.x = s.baseSx * sx; s.scale.y = s.baseSy * sy; };
  return s;
}

class Spring {
  constructor(v = 0, k = 0.25, d = 0.68) { this.v = v; this.vel = 0; this.k = k; this.d = d; this.target = v; }
  update() {
    this.vel += (this.target - this.v) * this.k;
    this.vel *= this.d;
    this.v += this.vel;
    return this.v;
  }
}

const sm = (cur, target, k) => cur + (target - cur) * k;

class Bone {
  constructor(parent, x = 0, y = 0) {
    this.c = new Container();
    this.c.position.set(x, y);
    this.baseX = x; this.baseY = y;
    this.rot = 0; this.tx = x; this.ty = y; this.sx = 1; this.sy = 1;
    if (parent) (parent.c || parent).addChild(this.c);
  }
  to(rot, x = this.baseX, y = this.baseY, k = 0.35) {
    this.rot = sm(this.rot, rot, k);
    this.tx = sm(this.tx, x, k);
    this.ty = sm(this.ty, y, k);
  }
  set(rot, x = this.baseX, y = this.baseY) { this.rot = rot; this.tx = x; this.ty = y; }
  apply() {
    this.c.rotation = this.rot;
    this.c.position.set(this.tx, this.ty);
    this.c.scale.set(this.sx, this.sy);
  }
}

// ================================================================== PIP ==
const CREAM = '#f6ecd4', CREAM_D = '#d9c9a6';
const TUNIC = '#6fae4c', TUNIC_D = '#4c7f35';
const LEAF = '#8fce58', LEAF_D = '#5a9e3d';
const BLADE = '#3c6b46', BLADE_EDGE = '#ffd76e';

function drawHead(x) {
  // face
  x.fillStyle = rad(x, 4.4, 3.6, 6.4, [['0', '#fff8e8'], ['0.6', CREAM], ['1', CREAM_D]]);
  blob(x, 5, 4.6, 4.6, 4.1, 9, 0.04, 3); x.fill();
  x.strokeStyle = 'rgba(90,70,40,0.35)'; x.lineWidth = 0.35;
  blob(x, 5, 4.6, 4.6, 4.1, 9, 0.04, 3); x.stroke();
  // eye (side view: one big eye)
  x.fillStyle = '#2b2b33';
  x.beginPath(); x.ellipse(7, 4.4, 1.05, 1.5, 0, 0, 7); x.fill();
  x.fillStyle = '#fff';
  x.beginPath(); x.arc(7.35, 3.9, 0.42, 0, 7); x.fill();
  // blush
  x.fillStyle = 'rgba(240,140,110,0.4)';
  x.beginPath(); x.ellipse(7.6, 6.2, 0.9, 0.55, 0, 0, 7); x.fill();
  // cap base
  x.fillStyle = lin(x, 0, 0, 0, 3.4, [['0', LEAF], ['1', LEAF_D]]);
  x.beginPath(); x.moveTo(0.2, 2.8);
  x.quadraticCurveTo(4.6, -1.6, 9.8, 2.4);
  x.quadraticCurveTo(5, 1.4, 0.2, 2.8);
  x.closePath(); x.fill();
}
function drawCapLeaf(x) {
  x.fillStyle = lin(x, 0, 4, 8, 0, [['0', LEAF_D], ['0.5', LEAF], ['1', '#c8f08c']]);
  x.beginPath(); x.moveTo(0.4, 4.6);
  x.quadraticCurveTo(2.2, 0.6, 7.6, 0.4);
  x.quadraticCurveTo(5.4, 3.2, 3.6, 4.2);
  x.quadraticCurveTo(2, 4.9, 0.4, 4.6);
  x.closePath(); x.fill();
  x.strokeStyle = 'rgba(60,100,30,0.6)'; x.lineWidth = 0.4;
  x.beginPath(); x.moveTo(1, 4.4); x.quadraticCurveTo(4, 2.6, 7.2, 0.7); x.stroke();
}
function drawTorso(x) {
  x.fillStyle = lin(x, 0, 0, 0, 8.6, [['0', lighten(TUNIC, 0.18)], ['0.6', TUNIC], ['1', TUNIC_D]]);
  x.beginPath();
  x.moveTo(1.2, 0.6);
  x.quadraticCurveTo(3.6, -0.6, 6, 0.6);
  x.quadraticCurveTo(7.4, 4, 6.6, 7.4);
  x.quadraticCurveTo(3.6, 9, 0.8, 7.4);
  x.quadraticCurveTo(-0.2, 4, 1.2, 0.6);
  x.closePath(); x.fill();
  // belt
  x.fillStyle = '#8a5a33';
  x.fillRect(0.6, 6.2, 6.4, 1.2);
  x.fillStyle = '#ffd76e';
  x.fillRect(3.1, 6.1, 1.4, 1.4);
  // rim light
  x.strokeStyle = 'rgba(255,255,230,0.5)'; x.lineWidth = 0.45;
  x.beginPath(); x.moveTo(1.5, 0.9); x.quadraticCurveTo(3.6, -0.1, 5.7, 0.9); x.stroke();
}
function drawArm(x) {
  x.fillStyle = lin(x, 0, 0, 0, 5, [['0', TUNIC], ['1', CREAM]]);
  rr(x, 0.4, 0, 1.9, 5, 0.95); x.fill();
}
function drawFore(x) {
  x.fillStyle = CREAM;
  rr(x, 0.4, 0, 1.7, 4.4, 0.85); x.fill();
  x.fillStyle = '#8a5a33'; // glove
  rr(x, 0.25, 3, 2.1, 1.6, 0.7); x.fill();
}
function drawLegThigh(x) {
  x.fillStyle = '#5b7f3f';
  rr(x, 0.3, 0, 2.3, 4.6, 1.05); x.fill();
}
function drawLegShin(x) {
  x.fillStyle = CREAM_D;
  rr(x, 0.45, 0, 1.9, 3.4, 0.9); x.fill();
  // boot
  x.fillStyle = '#7e4c2a';
  rr(x, 0.1, 2.6, 3.4, 1.9, 0.9); x.fill();
  x.fillStyle = 'rgba(255,255,255,0.25)';
  x.fillRect(0.4, 2.8, 2.6, 0.5);
}
function drawSword(x) {
  // thorn blade pointing +x from grip at left
  x.fillStyle = '#573b22';
  rr(x, 0, 1.1, 3.2, 1.8, 0.8); x.fill();          // grip
  x.fillStyle = '#8a5a33';
  x.beginPath(); x.ellipse(3.6, 2, 0.8, 2.1, 0, 0, 7); x.fill();  // guard leaf
  x.fillStyle = lin(x, 4, 0, 15, 0, [['0', BLADE], ['0.75', shade(BLADE, -0.1)], ['1', '#26492f']]);
  x.beginPath();
  x.moveTo(4.2, 0.9);
  x.quadraticCurveTo(11, 0.2, 14.8, 1.7);          // top edge curve (thorn-like)
  x.quadraticCurveTo(11, 3.6, 4.2, 3.1);
  x.closePath(); x.fill();
  // amber edge glow
  x.strokeStyle = BLADE_EDGE; x.lineWidth = 0.5;
  x.beginPath(); x.moveTo(4.4, 1); x.quadraticCurveTo(11, 0.35, 14.6, 1.7); x.stroke();
  // barb
  x.fillStyle = BLADE;
  x.beginPath(); x.moveTo(8.5, 0.8); x.lineTo(9.6, -0.9); x.lineTo(10.6, 0.7); x.closePath(); x.fill();
}

export class PipRig {
  constructor() {
    this.root = new Container();
    this.body = new Bone(this.root, 0, 0);        // squash pivot at feet

    this.legB = new Bone(this.body, -1.6, -8.2);
    this.legBShin = new Bone(this.legB, 0.4, 4.2);
    this.armB = new Bone(this.body, -2.2, -13.6);
    this.armBFore = new Bone(this.armB, 0.3, 4.4);
    this.torso = new Bone(this.body, 0, -15.2);
    this.head = new Bone(this.body, 0.4, -14.6);
    this.cap = new Bone(this.head, -0.6, -8.6);
    this.legF = new Bone(this.body, 1.7, -8.2);
    this.legFShin = new Bone(this.legF, 0.4, 4.2);
    this.armF = new Bone(this.body, 2.2, -13.4);
    this.armFFore = new Bone(this.armF, 0.3, 4.4);
    this.sword = new Bone(this.armFFore, 0.6, 3.9);

    const legBP = part(drawLegThigh, 3, 5, 0.5, 0.1); this.legB.c.addChild(legBP); legBP.tint = 0xbbbbcc;
    const shinBP = part(drawLegShin, 3.6, 5, 0.5, 0.08); this.legBShin.c.addChild(shinBP); shinBP.tint = 0xbbbbcc;
    const armBP = part(drawArm, 2.7, 5.2, 0.5, 0.06); this.armB.c.addChild(armBP); armBP.tint = 0xbbbbcc;
    const foreBP = part(drawFore, 2.7, 4.8, 0.5, 0.06); this.armBFore.c.addChild(foreBP); foreBP.tint = 0xbbbbcc;
    this.torso.c.addChild(part(drawTorso, 7.4, 9, 0.48, 0.06));
    this.head.c.addChild(part(drawHead, 10, 9, 0.42, 0.62));
    this.cap.c.addChild(part(drawCapLeaf, 8, 5.2, 0.1, 0.85));
    this.legF.c.addChild(part(drawLegThigh, 3, 5, 0.5, 0.1));
    this.legFShin.c.addChild(part(drawLegShin, 3.6, 5, 0.5, 0.08));
    this.armF.c.addChild(part(drawArm, 2.7, 5.2, 0.5, 0.06));
    this.armFFore.c.addChild(part(drawFore, 2.7, 4.8, 0.5, 0.06));
    this.swordSprite = part(drawSword, 15.5, 4.4, 0.06, 0.45);
    this.sword.c.addChild(this.swordSprite);

    this.capSpring = new Spring(0, 0.3, 0.62);
    this.squash = new Spring(1, 0.3, 0.55);
    this.runT = 0;
    this.prevState = 'normal';
    this.prevVy = 0;
    this.landPop = 0;
  }

  // main per-render-frame update (dt in frames at 60fps)
  update(p, world, dt) {
    const r = this.root;
    r.scale.x = p.facing;
    const speed = Math.abs(p.vx);
    this.runT += dt * (0.09 + speed * 0.075);

    // squash & stretch from vertical events
    if (p.onGround && this.prevVy > 2.2) this.squash.vel += Math.min(0.24, this.prevVy * 0.045);
    this.prevVy = p.vy;
    const sq = this.squash.update();
    this.body.sx = 2 - sq; this.body.sy = sq;
    if (!p.onGround && p.vy < -2) { this.body.sy = 1.06; this.body.sx = 0.95; }
    if (p.state === 'plunge' && p.plungePhase === 1) { this.body.sy = 1.1; this.body.sx = 0.92; }

    // default targets
    let torsoRot = 0, headRot = 0, headX = 0.4;
    let armFRot = 0.35, armFFRot = 0.35, armBRot = -0.3, armBFRot = 0.3;
    let legFRot = 0.08, legFSRot = 0.05, legBRot = -0.1, legBSRot = 0.08;
    let swordRot = 1.9;                             // stowed low behind
    let k = 0.3;

    const st = p.state;
    if (st === 'normal' && p.onGround) {
      if (speed > 0.25) {
        // run cycle
        const c = Math.sin(this.runT * Math.PI * 2), s2 = Math.sin(this.runT * Math.PI * 2 + Math.PI);
        const amp = 0.55 + Math.min(0.45, speed * 0.16);
        legFRot = c * amp; legFSRot = Math.max(0, -c) * 1.1 + 0.15;
        legBRot = s2 * amp; legBSRot = Math.max(0, -s2) * 1.1 + 0.15;
        armFRot = s2 * amp * 0.7 + 0.25; armFFRot = 0.5;
        armBRot = c * amp * 0.7 - 0.2; armBFRot = 0.55;
        torsoRot = 0.14 + speed * 0.045;
        headRot = -0.05;
        this.body.ty = Math.abs(Math.sin(this.runT * Math.PI * 2)) * -1.1;
        k = 0.5;
      } else {
        // idle breathe
        const b = Math.sin(this.runT * Math.PI * 0.66) * 0.5 + 0.5;
        torsoRot = 0.015 * b; this.torso.sy = 1 + 0.015 * b;
        armFRot = 0.32 + b * 0.05; armBRot = -0.32 - b * 0.05;
        this.body.ty = 0;
      }
      // skid
      if (speed > 1.2 && ((p.vx > 0 && p.facing < 0) || (p.vx < 0 && p.facing > 0))) {
        torsoRot = -0.35; legFRot = 0.7; legBRot = -0.5; armFRot = -0.8; armBRot = -0.6;
      }
    } else if (st === 'normal' && p.swim) {
      torsoRot = -0.5 + Math.sin(this.runT * 2) * 0.08;
      legFRot = Math.sin(this.runT * 5) * 0.5 + 0.3;
      legBRot = Math.sin(this.runT * 5 + 1.4) * 0.5 + 0.1;
      armFRot = Math.sin(this.runT * 5 + 0.6) * 0.7 - 0.4;
      armBRot = Math.sin(this.runT * 5 + 2) * 0.7 - 1.2;
      this.body.ty = Math.sin(this.runT * 1.8) * 1.4;
    } else if (st === 'normal') {
      // airborne
      if (p.glide) {
        armFRot = -2.5; armBRot = -2.6; armFFRot = -0.2; armBFRot = -0.2;
        legFRot = 0.35; legBRot = 0.15; legFSRot = 0.5; legBSRot = 0.55;
        torsoRot = 0.06;
      } else if (p.vy < -0.8) {
        armFRot = -2.2; armBRot = 0.9; legFRot = -0.65; legFSRot = 1.15; legBRot = 0.5; legBSRot = 0.35;
        torsoRot = 0.1; k = 0.4;
      } else {
        armFRot = -0.9 + Math.sin(this.runT * 3) * 0.12; armBRot = 0.7;
        legFRot = 0.25; legFSRot = 0.65; legBRot = -0.35; legBSRot = 0.9;
        torsoRot = -0.06; k = 0.35;
      }
    } else if (st === 'dash') {
      torsoRot = 0.55; headRot = -0.3;
      armFRot = -0.5; armBRot = 2.4; armFFRot = -0.6;
      legFRot = -1.05; legFSRot = 1.2; legBRot = 0.85; legBSRot = 0.2;
      swordRot = 2.6; k = 0.6;
    } else if (st === 'wallslide') {
      torsoRot = -0.15; headRot = 0.1;
      armFRot = -2.6; armFFRot = -0.3;                 // hand on wall
      armBRot = 0.4; legFRot = 0.55; legFSRot = 0.9; legBRot = 0.3; legBSRot = 1.1;
      k = 0.45;
    } else if (st === 'ledge') {
      const sway = Math.sin(this.runT * 1.6) * 0.05;
      torsoRot = -0.1 + sway;
      armFRot = -2.9; armBRot = -2.9; armFFRot = -0.25; armBFRot = -0.25;
      legFRot = 0.35 + sway; legFSRot = 0.7; legBRot = 0.2 - sway; legBSRot = 0.8;
    } else if (st === 'clamber') {
      const t = 1 - p.clamberT / 12;
      torsoRot = lerp(-0.7, 0.15, EASE.outQuad(t));
      armFRot = lerp(-2.9, 0.4, t); armBRot = lerp(-2.9, -0.4, t);
      legFRot = lerp(1.3, 0.1, t); legBRot = lerp(0.8, -0.1, t);
    } else if (st === 'plunge') {
      torsoRot = 0.05; headRot = 0.25;
      armFRot = 2.3; armFFRot = 0.5; armBRot = 2.5; armBFRot = 0.4;
      swordRot = -2.75;                                // blade straight down
      legFRot = -0.5; legFSRot = 0.7; legBRot = 0.45; legBSRot = 0.6;
      k = 0.55;
    } else if (st === 'hurt') {
      torsoRot = -0.5; armFRot = -1.9; armBRot = 1.6; legFRot = -0.8; legBRot = 0.9;
      headRot = -0.3; k = 0.5;
    } else if (st === 'heal') {
      torsoRot = 0.25; headRot = 0.35;
      armFRot = 1.15; armBRot = -1.15; armFFRot = -1.5; armBFRot = 1.5;   // hands cupped
      legFRot = 0.15; legBRot = -0.15;
    } else if (st === 'dead') {
      torsoRot = -0.9; armFRot = -2.6; armBRot = 2.2; legFRot = -1; legBRot = 1;
      headRot = -0.5;
    } else if (st === 'goal') {
      const b = Math.sin(this.runT * 4);
      armFRot = -2.9 + b * 0.1; armBRot = -2.9 - b * 0.1;
      torsoRot = 0.05;
    }

    // parry pose overrides
    if (p.parryT > 0 || p.parryPose > 0) {
      armFRot = -0.95; armFFRot = -1.35; swordRot = -1.1;   // blade up as a guard
      armBRot = 0.6; torsoRot = -0.12; k = 0.65;
      if (p.parryPose > 16 && p.parryT === 0) {             // successful flash
        armFRot = -1.6; swordRot = -0.5; torsoRot = -0.3;
      }
    }

    // beam pose
    if (p.beamCharge > 0 || p.beamFire > 0) {
      armFRot = -1.5 + p.beamAim; armFFRot = -0.1;
      armBRot = -1.2 + p.beamAim; armBFRot = -0.3;
      torsoRot = -0.1; swordRot = 2.4; k = 0.5;
    }

    // ---- attack overlay (sharp keys, no smoothing) ----
    let atkOverride = null;
    if (p.atk) {
      const a = p.atk, d = a.def;
      const total = d.startup + d.active + d.recovery;
      const t = a.t / total;
      const winT = clamp(a.t / d.startup, 0, 1);
      const actT = clamp((a.t - d.startup) / d.active, 0, 1);
      const recT = clamp((a.t - d.startup - d.active) / d.recovery, 0, 1);
      const arc = (from, to) =>
        a.t < d.startup ? lerp(from * 0.55, from, EASE.outQuad(winT)) :
        a.t < d.startup + d.active ? lerp(from, to, EASE.outCubic(actT)) :
        lerp(to, 0.6, EASE.inOutQuad(recT));
      if (a.kind === 'slash1') atkOverride = { arm: arc(-2.3, 0.75), sword: 0.45, torso: arc(-0.18, 0.3) };
      else if (a.kind === 'slash2') atkOverride = { arm: arc(1.3, -1.7), sword: 0.6, torso: arc(0.3, -0.15) };
      else if (a.kind === 'slash3') atkOverride = { arm: arc(-2.9, 0.95), sword: 0.2, torso: arc(-0.3, 0.42) };
      else if (a.kind === 'air') atkOverride = { arm: arc(-2.4, 0.9), sword: 0.4, torso: arc(-0.1, 0.22) };
      else if (a.kind === 'up') atkOverride = { arm: arc(0.8, -2.9), sword: -0.3, torso: arc(0.15, -0.2) };
      else if (a.kind === 'spin') {
        const spinT = clamp(a.t / (d.startup + d.active), 0, 1);
        atkOverride = { arm: -1 + spinT * Math.PI * 2 * 1.0, sword: 0.5, torso: 0.1, bodyRot: spinT * Math.PI * 2 };
      }
    }
    if (p.chargeT > this.chargeGlowAt) { /* renderer adds glow */ }

    if (atkOverride) {
      this.armF.set(atkOverride.arm, this.armF.baseX, this.armF.baseY);
      this.armFFore.set(0.35);
      this.sword.set(atkOverride.sword);
      this.torso.to(atkOverride.torso, undefined, undefined, 0.8);
      this.body.c.rotation = atkOverride.bodyRot || 0;
    } else {
      this.body.c.rotation = 0;
      this.armF.to(armFRot, undefined, undefined, k);
      this.armFFore.to(armFFRot, undefined, undefined, k);
      this.sword.to(swordRot, undefined, undefined, k * 0.9);
      this.torso.to(torsoRot, undefined, undefined, k);
    }
    this.armB.to(armBRot, undefined, undefined, k);
    this.armBFore.to(armBFRot, undefined, undefined, k);
    this.legF.to(legFRot, undefined, undefined, k);
    this.legFShin.to(legFSRot, undefined, undefined, k);
    this.legB.to(legBRot, undefined, undefined, k);
    this.legBShin.to(legBSRot, undefined, undefined, k);
    this.head.to(headRot, headX, this.head.baseY + (p.onGround && speed > 0.3 ? Math.sin(this.runT * Math.PI * 4) * 0.3 : 0), k);

    // cap leaf secondary motion: lags behind horizontal accel + vertical speed
    this.capSpring.target = clamp(-p.vx * p.facing * 0.22 - p.vy * 0.05, -0.9, 0.9);
    this.cap.set(this.capSpring.update() - 0.15);

    for (const b of [this.body, this.legB, this.legBShin, this.armB, this.armBFore, this.torso,
      this.head, this.cap, this.legF, this.legFShin, this.armF, this.armFFore, this.sword]) b.apply();

    // hurt flash
    const flash = (p.invuln > 0 && Math.floor(p.invuln / 3) % 2 === 0 && st !== 'dead');
    this.root.alpha = flash ? 0.45 : 1;
  }
}

// =============================================================== enemies ==
// Each enemy view: { c: Container, update(e, world, dt) }
// Simple bodies + procedural motion; hit flash via brightness tint.

function flashTint(view, e) {
  const s = view.bodyC;
  if (!s) return;
  if (e.hitT > 0) { s.tint = 0xffffff; view.c.alpha = 0.85 + Math.sin(e.hitT * 2) * 0.15; }
  else { s.tint = 0xffffff; view.c.alpha = 1; }
}

function dieAnim(view, e, dt) {
  if (e.dying > 0) {
    view.c.alpha = e.dying / 24;
    view.c.rotation += 0.12 * dt * (view.spinDir || 1);
    view.c.scale.set(0.6 + (e.dying / 24) * 0.4);
    return true;
  }
  return false;
}

function makeShadow(wSim) {
  const sh = part((x, w, h) => {
    x.fillStyle = rad(x, w / 2, h / 2, w / 2, [['0', 'rgba(0,0,0,0.32)'], ['1', 'rgba(0,0,0,0)']]);
    x.fillRect(0, 0, w, h);
  }, wSim, 3.4, 0.5, 0.5);
  sh.y = -0.6;
  return sh;
}

export function makeEnemyView(e) {
  const kind = e.constructor.name;
  const mk = ENEMY_VIEWS[kind];
  return mk ? mk(e) : makeBumbleView(e, '#888');
}

function baseView(e) {
  const c = new Container();
  return { c, t: Math.random() * 10, update() {}, bodyC: null };
}

function makeBumbleView(e) {
  const v = baseView(e);
  v.c.addChild(makeShadow(12));
  const body = part((x) => {
    x.fillStyle = lin(x, 0, 0, 0, 11, [['0', '#f0b64e'], ['0.55', '#d99334'], ['1', '#9c6120']]);
    blob(x, 6.5, 6, 5.9, 5, 9, 0.05, 8); x.fill();
    x.fillStyle = 'rgba(70,40,10,0.55)';
    for (const bx of [3.4, 6.6, 9.8]) { x.beginPath(); x.ellipse(bx, 5.6, 1, 4.2, 0, 0, 7); x.fill(); }
    x.fillStyle = '#2b2b33';
    x.beginPath(); x.arc(10.4, 4.6, 1, 0, 7); x.fill();
    x.fillStyle = '#fff'; x.beginPath(); x.arc(10.7, 4.3, 0.35, 0, 7); x.fill();
    x.fillStyle = 'rgba(255,255,255,0.3)';
    x.beginPath(); x.ellipse(4.4, 2.6, 2.6, 1.2, -0.3, 0, 7); x.fill();
  }, 13, 12, 0.5, 1);
  const legs = [];
  for (let i = 0; i < 3; i++) {
    const leg = part((x) => { x.fillStyle = '#5c3a14'; rr(x, 0.4, 0, 1.4, 3.4, 0.7); x.fill(); }, 2.2, 3.6, 0.5, 0.1);
    leg.x = -3.4 + i * 3.2; leg.y = -3;
    v.c.addChild(leg); legs.push(leg);
  }
  v.c.addChild(body);
  v.bodyC = body;
  const ant = part((x) => {
    x.strokeStyle = '#5c3a14'; x.lineWidth = 0.6;
    x.beginPath(); x.moveTo(0.4, 4.6); x.quadraticCurveTo(1.6, 1.4, 3.6, 0.5); x.stroke();
    x.fillStyle = '#d99334'; x.beginPath(); x.arc(3.8, 0.6, 0.8, 0, 7); x.fill();
  }, 4.6, 5.2, 0.15, 0.9);
  ant.x = 4; ant.y = -10.4;
  v.c.addChild(ant);
  const spring = new Spring(0, 0.3, 0.6);
  v.update = (e2, world, dt) => {
    if (dieAnim(v, e2, dt)) return;
    v.t += dt * (0.1 + Math.abs(e2.vx || 0.4) * 0.12);
    v.c.scale.x = e2.dir < 0 ? 1 : -1;   // art faces right by default? face travel
    body.rotation = Math.sin(v.t * 2.4) * 0.06;
    legs.forEach((l, i) => l.rotation = Math.sin(v.t * 4 + i * 2.1) * 0.55);
    spring.target = clamp((e2.vx || 0) * -0.5, -0.5, 0.5);
    ant.rotation = spring.update();
    flashTint(v, e2);
  };
  return v;
}

function makeSnapcapView(e) {
  const v = baseView(e);
  v.c.addChild(makeShadow(12));
  const face = part((x) => {
    x.fillStyle = lin(x, 0, 0, 0, 8, [['0', '#f4e3c2'], ['1', '#c8a878']]);
    blob(x, 5, 4.4, 4.4, 3.8, 8, 0.06, 12); x.fill();
    x.fillStyle = '#2b2b33';
    x.beginPath(); x.arc(6.8, 3.8, 0.95, 0, 7); x.fill();
    x.fillStyle = '#fff'; x.beginPath(); x.arc(7.1, 3.5, 0.32, 0, 7); x.fill();
    // little frown teeth
    x.fillStyle = '#fff';
    x.beginPath(); x.moveTo(7.6, 6.2); x.lineTo(8.4, 7.4); x.lineTo(8.9, 6.1); x.closePath(); x.fill();
  }, 10, 8.6, 0.5, 1);
  face.y = -0.5;
  const cap = part((x) => {
    x.fillStyle = lin(x, 0, 0, 0, 8, [['0', '#ff8459'], ['0.55', '#e5533a'], ['1', '#9e2f26']]);
    x.beginPath(); x.moveTo(0.6, 7.6);
    x.quadraticCurveTo(6.75, -2.8, 12.9, 7.6);
    x.quadraticCurveTo(6.75, 5.4, 0.6, 7.6);
    x.closePath(); x.fill();
    x.fillStyle = 'rgba(255,255,255,0.75)';
    for (const [dx2, dy2, r2] of [[4, 3.4, 1.1], [8.6, 2.5, 0.85], [10.6, 4.6, 0.7]]) {
      x.beginPath(); x.arc(dx2, dy2, r2, 0, 7); x.fill();
    }
    x.strokeStyle = 'rgba(120,30,20,0.5)'; x.lineWidth = 0.5;
    x.beginPath(); x.moveTo(1, 7.3); x.quadraticCurveTo(6.75, 4.9, 12.5, 7.3); x.stroke();
  }, 13.5, 8.4, 0.5, 0.88);
  cap.y = -6.2;
  v.c.addChild(face); v.c.addChild(cap);
  v.bodyC = cap;
  v.update = (e2, world, dt) => {
    if (dieAnim(v, e2, dt)) return;
    v.t += dt * 0.1;
    v.c.scale.x = e2.dir < 0 ? 1 : -1;
    if (e2.mode === 'stunned' || e2.carried) {
      face.visible = false;
      cap.y = -1.6;
      cap.rotation = Math.sin(v.t * 6) * (e2.carried ? 0.06 : 0.02);
    } else if (e2.mode === 'slide') {
      face.visible = false;
      cap.y = -1.6;
      cap.rotation += (e2.vx || 0) * 0.09 * dt;
    } else {
      face.visible = true;
      cap.y = -6.2 + Math.sin(v.t * 3) * 0.25;
      cap.rotation = Math.sin(v.t * 2.2) * 0.05;
      face.rotation = Math.sin(v.t * 2.2 + 1) * 0.04;
    }
    flashTint(v, e2);
  };
  return v;
}

function makeSpikeletView(e) {
  const v = baseView(e);
  v.c.addChild(makeShadow(10));
  const body = part((x) => {
    // spiky ball
    x.fillStyle = lin(x, 0, 0, 0, 11, [['0', '#9db86a'], ['1', '#5c7340']]);
    const cx2 = 6, cy2 = 6.4, R = 3.6;
    x.beginPath();
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 2;
      const a2 = a + Math.PI / 11;
      x.lineTo(cx2 + Math.cos(a) * (R + 2.4), cy2 + Math.sin(a) * (R + 2.4));
      x.lineTo(cx2 + Math.cos(a2) * R, cy2 + Math.sin(a2) * R);
    }
    x.closePath(); x.fill();
    x.fillStyle = '#c9dd9a';
    x.beginPath(); x.arc(cx2, cy2, R - 0.4, 0, 7); x.fill();
    x.fillStyle = '#2b2b33';
    x.beginPath(); x.arc(7.4, 5.8, 0.9, 0, 7); x.fill();
    x.fillStyle = '#fff'; x.beginPath(); x.arc(7.7, 5.5, 0.3, 0, 7); x.fill();
  }, 12, 12.5, 0.5, 0.95);
  v.c.addChild(body);
  v.bodyC = body;
  v.update = (e2, world, dt) => {
    if (dieAnim(v, e2, dt)) return;
    v.t += dt * 0.1;
    v.c.scale.x = e2.dir < 0 ? 1 : -1;
    body.rotation = Math.sin(v.t * 3.2) * 0.14;
    body.y = Math.abs(Math.sin(v.t * 3.2)) * -0.7;
    flashTint(v, e2);
  };
  return v;
}

function makePuffhawkView(e) {
  const v = baseView(e);
  const wingT = (x) => {
    x.fillStyle = lin(x, 0, 0, 0, 6, [['0', '#f0ead8'], ['1', '#bfae8e']]);
    x.beginPath(); x.moveTo(0.5, 1);
    x.quadraticCurveTo(6, -0.8, 10.5, 2.4);
    x.quadraticCurveTo(6, 5.6, 0.5, 3.2);
    x.closePath(); x.fill();
    x.strokeStyle = 'rgba(90,70,40,0.4)'; x.lineWidth = 0.4;
    x.beginPath(); x.moveTo(2, 2.4); x.quadraticCurveTo(6, 1.6, 9.6, 2.5); x.stroke();
  };
  const wingB = part(wingT, 11, 6, 0.06, 0.4); wingB.y = -8; wingB.x = -1;
  const body = part((x) => {
    x.fillStyle = lin(x, 0, 0, 0, 10, [['0', '#f7f1e2'], ['0.6', '#ddd0b4'], ['1', '#a9987a']]);
    blob(x, 6.5, 5.4, 5.6, 4.6, 9, 0.07, 21); x.fill();
    // beak
    x.fillStyle = '#f0a03c';
    x.beginPath(); x.moveTo(11.2, 4.4); x.lineTo(14, 5.6); x.lineTo(11.2, 6.6); x.closePath(); x.fill();
    // eye
    x.fillStyle = '#2b2b33'; x.beginPath(); x.arc(9.6, 4.4, 1, 0, 7); x.fill();
    x.fillStyle = '#fff'; x.beginPath(); x.arc(9.9, 4.1, 0.35, 0, 7); x.fill();
    // tail feathers
    x.fillStyle = '#c9b894';
    x.beginPath(); x.moveTo(1.6, 4); x.lineTo(-0.5, 2.6); x.lineTo(0.8, 5.4); x.lineTo(-0.8, 5.2); x.lineTo(1.8, 6.6); x.closePath(); x.fill();
  }, 14.5, 11, 0.45, 0.75);
  const wingF = part(wingT, 11, 6, 0.06, 0.4); wingF.y = -8.4; wingF.x = -0.5;
  v.c.addChild(wingB); v.c.addChild(body); v.c.addChild(wingF);
  v.bodyC = body;
  v.spinDir = 1;
  v.update = (e2, world, dt) => {
    if (dieAnim(v, e2, dt)) return;
    v.t += dt * (e2.mode === 'swoop' ? 0.28 : 0.14);
    v.c.scale.x = (e2.mode === 'swoop' ? (e2.swoopVec?.x || 1) : (world.player.x - e2.x)) < 0 ? 1 : -1;
    const flap = Math.sin(v.t * 6);
    wingF.rotation = -0.5 + flap * (e2.mode === 'floorstun' ? 0.1 : 0.8);
    wingB.rotation = -0.4 + Math.sin(v.t * 6 + 0.6) * 0.7;
    body.rotation = e2.mode === 'swoop' ? 0.35 : Math.sin(v.t * 1.4) * 0.06;
    if (e2.mode === 'floorstun') body.rotation = 2.6;
    flashTint(v, e2);
  };
  return v;
}

function makeLobberView(e) {
  const v = baseView(e);
  v.c.addChild(makeShadow(13));
  const pot = part((x) => {
    x.fillStyle = lin(x, 0, 0, 0, 12, [['0', '#7fae4f'], ['0.5', '#5d8a3c'], ['1', '#3c5e28']]);
    x.beginPath();
    x.moveTo(2.4, 1.6);
    x.quadraticCurveTo(0.2, 6, 1.8, 10.4);
    x.quadraticCurveTo(6.75, 12.6, 11.7, 10.4);
    x.quadraticCurveTo(13.3, 6, 11.1, 1.6);
    x.quadraticCurveTo(6.75, 3.6, 2.4, 1.6);
    x.closePath(); x.fill();
    // lip
    x.fillStyle = '#a5d16e';
    x.beginPath(); x.ellipse(6.75, 2.2, 4.9, 1.6, 0, 0, 7); x.fill();
    x.fillStyle = '#2f4a1e';
    x.beginPath(); x.ellipse(6.75, 2.3, 3.6, 1, 0, 0, 7); x.fill();
    // stripes
    x.strokeStyle = 'rgba(255,255,255,0.22)'; x.lineWidth = 0.8;
    x.beginPath(); x.moveTo(3.4, 4.2); x.quadraticCurveTo(3, 7.5, 4, 10.6); x.stroke();
    x.beginPath(); x.moveTo(9.9, 4.2); x.quadraticCurveTo(10.4, 7.5, 9.4, 10.6); x.stroke();
  }, 13.5, 13, 0.5, 1);
  const leaf1 = part((x) => {
    x.fillStyle = '#6f9e46';
    x.beginPath(); x.moveTo(0.4, 4.4); x.quadraticCurveTo(3, 0.2, 7.6, 0.6); x.quadraticCurveTo(4.4, 3.6, 0.4, 4.4); x.closePath(); x.fill();
  }, 8, 5, 0.1, 0.9);
  leaf1.x = 3; leaf1.y = -11.4;
  v.c.addChild(pot); v.c.addChild(leaf1);
  v.bodyC = pot;
  v.update = (e2, world, dt) => {
    if (dieAnim(v, e2, dt)) return;
    v.t += dt * 0.08;
    const windup = (e2.t % 150) > 132;
    pot.sq(windup ? 1.07 : 1, windup ? 0.92 : 1 + Math.sin(v.t * 2) * 0.02);
    leaf1.rotation = Math.sin(v.t * 1.7) * 0.14;
    flashTint(v, e2);
  };
  return v;
}

function makeWispView(e) {
  const v = baseView(e);
  const glow = new Sprite();
  const core = part((x) => {
    x.fillStyle = rad(x, 6, 6, 6, [['0', '#eafcff'], ['0.4', '#9fe8ef'], ['1', 'rgba(80,180,200,0)']]);
    x.fillRect(0, 0, 12, 12);
    x.fillStyle = '#dffbff';
    blob(x, 6, 5.6, 2.8, 3.2, 8, 0.12, 33); x.fill();
    // hollow eyes
    x.fillStyle = '#12333d';
    x.beginPath(); x.ellipse(4.7, 5.2, 0.7, 1.1, 0, 0, 7); x.fill();
    x.beginPath(); x.ellipse(7.3, 5.2, 0.7, 1.1, 0, 0, 7); x.fill();
  }, 12, 14, 0.5, 0.6);
  const tail = part((x) => {
    x.fillStyle = 'rgba(160,230,240,0.6)';
    x.beginPath(); x.moveTo(1, 0.5);
    x.quadraticCurveTo(3.4, 3, 2.6, 6.4);
    x.quadraticCurveTo(4.8, 3.4, 5.6, 0.6);
    x.closePath(); x.fill();
  }, 7, 7, 0.5, 0.05);
  tail.y = -4;
  v.c.addChild(tail); v.c.addChild(core);
  v.bodyC = core;
  v.update = (e2, world, dt) => {
    if (dieAnim(v, e2, dt)) return;
    v.t += dt * 0.12;
    core.y = Math.sin(v.t * 1.8) * 1.2 - 6;
    tail.y = core.y + 5;
    tail.rotation = Math.sin(v.t * 2.6) * 0.3;
    const lit = e2.litT > 0;
    core.tint = lit ? 0xffd76e : 0xffffff;
    v.c.alpha = lit ? 1 : 0.55 + Math.sin(v.t * 3) * 0.1;
    flashTint(v, e2);
    if (lit) v.c.alpha = 1;
  };
  return v;
}

function makePodView(e) {
  const v = baseView(e);
  v.c.addChild(makeShadow(12));
  const bulb = part((x) => {
    x.fillStyle = lin(x, 0, 0, 0, 12, [['0', '#b06ad0'], ['0.55', '#7e3f9e'], ['1', '#4c2363']]);
    blob(x, 6.5, 7, 5.4, 5, 9, 0.06, 44); x.fill();
    x.fillStyle = 'rgba(255,255,255,0.25)';
    x.beginPath(); x.ellipse(4.4, 4.2, 2.2, 1.1, -0.4, 0, 7); x.fill();
    // maw
    x.fillStyle = '#2b1136';
    x.beginPath(); x.ellipse(6.5, 6.8, 2, 1.4, 0, 0, 7); x.fill();
  }, 13, 13, 0.5, 1);
  const burrs = [];
  for (let i = 0; i < 3; i++) {
    const b = part((x) => {
      x.fillStyle = '#5c2f73';
      x.beginPath();
      for (let j = 0; j < 8; j++) {
        const a = (j / 8) * Math.PI * 2;
        x.lineTo(2.4 + Math.cos(a) * 2.2, 2.4 + Math.sin(a) * 2.2);
        x.lineTo(2.4 + Math.cos(a + 0.4) * 1.1, 2.4 + Math.sin(a + 0.4) * 1.1);
      }
      x.closePath(); x.fill();
    }, 5, 5, 0.5, 0.5);
    b.x = -3 + i * 3; b.y = -11 - (i % 2) * 1.6;
    v.c.addChild(b); burrs.push(b);
  }
  v.c.addChild(bulb);
  v.bodyC = bulb;
  v.update = (e2, world, dt) => {
    if (dieAnim(v, e2, dt)) return;
    v.t += dt * 0.1;
    const arming = e2.burst > 0;
    bulb.sq(1, arming ? 0.94 + Math.sin(v.t * 12) * 0.03 : 1 + Math.sin(v.t * 1.8) * 0.02);
    burrs.forEach((b, i) => { b.rotation += dt * (0.05 + i * 0.02); b.y = -11 - (i % 2) * 1.6 + Math.sin(v.t * 2 + i) * 0.5; });
    flashTint(v, e2);
  };
  return v;
}

function makeWardenView(e) {
  const v = baseView(e);
  v.c.addChild(makeShadow(15));
  const body = part((x) => {
    x.fillStyle = lin(x, 0, 0, 0, 16, [['0', '#8898b8'], ['0.55', '#5e6c8a'], ['1', '#3a4258']]);
    blob(x, 7, 9.6, 6, 7.4, 9, 0.05, 55); x.fill();
    // helm ridge
    x.fillStyle = '#aab8d6';
    x.beginPath(); x.moveTo(3.4, 3.6); x.quadraticCurveTo(7, 0.4, 10.6, 3.6); x.quadraticCurveTo(7, 2.4, 3.4, 3.6); x.closePath(); x.fill();
    x.fillStyle = '#ffd76e';
    x.beginPath(); x.arc(9.4, 7.2, 1, 0, 7); x.fill();   // eye slit glow
  }, 14, 17, 0.5, 1);
  const shield = part((x) => {
    x.fillStyle = lin(x, 0, 0, 3, 14, [['0', '#d7e3f4'], ['0.5', '#9fb2cf'], ['1', '#61718e']]);
    rr(x, 0.4, 0.4, 4.6, 13.2, 2.2); x.fill();
    x.strokeStyle = 'rgba(20,30,50,0.5)'; x.lineWidth = 0.7;
    rr(x, 0.4, 0.4, 4.6, 13.2, 2.2); x.stroke();
    x.fillStyle = '#ffd76e';
    x.beginPath(); x.arc(2.7, 7, 1.2, 0, 7); x.fill();
  }, 5.5, 14, 0.5, 0.5);
  shield.x = 6.4; shield.y = -8.4;
  v.c.addChild(body); v.c.addChild(shield);
  v.bodyC = body;
  v.update = (e2, world, dt) => {
    if (dieAnim(v, e2, dt)) return;
    v.t += dt * 0.09;
    v.c.scale.x = e2.dir < 0 ? -1 : 1;   // shield arm forward
    body.rotation = Math.sin(v.t * 2.4) * 0.04;
    shield.visible = e2.shield;
    shield.y = -8.4 + Math.sin(v.t * 2.4) * 0.4;
    flashTint(v, e2);
  };
  return v;
}

function makeDuelistView(e) {
  const v = baseView(e);
  v.c.addChild(makeShadow(10));
  const body = part((x) => {
    // slim mantis fencer
    x.fillStyle = lin(x, 0, 0, 0, 16, [['0', '#7cc98a'], ['0.6', '#4e9e60'], ['1', '#2e6b40']]);
    x.beginPath(); x.ellipse(4.5, 10.4, 2.6, 6, 0.08, 0, 7); x.fill();
    // head
    x.fillStyle = '#8fd89c';
    x.beginPath(); x.ellipse(5.4, 3.2, 2.4, 1.8, -0.25, 0, 7); x.fill();
    x.fillStyle = '#1d3626';
    x.beginPath(); x.arc(6.8, 3, 0.9, 0, 7); x.fill();
    x.fillStyle = '#fff'; x.beginPath(); x.arc(7.05, 2.75, 0.3, 0, 7); x.fill();
    // plume
    x.fillStyle = '#e5533a';
    x.beginPath(); x.moveTo(3.6, 2); x.quadraticCurveTo(1.4, 0, 0.6, 2.6); x.quadraticCurveTo(2.4, 2.6, 3.6, 3.2); x.closePath(); x.fill();
  }, 9, 17, 0.45, 1);
  const arm = new Container();
  arm.position.set(2, -9);
  const rapier = part((x) => {
    x.fillStyle = '#caced8';
    rr(x, 2.6, 1.1, 10.4, 0.9, 0.45); x.fill();
    x.fillStyle = '#8a5a33';
    x.beginPath(); x.arc(2.2, 1.5, 1.3, 0, 7); x.fill();
  }, 13.5, 3, 0.1, 0.5);
  arm.addChild(rapier);
  v.c.addChild(body); v.c.addChild(arm);
  v.bodyC = body;
  v.update = (e2, world, dt) => {
    if (dieAnim(v, e2, dt)) return;
    v.t += dt * 0.1;
    v.c.scale.x = e2.dir < 0 ? -1 : 1;
    body.rotation = Math.sin(v.t * 2) * 0.04;
    let target = 0.35;
    if (e2.mode === 'windup') target = -1.15;
    else if (e2.mode === 'lunge') target = 0.05;
    else if (e2.mode === 'guardbreak') target = 1.5;
    else if (e2.mode === 'approach') target = 0.2 + Math.sin(v.t * 3) * 0.06;
    arm.rotation = sm(arm.rotation, target, 0.4);
    body.sq(1, e2.mode === 'windup' ? 0.94 : 1);
    flashTint(v, e2);
  };
  return v;
}

function makeGlintwingView(e) {
  const v = baseView(e);
  const wingT = (x) => {
    x.fillStyle = lin(x, 0, 0, 8, 0, [['0', 'rgba(200,230,255,0.9)'], ['1', 'rgba(140,190,255,0.4)']]);
    x.beginPath(); x.moveTo(0.4, 2.6); x.quadraticCurveTo(4, -1, 8.6, 0.6); x.quadraticCurveTo(5, 3.8, 0.4, 2.6); x.closePath(); x.fill();
  };
  const wingL = part(wingT, 9, 4.5, 0.06, 0.6); wingL.x = -1; wingL.y = -8;
  const wingR = part(wingT, 9, 4.5, 0.06, 0.6); wingR.x = 1; wingR.y = -8; wingR.sq(-1, 1);
  const body = part((x) => {
    x.fillStyle = lin(x, 0, 0, 0, 10, [['0', '#c8ccd8'], ['0.5', '#8f95a8'], ['1', '#565c70']]);
    blob(x, 5, 5, 3.6, 4.4, 8, 0.05, 66); x.fill();
    // lens
    x.fillStyle = rad(x, 5, 6, 2.2, [['0', '#fff'], ['0.4', '#ffd76e'], ['1', '#a05c1e']]);
    x.beginPath(); x.arc(5, 6, 1.9, 0, 7); x.fill();
    x.strokeStyle = 'rgba(30,30,40,0.6)'; x.lineWidth = 0.5;
    x.beginPath(); x.arc(5, 6, 1.9, 0, 7); x.stroke();
  }, 10, 10.5, 0.5, 0.8);
  v.c.addChild(wingL); v.c.addChild(wingR); v.c.addChild(body);
  v.bodyC = body;
  v.update = (e2, world, dt) => {
    if (dieAnim(v, e2, dt)) return;
    v.t += dt;
    const flap = Math.sin(v.t * 1.4);
    wingL.rotation = flap * 0.7; wingR.rotation = -flap * 0.7;
    body.y = Math.sin(v.t * 0.23) * 0.8;
    const aiming = e2.mode === 'aim';
    body.tint = aiming && Math.floor(v.t / 4) % 2 === 0 ? 0xffe9a0 : 0xffffff;
    flashTint(v, e2);
    if (aiming) v.c.alpha = 1;
  };
  return v;
}

function makeMossView(e) {
  const v = baseView(e);
  v.c.addChild(makeShadow(16));
  const body = part((x) => {
    x.fillStyle = lin(x, 0, 0, 0, 12, [['0', '#79c46a'], ['0.55', '#549e4a'], ['1', '#316b33']]);
    blob(x, 8, 7, 7.2, 5.4, 9, 0.05, 77); x.fill();
    // shell moss patches
    x.fillStyle = 'rgba(200,240,140,0.5)';
    for (const [dx2, dy2, r2] of [[5, 4, 1.6], [10.4, 5.4, 1.2], [7.4, 7.6, 1]]) {
      blob(x, dx2, dy2, r2, r2 * 0.8, 7, 0.2, dx2 * 10); x.fill();
    }
    // face
    x.fillStyle = '#2b2b33';
    x.beginPath(); x.arc(13, 6.4, 1.05, 0, 7); x.fill();
    x.fillStyle = '#fff'; x.beginPath(); x.arc(13.3, 6.1, 0.35, 0, 7); x.fill();
    x.fillStyle = 'rgba(240,140,110,0.45)';
    x.beginPath(); x.ellipse(13.6, 8.2, 0.9, 0.5, 0, 0, 7); x.fill();
  }, 16.5, 12.5, 0.5, 1);
  const saddle = part((x) => {
    x.fillStyle = '#c8f08c';
    x.beginPath(); x.moveTo(0.5, 3.4); x.quadraticCurveTo(4.5, -0.8, 8.5, 3.4); x.quadraticCurveTo(4.5, 2, 0.5, 3.4); x.closePath(); x.fill();
  }, 9, 4, 0.5, 1);
  saddle.y = -10.4;
  const legs = [];
  for (let i = 0; i < 3; i++) {
    const leg = part((x) => { x.fillStyle = '#2e5e2e'; rr(x, 0.4, 0, 1.7, 3.6, 0.8); x.fill(); }, 2.5, 3.8, 0.5, 0.1);
    leg.x = -4.5 + i * 4.4; leg.y = -3.4;
    v.c.addChild(leg); legs.push(leg);
  }
  const ant = part((x) => {
    x.strokeStyle = '#2e5e2e'; x.lineWidth = 0.7;
    x.beginPath(); x.moveTo(0.4, 5.6); x.quadraticCurveTo(2, 1.6, 4.4, 0.6); x.stroke();
    x.fillStyle = '#c8f08c'; x.beginPath(); x.arc(4.6, 0.8, 1, 0, 7); x.fill();
  }, 6, 6.4, 0.1, 0.92);
  ant.x = 5.4; ant.y = -11;
  v.c.addChild(body); v.c.addChild(saddle); v.c.addChild(ant);
  v.bodyC = body;
  const spring = new Spring(0, 0.28, 0.6);
  v.update = (e2, world, dt) => {
    v.t += dt * (0.08 + Math.abs(e2.vx || 0) * 0.1);
    const p = world.player;
    const dir2 = e2.mounted ? p.facing : (e2.dir || 1);
    v.c.scale.x = dir2 < 0 ? -1 : 1;
    legs.forEach((l, i) => l.rotation = Math.sin(v.t * 5 + i * 2.1) * 0.6);
    spring.target = clamp(-(e2.mounted ? p.vx : e2.vx || 0) * (v.c.scale.x) * 0.3, -0.7, 0.7);
    ant.rotation = spring.update();
    body.rotation = Math.sin(v.t * 2.2) * 0.03;
    flashTint(v, e2);
  };
  return v;
}

// --------------------------------------------------------- King Snapjaw --
function makeSnapjawView(e) {
  const v = baseView(e);
  v.c.addChild(makeShadow(26));
  const face = part((x) => {
    x.fillStyle = lin(x, 0, 0, 0, 14, [['0', '#f4e3c2'], ['1', '#bd9a66']]);
    blob(x, 9, 7.5, 8, 6.6, 9, 0.05, 12); x.fill();
    // jaw teeth
    x.fillStyle = '#fff';
    for (const [tx2, ty2] of [[5, 11.6], [8.5, 12.4], [12, 11.6]]) {
      x.beginPath(); x.moveTo(tx2, ty2); x.lineTo(tx2 + 1.6, ty2 + 2.6); x.lineTo(tx2 + 3, ty2); x.closePath(); x.fill();
    }
    // eye: cross scar
    x.fillStyle = '#2b2b33';
    x.beginPath(); x.arc(12.6, 6, 1.8, 0, 7); x.fill();
    x.fillStyle = '#ffd76e'; x.beginPath(); x.arc(13.1, 5.5, 0.6, 0, 7); x.fill();
    x.strokeStyle = 'rgba(90,50,20,0.6)'; x.lineWidth = 0.6;
    x.beginPath(); x.moveTo(4, 4); x.lineTo(7, 7); x.moveTo(7, 4); x.lineTo(4, 7); x.stroke();
  }, 18.5, 15, 0.5, 1);
  face.y = -1;
  const cap = part((x) => {
    x.fillStyle = lin(x, 0, 0, 0, 14, [['0', '#ff8459'], ['0.55', '#d5432f'], ['1', '#8e2620']]);
    x.beginPath(); x.moveTo(1, 13);
    x.quadraticCurveTo(13.5, -5.4, 26, 13);
    x.quadraticCurveTo(13.5, 8.6, 1, 13);
    x.closePath(); x.fill();
    x.fillStyle = 'rgba(255,255,255,0.75)';
    for (const [dx2, dy2, r2] of [[7.4, 6, 2], [15.5, 3.6, 1.6], [20.6, 7.4, 1.3]]) {
      x.beginPath(); x.arc(dx2, dy2, r2, 0, 7); x.fill();
    }
    // armor plates
    x.strokeStyle = 'rgba(90,20,15,0.65)'; x.lineWidth = 1;
    x.beginPath(); x.moveTo(4, 11.4); x.quadraticCurveTo(13.5, 6.4, 23, 11.4); x.stroke();
  }, 27, 14.5, 0.5, 0.94);
  cap.y = -10;
  const crown = part((x) => {
    x.fillStyle = lin(x, 0, 0, 0, 6, [['0', '#ffe9a0'], ['1', '#c9941e']]);
    x.beginPath(); x.moveTo(1, 6.4); x.lineTo(1.6, 1.6); x.lineTo(4, 4.2); x.lineTo(6.4, 0.6);
    x.lineTo(8.8, 4.2); x.lineTo(11.2, 1.6); x.lineTo(11.8, 6.4); x.closePath(); x.fill();
    x.fillStyle = '#e5533a'; x.beginPath(); x.arc(6.4, 4.4, 1, 0, 7); x.fill();
  }, 13, 7, 0.5, 1);
  crown.y = -20; crown.x = -2;
  v.c.addChild(face, cap, crown);
  v.bodyC = cap;
  const dizzy = part((x) => {
    x.strokeStyle = 'rgba(255,240,160,0.9)'; x.lineWidth = 0.8;
    x.beginPath(); x.arc(5, 5, 4, 0.4, 5.4); x.stroke();
    x.fillStyle = '#fff2b0'; x.beginPath(); x.arc(8.6, 3, 1, 0, 7); x.fill();
  }, 10, 10, 0.5, 0.5);
  dizzy.y = -26; dizzy.visible = false;
  v.c.addChild(dizzy);
  v.update = (e2, world, dt) => {
    if (e2.dying > 0) {
      v.c.alpha = e2.dying / 90;
      v.c.rotation += 0.05 * dt;
      return;
    }
    v.t += dt * 0.1;
    v.c.scale.x = e2.dir < 0 ? 1 : -1;
    const stunned = e2.mode === 'wallstun' || e2.mode === 'stagger' || e2.mode === 'slamrecover';
    dizzy.visible = stunned;
    if (stunned) dizzy.rotation += 0.15 * dt;
    if (e2.mode === 'charge') {
      face.visible = false; crown.y = -14;
      cap.y = -3; cap.rotation += e2.dir * 0.16 * dt;
    } else {
      face.visible = true; crown.y = -20;
      cap.rotation = sm(cap.rotation, Math.sin(v.t * 2) * 0.03, 0.3);
      cap.y = -10 + Math.sin(v.t * 2.4) * 0.5;
      const windup = e2.mode === 'bitewind' || e2.mode === 'chargewind' || e2.mode === 'slamwind';
      face.sq(1, windup ? 0.9 : 1);
      cap.sq(1, windup ? 0.92 : 1);
    }
    flashTint(v, e2);
    if (e2.vulnT > 0) v.c.alpha = 0.9 + Math.sin(v.t * 8) * 0.1;
    else v.c.alpha = 1;
  };
  return v;
}

// --------------------------------------------------------------- Grubmaw --
function makeGrubmawView(e) {
  const v = baseView(e);
  const segs = [];
  for (let i = 3; i >= 1; i--) {
    const seg = part((x) => {
      x.fillStyle = lin(x, 0, 0, 0, 14, [['0', '#e8d8b0'], ['0.55', '#c4a878'], ['1', '#8a6a48']]);
      blob(x, 7, 7, 6 - 0, 6, 9, 0.06, 40 + 7);
      x.fill();
      x.strokeStyle = 'rgba(90,60,30,0.4)'; x.lineWidth = 0.6;
      x.beginPath(); x.arc(7, 7, 5.2, -0.9, 0.9); x.stroke();
    }, 14, 14, 0.5, 0.85);
    seg.sq(1 - i * 0.12, 1 - i * 0.12);
    v.c.addChild(seg);
    segs.push(seg);
  }
  const head = part((x) => {
    x.fillStyle = lin(x, 0, 0, 0, 18, [['0', '#f0e0bc'], ['0.5', '#d0b488'], ['1', '#96744e']]);
    blob(x, 9, 9.6, 8.2, 8, 9, 0.05, 55); x.fill();
    // mandibles
    x.fillStyle = '#6a4a2e';
    x.beginPath(); x.moveTo(3, 14); x.quadraticCurveTo(-1, 16.5, 1.5, 18.6); x.quadraticCurveTo(4, 17, 5.4, 15.2); x.closePath(); x.fill();
    x.beginPath(); x.moveTo(15, 14); x.quadraticCurveTo(19, 16.5, 16.5, 18.6); x.quadraticCurveTo(14, 17, 12.6, 15.2); x.closePath(); x.fill();
    // eyes
    x.fillStyle = '#2b2b33';
    x.beginPath(); x.arc(5.6, 8, 1.5, 0, 7); x.arc(12.4, 8, 1.5, 0, 7); x.fill();
    x.fillStyle = '#ffd76e';
    x.beginPath(); x.arc(6, 7.5, 0.5, 0, 7); x.arc(12.8, 7.5, 0.5, 0, 7); x.fill();
    // helm crack
    x.strokeStyle = 'rgba(60,40,20,0.6)'; x.lineWidth = 0.8;
    x.beginPath(); x.moveTo(9, 1.6); x.quadraticCurveTo(8, 4.5, 9.6, 6.4); x.stroke();
  }, 18, 19, 0.5, 0.92);
  v.c.addChild(head);
  v.bodyC = head;
  v.update = (e2, world, dt) => {
    if (e2.dying > 0) { v.c.alpha = e2.dying / 90; v.c.rotation += 0.04 * dt; return; }
    v.t += dt * 0.12;
    const under = e2.mode === 'burrowed' || e2.mode === 'emergewind';
    v.c.visible = true;
    if (under) {
      // only a moving mound shows (drawn via events); hide the body
      v.c.alpha = 0;
    } else {
      v.c.alpha = 1;
      head.y = Math.sin(v.t * 2) * 0.8;
      head.rotation = e2.mode === 'emerge' ? -0.15 + Math.sin(v.t * 9) * 0.1 : Math.sin(v.t * 1.6) * 0.05;
      segs.forEach((s2, i) => {
        s2.y = 2 + Math.sin(v.t * 2 + i) * 0.9;
        s2.x = Math.sin(v.t * 1.4 + i * 1.8) * 1.6;
      });
      if (e2.mode === 'emerge') { v.c.scale.y = 1.12; v.c.scale.x = 0.94; }
      else { v.c.scale.set(1); }
    }
    flashTint(v, e2);
    if (e2.vulnT > 0 && !under) v.c.alpha = 0.88 + Math.sin(v.t * 8) * 0.12;
  };
  return v;
}

// --------------------------------------------------------------- Zephyra --
function makeZephyraView(e) {
  const v = baseView(e);
  const wingT = (x) => {
    x.fillStyle = lin(x, 0, 0, 0, 12, [['0', '#ffffff'], ['0.55', '#e4e9f2'], ['1', '#b4bfd4']]);
    x.beginPath(); x.moveTo(0.6, 3);
    x.quadraticCurveTo(9, -3, 20, 2);
    x.quadraticCurveTo(13, 6, 8, 9.5);
    x.quadraticCurveTo(3.4, 7, 0.6, 3);
    x.closePath(); x.fill();
    x.strokeStyle = 'rgba(90,100,130,0.4)'; x.lineWidth = 0.6;
    x.beginPath(); x.moveTo(2.4, 3.6); x.quadraticCurveTo(10, 0.4, 18.6, 2.4); x.stroke();
  };
  const wingB = part(wingT, 21, 10.5, 0.05, 0.35); wingB.position.set(-3, -16);
  const body = part((x) => {
    x.fillStyle = lin(x, 0, 0, 0, 22, [['0', '#ffffff'], ['0.5', '#eee7da'], ['1', '#bfae94']]);
    blob(x, 13, 11, 11.5, 9.6, 10, 0.06, 88); x.fill();
    // chest ruff
    x.fillStyle = 'rgba(255,255,255,0.8)';
    blob(x, 10, 15, 6, 4.4, 8, 0.15, 21); x.fill();
    // beak
    x.fillStyle = '#f0a03c';
    x.beginPath(); x.moveTo(22.5, 8.6); x.lineTo(27.5, 10.6); x.lineTo(22.3, 13); x.closePath(); x.fill();
    // fierce eye
    x.fillStyle = '#2b2b33'; x.beginPath(); x.ellipse(19, 8.4, 1.9, 2.2, 0, 0, 7); x.fill();
    x.fillStyle = '#ffd76e'; x.beginPath(); x.arc(19.6, 7.8, 0.7, 0, 7); x.fill();
    x.strokeStyle = '#8a6a3e'; x.lineWidth = 0.8;
    x.beginPath(); x.moveTo(16.4, 5.6); x.lineTo(21.6, 7); x.stroke();   // brow
    // crest feathers
    x.fillStyle = '#9fd3ef';
    for (const [cx2, a] of [[12, -0.8], [15, -0.5], [18, -0.25]]) {
      x.save(); x.translate(cx2, 2.4); x.rotate(a);
      x.beginPath(); x.ellipse(0, -3, 1.6, 4, 0, 0, 7); x.fill();
      x.restore();
    }
  }, 28, 22.5, 0.5, 0.9);
  const wingF = part(wingT, 21, 10.5, 0.05, 0.35); wingF.position.set(-1, -17);
  const tail = part((x) => {
    x.fillStyle = '#d8ccb4';
    for (let i = 0; i < 3; i++) {
      x.save(); x.translate(4, 3 + i * 2.6); x.rotate(0.25 - i * 0.25);
      x.beginPath(); x.ellipse(-5, 0, 6.5, 1.7, 0, 0, 7); x.fill();
      x.restore();
    }
  }, 12, 12, 0.8, 0.4); tail.position.set(-11, -10);
  v.c.addChild(tail, wingB, body, wingF);
  v.bodyC = body;
  v.update = (e2, world, dt) => {
    if (e2.dying > 0) { v.c.alpha = e2.dying / 90; v.c.y += dt; return; }
    v.t += dt;
    const p = world.player;
    v.c.scale.x = (e2.mode === 'dive' ? (e2.diveVec?.x || 1) : p.x - e2.x) < 0 ? -1 : 1;
    const speed = e2.mode === 'dive' ? 0.55 : e2.mode === 'skid' ? 0.05 : 0.22;
    const flap = Math.sin(v.t * speed);
    wingF.rotation = -0.4 + flap * 0.75;
    wingB.rotation = -0.3 + Math.sin(v.t * speed + 0.7) * 0.65;
    body.rotation = e2.mode === 'dive' ? 0.5 : Math.sin(v.t * 0.06) * 0.05;
    if (e2.mode === 'skid') { body.rotation = 0.9; v.c.y = 0; }
    body.sq(1, e2.mode === 'divewind' ? 0.92 : 1);
    flashTint(v, e2);
    if (e2.vulnT > 0) v.c.alpha = 0.88 + Math.sin(v.t * 0.5) * 0.12;
    else v.c.alpha = 1;
  };
  return v;
}

// -------------------------------------------------------- General Bramble --
function makeBrambleView(e) {
  const v = baseView(e);
  v.c.addChild(makeShadow(24));
  const cloak = part((x) => {
    x.fillStyle = lin(x, 0, 0, 0, 30, [['0', '#3a1a20'], ['1', '#1c0b10']]);
    x.beginPath(); x.moveTo(9, 2);
    x.quadraticCurveTo(-2, 12, 2, 29);
    x.lineTo(16, 29);
    x.quadraticCurveTo(18, 12, 9, 2);
    x.closePath(); x.fill();
  }, 19, 30, 0.5, 0.97);
  cloak.x = -2;
  const body = part((x) => {
    // thorn-plate armor
    x.fillStyle = lin(x, 0, 0, 0, 30, [['0', '#6e3226'], ['0.5', '#552a20'], ['1', '#361712']]);
    rr(x, 3, 4, 14, 25, 4); x.fill();
    x.strokeStyle = 'rgba(20,8,8,0.7)'; x.lineWidth = 0.8;
    rr(x, 3, 4, 14, 25, 4); x.stroke();
    // plate ridges
    x.strokeStyle = 'rgba(255,120,70,0.25)';
    x.beginPath(); x.moveTo(4, 12); x.quadraticCurveTo(10, 10, 16, 12); x.stroke();
    x.beginPath(); x.moveTo(4, 19); x.quadraticCurveTo(10, 17, 16, 19); x.stroke();
    // thorn shoulder
    x.fillStyle = '#2e1216';
    x.beginPath(); x.moveTo(2.6, 6); x.quadraticCurveTo(-2, 2.5, 1, -0.5); x.quadraticCurveTo(4, 2.5, 6, 5); x.closePath(); x.fill();
    x.beginPath(); x.moveTo(17.4, 6); x.quadraticCurveTo(22, 2.5, 19, -0.5); x.quadraticCurveTo(16, 2.5, 14, 5); x.closePath(); x.fill();
    // chest sun-seed prison (stolen light)
    x.fillStyle = rad(x, 10, 14.5, 3.4, [['0', '#fff2b0'], ['0.55', '#ffb347'], ['1', '#7e3a1e']]);
    x.beginPath(); x.arc(10, 14.5, 3, 0, 7); x.fill();
    x.strokeStyle = '#2e1216'; x.lineWidth = 1;
    x.beginPath(); x.moveTo(7.4, 12.2); x.lineTo(12.8, 17); x.moveTo(12.6, 12.2); x.lineTo(7.2, 17); x.stroke();
  }, 20, 31, 0.5, 1);
  const head = part((x) => {
    // horned helm, burning eye
    x.fillStyle = lin(x, 0, 0, 0, 10, [['0', '#4a2018'], ['1', '#2e1212']]);
    blob(x, 6.5, 5.6, 5.4, 4.6, 8, 0.05, 61); x.fill();
    x.fillStyle = '#2e1216';
    x.beginPath(); x.moveTo(2.4, 3.6); x.quadraticCurveTo(-1.6, -0.6, 1.2, -2.4); x.quadraticCurveTo(3.6, 0.4, 4.8, 2.6); x.closePath(); x.fill();
    x.beginPath(); x.moveTo(10.6, 3.6); x.quadraticCurveTo(14.6, -0.6, 11.8, -2.4); x.quadraticCurveTo(9.4, 0.4, 8.2, 2.6); x.closePath(); x.fill();
    x.fillStyle = '#ffd76e';
    x.beginPath(); x.ellipse(9.2, 5.6, 1.7, 1, 0, 0, 7); x.fill();
    x.fillStyle = '#ff5c2a';
    x.beginPath(); x.arc(9.6, 5.6, 0.6, 0, 7); x.fill();
  }, 13, 11, 0.42, 0.92);
  head.y = -27;
  const armC = new Container();
  armC.position.set(6, -22);
  const sword = part((x) => {
    // greatsword of woven thorn
    x.fillStyle = '#573b22';
    rr(x, 0, 2.2, 4, 2.6, 1.2); x.fill();
    x.fillStyle = '#8a5a33';
    x.beginPath(); x.ellipse(4.6, 3.5, 1, 3, 0, 0, 7); x.fill();
    x.fillStyle = lin(x, 5, 0, 22, 0, [['0', '#3c2030'], ['0.6', '#54202a'], ['1', '#20090c']]);
    x.beginPath(); x.moveTo(5.4, 1.4);
    x.quadraticCurveTo(15, 0.2, 21.6, 2.6);
    x.quadraticCurveTo(15, 5.6, 5.4, 5.4);
    x.closePath(); x.fill();
    x.strokeStyle = '#ff9d5c'; x.lineWidth = 0.5;
    x.beginPath(); x.moveTo(5.6, 1.6); x.quadraticCurveTo(15, 0.5, 21.2, 2.6); x.stroke();
    for (const bx of [9, 13.5, 17.5]) {
      x.fillStyle = '#2e1216';
      x.beginPath(); x.moveTo(bx, 1.2); x.lineTo(bx + 1.2, -0.8); x.lineTo(bx + 2.2, 1.1); x.closePath(); x.fill();
    }
  }, 22.5, 6.5, 0.05, 0.6);
  armC.addChild(sword);
  v.c.addChild(cloak, body, head, armC);
  v.bodyC = body;
  v.update = (e2, world, dt) => {
    if (e2.dying > 0) {
      v.c.alpha = Math.min(1, e2.dying / 100);
      v.c.rotation = sm(v.c.rotation, 0.5, 0.01 * dt);
      head.y = -27 + (150 - e2.dying) * 0.05;
      return;
    }
    v.t += dt * 0.1;
    v.c.scale.x = e2.dir < 0 ? -1 : 1;
    body.rotation = Math.sin(v.t * 1.8) * 0.02;
    cloak.rotation = Math.sin(v.t * 1.5) * 0.04 - (e2.vx ? sign2(e2.vx) * 0.1 : 0) * v.c.scale.x;
    let target = 0.8;                          // sword low
    if (e2.mode === 'whipwind' || e2.mode === 'duelwind') target = -2.1;
    else if (e2.mode === 'whip' || e2.mode === 'duelslash') target = -0.15;
    else if (e2.mode === 'laserwind' || e2.mode === 'laser') target = -0.6;
    else if (e2.mode === 'lunge') target = 0.35;
    else if (e2.mode === 'stagger' || e2.mode === 'wallstun') target = 1.5;
    else if (e2.mode === 'duelstance') target = -0.75 + Math.sin(v.t * 2.4) * 0.06;
    armC.rotation = sm(armC.rotation, target, 0.35);
    const windup = ['whipwind', 'lungewind', 'duelwind'].includes(e2.mode);
    body.sq(1, windup ? 0.95 : 1);
    head.x = e2.mode === 'duelstance' ? 1.5 : 0;
    flashTint(v, e2);
    v.c.alpha = e2.vulnT > 0 ? 0.88 + Math.sin(v.t * 7) * 0.12 : 1;
  };
  return v;
}
const sign2 = (v2) => v2 < 0 ? -1 : v2 > 0 ? 1 : 0;

const ENEMY_VIEWS = {
  Bumble: makeBumbleView,
  KingSnapjaw: makeSnapjawView,
  Grubmaw: makeGrubmawView,
  Zephyra: makeZephyraView,
  GeneralBramble: makeBrambleView,
  Snapcap: makeSnapcapView,
  Spikelet: makeSpikeletView,
  Puffhawk: makePuffhawkView,
  Lobber: makeLobberView,
  Wisp: makeWispView,
  Pod: makePodView,
  Warden: makeWardenView,
  Duelist: makeDuelistView,
  Glintwing: makeGlintwingView,
  Moss: makeMossView,
  Dummy: (e) => {
    const v = baseView(e);
    v.c.addChild(makeShadow(13));
    const body = part((x) => {
      x.fillStyle = lin(x, 0, 0, 0, 20, [['0', '#d8c49a'], ['1', '#9a7f56']]);
      rr(x, 4, 2, 6, 18, 3); x.fill();
      x.strokeStyle = 'rgba(80,60,30,0.6)'; x.lineWidth = 0.7;
      rr(x, 4, 2, 6, 18, 3); x.stroke();
      x.beginPath(); x.moveTo(7, 2); x.lineTo(7, 20); x.stroke();
      x.fillStyle = '#7e4c2a';
      x.beginPath(); x.arc(7, 6.4, 2.2, 0, 7); x.fill();
    }, 14, 22.5, 0.5, 1);
    v.c.addChild(body);
    v.bodyC = body;
    let wob = 0;
    v.update = (e2, world, dt) => {
      if (e2.hitT > 6) wob = 0.3;
      wob *= Math.pow(0.9, dt);
      body.rotation = Math.sin(world.frame * 0.5) * wob;
      flashTint(v, e2);
    };
    return v;
  },
};

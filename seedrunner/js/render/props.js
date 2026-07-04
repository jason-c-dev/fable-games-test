// Instanced prop pools: every obstacle, dew drop, lantern, ramp and piece of
// trackside scenery drawn from ~a dozen InstancedMeshes. Static one-offs
// (shrines, seeds, checkpoints, signs) get real meshes managed in a Map.

import * as THREE from 'three';
import { LANES, OBSTACLES } from '../config.js';
import { laneX } from '../sim/chunks.js';
import { worldPos, headingAt } from './curve.js';
import { lookAt } from './biomes.js';
import { hashString } from '../core/math.js';

const VIEW_AHEAD = 130, VIEW_BACK = 22;

function makePool(scene, geo, mat, max) {
  const m = new THREE.InstancedMesh(geo, mat, max);
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  m.count = 0;
  m.frustumCulled = false;
  scene.add(m);
  return m;
}

function glowTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,0.85)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.28)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(cv);
  return t;
}

export class Props {
  constructor(scene) {
    this.scene = scene;
    this.dummy = new THREE.Object3D();
    this.statics = new Map();          // item -> mesh group for one-offs
    this._signTex = new Map();

    const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85, ...extra });

    this.pools = {
      block: makePool(scene, new THREE.CylinderGeometry(0.55, 0.75, OBSTACLES.blockH, 6), std(0xffffff), 90),
      spike: makePool(scene, new THREE.ConeGeometry(0.16, 0.55, 5), std(0x2c1e26), 220),
      post: makePool(scene, new THREE.CylinderGeometry(0.14, 0.2, OBSTACLES.archY, 6), std(0xffffff), 120),
      bar: makePool(scene, new THREE.BoxGeometry(LANES.width * 0.98, 0.5, 0.5), std(0xffffff), 60),
      barrier: makePool(scene, new THREE.PlaneGeometry(LANES.width * 0.92, 2.4, 4, 5),
        new THREE.MeshStandardMaterial({ color: 0x1e0f1e, emissive: 0xb03060, emissiveIntensity: 0.7, side: THREE.DoubleSide, wireframe: true }), 40),
      barrierSkin: makePool(scene, new THREE.PlaneGeometry(LANES.width * 0.92, 2.4),
        new THREE.MeshStandardMaterial({ color: 0x241626, transparent: true, opacity: 0.55, side: THREE.DoubleSide }), 40),
      dew: makePool(scene, new THREE.OctahedronGeometry(0.22),
        new THREE.MeshStandardMaterial({ color: 0x9fe8ff, emissive: 0x5fd8ff, emissiveIntensity: 1.4 }), 400),
      glow: makePool(scene, new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({ map: glowTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: 0x88e0ff, opacity: 0.8 }), 460),
      ramp: makePool(scene, wedgeGeo(), std(0xffffff), 30),
      lantern: makePool(scene, new THREE.SphereGeometry(0.42, 10, 8),
        new THREE.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xffd88a, emissiveIntensity: 1.6 }), 40),
      lanternPost: makePool(scene, new THREE.CylinderGeometry(0.08, 0.12, 2.6, 5), std(0x4a5a78), 40),
      trunk: makePool(scene, new THREE.CylinderGeometry(0.28, 0.5, 3.2, 6), std(0xffffff), 160),
      leaf: makePool(scene, new THREE.IcosahedronGeometry(1.35, 0), std(0xffffff), 160),
      crystal: makePool(scene, new THREE.OctahedronGeometry(0.8),
        new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x99aabb, emissiveIntensity: 0.22, flatShading: true }), 120),
      shrub: makePool(scene, new THREE.IcosahedronGeometry(0.5, 0), std(0xffffff), 200),
    };
    this.pools.block.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(90 * 3), 3);
    for (const k of ['post', 'bar', 'trunk', 'leaf', 'crystal', 'shrub', 'ramp']) {
      this.pools[k].instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.pools[k].instanceMatrix.count * 3), 3);
    }
    this._counts = {};
    this._color = new THREE.Color();
    this._p = [0, 0, 0];
  }

  _put(pool, x, y, z, { sx = 1, sy = 1, sz = 1, ry = 0, rz = 0, rx = 0, color, quat } = {}) {
    const mesh = this.pools[pool];
    const i = this._counts[pool] ?? 0;
    if (i >= mesh.instanceMatrix.count) return;
    this.dummy.position.set(x, y, z);
    if (quat) this.dummy.quaternion.copy(quat);
    else this.dummy.quaternion.identity();
    if (!quat) this.dummy.rotation.set(rx, ry, rz);
    this.dummy.scale.set(sx, sy, sz);
    this.dummy.updateMatrix();
    mesh.setMatrixAt(i, this.dummy.matrix);
    if (mesh.instanceColor && color != null) {
      this._color.setHex(color);
      mesh.setColorAt(i, this._color);
    }
    this._counts[pool] = i + 1;
  }

  update(world, camD, camQuat, t) {
    for (const k in this.pools) this._counts[k] = 0;
    const track = world.track;
    const speed = world.speedAt(world.player.d);

    for (const it of track.itemsInRange(camD - VIEW_BACK, camD + VIEW_AHEAD, 60)) {
      const biome = track.biomeAt(it.d);
      const lk = lookAt(biome);
      const P = lk.props;
      switch (it.type) {
        case 'block': {
          if (it._hit) break;
          const p = worldPos(it.d + OBSTACLES.blockDepth / 2, laneX(it.lane), OBSTACLES.blockH / 2, this._p);
          this._put('block', p[0], p[1], p[2], { color: P.trunk });
          // thorn crown
          const rng = hashString(it.chunk + it.d + it.lane);
          for (let s = 0; s < 3; s++) {
            const a = (rng % 7) / 7 * 6.28 + s * 2.1;
            const q = worldPos(it.d + OBSTACLES.blockDepth / 2, laneX(it.lane) + Math.cos(a) * 0.3, OBSTACLES.blockH, this._p);
            this._put('spike', q[0], q[1], q[2], { rz: Math.cos(a) * 0.5, rx: Math.sin(a) * 0.4 });
          }
          break;
        }
        case 'arch': {
          if (it._hit) break;
          const mid = it.d + OBSTACLES.archDepth / 2;
          for (const off of [-LANES.width / 2 + 0.12, LANES.width / 2 - 0.12]) {
            const p = worldPos(mid, laneX(it.lane) + off, OBSTACLES.archY / 2, this._p);
            this._put('post', p[0], p[1], p[2], { color: P.trunk });
          }
          const p = worldPos(mid, laneX(it.lane), OBSTACLES.archY + 0.16, this._p);
          this._put('bar', p[0], p[1], p[2], { color: P.trunk, sy: 0.6, sz: OBSTACLES.archDepth / 0.5, ry: -headingAt(mid) });
          for (let s = 0; s < 4; s++) {
            const q = worldPos(mid + (s % 2 - 0.5) * 1.1, laneX(it.lane) + (s < 2 ? -0.55 : 0.55), OBSTACLES.archY - 0.12, this._p);
            this._put('spike', q[0], q[1], q[2], { rx: Math.PI, sy: 0.9 });
          }
          break;
        }
        case 'barrier': {
          if (it._done) break;
          const tti = (it.d - world.player.d) / speed;
          const glint = it._glinted && tti > 0 ? (0.75 + 0.25 * Math.sin(t * 18)) : 0.35;
          const ry = -headingAt(it.d);
          const p = worldPos(it.d, laneX(it.lane), 1.2, this._p);
          this._put('barrier', p[0], p[1], p[2], { sy: 1 + Math.sin(t * 6 + it.d) * 0.02, ry });
          this._put('barrierSkin', p[0], p[1] + 0.01, p[2] + 0.02, { ry });
          const g = worldPos(it.d, laneX(it.lane), 1.5, this._p);
          this._put('glow', g[0], g[1], g[2], { sx: 2.4 * glint, sy: 2.4 * glint, quat: camQuat });
          break;
        }
        case 'dew': {
          if (it._done) break;
          const h = 0.8 + (it.y ?? 0);
          const bob = Math.sin(t * 3 + it.d * 2) * 0.07;
          const p = worldPos(it.d, laneX(it.lane), h + bob, this._p);
          this._put('dew', p[0], p[1], p[2], { ry: t * 2 + it.d });
          this._put('glow', p[0], p[1], p[2], { sx: 0.9, sy: 0.9, quat: camQuat });
          break;
        }
        case 'ramp': {
          const p = worldPos(it.d + OBSTACLES.rampDepth / 2, laneX(it.lane), 0, this._p);
          this._put('ramp', p[0], p[1], p[2], { color: P.trunk, ry: -headingAt(it.d) });
          break;
        }
        case 'lantern': {
          const p = worldPos(it.d, laneX(it.lane) * 0.4 + (it.lane === 0 ? 2.2 : 0), 2.6, this._p);
          this._put('lantern', p[0], p[1], p[2], { sx: 1 + Math.sin(t * 2 + it.d) * 0.06 });
          this._put('lanternPost', p[0], p[1] - 1.3, p[2]);
          this._put('glow', p[0], p[1], p[2], { sx: 5.5, sy: 5.5, quat: camQuat });
          break;
        }
        case 'seed': {
          if (it._done) break;
          const p = worldPos(it.d, laneX(it.lane), 1.5 + Math.sin(t * 2.4) * 0.15, this._p);
          this._put('crystal', p[0], p[1], p[2], { color: 0xffd76a, ry: t * 1.5, sx: 0.7, sy: 1, sz: 0.7 });
          this._put('glow', p[0], p[1], p[2], { sx: 3.4, sy: 3.4, quat: camQuat });
          break;
        }
        default: break;
      }
    }

    this._scatter(world, camD, t);
    this._updateStatics(world, camD, t);

    for (const k in this.pools) {
      const mesh = this.pools[k];
      mesh.count = this._counts[k];
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  // deterministic trackside scenery from d alone
  _scatter(world, camD, t) {
    const track = world.track;
    for (let d = Math.floor((camD - 10) / 3) * 3; d < camD + VIEW_AHEAD; d += 3) {
      if (d < 0) continue;
      const biome = track.biomeAt(d);
      const P = lookAt(biome).props;
      const h1 = hashString('sc' + d);
      const side = (h1 & 1) ? 1 : -1;
      const off = 6 + (h1 % 100) / 100 * 13;
      const kind = (h1 >> 3) % 10;
      const s = 0.7 + ((h1 >> 5) % 60) / 100;
      const p = worldPos(d, side * off, 0, this._p);
      if (biome === 'meadow') {
        if (kind < 4) {
          this._put('trunk', p[0], p[1] + 1.6 * s, p[2], { color: P.trunk, sy: s, sx: s, sz: s });
          this._put('leaf', p[0], p[1] + 3.4 * s, p[2], { color: P.leaf, sx: s, sy: s, sz: s, ry: h1 });
        } else if (kind < 7) this._put('shrub', p[0], p[1] + 0.4 * s, p[2], { color: P.leaf, sx: s, sy: s, sz: s });
        else this._put('crystal', p[0], p[1] + 0.4, p[2], { color: P.accent, sx: 0.4, sy: 0.4, sz: 0.4 });
      } else if (biome === 'cavern') {
        if (kind < 5) this._put('crystal', p[0], p[1] + 0.9 * s, p[2], { color: P.crystal, sx: s, sy: s * 1.6, sz: s, ry: h1 });
        else this._put('trunk', p[0], p[1] + 1.6 * s, p[2], { color: P.trunk, sx: s * 0.7, sy: s * 1.5, sz: s * 0.7 });
        // stalactites overhead
        if ((h1 >> 7) % 3 === 0) {
          const q = worldPos(d, side * off * 0.35, 7.5, this._p);
          this._put('spike', q[0], q[1], q[2], { rx: Math.PI, sx: 3, sy: 6, sz: 3 });
        }
      } else if (biome === 'cloudline') {
        if (kind < 3) {
          const q = worldPos(d, side * (off + 6), -4 - (h1 % 5), this._p);
          this._put('leaf', q[0], q[1], q[2], { color: 0xffffff, sx: 2.2 * s, sy: 1.1 * s, sz: 2.2 * s });
        } else if (kind < 5) this._put('shrub', p[0], p[1] + 0.4, p[2], { color: P.leaf, sx: s, sy: s, sz: s });
      } else {
        if (kind < 5) {
          this._put('trunk', p[0], p[1] + 1.6 * s, p[2], { color: P.trunk, sy: s * 1.3, sx: s * 0.8, sz: s * 0.8, rz: Math.sin(h1) * 0.2 });
          this._put('spike', p[0], p[1] + 3.2 * s, p[2], { sx: 2, sy: 2.5, sz: 2, rz: Math.sin(h1) * 0.5 });
        } else if (kind < 7) this._put('crystal', p[0], p[1] + 0.5, p[2], { color: P.crystal, sx: 0.5, sy: 0.6, sz: 0.5 });
      }
    }
  }
}

// ---- static one-offs: signs, checkpoints, shrines ----
Props.prototype._updateStatics = function (world, camD, t) {
  const track = world.track;
  const want = new Set();
  for (const it of track.itemsInRange(camD - VIEW_BACK, camD + VIEW_AHEAD, 60)) {
    if (it.type !== 'sign' && it.type !== 'checkpoint' && it.type !== 'shrine') continue;
    want.add(it);
    if (!this.statics.has(it)) this.statics.set(it, this._buildStatic(it, track));
  }
  for (const [it, obj] of this.statics) {
    if (!want.has(it)) {
      this.scene.remove(obj);
      obj.traverse((o) => { o.geometry?.dispose?.(); if (o.material?.map?._sr) o.material.map.dispose(); });
      this.statics.delete(it);
    } else if (it.type === 'checkpoint') {
      obj.children[2].material.opacity = it._done ? 0.85 : 0.35;
      obj.children[2].material.color.setHex(it._done ? 0x8fe06a : 0xe8e8e8);
    } else if (it.type === 'shrine') {
      obj.children[2].rotation.y = t * 0.8;
      obj.children[2].position.y = obj.userData.baseY + 2.6 + Math.sin(t * 2) * 0.1;
    }
  }
};

Props.prototype._buildStatic = function (it, track) {
  const g = new THREE.Group();
  const p = worldPos(it.d, it.type === 'sign' ? laneX(it.lane) * 0.35 + (it.lane <= 0 ? -3.9 : 3.9) : 0, 0, this._p);
  g.position.set(p[0], p[1], p[2]);
  g.rotation.y = -headingAt(it.d);
  const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, flatShading: true, ...extra });

  if (it.type === 'sign') {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 2.2, 6), std(0x6b4a30));
    post.position.y = 1.1;
    const text = this._textSprite(this._resolveSign(it.text), 0xeaf6e4);
    const w = text.geometry.parameters.width;
    const panel = new THREE.Mesh(new THREE.BoxGeometry(w + 0.5, 1.0, 0.12), std(0x3c5a30));
    panel.position.y = 2.4;
    text.position.y = 2.42;
    text.position.z = 0.1;
    it._sprite = { sprite: text, raw: it.text };
    g.add(post, panel, text);
  } else if (it.type === 'checkpoint') {
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 3.4, 6), std(0x8a7a58));
      post.position.set(side * (LANES.width * 1.5 + 0.6), 1.7, 0);
      g.add(post);
    }
    const beam = new THREE.Mesh(
      new THREE.BoxGeometry(LANES.width * 3 + 1.6, 0.18, 0.18),
      new THREE.MeshBasicMaterial({ color: 0xe8e8e8, transparent: true, opacity: 0.35 }),
    );
    beam.position.y = 3.3;
    g.add(beam);
  } else if (it.type === 'shrine') {
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.1, 1.0, 8), std(0x8a7a58));
    base.position.y = 0.5;
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.7, 4.4, 8),
      new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    pillar.position.y = 2.7;
    const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.6, 10, 8), std(0xffd76a, { emissive: 0x7a5a10, emissiveIntensity: 0.8 }));
    g.userData.baseY = 0;
    bowl.position.y = 2.6;
    g.add(base, pillar, bowl);
  }
  this.scene.add(g);
  return g;
};

// %verb% -> current binding label; underscores -> spaces
Props.prototype._resolveSign = function (raw) {
  const labeler = this.signLabeler || ((v) => v.toUpperCase());
  return raw.replace(/%(\w+)%/g, (_, v) => labeler(v)).replace(/_/g, ' ');
};

// re-render sign textures when bindings/device change
Props.prototype.refreshSigns = function () {
  for (const [it, obj] of this.statics) {
    if (it.type !== 'sign' || !it._sprite) continue;
    const resolved = this._resolveSign(it._sprite.raw);
    if (resolved === it._sprite.resolved) continue;
    it._sprite.resolved = resolved;
    const fresh = this._textSprite(resolved, 0xeaf6e4);
    fresh.position.copy(it._sprite.sprite.position);
    obj.remove(it._sprite.sprite);
    it._sprite.sprite.material.map.dispose();
    obj.add(fresh);
    it._sprite.sprite = fresh;
  }
};

Props.prototype._textSprite = function (text, color) {
  const cv = document.createElement('canvas');
  const ctx = cv.getContext('2d');
  ctx.font = 'bold 42px "Trebuchet MS", sans-serif';
  const w = Math.max(64, Math.ceil(ctx.measureText(text).width) + 24);
  cv.width = w; cv.height = 64;
  const ctx2 = cv.getContext('2d');
  ctx2.font = 'bold 42px "Trebuchet MS", sans-serif';
  ctx2.textAlign = 'center'; ctx2.textBaseline = 'middle';
  ctx2.fillStyle = '#' + color.toString(16).padStart(6, '0');
  ctx2.strokeStyle = 'rgba(10,20,8,0.9)'; ctx2.lineWidth = 7; ctx2.lineJoin = 'round';
  ctx2.strokeText(text, w / 2, 32);
  ctx2.fillText(text, w / 2, 32);
  const tex = new THREE.CanvasTexture(cv);
  tex._sr = true;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthWrite: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w / 64 * 0.85, 0.85), mat);
  return mesh;
};

function wedgeGeo() {
  // a ramp wedge: rises from 0 to ~1.1 over rampDepth
  const g = new THREE.BufferGeometry();
  const w = LANES.width * 0.46, dep = OBSTACLES.rampDepth / 2, h = 1.1;
  const v = new Float32Array([
    // left face triangle, right face triangle, top slope, back wall
    -w, 0, dep, -w, 0, -dep, -w, h, -dep,
    w, 0, dep, w, h, -dep, w, 0, -dep,
    -w, 0, dep, -w, h, -dep, w, h, -dep, -w, 0, dep, w, h, -dep, w, 0, dep,
    -w, h, -dep, -w, 0, -dep, w, 0, -dep, -w, h, -dep, w, 0, -dep, w, h, -dep,
  ]);
  g.setAttribute('position', new THREE.BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
}

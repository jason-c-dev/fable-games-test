// Particles: one instanced quad pool, simple physics, additive glow.
// Kinds: dew sparkle, parry shatter shards, dust, stumble leaves, seed
// planting burst, tide wisps, wind streaks.

import * as THREE from 'three';
import { worldPos } from './curve.js';

const MAX = 340;

function softDot() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 32;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(16, 16, 1, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.5)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(cv);
}

export class Fx {
  constructor(scene) {
    const geo = new THREE.PlaneGeometry(0.16, 0.16);
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({
      map: softDot(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }), MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.live = [];
    this.dummy = new THREE.Object3D();
    this._color = new THREE.Color();
    this._p = [0, 0, 0];
  }

  // spawn at track coords (d, x, h)
  burst(d, x, h, { n = 8, color = 0x9fe8ff, spread = 2.2, up = 2.5, life = 40, size = 1, gravity = 6 } = {}) {
    for (let i = 0; i < n && this.live.length < MAX; i++) {
      const w = worldPos(d, x, h, this._p);
      this.live.push({
        x: w[0], y: w[1], z: w[2],
        vx: (Math.random() - 0.5) * spread, vy: Math.random() * up + 0.5, vz: (Math.random() - 0.5) * spread,
        life, maxLife: life, color, size: size * (0.7 + Math.random() * 0.7), gravity,
      });
    }
  }

  update(dt, camQuat) {
    const arr = this.live;
    for (let i = arr.length - 1; i >= 0; i--) {
      const p = arr[i];
      p.life -= dt;
      if (p.life <= 0) { arr.splice(i, 1); continue; }
      const s = dt / 60;
      p.vy -= p.gravity * s;
      p.x += p.vx * s; p.y += p.vy * s; p.z += p.vz * s;
    }
    for (let i = 0; i < arr.length; i++) {
      const p = arr[i];
      const k = p.life / p.maxLife;
      this.dummy.position.set(p.x, p.y, p.z);
      this.dummy.quaternion.copy(camQuat);
      this.dummy.scale.setScalar(p.size * (0.5 + k));
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
      this._color.setHex(p.color).multiplyScalar(Math.min(1, k * 2));
      this.mesh.setColorAt(i, this._color);
    }
    this.mesh.count = arr.length;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
  }
}

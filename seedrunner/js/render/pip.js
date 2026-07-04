// Pip: a low-poly sprout knight built from primitives, animated procedurally.
// Run cycle, lane lean, jump tuck, slide, stumble flail, parry flourish,
// death tumble, victory — one pose function per sim state (no state is
// allowed to fall through to a T-pose).

import * as THREE from 'three';
import { PLAYER } from '../config.js';

const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.8, ...extra });

export class Pip {
  constructor(scene) {
    this.root = new THREE.Group();      // world placement (curve + lateral)
    this.rig = new THREE.Group();       // squash/stretch + lean
    this.root.add(this.rig);

    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.42, 4, 8), std(0x4d8a3a));
    body.position.y = 0.72;
    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), std(0xcfe8a8));
    belly.position.set(0, 0.66, 0.16);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), std(0xf0d8a8));
    head.position.y = 1.25;
    const capBrim = new THREE.Mesh(new THREE.SphereGeometry(0.27, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.55), std(0x3c6030));
    capBrim.position.y = 1.33;
    const capLeaf = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.42, 5), std(0x5fb04a));
    capLeaf.position.set(0, 1.62, -0.05);
    capLeaf.rotation.x = -0.5;
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 6), std(0x1a2018));
    const eyeR = eyeL.clone();
    eyeL.position.set(-0.1, 1.28, 0.2);
    eyeR.position.set(0.1, 1.28, 0.2);

    this.armL = limb(0.07, 0.34, 0x4d8a3a); this.armL.position.set(-0.32, 1.0, 0);
    this.armR = limb(0.07, 0.34, 0x4d8a3a); this.armR.position.set(0.32, 1.0, 0);
    this.legL = limb(0.09, 0.4, 0x3c6030); this.legL.position.set(-0.13, 0.42, 0);
    this.legR = limb(0.09, 0.4, 0x3c6030); this.legR.position.set(0.13, 0.42, 0);

    // leaf cape: a soft plane that trails
    this.cape = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.72, 1, 4), std(0x5fb04a, { side: THREE.DoubleSide }));
    this.cape.position.set(0, 1.05, -0.2);
    this.capePos = this.cape.geometry.attributes.position;
    this.capeBase = this.capePos.array.slice();

    this.rig.add(body, belly, head, capBrim, capLeaf, eyeL, eyeR, this.armL, this.armR, this.legL, this.legR, this.cape);

    // dash/parry aura
    this.aura = new THREE.Mesh(
      new THREE.SphereGeometry(0.75, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.aura.position.y = 0.85;
    this.rig.add(this.aura);

    scene.add(this.root);
    this.phase = 0;
    this._lean = 0;
    this._squash = 1;
  }

  // p: sim player; t: seconds; dt: frame delta (frames)
  update(p, world, t, dt) {
    const speed = p.speed ?? 10;
    this.phase += dt * (0.11 + speed * 0.011);
    const ph = this.phase * Math.PI * 2;

    // lean into lateral motion, tumble states override below
    const lateralV = (p.x - (this._px ?? p.x)) / Math.max(dt / 60, 1e-4);
    this._px = p.x;
    this._lean += ((-lateralV * 0.035) - this._lean) * Math.min(1, dt * 0.35);

    const S = (v) => { this._squash += (v - this._squash) * Math.min(1, dt * 0.4); };

    const pose = {
      run: () => {
        S(1);
        this.rig.rotation.set(0.12 + Math.sin(ph * 2) * 0.02, 0, this._lean);
        this.legL.rotation.x = Math.sin(ph) * 1.1;
        this.legR.rotation.x = Math.sin(ph + Math.PI) * 1.1;
        this.armL.rotation.x = Math.sin(ph + Math.PI) * 0.9;
        this.armR.rotation.x = Math.sin(ph) * 0.9;
        this.rig.position.y = Math.abs(Math.sin(ph)) * 0.06;
      },
      air: () => {
        S(p.vy > 2 ? 1.12 : 0.96);
        this.rig.rotation.set(0.2 - p.vy * 0.02, 0, this._lean);
        this.legL.rotation.x = 0.6; this.legR.rotation.x = -0.35;
        this.armL.rotation.x = -0.7; this.armR.rotation.x = -0.9;
        this.rig.position.y = 0;
      },
      slide: () => {
        S(0.55);
        this.rig.rotation.set(-0.5, 0, this._lean * 0.5);
        this.legL.rotation.x = -0.3; this.legR.rotation.x = 0.25;
        this.armL.rotation.x = -1.6; this.armR.rotation.x = -1.6;
        this.rig.position.y = -0.12;
      },
      win: () => {
        S(1);
        this.rig.rotation.set(0, 0, 0);
        this.legL.rotation.x = Math.sin(ph) * 0.5;
        this.legR.rotation.x = Math.sin(ph + Math.PI) * 0.5;
        this.armL.rotation.x = -2.6 + Math.sin(ph) * 0.2;
        this.armR.rotation.x = -2.6 - Math.sin(ph) * 0.2;
        this.rig.position.y = Math.abs(Math.sin(ph * 0.5)) * 0.18;
      },
      dead: () => {
        S(0.9);
        this.rig.rotation.x += dt * 0.12;
        this.rig.rotation.z += dt * 0.05;
        this.armL.rotation.x = -2.2; this.armR.rotation.x = -1.8;
      },
    };
    (pose[p.state] || pose.run)();

    // stumble overlays whatever pose: flail + wobble
    if (p.stumbleT > 0 && p.state !== 'dead') {
      const k = p.stumbleT / PLAYER.stumbleFrames;
      this.rig.rotation.x += Math.sin(t * 30) * 0.16 * k;
      this.rig.rotation.z += Math.sin(t * 23) * 0.12 * k;
      this.armL.rotation.x = -1.4 + Math.sin(t * 27) * 0.7 * k;
      this.armR.rotation.x = -1.2 + Math.cos(t * 25) * 0.7 * k;
    }
    // i-frame flicker (also reads as "safe")
    this.rig.visible = !(p.iframesT > 0 && Math.floor(t * 24) % 2 === 0);

    this.rig.scale.set(1 / Math.sqrt(this._squash), this._squash, 1 / Math.sqrt(this._squash));

    // aura: dash trail / parry window shimmer
    const dashGlow = p.dashT > 0 ? 0.4 : 0;
    const parryGlow = p.parryT > 0 ? 0.3 : 0;
    this.aura.material.opacity += ((dashGlow + parryGlow) - this.aura.material.opacity) * 0.3;
    this.aura.material.color.setHex(p.dashT > 0 ? 0x9fe8ff : 0xffe9a8);

    // cape flutter
    const arr = this.capePos.array;
    for (let i = 0; i < arr.length; i += 3) {
      const yRow = this.capeBase[i + 1];
      const sway = (0.55 - yRow) * (0.12 + speed * 0.004);
      arr[i] = this.capeBase[i] + Math.sin(t * 9 + yRow * 6) * sway * 0.4;
      arr[i + 2] = this.capeBase[i + 2] - Math.abs(Math.sin(t * 7 + yRow * 5)) * sway - (p.state === 'air' ? 0.15 : 0.05);
    }
    this.capePos.needsUpdate = true;
    this.cape.rotation.x = 0.25 + (p.state === 'air' ? -p.vy * 0.03 : speed * 0.008);
  }
}

function limb(r, len, color) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 3, 6), std(color));
  m.position.y = -len / 2;
  g.add(m);
  return g;
}

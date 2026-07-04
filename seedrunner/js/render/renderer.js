// Renderer: owns the Three scene — deck, props, Pip, Tide, particles,
// camera, biome grading, and the comfort pass (capped shake, no snap cuts,
// reduced-motion mode). Draws interpolated sim state; never decides gameplay.

import * as THREE from 'three';
import { LANES, TIDE, SPEED } from '../config.js';
import { laneX } from '../sim/chunks.js';
import { worldPos } from './curve.js';
import { lookAt } from './biomes.js';
import { TrackMesh } from './trackmesh.js';
import { Props } from './props.js';
import { Pip } from './pip.js';
import { TideWall } from './tidewall.js';
import { Fx } from './fx.js';
import { lerp, clamp } from '../core/math.js';

export class Renderer {
  constructor(container, uiRoot) {
    this.three = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.three.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.three.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(this.three.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x8fc8e8);
    this.scene.fog = new THREE.Fog(0x9ecf8f, 30, 95);
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 400);

    this.hemi = new THREE.HemisphereLight(0xd8f0c0, 0x3c5a30, 1.05);
    this.sun = new THREE.DirectionalLight(0xfff3cf, 1.6);
    this.sun.position.set(5, 9, -4);
    this.scene.add(this.hemi, this.sun);

    this.track = new TrackMesh(this.scene);
    this.props = new Props(this.scene);
    this.pip = new Pip(this.scene);
    this.tide = new TideWall(this.scene);
    this.fx = new Fx(this.scene);

    // vignette + flash overlays (DOM: cheap, resolution independent)
    this.vignette = document.createElement('div');
    this.vignette.style.cssText = 'position:absolute;inset:0;pointer-events:none;opacity:0;transition:opacity .2s;' +
      'background:radial-gradient(ellipse at center, transparent 42%, rgba(30,8,34,0.85) 100%)';
    this.flash = document.createElement('div');
    this.flash.style.cssText = 'position:absolute;inset:0;pointer-events:none;opacity:0;background:#eaffe8';
    uiRoot.appendChild(this.vignette);
    uiRoot.appendChild(this.flash);

    this.shakeScale = 1;         // settings: 0 (off) .. 1
    this.reducedMotion = false;
    this._shakeT = 0; this._shakeAmp = 0;
    this._landKick = 0;
    this._fov = 62;
    this._look = { sky: new THREE.Color(0x8fc8e8), fog: new THREE.Color(0x9ecf8f), near: 30, far: 95, hemiI: 1.05, sunI: 1.6 };
    this._p = [0, 0, 0];
    this._camPos = new THREE.Vector3();
    this._biome = 'meadow';

    window.addEventListener('resize', () => {
      this.three.setSize(window.innerWidth, window.innerHeight);
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
    });
  }

  handleEvent(ev, world) {
    const p = world.player;
    const F = this.fx;
    switch (ev.t) {
      case 'dew': F.burst(p.d, p.x, p.y + 0.9, { n: 4, color: 0x9fe8ff, life: 26, spread: 1.4 }); break;
      case 'chain': F.burst(p.d, p.x, p.y + 1, { n: 16, color: 0x66e0ff, up: 3.5, life: 40 }); break;
      case 'parry':
        F.burst(ev.at, laneX(ev.lane), 1.3, { n: 26, color: 0xff8ab0, up: 4, spread: 5, life: 48, size: 1.6 });
        F.burst(ev.at, laneX(ev.lane), 1.3, { n: 14, color: 0xfff2c0, up: 3, spread: 3, life: 36 });
        this._flash(0.35);
        break;
      case 'barrierdash': F.burst(ev.at ?? p.d, p.x, 1.2, { n: 14, color: 0x9fe8ff, spread: 4, life: 30 }); break;
      case 'glint': F.burst(ev.at, laneX(ev.lane), 2.2, { n: 3, color: 0xffe9a8, life: 20, up: 1 }); break;
      case 'stumble':
        F.burst(p.d, p.x, 0.8, { n: 14, color: 0xc88a4a, spread: 3, life: 34 });
        this._shake(0.16, 14);
        break;
      case 'fall': F.burst(p.d, p.x, 0.4, { n: 18, color: 0x7a6a4a, spread: 3, life: 40 }); this._shake(0.2, 16); break;
      case 'land': if (ev.hard) { this._landKick = 8; F.burst(p.d, p.x, 0.1, { n: 6, color: 0xbbaa88, life: 20, up: 1, spread: 2 }); } break;
      case 'jump': F.burst(p.d, p.x, 0.1, { n: 4, color: 0xbbccaa, life: 16, up: 0.8 }); break;
      case 'dash': F.burst(p.d, p.x, 0.8, { n: 10, color: 0x9fe8ff, life: 24, spread: 2 }); break;
      case 'seed': F.burst(ev.at, p.x, 1.6, { n: 22, color: 0xffd76a, up: 3.5, life: 55, size: 1.4 }); break;
      case 'checkpoint': F.burst(ev.at, 0, 3.2, { n: 12, color: 0x8fe06a, spread: 5, life: 40 }); break;
      case 'win': F.burst(ev.at ?? p.d, 0, 2, { n: 60, color: 0xffd76a, up: 6, spread: 7, life: 90, size: 1.5, gravity: 3 }); this._flash(0.5); break;
      case 'dead':
        this._shake(0.3, 24);
        F.burst(p.d, p.x, 1, { n: 30, color: 0x501838, spread: 5, up: 3, life: 60 });
        break;
      case 'tidesurge': this._shake(0.14, 12); break;
      case 'speedtier': F.burst(p.d + 6, 0, 1.5, { n: 10, color: 0xffffff, life: 26, spread: 4 }); break;
      default: break;
    }
  }

  _shake(amp, frames) {
    if (this.reducedMotion) { amp *= 0.3; frames = Math.min(frames, 6); }
    this._shakeAmp = Math.min(0.3, Math.max(this._shakeAmp, amp * this.shakeScale));
    this._shakeT = Math.max(this._shakeT, frames);
  }

  _flash(op) {
    if (this.reducedMotion) op *= 0.4;
    this.flash.style.transition = 'none';
    this.flash.style.opacity = op;
    requestAnimationFrame(() => {
      this.flash.style.transition = 'opacity .35s';
      this.flash.style.opacity = 0;
    });
  }

  draw(world, alpha, dt, t) {
    const p = world.player;
    const d = lerp(p.prevD ?? p.d, p.d, alpha);
    const x = lerp(p.prevX ?? p.x, p.x, alpha);
    const y = lerp(p.prevY ?? p.y, p.y, alpha);

    // ---- biome grade (lerp toward the current biome look) ----
    const biome = world.track.biomeAt(d);
    const lk = lookAt(biome);
    const L = this._look;
    const k = Math.min(1, dt * 0.03);
    L.sky.lerp(new THREE.Color(lk.sky), k);
    L.fog.lerp(new THREE.Color(lk.fogColor), k);
    L.near = lerp(L.near, lk.fogNear, k);
    L.far = lerp(L.far, lk.fogFar, k);
    L.hemiI = lerp(L.hemiI, lk.hemiI, k);
    L.sunI = lerp(L.sunI, lk.sunI, k);
    this.scene.background = L.sky;
    this.scene.fog.color = L.fog;
    this.scene.fog.near = L.near;
    this.scene.fog.far = L.far;
    this.hemi.intensity = L.hemiI;
    this.hemi.color.setHex(lk.hemiSky);
    this.hemi.groundColor.setHex(lk.hemiGround);
    this.sun.intensity = L.sunI;
    this.sun.color.setHex(lk.sunColor);
    this._biome = biome;

    // ---- Pip placement ----
    const pw = worldPos(d, x, y, this._p);
    this.pip.root.position.set(pw[0], pw[1], pw[2]);
    const ahead = worldPos(d + 2, x, y, this._p);
    this.pip.root.lookAt(ahead[0], pw[1], ahead[2]);
    this.pip.update(p, world, t, dt);

    // ---- camera: behind the shoulder, speed-reactive FOV, comfort caps ----
    const speed = world.speedAt(p.d);
    const targetFov = 62 + clamp((speed - 9) / 13, 0, 1) * 9 + (p.dashT > 0 ? 5 : 0);
    this._fov = lerp(this._fov, targetFov, Math.min(1, dt * 0.08));
    this.camera.fov = this._fov;
    this.camera.updateProjectionMatrix();

    if (this._landKick > 0) this._landKick -= dt;
    const kick = this._landKick > 0 ? this._landKick / 8 * 0.22 : 0;

    const camD = d - 5.6;
    const cw = worldPos(camD, x * 0.45, 0, this._p);
    let cy = cw[1] + (p.sliding ? 1.95 : 2.55) + y * 0.32 - kick;
    let cx = cw[0], cz = cw[2];
    if (this._shakeT > 0) {
      this._shakeT -= dt;
      const a = this._shakeAmp * (this._shakeT > 0 ? this._shakeT / 24 : 0);
      cx += (Math.random() - 0.5) * a * 2;
      cy += (Math.random() - 0.5) * a * 2;
      if (this._shakeT <= 0) this._shakeAmp = 0;
    }
    // smooth (no snap cuts)
    if (!this._camInit) { this._camPos.set(cx, cy, cz); this._camInit = true; }
    this._camPos.lerp(new THREE.Vector3(cx, cy, cz), Math.min(1, dt * 0.55));
    this.camera.position.copy(this._camPos);
    const lw = worldPos(d + 9, x * 0.25, 1.45 + y * 0.25, this._p);
    this.camera.lookAt(lw[0], lw[1], lw[2]);
    // lane-change tilt
    const lateralV = p.x - (p.prevX ?? p.x);
    const targetRoll = this.reducedMotion ? 0 : -lateralV * 1.4;
    this._roll = lerp(this._roll ?? 0, targetRoll, Math.min(1, dt * 0.25));
    this.camera.rotation.z += this._roll;

    // ---- world pieces ----
    this.track.update(world, camD);
    this.props.update(world, camD, this.camera.quaternion, t);
    this.tide.update(world, t);
    this.fx.update(dt, this.camera.quaternion);

    // ---- tide pressure on the frame ----
    const danger = clamp(1 - (world.tide.gap - TIDE.catchGap) / TIDE.dangerGap, 0, 1);
    this.vignette.style.opacity = (danger * 0.75).toFixed(2);

    this.three.render(this.scene, this.camera);
  }

  get drawCalls() { return this.three.info.render.calls; }
  get triangles() { return this.three.info.render.triangles; }
}

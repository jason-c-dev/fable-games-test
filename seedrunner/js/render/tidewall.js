// The Rot Tide made visible: a crawling dark wall behind Pip with glowing
// eyes and tendrils, plus edge-creep vines that enter the frame as it nears.
// Its pressure is also fed to the vignette + camera by the renderer.

import * as THREE from 'three';
import { LANES, TIDE } from '../config.js';
import { worldPos, headingAt } from './curve.js';

export class TideWall {
  constructor(scene) {
    this.group = new THREE.Group();

    // scrolling rot texture on a tall wall
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 256;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#0c0612';
    ctx.fillRect(0, 0, 256, 256);
    let s = 7;
    const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 90; i++) {
      ctx.strokeStyle = `rgba(${90 + rnd() * 60}, ${20 + rnd() * 30}, ${80 + rnd() * 60}, ${0.25 + rnd() * 0.3})`;
      ctx.lineWidth = 1 + rnd() * 3;
      ctx.beginPath();
      let x = rnd() * 256, y = 256;
      ctx.moveTo(x, y);
      for (let k = 0; k < 6; k++) { x += (rnd() - 0.5) * 60; y -= 20 + rnd() * 40; ctx.lineTo(x, y); }
      ctx.stroke();
    }
    this.tex = new THREE.CanvasTexture(cv);
    this.tex.wrapS = this.tex.wrapT = THREE.RepeatWrapping;
    this.tex.repeat.set(3, 2);

    this.wall = new THREE.Mesh(
      new THREE.PlaneGeometry(LANES.width * 3 + 14, 14),
      new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, opacity: 0.96 }),
    );
    this.wall.position.y = 5.5;
    this.group.add(this.wall);

    // eyes
    this.eyes = [];
    for (let i = 0; i < 7; i++) {
      const e = new THREE.Mesh(
        new THREE.SphereGeometry(0.16, 6, 6),
        new THREE.MeshBasicMaterial({ color: 0xff5a8a }),
      );
      e.position.set((i - 3) * 1.7 + Math.sin(i * 7) * 0.8, 2 + Math.sin(i * 3) * 1.4, 0.2);
      this.eyes.push(e);
      this.group.add(e);
    }

    // tendrils reaching forward
    this.tendrils = [];
    for (let i = 0; i < 9; i++) {
      const tm = new THREE.Mesh(
        new THREE.ConeGeometry(0.35, 3.2, 5),
        new THREE.MeshStandardMaterial({ color: 0x1e0f24, emissive: 0x501838, emissiveIntensity: 0.5, flatShading: true }),
      );
      tm.rotation.x = Math.PI / 2.3;
      tm.position.set((i - 4) * 1.4 + Math.sin(i * 5) * 0.7, 0.4 + (i % 3) * 0.4, 1.6);
      this.tendrils.push(tm);
      this.group.add(tm);
    }

    scene.add(this.group);
    this._p = [0, 0, 0];
  }

  update(world, t) {
    const tideD = world.tide.d;
    const p = worldPos(tideD, 0, 0, this._p);
    this.group.position.set(p[0], p[1], p[2]);
    this.group.rotation.y = -headingAt(tideD);
    this.tex.offset.y = -t * 0.22;
    this.tex.offset.x = Math.sin(t * 0.7) * 0.05;

    const danger = Math.max(0, 1 - world.tide.gap / TIDE.dangerGap);
    for (const [i, e] of this.eyes.entries()) {
      e.material.color.setHSL(0.93, 0.8, 0.45 + danger * 0.25 + Math.sin(t * 5 + i) * 0.08);
      e.scale.setScalar(1 + Math.sin(t * 4 + i * 2) * 0.2 + danger * 0.5);
    }
    for (const [i, tm] of this.tendrils.entries()) {
      tm.position.z = 1.6 + Math.sin(t * 2.4 + i * 1.7) * 0.8 + danger * 1.4;
      tm.rotation.z = Math.sin(t * 1.8 + i) * 0.3;
    }
  }
}

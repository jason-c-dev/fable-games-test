// Boot: Three.js renderer, fixed-timestep 60 Hz sim loop decoupled from
// rendering with interpolation. The sim never touches Three; Three only draws.
// Wrapped in boot() from day one — top-level await breaks the IIFE standalone.

import * as THREE from 'three';
import { STEP } from './config.js';

function boot() {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.getElementById('game').appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a2b18);
  scene.fog = new THREE.Fog(0x1a2b18, 20, 90);
  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 300);
  camera.position.set(0, 3, 7);
  camera.lookAt(0, 1, 0);

  const hemi = new THREE.HemisphereLight(0xcfe8bd, 0x2a3d22, 1.1);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2cc, 1.4);
  sun.position.set(4, 8, 3);
  scene.add(sun);

  // placeholder: a spinning Sun Seed over a ground slab
  const seed = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1, 0),
    new THREE.MeshStandardMaterial({ color: 0xffd76a, emissive: 0x7a5a10, flatShading: true }),
  );
  seed.position.y = 1.4;
  scene.add(seed);
  scene.add(new THREE.Mesh(
    new THREE.BoxGeometry(8, 0.4, 8),
    new THREE.MeshStandardMaterial({ color: 0x3f5d33, flatShading: true }),
  ));

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  });

  // fixed-timestep loop: sim steps at 60 Hz, draw interpolates
  let acc = 0, last = performance.now(), frame = 0, fpsAvg = 60;
  let prevRot = 0, rot = 0;
  function tick() {
    requestAnimationFrame(tick);
    const now = performance.now();
    const dtMs = Math.min(now - last, 100);
    last = now;
    acc += dtMs / 1000;
    let steps = 0;
    while (acc >= STEP && steps < 4) {
      prevRot = rot;
      rot += 0.02;
      frame++;
      acc -= STEP;
      steps++;
    }
    if (steps === 4) acc = 0;
    seed.rotation.y = prevRot + (rot - prevRot) * (acc / STEP);
    renderer.render(scene, camera);
    fpsAvg = fpsAvg * 0.95 + (1000 / Math.max(dtMs, 0.01)) * 0.05;
  }
  tick();

  // hooks for headless QA
  window.SR = { renderer, scene, camera, get frame() { return frame; }, get fps() { return fpsAvg; } };
}

try { boot(); } catch (err) {
  const el = document.getElementById('boot-error');
  if (el) { el.hidden = false; el.textContent = 'Boot failed: ' + (err && err.stack || err); }
  throw err;
}

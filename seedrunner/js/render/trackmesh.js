// The deck: a vertex-coloured ribbon rebuilt each frame in a ring around the
// player (rows every 2 m, ~90 rows — trivial upload). Gap lanes sink into a
// dark pit; lantern pools brighten nearby rows; lane dividers ride on top.

import * as THREE from 'three';
import { LANES } from '../config.js';
import { worldPos } from './curve.js';
import { lookAt } from './biomes.js';

const ROWS = 90;
const ROW_SPACING = 2;
const BACK = 24;                       // meters of deck behind the player
const HALF_W = LANES.width * 1.5 + 1.1;
// skirt columns extend the ground out to the fog so the world has a floor
const COLS = 10;
const COL_X = [-58, -HALF_W, -3.3, -1.1, 0, 1.1, 3.3, HALF_W * 0.999, HALF_W, 58];

export class TrackMesh {
  constructor(scene) {
    const verts = ROWS * COLS;
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(verts * 3);
    this.col = new Float32Array(verts * 3);
    const idx = [];
    for (let r = 0; r < ROWS - 1; r++) {
      for (let cI = 0; cI < COLS - 1; cI++) {
        const a = r * COLS + cI, b = a + 1, cc = a + COLS, dd = cc + 1;
        idx.push(a, b, cc, b, dd, cc);   // winding: normals up
      }
    }
    geo.setIndex(idx);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.95, metalness: 0, flatShading: false,
    }));
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);

    // lane divider veins: two thin emissive strips
    this.dividers = [];
    for (let i = 0; i < 2; i++) {
      const dGeo = new THREE.BufferGeometry();
      const dPos = new Float32Array(ROWS * 2 * 3);
      const dIdx = [];
      for (let r = 0; r < ROWS - 1; r++) {
        const a = r * 2, b = a + 1, cc = a + 2, dd = a + 3;
        dIdx.push(a, b, cc, b, dd, cc);
      }
      dGeo.setIndex(dIdx);
      dGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3));
      const mat = new THREE.MeshBasicMaterial({ color: 0x8fd06a, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(dGeo, mat);
      mesh.frustumCulled = false;
      scene.add(mesh);
      this.dividers.push({ mesh, pos: dPos, mat });
    }
    this._tmp = [0, 0, 0];
    this._ca = new THREE.Color(); this._cb = new THREE.Color(); this._ce = new THREE.Color(); this._cg = new THREE.Color();
  }

  update(world, camD) {
    const track = world.track;
    const startD = camD - BACK;
    const look = lookAt(track.biomeAt(world.player.d));
    const isCavern = track.biomeAt(world.player.d) === 'cavern';

    for (let r = 0; r < ROWS; r++) {
      const d = startD + r * ROW_SPACING;
      const biome = track.biomeAt(Math.max(d, 0));
      const lk = lookAt(biome);
      const checker = (Math.floor(d / 4) % 2 === 0);
      this._ca.setHex(lk.deck[checker ? 0 : 1]);
      this._ce.setHex(lk.deckEdge);
      // lantern pools visibly brighten the deck
      let glow = 0;
      if (biome === 'cavern' && track.litAt(Math.max(d, 0))) glow = 0.5;

      const drop = lk.groundDrop ?? -0.35;
      this._cg.setHex(lk.ground);
      for (let cI = 0; cI < COLS; cI++) {
        const x = COL_X[cI];
        let h = 0;
        let color = this._ca;
        if (cI === 0 || cI === COLS - 1) { h = drop; color = this._cg; }       // skirt
        else if (cI === 1 || cI === COLS - 2) color = this._ce;                // deck edge
        else {
          // gap pits: sink the lane's columns
          const lane = x < -1.1 ? -1 : x > 1.1 ? 1 : 0;
          const gap = d >= 0 ? track.gapAt(d, lane) : null;
          if (gap && Math.abs(x - lane * LANES.width) < 1.35) { h = -4.2; color = this._ce; }
        }
        const p = worldPos(Math.max(d, 0), x, h, this._tmp);
        const i = (r * COLS + cI) * 3;
        this.pos[i] = p[0]; this.pos[i + 1] = p[1]; this.pos[i + 2] = p[2];
        this.col[i] = Math.min(1, color.r + glow);
        this.col[i + 1] = Math.min(1, color.g + glow);
        this.col[i + 2] = Math.min(1, color.b + glow * 0.7);
      }
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.geometry.attributes.color.needsUpdate = true;
    this.mesh.geometry.computeVertexNormals();

    // dividers at lane boundaries
    this.dividers.forEach((dv, i) => {
      const x = i === 0 ? -LANES.width / 2 : LANES.width / 2;
      for (let r = 0; r < ROWS; r++) {
        const d = Math.max(startD + r * ROW_SPACING, 0);
        for (const [j, off] of [[0, -0.09], [1, 0.09]]) {
          const p = worldPos(d, x + off, 0.02, this._tmp);
          const k = (r * 2 + j) * 3;
          dv.pos[k] = p[0]; dv.pos[k + 1] = p[1]; dv.pos[k + 2] = p[2];
        }
      }
      dv.mesh.geometry.attributes.position.needsUpdate = true;
      dv.mat.color.setHex(look.divider);
      dv.mat.opacity = isCavern ? 0.9 : 0.5;
    });
  }
}

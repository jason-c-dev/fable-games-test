// Procedural pixel-art sprite generation. Everything is drawn to offscreen
// canvases at load time; no external assets.

const Sprites = {};

(function () {
  // ---------- helpers ----------
  function mk(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }
  function g2d(c) {
    const x = c.getContext('2d', { willReadFrequently: true });
    x.imageSmoothingEnabled = false;
    return x;
  }
  // Seeded LCG so generated decoration is deterministic.
  let _seed = 0x5eedb0b;
  function rnd() {
    _seed = (_seed * 1664525 + 1013904223) >>> 0;
    return _seed / 4294967296;
  }
  function reseed(n) { _seed = n >>> 0; }

  const OUTLINE = '#2d1c12';

  // Rasterized primitives
  function disc(x, cx, cy, r, color) {
    x.fillStyle = color;
    for (let y = -r; y <= r; y++) {
      const w = Math.floor(Math.sqrt(r * r - y * y) + 0.5);
      x.fillRect(cx - w, cy + y, w * 2 + 1, 1);
    }
  }
  function halfDiscTop(x, cx, cy, r, color) {
    x.fillStyle = color;
    for (let y = -r; y <= 0; y++) {
      const w = Math.floor(Math.sqrt(r * r - y * y) + 0.5);
      x.fillRect(cx - w, cy + y, w * 2 + 1, 1);
    }
  }
  function ellipse(x, cx, cy, rx, ry, color) {
    x.fillStyle = color;
    for (let y = -ry; y <= ry; y++) {
      const w = Math.floor(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry))) + 0.5);
      x.fillRect(cx - w, cy + y, w * 2 + 1, 1);
    }
  }
  function rect(x, a, b, w, h, color) { x.fillStyle = color; x.fillRect(a, b, w, h); }
  function tri(x, x0, y0, w, h, color, dir) {
    // dir 'up': apex on top; 'down': apex on bottom
    x.fillStyle = color;
    for (let r = 0; r < h; r++) {
      const t = dir === 'up' ? r / (h - 1 || 1) : 1 - r / (h - 1 || 1);
      const ww = Math.max(1, Math.round(w * t));
      x.fillRect(x0 + Math.floor((w - ww) / 2), y0 + r, ww, 1);
    }
  }

  // 1px outline pass around all opaque pixels (canvas must have 1px margin).
  function outline(c, color = OUTLINE) {
    const x = g2d(c);
    const w = c.width, h = c.height;
    const img = x.getImageData(0, 0, w, h);
    const d = img.data;
    const solid = (i) => d[i * 4 + 3] > 40;
    const edges = [];
    for (let y = 0; y < h; y++) for (let px = 0; px < w; px++) {
      const i = y * w + px;
      if (solid(i)) continue;
      if ((px > 0 && solid(i - 1)) || (px < w - 1 && solid(i + 1)) ||
          (y > 0 && solid(i - w)) || (y < h - 1 && solid(i + w))) edges.push(i);
    }
    x.fillStyle = color;
    for (const i of edges) x.fillRect(i % w, (i / w) | 0, 1, 1);
    return c;
  }

  function squashX(c, factor) {
    const out = mk(c.width, c.height);
    const x = g2d(out);
    const w = Math.max(2, Math.round(c.width * factor));
    x.drawImage(c, Math.floor((c.width - w) / 2), 0, w, c.height);
    return out;
  }
  function flipX(c) {
    const out = mk(c.width, c.height);
    const x = g2d(out);
    x.translate(c.width, 0); x.scale(-1, 1);
    x.drawImage(c, 0, 0);
    return out;
  }

  // ---------- palettes ----------
  const PAL = {
    capRed: '#e0402f', capDark: '#a32b1e',
    capPink: '#f2f2ee', capPinkDark: '#c9793f', // blossom variant: white w/ orange
    capTan: '#d8a558', capTanDark: '#a3773a',   // glider variant: maple tan
    leaf: '#4fae3d', leafDark: '#35802a',
    face: '#ffcf9b', faceShade: '#e59e66',
    tunic: '#4a9e3f', tunicDark: '#2e6e2a', shirt: '#f5e6c8',
    boots: '#8a5524',
    white: '#ffffff', black: '#2d1c12',
    coin: '#ffd23e', coinHi: '#fff3a8', coinDark: '#c98f1b',
  };

  // World tile palettes: [Meadow, Cavern, Cloudline, Bramble Keep]
  const WORLD_PAL = [
    { skyTop: '#7fcdf5', skyBot: '#d8f4ff', lip: '#63c94f', lipHi: '#9ee55c',
      fill: '#a06a3a', fillDark: '#835426', speck: '#8f5c30',
      stone: '#c8b088', stoneHi: '#e8d4ac', stoneLo: '#a08858',
      brick: '#d88d4a', brickLo: '#b0682f',
      plat: '#c98f4f', platHi: '#eec27f',
      accent: '#ff8fb2' },
    { skyTop: '#10121f', skyBot: '#1c2135', lip: '#4fb09e', lipHi: '#7fd8c4',
      fill: '#57637a', fillDark: '#454f63', speck: '#6b7890',
      stone: '#7c88a0', stoneHi: '#a8b4c8', stoneLo: '#5c6880',
      brick: '#8a7898', brickLo: '#6a5a78',
      plat: '#8a94ac', platHi: '#b8c2d8',
      accent: '#66e0ff' },
    { skyTop: '#6faef0', skyBot: '#cfe8ff', lip: '#ffffff', lipHi: '#ffffff',
      fill: '#e8ecfa', fillDark: '#c8d0ec', speck: '#d8defa',
      stone: '#f2d88f', stoneHi: '#fff0c0', stoneLo: '#d0ac60',
      brick: '#f2b25f', brickLo: '#d08c3a',
      plat: '#f8f8ff', platHi: '#ffffff',
      accent: '#ffd23e' },
    { skyTop: '#2a1a35', skyBot: '#5a2c3a', lip: '#7a9440', lipHi: '#a5c05a',
      fill: '#6a4a3a', fillDark: '#54382c', speck: '#7d5844',
      stone: '#8a8090', stoneHi: '#aca4b4', stoneLo: '#686070',
      brick: '#9a5a48', brickLo: '#784234',
      plat: '#8a6a50', platHi: '#b09070',
      accent: '#ff5f45' },
  ];
  Sprites.worldPal = WORLD_PAL;

  // ---------- Pip ----------
  // Build a full pose sheet for one power look.
  // size: 16x18 (small, hitbox 12x14) or 16x26 (big, hitbox 12x24). 1px margin all around.
  function pipSheet(big, capA, capB, gliderWings) {
    const W = 20, H = big ? 30 : 22;
    const sheet = {};

    function base(pose) {
      const c = mk(W, H);
      const x = g2d(c);
      const cx = 10;
      // vertical layout: feet at H-2 (leaving 1px margin + outline space)
      const footY = H - 3;
      const bodyH = big ? 9 : 4;
      const bodyTop = footY - bodyH + 1;
      const headCy = bodyTop - 5; // head disc center
      const crouch = pose === 'crouch';
      const hc = crouch ? headCy + (big ? 7 : 2) : headCy;

      // legs / feet
      const legPh = pose === 'walk2' ? 1 : 0;
      if (!crouch) {
        if (pose === 'jump') {
          rect(x, cx - 4, footY - 1, 3, 2, PAL.boots);
          rect(x, cx + 2, footY - 1, 3, 2, PAL.boots);
        } else if (pose === 'fall') {
          rect(x, cx - 5, footY, 3, 2, PAL.boots);
          rect(x, cx + 3, footY, 3, 2, PAL.boots);
        } else if (pose === 'walk1' || pose === 'walk2') {
          rect(x, cx - 4 + (legPh ? 2 : 0), footY, 3, 2, PAL.boots);
          rect(x, cx + 2 - (legPh ? 2 : 0), footY, 3, 2, PAL.boots);
        } else {
          rect(x, cx - 4, footY, 3, 2, PAL.boots);
          rect(x, cx + 2, footY, 3, 2, PAL.boots);
        }
      } else {
        rect(x, cx - 4, footY, 3, 2, PAL.boots);
        rect(x, cx + 2, footY, 3, 2, PAL.boots);
      }

      // body
      if (!crouch) {
        ellipse(x, cx, bodyTop + Math.floor(bodyH / 2), 5, Math.ceil(bodyH / 2), PAL.tunic);
        if (big) {
          rect(x, cx - 5, bodyTop + 1, 10, 2, PAL.shirt);       // shirt band
          rect(x, cx - 3, bodyTop, 2, bodyH - 2, PAL.tunicDark); // strap
          rect(x, cx + 1, bodyTop, 2, bodyH - 2, PAL.tunicDark);
        }
        // arms
        if (pose === 'jump' || pose === 'glide') {
          rect(x, cx - 8, bodyTop - 1, 2, 2, PAL.face);
          rect(x, cx + 6, bodyTop - 1, 2, 2, PAL.face);
        } else if (pose === 'carry1' || pose === 'carry2') {
          rect(x, cx + 5, bodyTop, 3, 2, PAL.face);
          rect(x, cx - 8, bodyTop, 3, 2, PAL.face);
        } else if (pose !== 'back') {
          rect(x, cx - 7, bodyTop + 1, 2, 2, PAL.face);
          rect(x, cx + 5, bodyTop + 1, 2, 2, PAL.face);
        }
      }

      // head
      disc(x, cx, hc, 5, PAL.face);
      // cap (top of head)
      halfDiscTop(x, cx, hc - 1, 6, capA);
      rect(x, cx - 6, hc - 1, 13, 1, capA);
      // scalloped cap brim
      for (let i = -6; i <= 6; i += 2) rect(x, cx + i, hc, 1, 1, capB);
      // glider wings: maple-seed blades on the cap
      if (gliderWings && pose !== 'back') {
        ellipse(x, cx - 8, hc - 3, 3, 1, PAL.capTan);
        ellipse(x, cx + 8, hc - 3, 3, 1, PAL.capTan);
        rect(x, cx - 8, hc - 3, 2, 1, PAL.capTanDark);
        rect(x, cx + 7, hc - 3, 2, 1, PAL.capTanDark);
      }
      // leaf sprig
      rect(x, cx, hc - 7, 1, 2, PAL.leafDark);
      rect(x, cx + 1, hc - 8, 2, 2, PAL.leaf);
      // face
      if (pose === 'back') {
        // back of head: cap color fills face area
        disc(x, cx, hc + 1, 5, capA);
        rect(x, cx - 5, hc + 3, 11, 2, PAL.face);
      } else {
        // eyes (facing right)
        const ey = hc + (pose === 'skid' ? 2 : 1);
        rect(x, cx + 1, ey, 2, 2, PAL.white); rect(x, cx + 2, ey, 1, 2, PAL.black);
        rect(x, cx + 4, ey, 2, 2, PAL.white); rect(x, cx + 5, ey, 1, 2, PAL.black);
        if (pose === 'skid') rect(x, cx + 2, hc + 5, 3, 1, PAL.black); // grimace
        // cheek
        rect(x, cx - 3, hc + 3, 2, 1, PAL.faceShade);
      }
      return c;
    }

    const poses = ['idle', 'walk1', 'walk2', 'jump', 'fall', 'skid', 'crouch',
                   'carry1', 'carry2', 'glide', 'back'];
    const raw = {};
    for (const p of poses) raw[p] = base(p);

    sheet.idle = outline(raw.idle);
    sheet.walk = [outline(raw.walk1), outline(raw.walk2)];
    sheet.jump = outline(raw.jump);
    sheet.fall = outline(raw.fall);
    sheet.skid = outline(raw.skid);
    sheet.crouch = outline(raw.crouch);
    sheet.carry = [outline(raw.carry1), outline(raw.carry2)];
    sheet.glide = outline(raw.glide);
    // spin: front, squashed front, back, squashed back
    sheet.spin = [
      sheet.idle,
      outline(squashX(base('idle'), 0.5)),
      outline(raw.back),
      outline(squashX(base('back'), 0.5)),
    ];
    sheet.w = W; sheet.h = H;
    return sheet;
  }

  // ---------- enemies ----------
  function bumbleSprites() {
    function frame(squish) {
      const c = mk(20, 16); const x = g2d(c);
      const ry = squish ? 4 : 5, cy = 12 - ry + 3;
      ellipse(x, 10, 15 - ry, 7, ry, '#e8b84a');
      // stripes
      rect(x, 5, 15 - ry * 2 + 2, 2, ry * 2 - 2, '#b07a2a');
      rect(x, 10, 15 - ry * 2 + 2, 2, ry * 2 - 2, '#b07a2a');
      // face (right)
      rect(x, 14, 12 - (squish ? 0 : 1), 2, 2, PAL.white);
      rect(x, 15, 12 - (squish ? 0 : 1), 1, 2, PAL.black);
      // feet nubs
      rect(x, 5, 14, 2, 2, '#8a5c1e'); rect(x, 12, 14, 2, 2, '#8a5c1e');
      return outline(c);
    }
    return { walk: [frame(false), frame(true)] };
  }

  function snapcapSprites() {
    const SHELL = '#e06a2c', SHELL_D = '#b04a18', SPOT = '#f8e0b0';
    function shellDome(x, cx, cy, r) {
      halfDiscTop(x, cx, cy, r, SHELL);
      rect(x, cx - r, cy, r * 2 + 1, 2, SHELL_D);
      rect(x, cx - 3, cy - r + 2, 2, 2, SPOT);
      rect(x, cx + 2, cy - 3, 2, 2, SPOT);
    }
    function walker(ph) {
      const c = mk(20, 18); const x = g2d(c);
      // body/head peeking right
      ellipse(x, 13, 12, 4, 3, '#f2d8a8');
      rect(x, 15, 10, 2, 2, PAL.white); rect(x, 16, 10, 1, 2, PAL.black);
      shellDome(x, 9, 13, 7);
      rect(x, 5 + (ph ? 2 : 0), 15, 3, 2, '#c09060');
      rect(x, 11 - (ph ? 2 : 0), 15, 3, 2, '#c09060');
      return outline(c);
    }
    function shellOnly() {
      const c = mk(18, 14); const x = g2d(c);
      shellDome(x, 8, 10, 7);
      rect(x, 1, 10, 15, 2, SHELL_D);
      return outline(c);
    }
    function shellSpin() {
      const c = mk(18, 14); const x = g2d(c);
      shellDome(x, 8, 10, 7);
      rect(x, 1, 10, 15, 2, SHELL_D);
      rect(x, 3, 5, 3, 1, PAL.white); rect(x, 10, 8, 3, 1, PAL.white);
      return outline(c);
    }
    return { walk: [walker(0), walker(1)], shell: outline(shellOnly()), shellSpin: shellSpin() };
  }

  function spikeletSprites() {
    function frame(rot) {
      const c = mk(18, 18); const x = g2d(c);
      // spikes
      for (let a = 0; a < 8; a++) {
        const ang = (a / 8) * Math.PI * 2 + (rot ? Math.PI / 8 : 0);
        const sx = 9 + Math.round(Math.cos(ang) * 7), sy = 9 + Math.round(Math.sin(ang) * 7);
        rect(x, sx - 1, sy - 1, 2, 2, '#f2e6c8');
      }
      disc(x, 9, 9, 5, '#d84a5f');
      disc(x, 9, 9, 3, '#b03248');
      rect(x, 10, 7, 2, 2, PAL.white); rect(x, 11, 7, 1, 2, PAL.black);
      rect(x, 8, 7, 1, 1, PAL.black); // angry brow
      return outline(c);
    }
    return { walk: [frame(0), frame(1)] };
  }

  function puffhawkSprites() {
    function frame(wingUp, dive) {
      const c = mk(24, 20); const x = g2d(c);
      ellipse(x, 12, 12, 6, 5, '#7ec4e8');
      ellipse(x, 13, 14, 4, 2, '#f0f8ff'); // belly
      // head/beak right
      disc(x, 17, 9, 3, '#7ec4e8');
      tri(x, 20, 8, 3, 3, '#f2a03a', 'up');
      rect(x, 17, 8, 2, 2, PAL.white); rect(x, 18, 8, 1, 2, PAL.black);
      // wings
      if (dive) {
        ellipse(x, 8, 9, 5, 2, '#5a9cc8');
      } else if (wingUp) {
        ellipse(x, 9, 5, 5, 3, '#5a9cc8');
      } else {
        ellipse(x, 9, 15, 5, 3, '#5a9cc8');
      }
      // tail
      rect(x, 4, 11, 3, 2, '#5a9cc8');
      return outline(c);
    }
    return { fly: [frame(true, false), frame(false, false)], dive: frame(false, true) };
  }

  function lobberSprites() {
    function frame(windup) {
      const c = mk(20, 24); const x = g2d(c);
      // pot
      rect(x, 4, 16, 12, 6, '#b06a32');
      rect(x, 3, 16, 14, 2, '#8a4e20');
      // stem + head
      rect(x, 9, 10, 2, 6, '#3f8a34');
      disc(x, 10, 8, 5, '#5faf4a');
      // open mouth
      ellipse(x, 12, 9, 3, 2, '#2a5a22');
      // eyes
      rect(x, 8, 5, 2, 2, PAL.white); rect(x, 9, 5, 1, 2, PAL.black);
      // lobbing arm-leaf
      if (windup) { ellipse(x, 3, 6, 3, 2, '#3f8a34'); }
      else { ellipse(x, 4, 12, 3, 2, '#3f8a34'); }
      return outline(c);
    }
    return { idle: [frame(false), frame(true)] };
  }

  function thornBallSprite() {
    const c = mk(12, 12); const x = g2d(c);
    for (let a = 0; a < 6; a++) {
      const ang = a / 6 * Math.PI * 2;
      rect(x, 5 + Math.round(Math.cos(ang) * 4), 5 + Math.round(Math.sin(ang) * 4), 2, 2, '#5a3a6a');
    }
    disc(x, 5, 5, 3, '#7a4a86');
    return outline(c);
  }

  function wispSprites() {
    function frame(shy) {
      const c = mk(20, 22); const x = g2d(c);
      x.globalAlpha = 0.92;
      disc(x, 10, 9, 7, '#cfe8ff');
      // wavy tail
      tri(x, 6, 15, 9, 5, '#cfe8ff', 'down');
      x.globalAlpha = 1;
      if (shy) {
        // covering face (turned away): just a highlight
        rect(x, 6, 7, 3, 3, '#eaf6ff');
      } else {
        rect(x, 10, 7, 2, 3, PAL.black); rect(x, 14, 7, 2, 3, PAL.black);
        ellipse(x, 12, 13, 2, 1, '#8fb4d8');
      }
      return outline(c, '#7898b8');
    }
    return { chase: frame(false), shy: frame(true) };
  }

  function podSprites() {
    const c = mk(20, 20); const x = g2d(c);
    // wooden bulb cannon
    disc(x, 10, 12, 7, '#7a5230');
    disc(x, 10, 12, 5, '#94682f');
    rect(x, 8, 2, 4, 6, '#5c3c20'); // muzzle up
    rect(x, 7, 2, 6, 2, '#5c3c20');
    const idle = outline(c);
    const b = mk(12, 12); const bx = g2d(b);
    for (let a = 0; a < 8; a++) {
      const ang = a / 8 * Math.PI * 2;
      rect(bx, 5 + Math.round(Math.cos(ang) * 4), 5 + Math.round(Math.sin(ang) * 4), 1, 1, '#6a4a24');
    }
    disc(bx, 5, 5, 3, '#8a6a3a');
    rect(bx, 5, 3, 2, 2, '#c8402e'); // angry glow eye
    const burr = outline(b);
    return { idle, burr, burr2: flipX(burr) };
  }

  function mossSprites() {
    function frame(ph, mouthOpen) {
      const c = mk(26, 20); const x = g2d(c);
      // shell dome
      halfDiscTop(x, 11, 13, 8, '#6fd44f');
      rect(x, 3, 13, 17, 2, '#4aa832');
      rect(x, 7, 7, 2, 2, '#4aa832'); rect(x, 12, 9, 2, 2, '#4aa832');
      // saddle
      rect(x, 7, 5, 8, 3, '#d84a3a'); rect(x, 8, 4, 6, 2, '#d84a3a');
      // head right
      disc(x, 19, 10, 4, '#8ae06a');
      rect(x, 19, 8, 2, 3, PAL.white); rect(x, 20, 8, 1, 3, PAL.black);
      if (mouthOpen) ellipse(x, 22, 12, 2, 2, '#a03028');
      // legs
      rect(x, 5 + (ph ? 2 : 0), 15, 3, 3, '#4aa832');
      rect(x, 13 - (ph ? 2 : 0), 15, 3, 3, '#4aa832');
      rect(x, 18, 15, 3, 3, '#4aa832');
      return outline(c);
    }
    return { walk: [frame(0, false), frame(1, false)], eat: frame(0, true) };
  }

  // ---------- bosses ----------
  function snapjawSprites() {
    const SHELL = '#c8542a', SHELL_D = '#94381a', SPOT = '#f8e0b0';
    function walker(ph, angry) {
      const c = mk(52, 44); const x = g2d(c);
      halfDiscTop(x, 24, 34, 20, SHELL);
      rect(x, 4, 34, 41, 4, SHELL_D);
      rect(x, 12, 20, 4, 4, SPOT); rect(x, 26, 16, 4, 4, SPOT); rect(x, 34, 26, 4, 4, SPOT);
      // head
      ellipse(x, 40, 30, 8, 6, '#f2d8a8');
      rect(x, 43, 26, 3, 4, PAL.white); rect(x, 45, 26, 2, 4, PAL.black);
      rect(x, 41, 24, 5, 2, angry ? '#a02818' : SHELL_D); // brow
      rect(x, 43, 33, 5, 2, '#a02818'); // jaw
      // feet
      rect(x, 10 + (ph ? 3 : 0), 38, 6, 4, '#c09060');
      rect(x, 26 - (ph ? 3 : 0), 38, 6, 4, '#c09060');
      return outline(c);
    }
    function shell() {
      const c = mk(52, 34); const x = g2d(c);
      halfDiscTop(x, 24, 28, 20, SHELL);
      rect(x, 4, 28, 41, 4, SHELL_D);
      rect(x, 8, 14, 4, 3, PAL.white); rect(x, 30, 20, 5, 3, PAL.white);
      return outline(c);
    }
    function stunned() {
      const c = mk(52, 44); const x = g2d(c);
      halfDiscTop(x, 24, 36, 20, SHELL);
      rect(x, 4, 36, 41, 4, SHELL_D);
      ellipse(x, 40, 33, 8, 6, '#f2d8a8');
      rect(x, 42, 29, 2, 2, PAL.black); rect(x, 46, 29, 2, 2, PAL.black); // X eyes
      rect(x, 43, 30, 2, 1, PAL.black);
      return outline(c);
    }
    return { walk: [walker(0, true), walker(1, true)], shell: shell(), stun: stunned() };
  }

  function grubmawSprites() {
    function up(mouthOpen) {
      const c = mk(44, 52); const x = g2d(c);
      // stacked segments
      ellipse(x, 22, 44, 16, 7, '#c8a04a');
      ellipse(x, 22, 32, 14, 7, '#e0b858');
      ellipse(x, 22, 19, 13, 8, '#e8c468');
      // mouth
      if (mouthOpen) {
        ellipse(x, 22, 22, 9, 6, '#5c2a1a');
        for (let i = 0; i < 4; i++) tri(x, 15 + i * 5, 17, 3, 3, '#f8f0d8', 'down');
      } else {
        rect(x, 16, 24, 12, 2, '#8a6428');
      }
      // eyes
      rect(x, 14, 12, 4, 4, PAL.white); rect(x, 16, 13, 2, 3, PAL.black);
      rect(x, 26, 12, 4, 4, PAL.white); rect(x, 28, 13, 2, 3, PAL.black);
      // little arms
      rect(x, 4, 30, 4, 3, '#c8a04a'); rect(x, 36, 30, 4, 3, '#c8a04a');
      return outline(c);
    }
    function stun() {
      const c = mk(44, 40); const x = g2d(c);
      ellipse(x, 22, 32, 16, 7, '#c8a04a');
      ellipse(x, 22, 20, 14, 8, '#e0b858');
      rect(x, 14, 14, 3, 3, PAL.black); rect(x, 27, 14, 3, 3, PAL.black);
      rect(x, 17, 24, 10, 2, '#8a6428');
      return outline(c);
    }
    return { up: [up(false), up(true)], stun: stun() };
  }

  function galeTalonSprites() {
    function fly(wingUp) {
      const c = mk(60, 36); const x = g2d(c);
      ellipse(x, 30, 20, 13, 8, '#5a7a9e');
      ellipse(x, 32, 24, 8, 4, '#e8eef8'); // chest
      disc(x, 44, 14, 6, '#5a7a9e');
      tri(x, 50, 12, 6, 5, '#f2a03a', 'up');
      rect(x, 44, 12, 3, 3, PAL.white); rect(x, 46, 12, 2, 3, PAL.black);
      rect(x, 42, 9, 6, 2, '#2d3c50'); // brow
      if (wingUp) { ellipse(x, 18, 8, 12, 5, '#3d5a7e'); }
      else { ellipse(x, 18, 28, 12, 5, '#3d5a7e'); }
      // talons
      rect(x, 26, 28, 3, 4, '#f2a03a'); rect(x, 34, 28, 3, 4, '#f2a03a');
      return outline(c);
    }
    function stall() {
      const c = mk(60, 36); const x = g2d(c);
      ellipse(x, 30, 24, 13, 8, '#5a7a9e');
      ellipse(x, 32, 28, 8, 4, '#e8eef8');
      disc(x, 44, 18, 6, '#5a7a9e');
      tri(x, 50, 16, 6, 5, '#f2a03a', 'up');
      rect(x, 44, 17, 2, 2, PAL.black); rect(x, 48, 17, 2, 2, PAL.black); // dizzy
      ellipse(x, 16, 22, 10, 4, '#3d5a7e');
      return outline(c);
    }
    return { fly: [fly(true), fly(false)], stall: stall() };
  }

  function brambleSprites() {
    const SHELL = '#3d5a2e', SHELL_D = '#2a4020', SPIKE = '#c8b490';
    function walker(ph, armUp) {
      const c = mk(60, 52); const x = g2d(c);
      // spiked shell
      halfDiscTop(x, 26, 40, 22, SHELL);
      rect(x, 4, 40, 45, 4, SHELL_D);
      for (let i = 0; i < 5; i++) tri(x, 8 + i * 8, 12 + Math.abs(i - 2) * 4, 5, 7, SPIKE, 'up');
      // head w/ thorn helm
      ellipse(x, 46, 30, 9, 8, '#8a9a58');
      halfDiscTop(x, 46, 26, 9, '#5c4630');
      tri(x, 44, 14, 4, 5, SPIKE, 'up');
      rect(x, 48, 28, 3, 3, '#ffd23e'); rect(x, 50, 28, 2, 3, PAL.black); // eye
      rect(x, 45, 25, 7, 2, '#3a2c1c'); // scowl brow
      rect(x, 48, 35, 6, 2, '#5c2a1a'); // frown
      // arm
      if (armUp) { rect(x, 32, 12, 5, 10, '#8a9a58'); disc(x, 34, 10, 3, '#8a9a58'); }
      else { rect(x, 34, 34, 5, 8, '#8a9a58'); }
      // feet
      rect(x, 12 + (ph ? 4 : 0), 44, 8, 5, '#6a7a44');
      rect(x, 30 - (ph ? 4 : 0), 44, 8, 5, '#6a7a44');
      return outline(c);
    }
    function withdrawn() {
      const c = mk(60, 40); const x = g2d(c);
      halfDiscTop(x, 28, 34, 24, SHELL);
      rect(x, 4, 34, 49, 4, SHELL_D);
      for (let i = 0; i < 5; i++) tri(x, 10 + i * 8, 6 + Math.abs(i - 2) * 4, 5, 7, SPIKE, 'up');
      return outline(c);
    }
    function stun() {
      const c = walker(0, false);
      const x = g2d(c);
      rect(x, 48, 27, 4, 4, '#ffffff'); rect(x, 49, 28, 2, 2, PAL.black);
      return c;
    }
    return { walk: [walker(0, false), walker(1, false)], throw: walker(0, true),
             shell: withdrawn(), stun: stun() };
  }

  // ---------- items ----------
  function coinFrames() {
    const frames = [];
    for (const w of [5, 3, 1, 3]) {
      const c = mk(14, 16); const x = g2d(c);
      ellipse(x, 6, 8, w, 6, PAL.coin);
      if (w > 2) {
        ellipse(x, 6, 8, w - 2, 4, PAL.coinDark);
        rect(x, 6 - (w > 3 ? 1 : 0), 5, 1, 6, PAL.coinHi);
      }
      frames.push(outline(c, '#8a5e14'));
    }
    return frames;
  }

  function sunFruitSprite() {
    const c = mk(18, 18); const x = g2d(c);
    disc(x, 8, 10, 6, '#ffa53a');
    disc(x, 6, 8, 2, '#ffd28a');
    rect(x, 8, 2, 1, 3, '#6a4a24');
    ellipse(x, 11, 3, 3, 1, PAL.leaf);
    return outline(c);
  }

  function fireBlossomSprite() {
    const c = mk(18, 18); const x = g2d(c);
    for (let a = 0; a < 6; a++) {
      const ang = a / 6 * Math.PI * 2 + 0.5;
      disc(x, 8 + Math.round(Math.cos(ang) * 5), 8 + Math.round(Math.sin(ang) * 5), 2, '#ff6a3a');
    }
    disc(x, 8, 8, 3, '#ffd23e');
    rect(x, 8, 14, 1, 3, PAL.leafDark);
    return outline(c);
  }

  function gliderCapSprite() {
    const c = mk(20, 14); const x = g2d(c);
    halfDiscTop(x, 9, 9, 6, PAL.capTan);
    rect(x, 3, 9, 13, 2, PAL.capTanDark);
    ellipse(x, 2, 5, 3, 1, PAL.capTan);
    ellipse(x, 16, 5, 3, 1, PAL.capTan);
    return outline(c);
  }

  function dewStarFrames() {
    const frames = [];
    for (const glow of [0, 1]) {
      const c = mk(14, 14); const x = g2d(c);
      const col = glow ? '#aef7ff' : '#5fd8f2';
      tri(x, 4, 1, 5, 6, col, 'up');
      tri(x, 4, 7, 5, 6, col, 'down');
      rect(x, 1, 5, 11, 3, col);
      rect(x, 5, 4, 3, 5, glow ? '#ffffff' : '#aef7ff');
      frames.push(outline(c, '#1a6a80'));
    }
    return frames;
  }

  function sunSeedSprite() {
    const c = mk(18, 22); const x = g2d(c);
    ellipse(x, 8, 12, 5, 7, '#ffb52e');
    ellipse(x, 8, 12, 3, 5, '#ffd875');
    rect(x, 7, 3, 3, 3, PAL.leaf);
    rect(x, 6, 10, 2, 3, '#ffefb8');
    return outline(c, '#8a5e14');
  }

  function cloverSprite() {
    const c = mk(16, 16); const x = g2d(c);
    disc(x, 5, 5, 3, PAL.leaf); disc(x, 10, 5, 3, PAL.leaf);
    disc(x, 7, 9, 3, PAL.leaf);
    rect(x, 7, 11, 1, 4, PAL.leafDark);
    rect(x, 5, 4, 1, 1, '#a5e07a'); rect(x, 10, 4, 1, 1, '#a5e07a');
    return outline(c);
  }

  function seedProjectileSprite() {
    const c = mk(9, 9); const x = g2d(c);
    disc(x, 4, 4, 3, '#ffd23e');
    rect(x, 3, 3, 2, 2, '#fff3a8');
    return outline(c, '#a06a10');
  }

  // ---------- tiles ----------
  function makeTiles(wp, worldIdx) {
    const t = {};
    function tile() { return mk(TILE, TILE); }

    // ground with grass/moss lip
    const gt = tile(); { const x = g2d(gt);
      rect(x, 0, 0, 16, 16, wp.fill);
      reseed(1234 + worldIdx);
      for (let i = 0; i < 7; i++) rect(x, (rnd() * 16) | 0, 6 + ((rnd() * 9) | 0), 2, 1, wp.speck);
      rect(x, 0, 0, 16, 4, wp.lip);
      rect(x, 0, 0, 16, 1, wp.lipHi);
      rect(x, 2, 4, 3, 1, wp.lip); rect(x, 9, 4, 4, 1, wp.lip);
      rect(x, 0, 4, 16, 1, wp.fillDark);
    }
    t.groundTop = gt;

    const gf = tile(); { const x = g2d(gf);
      rect(x, 0, 0, 16, 16, wp.fill);
      reseed(777 + worldIdx * 13);
      for (let i = 0; i < 9; i++) rect(x, (rnd() * 15) | 0, (rnd() * 15) | 0, 2, 1, wp.speck);
      for (let i = 0; i < 4; i++) rect(x, (rnd() * 15) | 0, (rnd() * 15) | 0, 1, 2, wp.fillDark);
    }
    t.groundFill = gf;

    const st = tile(); { const x = g2d(st);
      rect(x, 0, 0, 16, 16, wp.stone);
      rect(x, 0, 0, 16, 2, wp.stoneHi); rect(x, 0, 0, 2, 16, wp.stoneHi);
      rect(x, 14, 0, 2, 16, wp.stoneLo); rect(x, 0, 14, 16, 2, wp.stoneLo);
      rect(x, 5, 5, 6, 6, wp.stoneLo); rect(x, 5, 5, 5, 5, wp.stone);
    }
    t.stone = st;

    const br = tile(); { const x = g2d(br);
      rect(x, 0, 0, 16, 16, wp.brick);
      rect(x, 0, 0, 16, 1, '#00000030');
      for (const y of [0, 8]) { rect(x, 0, y + 7, 16, 1, wp.brickLo); }
      rect(x, 8, 0, 1, 8, wp.brickLo); rect(x, 3, 8, 1, 8, wp.brickLo); rect(x, 12, 8, 1, 8, wp.brickLo);
      rect(x, 0, 0, 16, 1, wp.brickLo);
      rect(x, 1, 1, 6, 1, '#ffffff40');
    }
    t.brick = br;

    function qblock(sym, symColor) {
      const frames = [];
      for (const shimmer of [0, 1]) {
        const c = tile(); const x = g2d(c);
        rect(x, 0, 0, 16, 16, '#e8a83a');
        rect(x, 0, 0, 16, 2, '#ffd275'); rect(x, 0, 0, 2, 16, '#ffd275');
        rect(x, 14, 0, 2, 16, '#a3701e'); rect(x, 0, 14, 16, 2, '#a3701e');
        rect(x, 2, 2, 2, 2, '#7a5214'); rect(x, 12, 2, 2, 2, '#7a5214');
        rect(x, 2, 12, 2, 2, '#7a5214'); rect(x, 12, 12, 2, 2, '#7a5214');
        drawGlyphOnTile(x, sym, shimmer ? '#ffffff' : symColor);
        frames.push(c);
      }
      return frames;
    }
    function drawGlyphOnTile(x, sym, color) {
      x.fillStyle = color;
      if (sym === '?') {
        rect(x, 6, 4, 4, 1, color); rect(x, 9, 5, 2, 2, color);
        rect(x, 7, 7, 2, 2, color); rect(x, 7, 11, 2, 1, color);
        rect(x, 5, 5, 2, 1, color);
      } else if (sym === 'M') { // power: sprout glyph
        rect(x, 7, 5, 2, 6, color); rect(x, 5, 4, 2, 3, color); rect(x, 9, 4, 2, 3, color);
      } else if (sym === 'G') { // glider: wing glyph
        rect(x, 4, 7, 8, 2, color); rect(x, 3, 5, 3, 2, color); rect(x, 10, 5, 3, 2, color);
      } else if (sym === 'E') { // moss: dome glyph
        rect(x, 5, 7, 6, 3, color); rect(x, 6, 5, 4, 2, color);
      } else if (sym === 'U') { // clover
        rect(x, 5, 5, 3, 3, color); rect(x, 9, 5, 3, 3, color); rect(x, 7, 8, 3, 3, color);
      }
    }
    t.qcoin = qblock('?', '#8a5c14');
    t.qpower = qblock('M', '#8a5c14');
    t.qglider = qblock('G', '#8a5c14');
    t.qmoss = qblock('E', '#8a5c14');
    t.qoneup = qblock('U', '#8a5c14');

    const used = tile(); { const x = g2d(used);
      rect(x, 0, 0, 16, 16, '#9a7a4a');
      rect(x, 0, 0, 16, 2, '#b8946a'); rect(x, 14, 0, 2, 16, '#6a5230');
      rect(x, 0, 14, 16, 2, '#6a5230');
      rect(x, 2, 2, 2, 2, '#5c4424'); rect(x, 12, 2, 2, 2, '#5c4424');
      rect(x, 2, 12, 2, 2, '#5c4424'); rect(x, 12, 12, 2, 2, '#5c4424');
    }
    t.used = used;

    const pl = tile(); { const x = g2d(pl);
      rect(x, 0, 2, 16, 6, wp.plat);
      rect(x, 0, 2, 16, 2, wp.platHi);
      rect(x, 0, 7, 16, 1, '#00000040');
      rect(x, 3, 8, 2, 3, wp.plat); rect(x, 11, 8, 2, 3, wp.plat);
    }
    t.platform = pl;

    const sp = tile(); { const x = g2d(sp);
      for (let i = 0; i < 4; i++) tri(x, i * 4, 6, 4, 10, '#d8d8e0', 'up');
      for (let i = 0; i < 4; i++) tri(x, i * 4 + 1, 10, 2, 6, '#9a9aac', 'up');
      rect(x, 0, 14, 16, 2, '#787888');
    }
    t.spikes = sp;

    const cr = tile(); { const x = g2d(cr);
      rect(x, 0, 2, 16, 7, wp.plat);
      rect(x, 0, 2, 16, 2, wp.platHi);
      rect(x, 4, 4, 1, 5, '#00000060'); rect(x, 9, 3, 1, 5, '#00000060');
      rect(x, 12, 5, 3, 1, '#00000060'); rect(x, 1, 6, 3, 1, '#00000060');
    }
    t.crumble = cr;

    const la = tile(); { const x = g2d(la);
      rect(x, 7, 0, 2, 4, '#6a4a2a');
      disc(x, 8, 9, 5, '#ffd23e');
      disc(x, 8, 9, 3, '#fff3a8');
      rect(x, 5, 14, 7, 2, '#6a4a2a');
    }
    t.lantern = la;

    const bu = tile(); { const x = g2d(bu);
      rect(x, 0, 0, 16, 16, '#54382c');
      disc(x, 8, 8, 6, '#2a1a10');
      rect(x, 0, 0, 2, 16, '#7a5a40'); rect(x, 14, 0, 2, 16, '#7a5a40');
      rect(x, 0, 0, 16, 2, '#7a5a40');
      rect(x, 5, 12, 6, 2, '#1a0e06');
    }
    t.burrow = bu;

    const th = tile(); { const x = g2d(th);
      rect(x, 0, 8, 16, 8, '#c83a1e');
      rect(x, 0, 8, 16, 2, '#ff8a3a');
      for (let i = 0; i < 4; i++) tri(x, i * 4, 2, 4, 7, '#ff5f45', 'up');
    }
    t.thorn = th;

    return t;
  }

  // ---------- backgrounds ----------
  function makeBackgrounds(wp, worldIdx) {
    const far = mk(VIEW_W, VIEW_H);
    { const x = g2d(far);
      const grad = x.createLinearGradient(0, 0, 0, VIEW_H);
      grad.addColorStop(0, wp.skyTop); grad.addColorStop(1, wp.skyBot);
      x.fillStyle = grad; x.fillRect(0, 0, VIEW_W, VIEW_H);
      reseed(42 + worldIdx * 100);
      if (worldIdx === 0) { // meadow: sun + clouds
        disc(x, 440, 44, 22, '#fff3a8'); disc(x, 440, 44, 17, '#ffe66a');
        for (let i = 0; i < 5; i++) {
          const cx = (rnd() * VIEW_W) | 0, cy = 30 + ((rnd() * 90) | 0);
          for (const dx of [0, VIEW_W, -VIEW_W]) {
            ellipse(x, cx + dx, cy, 26, 9, '#ffffffd8');
            ellipse(x, cx + dx - 14, cy + 4, 14, 6, '#ffffffd8');
            ellipse(x, cx + dx + 16, cy + 5, 16, 6, '#ffffffd8');
          }
        }
      } else if (worldIdx === 1) { // cavern: crystal glints + stalactites
        for (let i = 0; i < 26; i++) {
          const cx = (rnd() * VIEW_W) | 0, cy = (rnd() * VIEW_H) | 0;
          rect(x, cx, cy, 2, 2, i % 3 ? '#3a4460' : '#66e0ff88');
        }
        for (let i = 0; i < 12; i++) {
          const cx = (rnd() * VIEW_W) | 0, hh = 20 + ((rnd() * 50) | 0);
          tri(x, cx, 0, 14, hh, '#141726', 'down');
        }
      } else if (worldIdx === 2) { // cloudline: high sun, distant cloudbanks
        disc(x, 90, 40, 18, '#fff8d0');
        for (let i = 0; i < 6; i++) {
          const cy = 120 + i * 26;
          for (let j = 0; j < 7; j++) {
            const cx = ((rnd() * VIEW_W) | 0);
            for (const dx of [0, VIEW_W, -VIEW_W])
              ellipse(x, cx + dx, cy, 34, 8, i % 2 ? '#e8f2ffb0' : '#ffffffb0');
          }
        }
      } else { // bramble keep: dusk, keep silhouette, embers
        disc(x, 420, 60, 26, '#c84a2e'); disc(x, 420, 60, 20, '#e86a3a'); // ominous sun
        x.fillStyle = '#1c1024';
        for (let i = 0; i < 6; i++) {
          const bx = 30 + i * 84, bw = 34 + ((rnd() * 20) | 0), bh = 90 + ((rnd() * 80) | 0);
          x.fillRect(bx, VIEW_H - bh, bw, bh);
          tri(x, bx - 4, VIEW_H - bh - 14, bw + 8, 14, '#1c1024', 'up');
        }
        for (let i = 0; i < 16; i++)
          rect(x, (rnd() * VIEW_W) | 0, (rnd() * VIEW_H) | 0, 2, 2, '#ff8a3a66');
      }
    }

    const near = mk(VIEW_W, 120);
    { const x = g2d(near);
      reseed(99 + worldIdx * 31);
      if (worldIdx === 0) { // rolling hills
        x.fillStyle = '#57b04a';
        for (let i = 0; i < 4; i++) {
          const cx = i * 150 + 40, r = 70 + ((rnd() * 40) | 0);
          for (const dx of [0, VIEW_W, -VIEW_W]) disc(x, cx + dx, 130, r, '#57b04a');
        }
        x.fillStyle = '#469a3c';
        for (let i = 0; i < 5; i++) {
          const cx = i * 120 + 90, r = 50 + ((rnd() * 30) | 0);
          for (const dx of [0, VIEW_W, -VIEW_W]) disc(x, cx + dx, 140, r, '#469a3c');
        }
        for (let i = 0; i < 12; i++)
          rect(x, (rnd() * VIEW_W) | 0, 100 + ((rnd() * 18) | 0), 2, 2, '#ffdf6a');
      } else if (worldIdx === 1) { // stalagmite silhouettes
        for (let i = 0; i < 14; i++) {
          const cx = (rnd() * VIEW_W) | 0, hh = 30 + ((rnd() * 70) | 0);
          for (const dx of [0, VIEW_W, -VIEW_W]) tri(x, cx + dx, 120 - hh, 20, hh, '#232838', 'up');
        }
        for (let i = 0; i < 8; i++) {
          const cx = (rnd() * VIEW_W) | 0;
          rect(x, cx, 60 + ((rnd() * 50) | 0), 3, 3, '#66e0ff99');
        }
      } else if (worldIdx === 2) { // cloud sea
        x.fillStyle = '#ffffff';
        for (let i = 0; i < 10; i++) {
          const cx = i * 60 + ((rnd() * 30) | 0);
          for (const dx of [0, VIEW_W, -VIEW_W]) ellipse(x, cx + dx, 116, 40, 18, '#ffffff');
        }
        for (let i = 0; i < 10; i++) {
          const cx = i * 60 + 25;
          for (const dx of [0, VIEW_W, -VIEW_W]) ellipse(x, cx + dx, 124, 38, 16, '#e0eaff');
        }
      } else { // thorn bramble wall
        for (let i = 0; i < 20; i++) {
          const cx = (rnd() * VIEW_W) | 0, hh = 24 + ((rnd() * 60) | 0);
          for (const dx of [0, VIEW_W, -VIEW_W]) {
            tri(x, cx + dx, 120 - hh, 10, hh, '#2c1a30', 'up');
            tri(x, cx + dx + 6, 120 - ((hh * 0.6) | 0), 8, (hh * 0.6) | 0, '#241428', 'up');
          }
        }
      }
    }
    return { far, near };
  }

  // ---------- goal / flags ----------
  function goalDialFrames() {
    const frames = [];
    for (let f = 0; f < 8; f++) {
      const c = mk(18, 18); const x = g2d(c);
      disc(x, 8, 8, 7, '#ffd23e');
      disc(x, 8, 8, 5, '#ffb52e');
      const ang = f / 8 * Math.PI * 2 - Math.PI / 2;
      const nx = 8 + Math.round(Math.cos(ang) * 5), ny = 8 + Math.round(Math.sin(ang) * 5);
      x.strokeStyle = '#7a3c10'; x.lineWidth = 2;
      x.beginPath(); x.moveTo(8.5, 8.5); x.lineTo(nx + 0.5, ny + 0.5); x.stroke();
      rect(x, 7, 0, 3, 3, '#c8542a');
      frames.push(outline(c, '#8a5e14'));
    }
    return frames;
  }

  function checkpointSprites() {
    function flag(active, wave) {
      const c = mk(18, 34); const x = g2d(c);
      rect(x, 3, 2, 2, 30, '#b8946a');
      disc(x, 4, 2, 2, '#ffd23e');
      const col = active ? PAL.leaf : '#9a9aa8';
      if (wave) { tri(x, 5, 4, 11, 9, col, 'down'); }
      else { rect(x, 5, 4, 10, 7, col); tri(x, 15, 4, 3, 7, col, 'down'); }
      if (active) rect(x, 7, 6, 3, 3, '#ffd23e');
      return outline(c);
    }
    return { off: [flag(false, false), flag(false, true)], on: [flag(true, false), flag(true, true)] };
  }

  // ---------- HUD ----------
  function hudIcons() {
    const pipHead = mk(14, 12); { const x = g2d(pipHead);
      disc(x, 6, 7, 4, PAL.face);
      halfDiscTop(x, 6, 6, 5, PAL.capRed);
      rect(x, 6, 1, 1, 2, PAL.leaf);
      rect(x, 7, 7, 1, 2, PAL.black); rect(x, 9, 7, 1, 2, PAL.black);
      outline(pipHead);
    }
    const reserveBox = mk(28, 28); { const x = g2d(reserveBox);
      rect(x, 0, 0, 28, 28, '#00000070');
      rect(x, 0, 0, 28, 2, '#f5e6c8'); rect(x, 0, 26, 28, 2, '#f5e6c8');
      rect(x, 0, 0, 2, 28, '#f5e6c8'); rect(x, 26, 0, 2, 28, '#f5e6c8');
    }
    return { pipHead, reserveBox };
  }

  // ---------- public init ----------
  Sprites.init = function () {
    Sprites.pip = {
      [POWER.SMALL]: pipSheet(false, PAL.capRed, PAL.capDark, false),
      [POWER.SPROUT]: pipSheet(true, PAL.capRed, PAL.capDark, false),
      [POWER.BLOSSOM]: pipSheet(true, PAL.capPink, PAL.capPinkDark, false),
      [POWER.GLIDER]: pipSheet(true, PAL.capTan, PAL.capTanDark, true),
    };
    Sprites.bumble = bumbleSprites();
    Sprites.snapcap = snapcapSprites();
    Sprites.spikelet = spikeletSprites();
    Sprites.puffhawk = puffhawkSprites();
    Sprites.lobber = lobberSprites();
    Sprites.thornBall = thornBallSprite();
    Sprites.wisp = wispSprites();
    Sprites.pod = podSprites();
    Sprites.moss = mossSprites();

    Sprites.boss = {
      snapjaw: snapjawSprites(),
      grubmaw: grubmawSprites(),
      gale: galeTalonSprites(),
      bramble: brambleSprites(),
    };

    Sprites.coin = coinFrames();
    Sprites.sunFruit = sunFruitSprite();
    Sprites.fireBlossom = fireBlossomSprite();
    Sprites.gliderCap = gliderCapSprite();
    Sprites.dewStar = dewStarFrames();
    Sprites.sunSeed = sunSeedSprite();
    Sprites.clover = cloverSprite();
    Sprites.seed = seedProjectileSprite();

    Sprites.tiles = WORLD_PAL.map(makeTiles);
    Sprites.bg = WORLD_PAL.map(makeBackgrounds);
    Sprites.goalDial = goalDialFrames();
    Sprites.checkpoint = checkpointSprites();
    Sprites.hud = hudIcons();
  };
})();

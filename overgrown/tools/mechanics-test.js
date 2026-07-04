#!/usr/bin/env node
// Focused in-browser mechanics probes: real keyboard input driving the real
// build — dash, slash, parry stance, down-plunge pogo, and the beam/mirror
// gate puzzle. (Deep frame-accurate mechanics live in tools/sim-probe.js.)
// Usage: node tools/mechanics-test.js   (server on :8378)

import { createRequire } from 'module';
import { execSync } from 'child_process';
const require = createRequire(execSync('npm root -g').toString().trim() + '/');
const { chromium } = require('playwright');

const BASE = 'http://localhost:8378/overgrown/index.html';
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => {
  if (ok) { pass++; console.log(`PASS  ${name}`); }
  else { fail++; console.log(`FAIL  ${name}${extra ? '  (' + extra + ')' : ''}`); }
};

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto(`${BASE}?level=gym&seed=7`);
  await page.waitForTimeout(2200);

  // dash via C
  const watch = (expr, ms = 700) => page.evaluate(({ expr: ex, ms: m }) => new Promise((res) => {
    const t0 = performance.now();
    const fn = new Function('OG', `return (${ex});`);
    const tick = () => {
      if (fn(window.OG)) return res(true);
      if (performance.now() - t0 > m) return res(false);
      requestAnimationFrame(tick);
    };
    tick();
  }), { expr, ms });

  let p1 = watch("OG.world.player.state === 'dash'");
  await page.keyboard.press('KeyC', { delay: 60 });
  check('C key dashes', await p1);
  await page.waitForTimeout(400);

  let p2 = watch('!!OG.world.player.atk');
  await page.keyboard.press('KeyX', { delay: 60 });
  check('X key slashes', await p2);
  await page.waitForTimeout(400);

  let p3 = watch('OG.world.player.parryT > 0', 500);
  await page.keyboard.press('KeyV', { delay: 40 });
  check('V key raises the parry', await p3);
  await page.waitForTimeout(500);

  // down-plunge pogo on the gym spike strip (cols 96-103, row 18)
  await page.evaluate(() => {
    const p = OG.world.player;
    p.x = 100 * 16 + 8; p.y = 15 * 16; p.px = p.x; p.py = p.y; p.vx = 0; p.vy = 0;
    OG.world.camX = p.x; OG.world.camY = p.y; OG.world.wake();
    OG.run.hearts = 3;
  });
  await page.waitForTimeout(80);
  const pogoP = watch("OG.world.player.vy < -3", 1200);
  await page.keyboard.down('ArrowDown');
  await page.keyboard.press('KeyX', { delay: 60 });
  const pogoed = await pogoP;
  await page.keyboard.up('ArrowDown');
  const hearts = await page.evaluate(() => OG.run.hearts);
  check('down+X plunge pogos off spikes without damage', pogoed && hearts === 3, `pogo=${pogoed} hearts=${hearts}`);

  // beam puzzle: 2-3 mirror routes the beam up to the crystal, gates open
  await page.goto(`${BASE}?level=2-3&seed=7`);
  await page.waitForTimeout(2000);
  await page.evaluate(() => {
    OG.run.hasBeam = true;
    const p = OG.world.player;
    p.x = 84 * 16; p.y = 16 * 16; p.px = p.x; p.py = p.y; p.facing = 1;
    OG.world.camX = p.x; OG.world.camY = p.y - 40; OG.world.wake();
  });
  await page.waitForTimeout(200);
  await page.keyboard.down('KeyF');
  await page.waitForTimeout(700);
  await page.keyboard.up('KeyF');
  const opened = await watch('OG.world.gatesOpen', 1500);
  check('beam + mirror lights the crystal and opens the gates', opened);

  check('no page errors', errors.length === 0, errors.slice(0, 2).join('|'));
  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();

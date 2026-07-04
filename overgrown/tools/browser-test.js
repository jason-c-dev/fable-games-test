#!/usr/bin/env node
// End-to-end browser flow tests for Sprout Kingdom: Overgrown.
// Drives the real game in headless Chrome through the OG hooks.
// Usage: node tools/browser-test.js   (server on :8378 serving the repo root)

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

  // ---- 1. boot to title, start a fresh game ----
  await page.goto(BASE);
  await page.waitForTimeout(2200);
  check('boots without page errors', errors.length === 0, errors[0]);
  let st = await page.evaluate(() => ({ mode: OG.flow.mode }));
  check('lands on title', st.mode === 'title');

  await page.evaluate(() => { localStorage.clear(); OG.flow.newGame(); });
  await page.waitForTimeout(1400);
  st = await page.evaluate(() => ({ mode: OG.flow.mode, unlocked: OG.run.unlocked.length }));
  check('new game reaches overworld with one unlock', st.mode === 'overworld' && st.unlocked === 1, JSON.stringify(st));

  // ---- 2. play 1-1: collect a star, take damage, checkpoint, finish ----
  await page.evaluate(() => OG.flow.enterLevel('1-1'));
  await page.waitForTimeout(1400);
  st = await page.evaluate(() => ({ mode: OG.flow.mode, level: OG.run.currentLevel }));
  check('enters 1-1', st.mode === 'level' && st.level === '1-1');

  // walk right for real for a couple seconds (input path)
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(1500);
  await page.keyboard.up('ArrowRight');
  st = await page.evaluate(() => ({ x: OG.world.player.x }));
  check('keyboard input moves Pip', st.x > 100, `x=${st.x | 0}`);

  // grab the nearest star via teleport (snap the camera so it wakes)
  await page.evaluate(() => {
    const w = OG.world;
    const star = w.entities.find(e => e.constructor.name === 'DewStar');
    const p = w.player;
    p.x = star.x; p.y = star.y; p.px = p.x; p.py = p.y;
    w.camX = p.x; w.camY = p.y; w.wake();
  });
  await page.waitForTimeout(400);
  st = await page.evaluate(() => ({ stars: OG.run.starsCollected }));
  check('dew star collected', st.stars === 1, JSON.stringify(st));

  // touch the checkpoint, then die: should respawn there with the star kept
  await page.evaluate(() => {
    const w = OG.world;
    const cp = w.checkpointsByRoom.main[0];
    const p = w.player;
    p.x = cp.x; p.y = cp.y; p.px = p.x; p.py = p.y;
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => { OG.run.hearts = 1; OG.world.player.invuln = 0; OG.world.damagePlayer(5, 0); });
  await page.waitForTimeout(1600);
  st = await page.evaluate(() => {
    const w = OG.world, cp = w.checkpointsByRoom.main[0];
    return { alive: !w.player.dead, nearCp: Math.abs(w.player.x - cp.x) < 40, stars: OG.run.starsCollected, lives: OG.run.lives };
  });
  check('death respawns at checkpoint fast, star kept', st.alive && st.nearCp && st.stars === 1 && st.lives === 4, JSON.stringify(st));

  // finish the level
  await page.evaluate(() => {
    const w = OG.world, g = w.room.goals[0], p = w.player;
    p.x = g.x * 16 - 14; p.y = g.y * 16 + 16; p.px = p.x; p.py = p.y;
  });
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(600);
  await page.keyboard.up('ArrowRight');
  await page.waitForTimeout(3400);
  st = await page.evaluate(() => ({
    mode: OG.flow.mode, cleared: !!OG.run.cleared['1-1'],
    unlocked: OG.run.unlocked, best: !!OG.run.bestTimes['1-1'],
  }));
  check('1-1 clear returns to map, unlocks 1-2, records time',
    st.mode === 'overworld' && st.cleared && st.unlocked.includes('1-2') && st.best, JSON.stringify(st));

  // ---- 3. save/load roundtrip ----
  await page.reload();
  await page.waitForTimeout(2000);
  st = await page.evaluate(() => ({ stars: OG.run.starsCollected, cleared: !!OG.run.cleared['1-1'], unlocked: OG.run.unlocked.includes('1-2') }));
  check('progress survives reload', st.stars === 1 && st.cleared && st.unlocked, JSON.stringify(st));

  // ---- 4. boss flow: beat King Snapjaw, shrine unlocks and sells ----
  await page.evaluate(() => {
    OG.run.unlocked = ['1-1', '1-2', '1-3', '1-4', '1-B'];
    OG.flow.enterLevel('1-B');
  });
  await page.waitForTimeout(1500);
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(800);
  await page.keyboard.up('ArrowRight');
  st = await page.evaluate(() => ({ engaged: OG.world.boss.engaged, bar: OG.hud.bossC.visible }));
  check('boss engages with health bar', st.engaged && st.bar, JSON.stringify(st));
  await page.evaluate(() => { const b = OG.world.boss; b.vulnT = 999; b.hurt(OG.world, 99, { kind: 'burst' }); });
  await page.waitForTimeout(5500);
  st = await page.evaluate(() => ({ mode: OG.flow.mode, next: OG.run.unlocked.includes('2-1'), shrine: OG.run.unlocked.includes('shrine1') }));
  check('boss kill unlocks next world + shrine', st.mode === 'overworld' && st.next && st.shrine, JSON.stringify(st));

  await page.evaluate(() => {
    OG.run.stars['t'] = new Set([0, 1, 2, 3, 4]);   // grant stars to spend
    OG.run.mapPos = 'shrine1';
    OG.flow.overworld.onPick({ id: 'shrine1', shrine: true });
  });
  await page.waitForTimeout(300);
  st = await page.evaluate(() => {
    OG.flow.shrineMenu.idx = 2;                     // ROOTED WIND (4 stars)
    OG.flow.shrineMenu.items[2].cb();
    return { bought: !!OG.run.upgrades.longdash, avail: OG.run.starsAvailable };
  });
  check('shrine purchase works and spends stars', st.bought && st.avail === 2, JSON.stringify(st));

  // ---- 5. Sunbeam pickup in 2-1 ----
  await page.evaluate(() => OG.flow.enterLevel('2-1'));
  await page.waitForTimeout(1400);
  st = await page.evaluate(() => {
    const w = OG.world;
    const b = w.entities.find(e => e.kind === 'beam');
    const p = w.player;
    p.x = b.x; p.y = b.y + 8; p.px = p.x; p.py = p.y;
    w.camX = p.x; w.camY = p.y; w.wake();
    return { dark: w.darkness > 0, lighting: OG.renderer.lighting.enabled };
  });
  await page.waitForTimeout(400);
  const beamSt = await page.evaluate(() => ({ hasBeam: OG.run.hasBeam }));
  check('cavern darkness active', st.dark, JSON.stringify(st));
  check('Sunbeam Lance pickup unlocks the beam', beamSt.hasBeam);

  // ---- 6. secret exit unlocks the shortcut edge ----
  await page.evaluate(() => OG.flow.enterLevel('1-2'));
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    const w = OG.world, g = w.room.goals.find(g2 => g2.secret), p = w.player;
    p.x = g.x * 16 + 8; p.y = g.y * 16 + 16; p.px = p.x; p.py = p.y;
  });
  await page.waitForTimeout(3400);
  st = await page.evaluate(() => ({ secret: !!OG.run.cleared['1-2']?.secret, unlocked14: OG.run.unlocked.includes('1-4') }));
  check('secret exit records + unlocks shortcut', st.secret && st.unlocked14, JSON.stringify(st));

  // ---- 7. pause menu ----
  await page.evaluate(() => OG.flow.enterLevel('1-1'));
  await page.waitForTimeout(1300);
  await page.keyboard.press('Escape', { delay: 70 });
  await page.waitForTimeout(250);
  st = await page.evaluate(() => ({ paused: OG.flow.paused }));
  check('pause opens', st.paused);
  await page.keyboard.press('Escape', { delay: 70 });
  await page.waitForTimeout(250);
  st = await page.evaluate(() => ({ paused: OG.flow.paused }));
  check('pause closes', !st.paused);

  // ---- 8. audio engine alive ----
  st = await page.evaluate(() => ({
    ready: OG.audio.ready,
    transport: typeof Tone !== 'undefined' ? Tone.Transport.state : 'none',
  }));
  check('audio running after input', st.ready && st.transport === 'started', JSON.stringify(st));

  check('no page errors across the whole run', errors.length === 0, errors.slice(0, 3).join(' | '));

  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();

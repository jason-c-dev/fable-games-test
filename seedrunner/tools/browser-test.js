#!/usr/bin/env node
// Browser flow suite: boot/title/menus, campaign progression + persistence,
// settings + remap, pause, results, finale cutscene->credits->title,
// standalone file://, dpr/aspect matrix, fps sanity.
// Usage: node tools/browser-test.js [filter]

import { createRequire } from 'module';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const require = createRequire(execSync('npm root -g').toString().trim() + '/');
const { chromium } = require('playwright');

const BASE = 'http://localhost:8378/seedrunner/index.html';
const STANDALONE = 'file://' + join(dirname(fileURLToPath(import.meta.url)), '..', 'standalone.html');
let pass = 0, fail = 0;
const filter = process.argv[2];
const out = [];
function check(name, cond, detail = '') {
  if (cond) { pass++; out.push(`  ok  ${name}`); }
  else { fail++; out.push(`FAIL  ${name}  ${detail}`); }
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });

async function fresh(url = BASE, opts = {}) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, ...opts });
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  await page.goto(url);
  await page.waitForTimeout(1200);
  return page;
}

if (!filter || 'title-menus'.includes(filter)) {
  const page = await fresh();
  const mode = await page.evaluate(() => window.SR.flow.mode);
  check('title.boots', mode === 'title', `mode=${mode}`);
  const ambient = await page.evaluate(() => !!window.SR.world && window.SR.world.def.id === 'endless');
  check('title.ambient-world', ambient);
  // navigate: Play -> select
  await page.keyboard.press('Enter', { delay: 60 });
  await page.waitForTimeout(300);
  check('select.opens', await page.evaluate(() => window.SR.flow.mode) === 'select');
  // run 1 unlocked, run 2 locked
  const locks = await page.evaluate(() => [...document.querySelectorAll('#run-cards .card')].map((c) => c.classList.contains('locked')));
  check('select.locks', locks[0] === false && locks[1] === true && locks[5] === true, JSON.stringify(locks));
  // start run 1 via click
  await page.click('#run-cards .card:not(.locked)');
  await page.waitForTimeout(400);
  check('run1.starts', await page.evaluate(() => window.SR.flow.mode === 'run' && window.SR.world.def.id === 'run1'));
  // pause + resume
  await page.keyboard.press('Escape', { delay: 60 });
  await page.waitForTimeout(200);
  check('pause.opens', await page.evaluate(() => window.SR.flow.mode) === 'paused');
  const frameA = await page.evaluate(() => window.SR.frame);
  await page.waitForTimeout(400);
  const frameB = await page.evaluate(() => window.SR.frame);
  check('pause.freezes', frameB === frameA, `${frameA}->${frameB}`);
  await page.keyboard.press('Escape', { delay: 60 });
  await page.waitForTimeout(300);
  check('pause.resumes', await page.evaluate(() => window.SR.flow.mode) === 'run');
  check('title.no-errors', page.errors.length === 0, page.errors.join(' | '));
  await page.close();
}

if (!filter || 'settings-remap-persist'.includes(filter)) {
  const page = await fresh();
  await page.evaluate(() => window.SR.flow.setMode('settings'));
  await page.waitForTimeout(200);
  // remap jump to KeyG via the capture flow
  await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.set-row')];
    const jumpRow = rows.find((r) => r.querySelector('span')?.textContent === 'JUMP');
    jumpRow.querySelector('button').click();
  });
  await page.keyboard.press('KeyG', { delay: 60 });
  await page.waitForTimeout(200);
  const bound = await page.evaluate(() => window.SR.input.bindings.jump[0]);
  check('remap.captures', bound === 'KeyG', bound);
  // persists across reload
  await page.reload();
  await page.waitForTimeout(1200);
  const bound2 = await page.evaluate(() => window.SR.input.bindings.jump[0]);
  check('remap.persists', bound2 === 'KeyG', bound2);
  await page.evaluate(() => localStorage.clear());
  check('settings.no-errors', page.errors.length === 0, page.errors.join(' | '));
  await page.close();
}

if (!filter || 'finale-cutscene-credits'.includes(filter)) {
  const page = await fresh(BASE + '?run=run6&bot=1&seed=3');
  // wait for the bot to finish the finale (~75s of sim, fast-forwarded by wall clock)
  let mode = 'run';
  for (let i = 0; i < 120 && mode !== 'cutscene'; i++) {
    await page.waitForTimeout(1000);
    mode = await page.evaluate(() => window.SR.flow.mode);
    if (mode === 'results') break;   // would be a failure: finale must cutscene
  }
  check('finale.cutscene', mode === 'cutscene', `mode=${mode}`);
  // advance through all five beats — the fifth lands in credits
  for (let i = 0; i < 5; i++) { await page.keyboard.press('Space', { delay: 60 }); await page.waitForTimeout(250); }
  mode = await page.evaluate(() => window.SR.flow.mode);
  check('finale.credits', mode === 'credits', `mode=${mode}`);
  await page.keyboard.press('Escape', { delay: 60 });
  await page.waitForTimeout(300);
  mode = await page.evaluate(() => window.SR.flow.mode);
  check('credits.to-title', mode === 'title', `mode=${mode}`);
  check('finale.no-errors', page.errors.length === 0, page.errors.slice(0, 3).join(' | '));
  await page.close();
}

if (!filter || 'progression-persistence'.includes(filter)) {
  const page = await fresh(BASE + '?run=run1&bot=1&seed=3');
  let mode = 'run';
  for (let i = 0; i < 150 && mode !== 'results'; i++) {
    await page.waitForTimeout(1000);
    mode = await page.evaluate(() => window.SR.flow.mode);
  }
  check('run1.results', mode === 'results', `mode=${mode}`);
  const prog = await page.evaluate(() => window.SR.progress);
  check('run1.progress', prog.completed.run1 === true && prog.bestTime.run1 > 60, JSON.stringify(prog.completed));
  await page.reload();
  await page.waitForTimeout(1200);
  const prog2 = await page.evaluate(() => window.SR.progress);
  check('progress.persists', prog2.completed.run1 === true);
  // next run unlocked on select
  await page.evaluate(() => window.SR.flow.setMode('select'));
  await page.waitForTimeout(200);
  const locks = await page.evaluate(() => [...document.querySelectorAll('#run-cards .card')].map((c) => c.classList.contains('locked')));
  check('run2.unlocked', locks[1] === false, JSON.stringify(locks));
  await page.evaluate(() => localStorage.clear());
  await page.close();
}

if (!filter || 'standalone-file'.includes(filter)) {
  const page = await fresh(STANDALONE);
  const mode = await page.evaluate(() => window.SR?.flow?.mode);
  check('standalone.boots', mode === 'title', `mode=${mode}`);
  const frameA = await page.evaluate(() => window.SR.frame);
  await page.waitForTimeout(1500);
  const frameB = await page.evaluate(() => window.SR.frame);
  check('standalone.sim-runs', frameB - frameA > 70, `+${frameB - frameA}`);
  check('standalone.no-errors', page.errors.length === 0, page.errors.join(' | '));
  await page.close();
}

if (!filter || 'dpr-aspect-matrix-fps'.includes(filter)) {
  for (const [w, h, dpr] of [[1280, 720, 1], [1280, 720, 2], [1920, 1080, 1], [900, 1200, 2], [2560, 720, 1]]) {
    const page = await fresh(BASE + '?run=gym&bot=1', { viewport: { width: w, height: h }, deviceScaleFactor: dpr });
    await page.waitForTimeout(2500);
    const st = await page.evaluate(() => ({
      fps: window.SR.fps, frame: window.SR.frame,
      w: window.SR.renderer.three.domElement.width, h: window.SR.renderer.three.domElement.height,
    }));
    const expW = w * Math.min(dpr, 2);
    check(`matrix.${w}x${h}@${dpr}`, st.fps > 50 && st.frame > 100 && st.w === expW && page.errors.length === 0,
      `fps=${st.fps.toFixed(0)} canvas=${st.w}x${st.h} expW=${expW} err=${page.errors.length}`);
    await page.screenshot({ path: `/tmp/claude-501/-Users-claude-dev-sprout-kingdom/9e4e4faf-a81b-47c8-a2a9-994245f17269/scratchpad/matrix-${w}x${h}-${dpr}.png` });
    await page.close();
  }
}

if (!filter || 'attract-demo'.includes(filter)) {
  // title idle -> attract demo; the real bot must clear run 1 and return
  const page = await fresh();
  await page.evaluate(() => { window.SR.flow.idleT = 60 * 13.5; });
  await page.waitForTimeout(1500);
  let mode = await page.evaluate(() => window.SR.flow.mode);
  check('attract.starts', mode === 'attract' || mode === 'title', `mode=${mode}`);
  for (let i = 0; i < 10 && mode !== 'attract'; i++) { await page.waitForTimeout(500); mode = await page.evaluate(() => window.SR.flow.mode); }
  check('attract.running-run1', await page.evaluate(() => window.SR.flow.mode === 'attract' && window.SR.world.def.id === 'run1' && !!window.SR.bot));
  // watch the whole demo: bot must finish (win) and flow must return to title
  let final = null;
  for (let i = 0; i < 140; i++) {
    await page.waitForTimeout(1000);
    final = await page.evaluate(() => ({ mode: window.SR.flow.mode, fin: window.SR.world?.finished, dead: window.SR.world?.dead, d: window.SR.world?.player.d | 0 }));
    if (final.mode === 'title') break;
    if (final.dead) break;
  }
  check('attract.clears-run1', final.mode === 'title' && !final.dead, JSON.stringify(final));
  check('attract.no-errors', page.errors.length === 0, page.errors.slice(0, 3).join(' | '));
  await page.close();
}

if (!filter || 'fps-busiest'.includes(filter)) {
  // 1080p in the finale's dense stretch: fps must hold 60
  const page = await fresh(BASE + '?run=run6&bot=1&seed=3', { viewport: { width: 1920, height: 1080 } });
  await page.waitForTimeout(30000);   // mid-run: gauntlets + surges
  const st = await page.evaluate(() => ({ fps: window.SR.fps, draws: window.SR.renderer.drawCalls, d: window.SR.world.player.d | 0 }));
  check('fps.1080p-busiest', st.fps >= 58, `fps=${st.fps.toFixed(0)} draws=${st.draws} d=${st.d}`);
  await page.close();
}

if (!filter || 'audio-scenes'.includes(filter)) {
  // 60s automated play across biomes: scenes must switch, console must stay clean
  const page = await fresh(BASE + '?run=run5&bot=1&seed=3');
  page.consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') page.consoleErrors.push(m.text()); });
  await page.mouse.click(640, 360);         // user gesture unlocks Tone
  await page.waitForTimeout(1500);
  const ready = await page.evaluate(() => window.SR.audio.ready);
  check('audio.unlocks', ready === true, `ready=${ready}`);
  const scenes = new Set();
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(1000);
    const s = await page.evaluate(() => window.SR.audio.music?.sceneKey);
    if (s) scenes.add(s);
    if (await page.evaluate(() => window.SR.flow.mode === 'results')) break;
  }
  check('audio.scene-switch', [...scenes].filter((s) => s.startsWith('run-')).length >= 2, [...scenes].join(','));
  check('audio.no-console-errors', page.consoleErrors.length === 0 && page.errors.length === 0,
    [...page.consoleErrors, ...page.errors].slice(0, 4).join(' | '));
  await page.close();
}

await browser.close();
console.log(out.join('\n'));
console.log(`\nbrowser-test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

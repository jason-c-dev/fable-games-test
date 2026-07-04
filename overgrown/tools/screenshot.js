#!/usr/bin/env node
// Quick visual smoke test: load the game, run a scripted input burst,
// capture screenshots + console/page errors.
// Usage: NODE_PATH=$(npm root -g) node tools/screenshot.js [level] [outPrefix] [script...]
// script tokens: "hold:right:60" "press:jump" "wait:30" etc.

import { createRequire } from 'module';
import { execSync } from 'child_process';
const globalRoot = execSync('npm root -g').toString().trim();
const require = createRequire(globalRoot + '/');
const { chromium } = require('playwright');

(async () => {
  const level = process.argv[2] || 'gym';
  const outPrefix = process.argv[3] || '/tmp/og';
  const script = process.argv.slice(4);

  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });

  await page.goto(`http://localhost:8378/overgrown/index.html?level=${level}&seed=7`);
  await page.waitForTimeout(2500);

  const KEYMAP = { right: 'ArrowRight', left: 'ArrowLeft', up: 'ArrowUp', down: 'ArrowDown', jump: 'Space', attack: 'KeyX', dash: 'KeyC', parry: 'KeyV', beam: 'KeyF', special: 'KeyQ' };
  let shot = 0;
  for (const tok of script) {
    const [op, key, frames] = tok.split(':');
    if (op === 'hold') {
      await page.keyboard.down(KEYMAP[key] || key);
      await page.waitForTimeout((Number(frames) || 30) * 16.7);
      await page.keyboard.up(KEYMAP[key] || key);
    } else if (op === 'press') {
      await page.keyboard.press(KEYMAP[key] || key, { delay: 60 });
    } else if (op === 'wait') {
      await page.waitForTimeout((Number(key) || 30) * 16.7);
    } else if (op === 'shot') {
      await page.screenshot({ path: `${outPrefix}-${shot++}.png` });
    } else if (op === 'tp') {
      await page.evaluate(([x, y]) => {
        const p = window.OG.world.player;
        p.x = Number(x); p.y = Number(y); p.px = p.x; p.py = p.y; p.vx = 0; p.vy = 0;
      }, [key, frames]);
    }
  }
  await page.screenshot({ path: `${outPrefix}-final.png` });

  const state = await page.evaluate(() => {
    const w = window.OG.world;
    return {
      player: { x: w.player.x, y: w.player.y, state: w.player.state, hearts: w.run.hearts },
      entities: w.entities.length,
      frame: w.frame,
      finished: !!w.finished,
    };
  }).catch(e => ({ evalError: e.message }));

  console.log('STATE:', JSON.stringify(state));
  console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 12).join('\n') : 'NO ERRORS');
  await browser.close();
  process.exit(errors.filter(e => e.startsWith('PAGEERROR')).length ? 1 : 0);
})();

#!/usr/bin/env node
// Visual smoke test: load a run, script inputs, capture screenshots + errors.
// Usage: node tools/screenshot.js [run] [outPrefix] [tokens...]
// tokens: hold:jump:20  press:parry  wait:30  shot  bot (attach demo bot)
//         dpr:2  size:1280x720 (must come first)

import { createRequire } from 'module';
import { execSync } from 'child_process';
const require = createRequire(execSync('npm root -g').toString().trim() + '/');
const { chromium } = require('playwright');

(async () => {
  const run = process.argv[2] || 'gym';
  const outPrefix = process.argv[3] || '/tmp/sr';
  const script = process.argv.slice(4);

  let dpr = 1, width = 1280, height = 720;
  for (const tok of script) {
    if (tok.startsWith('dpr:')) dpr = Number(tok.split(':')[1]);
    if (tok.startsWith('size:')) [width, height] = tok.split(':')[1].split('x').map(Number);
  }

  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: dpr });
  const errors = [];
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  const bot = script.includes('bot') ? '&bot=1' : '';
  await page.goto(`http://localhost:8378/seedrunner/index.html?run=${run}&seed=7${bot}`);
  await page.waitForTimeout(1800);

  const KEYMAP = { left: 'ArrowLeft', right: 'ArrowRight', jump: 'Space', slide: 'ArrowDown', dash: 'ShiftLeft', parry: 'KeyX' };
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
    }
  }
  await page.screenshot({ path: `${outPrefix}-final.png` });

  const state = await page.evaluate(() => {
    const w = window.SR.world;
    return {
      d: +w.player.d.toFixed(1), x: +w.player.x.toFixed(2), y: +w.player.y.toFixed(2),
      state: w.player.state, dew: w.dew, tideGap: +w.tide.gap.toFixed(1),
      finished: w.finished, dead: w.dead, fps: +window.SR.fps.toFixed(0),
      draws: window.SR.renderer.drawCalls,
    };
  }).catch((e) => ({ evalError: e.message }));

  console.log('STATE:', JSON.stringify(state));
  console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 12).join('\n') : 'NO ERRORS');
  await browser.close();
  process.exit(errors.filter((e) => e.startsWith('PAGEERROR')).length ? 1 : 0);
})();

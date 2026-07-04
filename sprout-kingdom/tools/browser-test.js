#!/usr/bin/env node
// Headless browser playtest for Sprout Kingdom.
// Drives the real game with synthetic keyboard input, teleports through every
// level and boss arena, and reports any console/page errors.
// Usage: NODE_PATH=$(npm root -g) node tools/browser-test.js [--shots DIR]

const path = require('path');
const { chromium } = require('playwright');

const BASE = 'http://localhost:8377/sprout-kingdom/index.html';
const shotsDir = process.argv.includes('--shots')
  ? process.argv[process.argv.indexOf('--shots') + 1]
  : null;

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });

  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') errors.push(`[console.${m.type()}] ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}\n${(e.stack || '').split('\n').slice(0, 4).join('\n')}`));

  const shot = async (name) => {
    if (shotsDir) await page.screenshot({ path: path.join(shotsDir, name + '.png') });
  };
  const state = () => page.evaluate(() => Game.state ? Game.state.constructor.name : 'none');

  console.log('loading page...');
  await page.goto(BASE);
  await page.waitForTimeout(1200);
  console.log('state:', await state());
  await shot('01-title');

  // start game -> overworld
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1300);
  console.log('state after Enter:', await state());
  await shot('02-overworld');

  // enter level 1-1
  await page.keyboard.press('Enter');
  await page.waitForTimeout(2400); // wipe + intro banner
  console.log('state after level start:', await state());
  await shot('03-level-intro');

  // play: run right with periodic jumps for ~8 seconds
  const x0 = await page.evaluate(() => Game.state.player && Game.state.player.x);
  await page.keyboard.down('ArrowRight');
  await page.keyboard.down('ShiftLeft');
  for (let i = 0; i < 14; i++) {
    await page.keyboard.down('Space');
    await page.waitForTimeout(260);
    await page.keyboard.up('Space');
    await page.waitForTimeout(320);
    if (i === 6) await shot('04-level-mid');
  }
  await page.keyboard.up('ShiftLeft');
  await page.keyboard.up('ArrowRight');
  const x1 = await page.evaluate(() => Game.state.player && Game.state.player.x);
  console.log(`player progressed from x=${Math.round(x0)} to x=${Math.round(x1)} (${await page.evaluate(() => Run.lives)} lives, score ${await page.evaluate(() => Run.score)})`);
  await shot('05-level-after-run');

  // pause menu
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  console.log('pause state:', await state());
  await shot('06-pause');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // full goal-clear flow: place Pip just before the 1-1 gate and walk in
  await page.evaluate(() => { Main.newRun(); Main.startLevel('1-1'); });
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    const s = Game.state;
    const g = s.room.goals[0];
    s.player.x = g.x * 16 - 60;
    s.player.y = (g.y - 1) * 16;
    s.cam.follow(s.player, true);
  });
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(1500);
  await page.keyboard.up('ArrowRight');
  console.log('goal reached?', await page.evaluate(() => !!Game.state.clearSeq), '/ finished:', await page.evaluate(() => Game.state.finished));
  await shot('06b-clear');
  await page.waitForTimeout(4500);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(2000);
  console.log('after clear:', await state(), '| 1-2 unlocked:', await page.evaluate(() => Save.data.unlocked.includes('1-2')), '| 1-1 cleared:', await page.evaluate(() => Save.data.levels['1-1'] && Save.data.levels['1-1'].clear));
  await shot('06c-map-after-clear');

  // teleport through every level (fresh Run each time to avoid game over)
  const ids = await page.evaluate(() => LEVEL_ORDER);
  for (const id of ids) {
    await page.evaluate((lid) => { Main.newRun(); Main.startLevel(lid); }, id);
    await page.waitForTimeout(1600); // intro
    // brief input to exercise physics/enemies in the level
    await page.keyboard.down('ArrowRight');
    await page.keyboard.down('Space');
    await page.waitForTimeout(700);
    await page.keyboard.up('Space');
    await page.waitForTimeout(900);
    await page.keyboard.up('ArrowRight');
    const info = await page.evaluate(() => ({
      st: Game.state.constructor.name,
      px: Game.state.player ? Math.round(Game.state.player.x) : null,
      boss: Game.state.boss ? Game.state.boss.constructor.name : null,
      ents: Game.state.entities ? Game.state.entities.length : null,
    }));
    console.log(`level ${id}:`, JSON.stringify(info));
    await shot('lvl-' + id);
  }

  // boss fight sanity: let 1-B run for a while
  await page.evaluate(() => { Main.newRun(); Main.startLevel('1-B'); });
  await page.waitForTimeout(4500);
  const bossInfo = await page.evaluate(() => ({
    hp: Game.state.boss && Game.state.boss.hp,
    state: Game.state.boss && Game.state.boss.state,
  }));
  console.log('boss 1-B after 4.5s:', JSON.stringify(bossInfo));
  await shot('boss-1B-active');

  // overworld + credits render
  await page.evaluate(() => Main.toOverworld('1-1'));
  await page.waitForTimeout(600);
  await shot('07-overworld2');
  await page.evaluate(() => Game.setState(new CreditsState()));
  await page.waitForTimeout(1500);
  await shot('08-credits');
  console.log('credits state:', await state());

  // game over flow
  await page.evaluate(() => { Main.newRun(); Run.lives = 1; Main.startLevel('1-1'); });
  await page.waitForTimeout(1500);
  await page.evaluate(() => Game.state.player.die(false));
  await page.waitForTimeout(2500);
  console.log('after death with 1 life:', await state());
  await shot('09-gameover');

  await browser.close();

  console.log('\n---- errors/warnings ----');
  if (!errors.length) console.log('(none)');
  else errors.forEach(e => console.log(e));
  process.exit(errors.filter(e => e.includes('pageerror') || e.includes('console.error')).length ? 1 : 0);
})().catch(e => { console.error('TEST DRIVER FAILED:', e); process.exit(2); });

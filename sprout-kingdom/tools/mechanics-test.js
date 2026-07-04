#!/usr/bin/env node
// Focused mechanics tests: stomp, block bump, power-up, shell kick, damage,
// spin-hop brick break, Moss mount. Drives the real game via page.evaluate.
// Usage: NODE_PATH=$(npm root -g) node tools/mechanics-test.js

const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://localhost:8377/sprout-kingdom/index.html');
  await page.waitForTimeout(1000);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);

  const results = [];
  const check = (name, ok, extra = '') => {
    results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  (' + extra + ')' : ''}`);
  };

  const freshLevel = async (id) => {
    await page.evaluate((lid) => { Main.newRun(); Main.startLevel(lid); }, id);
    await page.waitForTimeout(1400);
  };

  // ---- 1. stomp a bumble ----
  await freshLevel('1-1');
  let r = await page.evaluate(async () => {
    const s = Game.state;
    const bumble = s.entities.find(e => e.constructor.name === 'Bumble');
    bumble.active = true;
    const p = s.player;
    p.x = bumble.x + 1; p.y = bumble.y - 40; p.vy = 2;
    const score0 = Run.score;
    await new Promise(res => setTimeout(res, 500));
    return { dying: bumble.dying || bumble.removed, bounced: p.vy < 0 || p.y < bumble.y - 20, score: Run.score - score0, alive: !p.dead };
  });
  check('stomp bumble kills it', r.dying, JSON.stringify(r));
  check('stomp gives score + no damage', r.score > 0 && r.alive);

  // ---- 2. bump a coin block ----
  r = await page.evaluate(async () => {
    const s = Game.state;
    // find a QCOIN tile
    let bx = -1, by = -1;
    outer: for (let y = 0; y < s.room.h; y++) for (let x = 0; x < s.room.w; x++) {
      if (s.room.grid[y][x] === T.QCOIN) { bx = x; by = y; break outer; }
    }
    const p = s.player;
    const coins0 = Run.coins;
    p.x = bx * 16 + 2; p.y = (by + 1) * 16 + 4; p.vy = -5; p.vx = 0;
    await new Promise(res => setTimeout(res, 400));
    return { tile: s.room.grid[by][bx], used: s.room.grid[by][bx] === T.USED, coins: Run.coins - coins0 };
  });
  check('head bump turns ? block to used + coin', r.used && r.coins === 1, JSON.stringify(r));

  // ---- 3. power block gives fruit; collecting grows Pip ----
  r = await page.evaluate(async () => {
    const s = Game.state;
    let bx = -1, by = -1;
    outer: for (let y = 0; y < s.room.h; y++) for (let x = 0; x < s.room.w; x++) {
      if (s.room.grid[y][x] === T.QPOWER) { bx = x; by = y; break outer; }
    }
    const p = s.player;
    p.x = bx * 16 + 2; p.y = (by + 1) * 16 + 4; p.vy = -5; p.vx = 0;
    await new Promise(res => setTimeout(res, 700));
    const item = s.entities.find(e => e.constructor.name === 'PowerItem');
    if (!item) return { item: false };
    // catch the fruit wherever it went
    p.x = item.x; p.y = item.y - 4; p.vx = 0; p.vy = 0;
    await new Promise(res => setTimeout(res, 500));
    return { item: true, power: p.power, big: p.big, h: p.h };
  });
  check('M block spawns power item; Pip grows', r.item && r.power === 1 && r.h === 24, JSON.stringify(r));

  // ---- 4. damage: big -> small with invuln; then small dies ----
  r = await page.evaluate(async () => {
    const s = Game.state, p = s.player;
    const lives0 = Run.lives;
    p.damage();
    const afterHit = { power: p.power, inv: p.invuln > 0 };
    p.invuln = 0;
    p.damage();
    await new Promise(res => setTimeout(res, 100));
    return { ...afterHit, dead: p.dead, seq: !!s.deathSeq, lives0, lives: Run.lives };
  });
  check('damage shrinks then kills', r.power === 0 && r.inv && r.dead && r.seq, JSON.stringify(r));

  // ---- 5. snapcap -> shell -> kick chain ----
  await freshLevel('1-2');
  r = await page.evaluate(async () => {
    const s = Game.state, p = s.player;
    const cap = s.entities.find(e => e.constructor.name === 'Snapcap');
    cap.active = true;
    p.x = cap.x + 1; p.y = cap.y - 30; p.vy = 2;
    // poll for the moment of the stomp, then move Pip clear to observe 'idle'
    let shellState = null;
    for (let i = 0; i < 60; i++) {
      await new Promise(res => setTimeout(res, 16));
      if (cap.state !== 'walk') { shellState = cap.state; p.x = cap.x - 60; p.vy = 0; break; }
    }
    await new Promise(res => setTimeout(res, 200));
    const idleHeld = cap.state;
    // kick it: approach from the left
    p.x = cap.x - 14; p.y = cap.y; p.vx = 1;
    await new Promise(res => setTimeout(res, 300));
    return { shellState, idleHeld, kicked: cap.state, vx: Math.round(cap.vx * 10) / 10, alive: !p.dead };
  });
  check('stomp snapcap -> shell', r.shellState === 'idle', JSON.stringify(r));
  check('touch idle shell -> kick slide', r.kicked === 'sliding' && Math.abs(r.vx) > 2 && r.alive);

  // ---- 6. spin-hop breaks brick below ----
  await freshLevel('1-1');
  r = await page.evaluate(async () => {
    const s = Game.state, p = s.player;
    let bx = -1, by = -1;
    outer: for (let y = 0; y < s.room.h; y++) for (let x = 0; x < s.room.w; x++) {
      if (s.room.grid[y][x] === T.BRICK) { bx = x; by = y; break outer; }
    }
    p.x = bx * 16 + 2; p.y = by * 16 - 60; p.vy = 0;
    p.spinning = true; // as if mid spin-hop
    await new Promise(res => setTimeout(res, 600));
    return { tile: s.room.grid[by][bx], broke: s.room.grid[by][bx] === T.EMPTY };
  });
  check('spin landing breaks brick', r.broke, JSON.stringify(r));

  // ---- 7. Moss: bump E block, mount ----
  await freshLevel('1-3');
  r = await page.evaluate(async () => {
    const s = Game.state, p = s.player;
    let bx = -1, by = -1;
    outer: for (let y = 0; y < s.room.h; y++) for (let x = 0; x < s.room.w; x++) {
      if (s.room.grid[y][x] === T.QMOSS) { bx = x; by = y; break outer; }
    }
    p.x = bx * 16 + 2; p.y = (by + 1) * 16 + 4; p.vy = -5;
    await new Promise(res => setTimeout(res, 900));
    const moss = s.entities.find(e => e.constructor.name === 'MossEnt');
    if (!moss) return { moss: false };
    p.x = moss.x; p.y = moss.y - 2;
    await new Promise(res => setTimeout(res, 400));
    return { moss: true, riding: p.riding, h: p.h };
  });
  check('E block spawns Moss; touching mounts', r.moss && r.riding, JSON.stringify(r));

  // ---- 8. seed projectile kills enemy (Blossom Pip) ----
  await freshLevel('1-1');
  r = await page.evaluate(async () => {
    const s = Game.state, p = s.player;
    p.setPower(2, true);
    const bumble = s.entities.find(e => e.constructor.name === 'Bumble');
    bumble.active = true;
    p.x = bumble.x - 60; p.y = bumble.y - 10; p.dir = 1;
    s.throwSeed(p);
    await new Promise(res => setTimeout(res, 900));
    return { dead: bumble.dying || bumble.removed };
  });
  check('seed projectile kills enemy', r.dead, JSON.stringify(r));

  // ---- 9. timer death + checkpoint respawn ----
  await freshLevel('1-1');
  r = await page.evaluate(async () => {
    const s = Game.state, p = s.player;
    // touch checkpoint
    const flag = s.entities.find(e => e.constructor.name === 'CheckpointFlag');
    flag.active = true;
    p.x = flag.x; p.y = flag.y;
    await new Promise(res => setTimeout(res, 200));
    const cpSet = !!s.checkpoint;
    p.die(false);
    await new Promise(res => setTimeout(res, 2600));
    const ns = Game.state;
    return { cpSet, lives: Run.lives, respawnX: ns.player ? Math.round(ns.player.x) : -1, flagX: Math.round(flag.x) };
  });
  check('checkpoint set + respawn at flag', r.cpSet && Math.abs(r.respawnX - r.flagX) < 30, JSON.stringify(r));

  // ---- 10. drop through a one-way platform (Down + jump) ----
  await freshLevel('1-1');
  r = await page.evaluate(async () => {
    const s = Game.state, p = s.player;
    let bx = -1, by = -1;
    outer: for (let y = 0; y < s.room.h; y++) for (let x = 0; x < s.room.w; x++) {
      if (s.room.grid[y][x] === T.PLATFORM) { bx = x; by = y; break outer; }
    }
    if (bx < 0) return { plat: false };
    p.x = bx * 16 + 2; p.y = by * 16 - p.h; p.vx = 0; p.vy = 0;
    await new Promise(res => setTimeout(res, 150));
    const onTop = p.onGround && p.onOneWay;
    Input.held.down = true;
    p.jumpBuf = 6;
    await new Promise(res => setTimeout(res, 250));
    Input.held.down = false;
    return { plat: true, onTop, droppedTo: Math.round(p.y - by * 16) };
  });
  check('down+jump drops through one-way', r.plat && r.onTop && r.droppedTo > 4, JSON.stringify(r));

  // ---- 11. P-meter charges at full run and extends glider soar ----
  await freshLevel('1-1');
  r = await page.evaluate(async () => {
    const s = Game.state, p = s.player;
    p.damage = () => {};
    p.setPower(3, true); // glider
    const x0 = p.x;
    Input.held.right = true; Input.held.run = true;
    for (let i = 0; i < 260; i++) {
      await new Promise(res => setTimeout(res, 8));
      if (p.pFull) break;
      if (p.x > x0 + 90) { p.x = x0; } // treadmill: stay on the flat runway
    }
    const full = p.pFull, meter = p.pspeed;
    p.vx = 2.6;
    p.doJump(false);
    const soar = p.soar;
    Input.held.right = false; Input.held.run = false;
    return { full, meter, soar };
  });
  check('P-meter fills at full run; soar extends', r.full && r.soar >= 120, JSON.stringify(r));

  // ---- 12. boss takes stomp damage ----
  await freshLevel('1-B');
  r = await page.evaluate(async () => {
    const s = Game.state, p = s.player;
    const b = s.boss;
    b.introT = 0;
    b.setState('walk');
    const hp0 = b.hp;
    p.x = b.cx - p.w / 2; p.y = b.y - 40; p.vy = 3; p.invuln = 0;
    await new Promise(res => setTimeout(res, 500));
    return { hp0, hp: b.hp, state: b.state };
  });
  check('stomping boss deals damage', r.hp === r.hp0 - 1, JSON.stringify(r));

  await browser.close();
  console.log(results.join('\n'));
  console.log('\nerrors:', errors.length ? errors : '(none)');
  process.exit(results.some(r => r.startsWith('FAIL')) || errors.length ? 1 : 0);
})().catch(e => { console.error('DRIVER FAILED:', e); process.exit(2); });

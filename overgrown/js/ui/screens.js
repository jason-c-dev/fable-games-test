// Game flow: title / overworld / level / pause / game over / shrine, with
// circle-wipe transitions. Owns which sim (if any) is stepping.

import { Container, Graphics, Sprite } from 'pixi.js';
import { VIEW_W, VIEW_H, UPGRADES, WORLD_NAMES } from '../config.js';
import { TEX, cnv, toTex, lin, rad, glowTex } from '../render/gfx.js';
import { makeText } from '../render/hud.js';
import { OverworldScreen, MAP_NODE_BY_ID } from './overworld.js';
import { saveGame, clearSave } from '../core/save.js';
import { clamp } from '../core/math.js';
import { ScriptedInput } from '../core/input.js';

// circle-wipe texture: opaque black ring with a transparent center hole,
// scaled huge->0 to close and 0->huge to open
function wipeTex() {
  const [c, x] = cnv(128, 128);
  x.fillStyle = '#060a08';
  x.fillRect(0, 0, 128, 128);
  x.globalCompositeOperation = 'destination-out';
  x.fillStyle = rad(x, 64, 64, 30, [['0', 'rgba(255,255,255,1)'], ['0.92', 'rgba(255,255,255,1)'], ['1', 'rgba(255,255,255,0)']]);
  x.beginPath(); x.arc(64, 64, 30, 0, 7); x.fill();
  return toTex(c);
}

function logoTexture() {
  const [c, x] = cnv(320, 120);
  x.textAlign = 'center';
  // vine flourish
  x.strokeStyle = '#5a9e3d'; x.lineWidth = 2.4; x.lineCap = 'round';
  x.beginPath(); x.moveTo(30, 88);
  x.bezierCurveTo(90, 100, 230, 100, 290, 86);
  x.stroke();
  for (const [lx, ly, s, a] of [[44, 92, 7, -0.6], [120, 97, 6, 0.4], [206, 97, 7, -0.4], [274, 90, 6, 0.5]]) {
    x.save(); x.translate(lx, ly); x.rotate(a);
    x.fillStyle = '#8fce58';
    x.beginPath(); x.moveTo(0, 0); x.quadraticCurveTo(s, -s * 0.8, s * 2, 0); x.quadraticCurveTo(s, s * 0.5, 0, 0); x.closePath(); x.fill();
    x.restore();
  }
  // SPROUT KINGDOM
  x.font = '900 34px Trebuchet MS, Verdana, sans-serif';
  x.lineJoin = 'round';
  x.strokeStyle = '#1d3a1e'; x.lineWidth = 7;
  x.strokeText('SPROUT KINGDOM', 160, 52);
  const g = x.createLinearGradient(0, 20, 0, 56);
  g.addColorStop(0, '#f8ffdd'); g.addColorStop(0.5, '#bde26e'); g.addColorStop(1, '#66aa3c');
  x.fillStyle = g;
  x.fillText('SPROUT KINGDOM', 160, 52);
  // OVERGROWN — thorny banner
  x.font = '900 26px Trebuchet MS, Verdana, sans-serif';
  x.strokeStyle = '#2e1216'; x.lineWidth = 6;
  x.strokeText('OVERGROWN', 160, 86);
  const g2 = x.createLinearGradient(0, 64, 0, 92);
  g2.addColorStop(0, '#ffb98a'); g2.addColorStop(0.55, '#e5533a'); g2.addColorStop(1, '#7e1f1e');
  x.fillStyle = g2;
  x.fillText('OVERGROWN', 160, 86);
  // thorn accents
  x.fillStyle = '#2e1216';
  for (const [tx2, ty2, fl] of [[52, 78, 1], [268, 78, -1]]) {
    x.beginPath(); x.moveTo(tx2, ty2);
    x.quadraticCurveTo(tx2 - 10 * fl, ty2 - 4, tx2 - 14 * fl, ty2 - 12);
    x.quadraticCurveTo(tx2 - 7 * fl, ty2 - 6, tx2, ty2 - 3);
    x.closePath(); x.fill();
  }
  return toTex(c);
}

function lerpColor(a, b, t) {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return ((ar + (br - ar) * t) << 16) | (((ag + (bg - ag) * t) | 0) << 8) | ((ab + (bb - ab) * t) | 0);
}

class Menu {
  constructor(items, opts = {}) {
    this.c = new Container();
    this.items = items;          // [{label, cb, disabled?}]
    this.idx = 0;
    this.texts = [];
    this.size = opts.size || 10;
    this.gap = opts.gap || 16;
    for (let i = 0; i < items.length; i++) {
      const t = makeText(items[i].label, this.size, { anchor: 0.5 });
      t.y = i * this.gap;
      this.c.addChild(t);
      this.texts.push(t);
    }
    this.cursor = makeText('❯', this.size, { anchor: 0.5, fill: 0xffd76e });
    this.c.addChild(this.cursor);
    this.t = 0;
  }
  setLabel(i, label) { this.texts[i].text = label; }
  step(inp, sfx) {
    this.t++;
    if (inp.pressed.down) { this.idx = (this.idx + 1) % this.items.length; sfx?.('uimove'); }
    if (inp.pressed.up) { this.idx = (this.idx + this.items.length - 1) % this.items.length; sfx?.('uimove'); }
    for (let i = 0; i < this.texts.length; i++) {
      const sel = i === this.idx;
      this.texts[i].style.fill = this.items[i].disabled ? 0x777768 : sel ? 0xffffff : 0xc8d8c0;
      this.texts[i].scale.set(sel ? 1.08 + Math.sin(this.t * 0.12) * 0.02 : 1);
    }
    this.cursor.position.set(this.texts[this.idx].x - this.texts[this.idx].width / 2 - 10, this.texts[this.idx].y);
    if (inp.pressed.confirm || inp.pressed.jump) {
      const it = this.items[this.idx];
      if (!it.disabled) { sfx?.('uiok'); it.cb?.(); }
      else sfx?.('uibad');
    }
  }
}

export class Flow {
  constructor({ app, input, renderer, hud, run, settings, startLevel, quitToTitle }) {
    this.app = app;
    this.input = input;
    this.renderer = renderer;
    this.hud = hud;
    this.run = run;
    this.settings = settings;
    this.startLevelCb = startLevel;
    this.mode = 'title';
    this.paused = false;
    this.onSfx = null;             // audio hook: (name) => {}
    this.onMode = null;            // audio hook: (mode, data) => {}

    this.root = new Container();   // screen-space UI root (over HUD)
    this.wipeSpr = new Sprite(wipeTex());
    this.wipeSpr.anchor.set(0.5);
    this.wipeSpr.position.set(VIEW_W / 2, VIEW_H / 2);
    this.wipeSpr.visible = false;
    this.wipe = null;              // {phase:'out'|'in', t, cb}

    this.overworld = new OverworldScreen(input, run);
    this.buildTitle();
    this.buildPause();
    this.buildGameOver();
    this.buildShrine();
    this.buildVictory();
    this.buildCredits();
    this.buildSettings();
    this.buildAttract();

    this.root.addChild(this.titleC, this.overworld.c, this.pauseC, this.gameOverC,
      this.shrineC, this.victoryC, this.creditsC, this.settingsC, this.attractC, this.wipeSpr);
    this.setMode('title');
    this.onSettingsChanged = null;
    this.idleT = 0;
  }

  sfx(name) { this.onSfx?.(name); }

  // ------------------------------------------------------------- screens --
  buildTitle() {
    const c = this.titleC = new Container();
    const bgG = new Graphics();
    bgG.rect(0, 0, VIEW_W, VIEW_H).fill({ color: 0x0a1408, alpha: 0.0 });
    c.addChild(bgG);

    this.logo = new Sprite(logoTexture());
    this.logo.anchor.set(0.5, 0.5);
    this.logo.width = 320; this.logo.height = 120;
    this.logo.position.set(VIEW_W / 2, 86);
    c.addChild(this.logo);

    this.titleMenu = new Menu([
      { label: 'START', cb: () => this.newGame() },
      { label: 'CONTINUE', cb: () => this.continueGame() },
      { label: 'TRAINING GROVE', cb: () => this.enterLevel('gym') },
      { label: 'SETTINGS', cb: () => this.openSettings('title') },
    ], { gap: 17 });
    this.titleMenu.c.position.set(VIEW_W / 2, 182);
    c.addChild(this.titleMenu.c);

    this.titleHint = makeText('ARROWS/WASD move · SPACE jump · X sword · C dash · V parry', 6.5, { anchor: 0.5, fill: 0xbcd4b0 });
    this.titleHint.position.set(VIEW_W / 2, VIEW_H - 14);
    c.addChild(this.titleHint);

    this.titleT = 0;
  }

  buildPause() {
    const c = this.pauseC = new Container();
    const dim = new Graphics();
    dim.rect(0, 0, VIEW_W, VIEW_H).fill({ color: 0x060a08, alpha: 0.68 });
    c.addChild(dim);
    const t = makeText('PAUSED', 16, { anchor: 0.5 });
    t.position.set(VIEW_W / 2, 84);
    c.addChild(t);
    this.pauseMenu = new Menu([
      { label: 'RESUME', cb: () => this.togglePause(false) },
      { label: 'RESTART LEVEL', cb: () => { this.togglePause(false); this.enterLevel(this.run.currentLevel, { keepCheckpoint: true }); } },
      { label: 'SETTINGS', cb: () => this.openSettings('paused') },
      { label: 'EXIT TO MAP', cb: () => { this.togglePause(false); this.toOverworld(); } },
    ]);
    this.pauseMenu.c.position.set(VIEW_W / 2, 136);
    c.addChild(this.pauseMenu.c);
    c.visible = false;
  }

  buildGameOver() {
    const c = this.gameOverC = new Container();
    const dim = new Graphics();
    dim.rect(0, 0, VIEW_W, VIEW_H).fill({ color: 0x120608, alpha: 0.85 });
    c.addChild(dim);
    const t = makeText('THE KINGDOM WILTS…', 15, { anchor: 0.5, fill: 0xff9a8a });
    t.position.set(VIEW_W / 2, 92);
    c.addChild(t);
    this.gameOverMenu = new Menu([
      { label: 'CONTINUE (5 SPROUTS)', cb: () => this.continueAfterGameOver() },
      { label: 'BACK TO TITLE', cb: () => this.toTitle() },
    ]);
    this.gameOverMenu.c.position.set(VIEW_W / 2, 148);
    c.addChild(this.gameOverMenu.c);
    c.visible = false;
  }

  buildShrine() {
    const c = this.shrineC = new Container();
    const dim = new Graphics();
    dim.rect(0, 0, VIEW_W, VIEW_H).fill({ color: 0x140a20, alpha: 0.88 });
    c.addChild(dim);
    this.shrineTitle = makeText('UPGRADE SHRINE', 14, { anchor: 0.5, fill: 0xe0c8ff });
    this.shrineTitle.position.set(VIEW_W / 2, 40);
    c.addChild(this.shrineTitle);
    this.shrineStars = makeText('', 9, { anchor: 0.5, fill: 0x9fe8ff });
    this.shrineStars.position.set(VIEW_W / 2, 58);
    c.addChild(this.shrineStars);
    this.shrineDesc = makeText('', 7.5, { anchor: 0.5, fill: 0xd8d8c8 });
    this.shrineDesc.position.set(VIEW_W / 2, VIEW_H - 34);
    c.addChild(this.shrineDesc);
    this.shrineMenuHolder = new Container();
    this.shrineMenuHolder.position.set(VIEW_W / 2, 84);
    c.addChild(this.shrineMenuHolder);
    const hint = makeText('ESC: back to map', 7, { anchor: 0.5, fill: 0x9a8ab0 });
    hint.position.set(VIEW_W / 2, VIEW_H - 16);
    c.addChild(hint);
    c.visible = false;
  }

  refreshShrine() {
    this.shrineMenuHolder.removeChildren();
    const entries = Object.entries(UPGRADES).map(([key, u]) => {
      const owned = !!this.run.upgrades[key];
      const lockedBelow = u.needs && !this.run.upgrades[u.needs];
      return {
        label: owned ? `✓ ${u.name}` : `${u.name} — ${u.cost}✦`,
        disabled: owned || lockedBelow || !this.run.canBuy(key),
        key, desc: u.desc,
        cb: () => {
          if (this.run.buy(key)) {
            this.sfx('shrinebuy');
            saveGame(this.run, this.settings);
            this.refreshShrine();
          }
        },
      };
    });
    entries.push({ label: 'LEAVE', cb: () => this.toOverworld(), desc: 'Back to the map.' });
    this.shrineMenu = new Menu(entries, { size: 8.5, gap: 13 });
    this.shrineMenuHolder.addChild(this.shrineMenu.c);
  }

  buildVictory() {
    const c = this.victoryC = new Container();
    const bg = new Graphics();
    bg.rect(0, 0, VIEW_W, VIEW_H).fill(0x1a1208);
    // dawn gradient bands
    for (let i = 0; i < 24; i++) {
      const t = i / 24;
      const col = lerpColor(0x2b1013, 0xffd76e, t * t);
      bg.rect(0, VIEW_H - (i + 1) * (VIEW_H / 24), VIEW_W, VIEW_H / 24 + 1).fill({ color: col, alpha: 0.9 });
    }
    c.addChild(bg);
    this.victoryText = makeText('', 11, { anchor: 0.5, align: 'center' });
    this.victoryText.position.set(VIEW_W / 2, VIEW_H / 2 - 20);
    c.addChild(this.victoryText);
    this.victorySub = makeText('', 7, { anchor: 0.5, fill: 0xffe9b8 });
    this.victorySub.position.set(VIEW_W / 2, VIEW_H - 22);
    c.addChild(this.victorySub);
    c.visible = false;
    this.victoryBeats = [
      'The Thorn Blade finds the seam in the armor…\nand the stolen light goes free.',
      'Six Sun Seeds rise out of the bramble,\nand the Kingdom takes a breath.',
      'Pip plants the blade in the soft earth.\nLet the wild green grow kind again.',
    ];
    this.victoryIdx = 0;
    this.victoryT = 0;
  }

  buildCredits() {
    const c = this.creditsC = new Container();
    this.creditLines = [
      'SPROUT KINGDOM: OVERGROWN', '',
      'STARRING',
      'PIP — the Sprout Knight',
      'MOSS — the loyal steed', '',
      'THE WILD CAST',
      'Bumbles · Snapcaps · Spikelets',
      'Puffhawks · Lobbers · Wisps · Pods',
      'Shell-Wardens · Thorn Duelists · Glintwings', '',
      'THE COURT',
      'King Snapjaw', 'Grubmaw', 'Zephyra the Gale Matron',
      'GENERAL BRAMBLE', '',
      'CODE · ART · MUSIC · LEVELS',
      'Claude', '',
      'grown from a prompt in ~/dev/sprout-kingdom', '',
      'THANK YOU FOR PLAYING',
    ];
    this.creditTexts = [];
    let y = 0;
    for (const line of this.creditLines) {
      const big = line === line.toUpperCase() && line.length > 3;
      const t = makeText(line, big ? 9 : 7.5, { anchor: [0.5, 0], fill: big ? 0xffd76e : 0xffffff });
      t.position.set(VIEW_W / 2, y);
      y += line === '' ? 10 : big ? 16 : 12;
      c.addChild(t);
      this.creditTexts.push(t);
    }
    this.creditsHeight = y;
    c.visible = false;
    this.creditsInput = new ScriptedInput();
    this._creditsJumpT = 0;
    this._creditsSkipT = 0;
  }

  buildSettings() {
    const c = this.settingsC = new Container();
    const dim = new Graphics();
    dim.rect(0, 0, VIEW_W, VIEW_H).fill({ color: 0x0a1210, alpha: 0.92 });
    c.addChild(dim);
    const title = makeText('SETTINGS', 14, { anchor: 0.5 });
    title.position.set(VIEW_W / 2, 34);
    c.addChild(title);
    this.settingsRows = new Container();
    this.settingsRows.position.set(VIEW_W / 2, 62);
    c.addChild(this.settingsRows);
    this.settingsHint = makeText('◂ ▸ adjust · ENTER rebind · ESC back', 7, { anchor: 0.5, fill: 0x9ab8a0 });
    this.settingsHint.position.set(VIEW_W / 2, VIEW_H - 14);
    c.addChild(this.settingsHint);
    this.settingsIdx = 0;
    this.capturing = null;
    c.visible = false;
  }

  settingsItems() {
    const s = this.settings;
    const bar = (v) => '▮'.repeat(Math.round(v * 10)) + '▯'.repeat(10 - Math.round(v * 10));
    const items = [
      { label: () => `MUSIC   ${bar(s.musicVol)}`, adjust: (d) => { s.musicVol = clamp(Math.round((s.musicVol + d * 0.1) * 10) / 10, 0, 1); } },
      { label: () => `SFX     ${bar(s.sfxVol)}`, adjust: (d) => { s.sfxVol = clamp(Math.round((s.sfxVol + d * 0.1) * 10) / 10, 0, 1); } },
      { label: () => `MUTE            ${s.mute ? 'ON' : 'OFF'}`, adjust: () => { s.mute = !s.mute; } },
      { label: () => `SCREEN SHAKE    ${['OFF', 'HALF', 'FULL'][[0, 0.5, 1].indexOf(s.shake)]}`, adjust: (d) => { const o = [0, 0.5, 1]; s.shake = o[clamp(o.indexOf(s.shake) + d, 0, 2)]; } },
      { label: () => `REDUCED FLASH   ${s.reducedFlash ? 'ON' : 'OFF'}`, adjust: () => { s.reducedFlash = !s.reducedFlash; } },
    ];
    for (const action of ['jump', 'attack', 'dash', 'parry', 'beam', 'special']) {
      items.push({
        label: () => `${action.toUpperCase().padEnd(8)}${this.capturing === action ? 'PRESS A KEY…' : this.input.promptFor(action)}`,
        rebind: action,
      });
    }
    items.push({ label: () => 'BACK', back: true });
    return items;
  }

  openSettings(returnTo) {
    this.settingsReturn = returnTo;
    this.setMode('settings');
    if (returnTo === 'paused') { this.hud.c.visible = true; }
    this.settingsIdx = 0;
    this.refreshSettings();
  }

  refreshSettings() {
    this._settingsList = this.settingsItems();
    this.settingsRows.removeChildren();
    this._settingsTexts = [];
    this._settingsList.forEach((it, i) => {
      const t = makeText(it.label(), 8.5, { anchor: 0.5 });
      t.y = i * 14;
      this.settingsRows.addChild(t);
      this._settingsTexts.push(t);
    });
  }

  closeSettings() {
    this.settings.keys = this.input.bindings;
    this.onSettingsChanged?.();
    saveGame(this.run, this.settings);
    if (this.settingsReturn === 'paused') {
      this.setMode('level');
      this.paused = true;
      this.pauseC.visible = true;
    } else {
      this.setMode('title');
    }
  }

  buildAttract() {
    const c = this.attractC = new Container();
    this.attractText = makeText('DEMO — PRESS ANY KEY', 10, { anchor: 0.5, fill: 0xffd76e });
    this.attractText.position.set(VIEW_W / 2, 30);
    c.addChild(this.attractText);
    c.visible = false;
    this.attractInput = new ScriptedInput();
    this._attractJumpT = 0;
    this._attractT = 0;
  }

  startAttract() {
    this.startWipe(() => {
      this.startLevelCb('gym', {});
      this.setMode('attract');
      this.attractC.visible = true;
      this.hud.c.visible = true;
    });
  }

  attractPoll(world) {
    const p = world.player;
    p.invuln = 10;
    this.run.hearts = this.run.maxHearts;
    this._attractT++;
    let held = { right: true };
    this._attractJumpT--;
    // stuck against a wall: back up for a run-up, then leap with jump HELD —
    // jumping flush against a face has no lateral momentum and wall-slides
    // straight back down
    if (this._attractPhase === 'quick') {
      // in-stride hop: clears steps and pit rims without losing ground
      held = { right: true, jump: true };
      if (--this._attractPhaseT <= 0) this._attractPhase = null;
    } else if (this._attractPhase === 'backup') {
      held = { left: true };
      if (--this._attractPhaseT <= 0) { this._attractPhase = 'leap'; this._attractPhaseT = 40; }
    } else if (this._attractPhase === 'leap') {
      // sprint first, then jump held — a standstill hop can't clear tall walls
      held = this._attractPhaseT > 24 ? { right: true } : { right: true, jump: true };
      if (--this._attractPhaseT <= 0) this._attractPhase = null;
    } else if (p.onGround && Math.abs(p.vx) < 0.3 && p.state !== 'wallslide' && this._attractJumpT <= 0) {
      // stuck twice at the same spot? take a run-up. Otherwise just hop.
      const sameSpot = Math.abs(p.x - (this._lastStuckX ?? -9999)) < 14;
      this._lastStuckX = p.x;
      this._attractPhase = sameSpot ? 'backup' : 'quick';
      this._attractPhaseT = sameSpot ? 26 : 18;
      this._attractJumpT = 45;
    }
    // hanging on a ledge: climb it
    if (p.state === 'ledge' && this._attractT % 16 < 3) held.jump = true;
    // falling with a dash in pocket? use it — this is how gaps get crossed
    if (!p.onGround && p.vy > 0.5 && !p.airDashUsed && this._attractT % 4 === 0) {
      held.dash = true;
    }
    if (p.swim && this._attractT % 18 < 2) held.jump = true;   // strokes
    if (this._attractT % 120 < 2 && this._attractPhase == null) held.attack = true;
    this.attractInput.feed(held);
    return this.attractInput.poll();
  }

  startVictory() {
    this.sfx('bossdead');
    this.victoryIdx = 0;
    this.victoryT = 0;
    this.startWipe(() => {
      this.setMode('victory');
      this.victoryText.text = this.victoryBeats[0];
      this.victorySub.text = '';
      this.onSfxScene?.('victory');
    });
  }

  startCredits() {
    this.startWipe(() => {
      this.startLevelCb('parade', {});
      this.creditsC.visible = true;
      this.creditsC.y = VIEW_H + 10;
      this.setMode('credits');
      this.run.gameCompleted = true;
      saveGame(this.run, this.settings);
    });
  }

  // autopilot for the parade: walk right, hop obstacles, no harm done
  creditsPoll(world) {
    const p = world.player;
    p.invuln = 10;
    this.run.hearts = this.run.maxHearts;
    for (const e of world.entities) {
      if (e.isEnemy) e.harmful = false;
      if (e.isProjectile) e.removed = true;
    }
    const held = { right: true };
    this._creditsJumpT--;
    if (this._creditsHold > 0) {
      this._creditsHold -= 1;
      held.jump = true;
    }
    if (p.onGround && Math.abs(p.vx) < 0.3 && this._creditsJumpT <= 0) {
      held.jump = true;
      this._creditsHold = 20;
      this._creditsJumpT = 34;
    }
    this.creditsInput.feed(held);
    return this.creditsInput.poll();
  }

  // ---------------------------------------------------------------- flow --
  setMode(mode, data) {
    this.mode = mode;
    this.titleC.visible = mode === 'title';
    this.overworld.c.visible = mode === 'overworld';
    this.shrineC.visible = mode === 'shrine';
    this.gameOverC.visible = mode === 'gameover';
    this.victoryC.visible = mode === 'victory';
    this.settingsC.visible = mode === 'settings';
    if (mode !== 'credits') this.creditsC.visible = false;
    if (mode !== 'attract') this.attractC.visible = false;
    this.pauseC.visible = false;
    this.paused = false;
    this.hud.c.visible = mode === 'level';
    if (mode === 'overworld') { this.overworld.build(); this.overworld.draw(); }
    this.onMode?.(mode, data);
  }

  startWipe(cb) {
    if (this.wipe) return;
    this.wipe = { phase: 'out', t: 0, cb };
    this.wipeSpr.visible = true;
  }

  stepWipe(dt) {
    if (!this.wipe) return;
    const w = this.wipe;
    w.t += dt;
    const D = 22;
    if (w.phase === 'out') {
      const k = clamp(w.t / D, 0, 1);
      const s = (1 - k) * 14 + 0.001;
      this.wipeSpr.scale.set(s);
      if (k >= 1) {
        w.cb?.();
        w.phase = 'in'; w.t = 0;
      }
    } else {
      const k = clamp(w.t / D, 0, 1);
      this.wipeSpr.scale.set(k * 14 + 0.001);
      if (k >= 1) { this.wipeSpr.visible = false; this.wipe = null; }
    }
  }

  newGame() {
    clearSave();
    this.run.reset?.();
    this.startWipe(() => {
      this.resetRunHard();
      this.toOverworldNow();
    });
  }

  resetRunHard() {
    // fresh Run fields without replacing the object identity
    const fresh = new this.run.constructor();
    for (const k of Object.keys(fresh)) this.run[k] = fresh[k];
  }

  continueGame() {
    this.startWipe(() => this.toOverworldNow());
  }

  continueAfterGameOver() {
    this.run.lives = 5;
    this.startWipe(() => {
      this.setMode('overworld');
    });
  }

  toTitle() { this.startWipe(() => this.setMode('title')); }
  toOverworld() { this.startWipe(() => this.toOverworldNow()); }
  toOverworldNow() {
    this.overworld.build();
    this.overworld.onPick = (n) => {
      if (!this.run.unlocked.includes(n.id)) { this.sfx('uibad'); return; }
      if (n.shrine) {
        this.refreshShrine();
        this.shrineStars.text = `✦ ${this.run.starsAvailable} available`;
        this.setMode('shrine');
      } else {
        this.enterLevel(n.id);
      }
    };
    this.setMode('overworld', { world: MAP_NODE_BY_ID[this.run.mapPos || '1-1']?.world ?? 0 });
    saveGame(this.run, this.settings);
  }

  enterLevel(id, opts = {}) {
    this.startWipe(() => {
      this.startLevelCb(id, opts);
      this.setMode('level', { levelId: id });
    });
  }

  togglePause(on) {
    if (this.mode !== 'level') return;
    this.paused = on ?? !this.paused;
    this.pauseC.visible = this.paused;
    this.sfx(this.paused ? 'pause' : 'unpause');
  }

  // called by main when the sim reports level completion
  levelFinished(world) {
    const def = world.def;
    const secret = world.finished.secret;
    const id = def.id;
    if (id.startsWith('gym')) { this.toTitle(); return; }
    const prev = this.run.cleared[id] || {};
    this.run.cleared[id] = { normal: prev.normal || !secret, secret: prev.secret || secret };
    const unlockNext = (nid) => {
      if (nid && !this.run.unlocked.includes(nid)) this.run.unlocked.push(nid);
    };
    unlockNext(def.next);
    if (secret) unlockNext(def.secretNext);
    // shrines unlock alongside their preceding boss's next
    for (const sid of ['shrine1', 'shrine2', 'shrine3']) {
      const after = { shrine1: '1-B', shrine2: '2-B', shrine3: '3-B' }[sid];
      if (this.run.cleared[after]) unlockNext(sid);
    }
    this.run.mapPos = id;
    this.run.checkpoint = null;
    saveGame(this.run, this.settings);
    if (id === '4-B') {
      this.startVictory();
      return;
    }
    this.toOverworld();
  }

  levelGameOver() {
    this.setMode('gameover');
    this.sfx('gameover');
  }

  // ---------------------------------------------------------------- step --
  // called once per render frame; returns true if the sim should step
  update(dt, world) {
    this.stepWipe(dt);
    if (this.wipe && this.wipe.phase === 'out') return false;

    if (this.mode === 'title') {
      this.titleT = (this.titleT || 0) + dt;
      this.logo.y = 86 + Math.sin(this.titleT * 0.04) * 3;
      this.logo.rotation = Math.sin(this.titleT * 0.025) * 0.012;
      const inp = this.input.poll();
      const anyInput = Object.values(inp.pressed).some(Boolean) || Object.values(inp.held).some(Boolean);
      this.idleT = anyInput ? 0 : this.idleT + dt;
      if (this.idleT > 1050 && !this.wipe) { this.idleT = 0; this.startAttract(); return false; }
      // prompts follow the active device
      this.titleHint.text = this.input.lastDevice === 'pad'
        ? `${this.input.promptFor('jump')} jump · ${this.input.promptFor('attack')} sword · ${this.input.promptFor('dash')} dash · ${this.input.promptFor('parry')} parry`
        : `ARROWS/WASD move · ${this.input.promptFor('jump')} jump · ${this.input.promptFor('attack')} sword · ${this.input.promptFor('dash')} dash · ${this.input.promptFor('parry')} parry`;
      this.titleMenu.step(inp, (n) => this.sfx(n));
      return false;
    }
    if (this.mode === 'settings') {
      const inp = this.input.poll();
      if (this.capturing) return false;          // waiting on key capture
      const list = this._settingsList;
      if (inp.pressed.down) { this.settingsIdx = (this.settingsIdx + 1) % list.length; this.sfx('uimove'); }
      if (inp.pressed.up) { this.settingsIdx = (this.settingsIdx + list.length - 1) % list.length; this.sfx('uimove'); }
      const item = list[this.settingsIdx];
      let changed = false;
      if ((inp.pressed.left || inp.pressed.right) && item.adjust) {
        item.adjust(inp.pressed.right ? 1 : -1);
        changed = true;
        this.sfx('uimove');
        this.onSettingsChanged?.();
      }
      if (inp.pressed.confirm || inp.pressed.jump) {
        if (item.back) { this.closeSettings(); return false; }
        if (item.adjust) { item.adjust(1); changed = true; this.onSettingsChanged?.(); this.sfx('uiok'); }
        if (item.rebind) {
          this.capturing = item.rebind;
          this.refreshSettings();
          this._settingsTexts.forEach((t, i) => t.style.fill = i === this.settingsIdx ? 0xffd76e : 0x889888);
          this.input.startCapture(({ device, code, button }) => {
            if (device === 'kb') this.input.rebindKey(item.rebind, code);
            else this.input.padBindings[item.rebind] = [button];
            this.capturing = null;
            this.settings.keys = this.input.bindings;
            this.onSettingsChanged?.();
            this.refreshSettings();
            this.sfx('uiok');
          });
        }
      }
      if (inp.pressed.back || inp.pressed.pause) { this.closeSettings(); return false; }
      if (changed || this._settingsTexts) {
        this._settingsTexts.forEach((t, i) => {
          t.text = list[i].label();
          t.style.fill = i === this.settingsIdx ? 0xffffff : 0xa8bca8;
          t.scale.set(i === this.settingsIdx ? 1.06 : 1);
        });
      }
      return false;
    }
    if (this.mode === 'attract') {
      this.attractText.alpha = 0.6 + Math.sin((this._attractT || 0) * 0.1) * 0.4;
      // any real key exits
      if (this.input.keysDown.size > 0 && !this.wipe) {
        this.input.keysDown.clear();
        this.toTitle();
        return false;
      }
      if (world && (world.finished || world.gameOver)) {
        if (!this.wipe) this.toTitle();
        return false;
      }
      return true;
    }
    if (this.mode === 'overworld') {
      const inp = this.input.poll();
      this.overworld.step(inp);
      return false;
    }
    if (this.mode === 'shrine') {
      const inp = this.input.poll();
      this.shrineStars.text = `✦ ${this.run.starsAvailable} available`;
      this.shrineMenu.step(inp, (n) => this.sfx(n));
      const sel = this.shrineMenu.items[this.shrineMenu.idx];
      this.shrineDesc.text = sel?.desc || '';
      if (inp.pressed.back || inp.pressed.pause) this.toOverworld();
      return false;
    }
    if (this.mode === 'gameover') {
      const inp = this.input.poll();
      this.gameOverMenu.step(inp, (n) => this.sfx(n));
      return false;
    }
    if (this.mode === 'victory') {
      this.victoryT += dt;
      const inp = this.input.poll();
      const advance = inp.pressed.confirm || inp.pressed.jump || this.victoryT > 300;
      this.victoryText.alpha = Math.min(1, this.victoryT / 40);
      this.victorySub.text = this.victoryT > 90 ? 'ENTER —' : '';
      if (advance) {
        this.victoryIdx++;
        this.victoryT = 0;
        if (this.victoryIdx >= this.victoryBeats.length) {
          this.startCredits();
        } else {
          this.victoryText.text = this.victoryBeats[this.victoryIdx];
        }
      }
      return false;
    }
    if (this.mode === 'credits') {
      // credits roll over the live parade; sim steps via creditsPoll
      this.creditsC.y -= dt * 0.32;
      this._creditsSkipT -= dt;
      const done = this.creditsC.y < -this.creditsHeight - 20;
      let skip = false;
      if (this._creditsSkipT <= 0) {
        for (const code of ['Escape', 'Enter', 'Space']) {
          if (this.input.keysDown.has(code)) { skip = true; this._creditsSkipT = 60; }
        }
      }
      const p = world?.player;
      if (done || skip || (p && p.x > world.room.w * 16 - 40)) {
        this.toTitle();
        return false;
      }
      return true;
    }
    if (this.mode === 'level') {
      if (this.paused) {
        const inp = this.input.poll();
        this.pauseMenu.step(inp, (n) => this.sfx(n));
        if (inp.pressed.pause) this.togglePause(false);
        return false;
      }
      return true;
    }
    return false;
  }
}

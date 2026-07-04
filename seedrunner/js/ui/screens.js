// Flow: every screen in the game — title (with attract demo), run select,
// results, pause, settings + live remap, the trilogy-closing cutscene and
// credits. All DOM; navigable by keyboard, gamepad, and mouse.

import { RUNS, runById } from '../sim/runs.js';
import { VERBS, keyLabel } from '../core/input.js';

const CUTSCENE = [
  'The Last Seed takes root.',
  'The Rot Tide breaks like a wave upon the bloom — and sinks, silent, into the soil.',
  'Six young suns rise over the Seedways, one for every shrine.',
  'General Bramble’s old thorns flower white. The kingdom, at last, breathes easy.',
  'And Pip? Pip keeps running — for the joy of it.',
];

const CREDITS = [
  ['SPROUT KINGDOM', 'header'],
  ['THE TRILOGY', 'sub'],
  ['', ''],
  ['Sprout Kingdom', 'role'], ['a tiny platformer with big parries', 'name'],
  ['Sprout Kingdom: Overgrown', 'role'], ['the kingdom, overgrown and reclaimed', 'name'],
  ['Sprout Kingdom: Seedrunner', 'role'], ['one last run to sow the dawn', 'name'],
  ['', ''],
  ['STARRING', 'sub'],
  ['Pip', 'role'], ['the Sprout of the Kingdom', 'name'],
  ['The Rot Tide', 'role'], ['the dying thorn’s final grasp', 'name'],
  ['The Mosslings', 'role'], ['soft, round, easily delighted', 'name'],
  ['The Shellbacks', 'role'], ['slow of foot, quick to cheer', 'name'],
  ['The Burrs', 'role'], ['spiky on the outside only', 'name'],
  ['The Wisps', 'role'], ['every lantern you ever followed', 'name'],
  ['Grubmaw', 'role'], ['reformed, mostly', 'name'],
  ['General Bramble', 'role'], ['fallen, flowering', 'name'],
  ['', ''],
  ['EVERYTHING ELSE', 'sub'],
  ['Geometry, paint & light', 'role'], ['procedural, every polygon', 'name'],
  ['Music & sound', 'role'], ['synthesized live in Tone.js', 'name'],
  ['Simulation', 'role'], ['a fixed 60 Hz heart, Node-importable', 'name'],
  ['Quality assurance', 'role'], ['a tireless bot with human reflexes', 'name'],
  ['', ''],
  ['Made with Three.js and Tone.js. No assets were harmed', 'name'],
  ['(none were used).', 'name'],
  ['', ''],
  ['Thank you for running the Seedways.', 'role'],
  ['The kingdom remembers.', 'role'],
];

export class Flow {
  constructor({ uiRoot, input, settings, progress, persist }) {
    this.input = input;
    this.settings = settings;
    this.progress = progress;
    this.persist = persist;
    this.mode = 'title';
    this.idleT = 0;
    this.onStartRun = null;
    this.onQuitRun = null;
    this.onSfx = null;
    this.onModeChange = null;
    this.onSettingsChanged = null;
    this._capturing = null;

    this.root = document.createElement('div');
    this.root.id = 'flow';
    uiRoot.appendChild(this.root);
    this._build();

    window.addEventListener('keydown', (e) => this._keyNav(e));
    this.setMode('title');
  }

  // ------------------------------------------------------------- screens --
  _build() {
    this.root.innerHTML = `
      <div class="screen" id="s-title">
        <div class="title-logo"><span class="t1">SPROUT KINGDOM</span><span class="t2">SEEDRUNNER</span></div>
        <div class="menu" id="title-menu"></div>
        <div class="title-foot">the trilogy finale — every leaf, note & thorn made of code</div>
      </div>
      <div class="screen" id="s-select">
        <h2>SOWING RUNS</h2>
        <div class="cards" id="run-cards"></div>
        <div class="menu-row" id="select-extra"></div>
      </div>
      <div class="screen" id="s-settings">
        <h2>SETTINGS</h2>
        <div id="settings-body"></div>
      </div>
      <div class="screen" id="s-results">
        <h2 id="results-title"></h2>
        <div id="results-stats"></div>
        <div class="menu" id="results-menu"></div>
      </div>
      <div class="screen" id="s-paused">
        <h2>PAUSED</h2>
        <div class="menu" id="pause-menu"></div>
      </div>
      <div class="screen" id="s-cutscene"><div id="cutscene-text"></div><div class="hint">press ${'`'}${'`'}</div></div>
      <div class="screen" id="s-credits"><div id="credits-roll"></div></div>
      <div id="attract-banner" hidden>DEMO — press any key</div>`;
    this.root.querySelector('#s-cutscene .hint').textContent = 'press any key';
  }

  setMode(mode, data = {}) {
    this.mode = mode;
    this.idleT = 0;
    for (const s of this.root.querySelectorAll('.screen')) s.classList.remove('active');
    const el = this.root.querySelector('#s-' + mode);
    if (el) el.classList.add('active');
    this.root.querySelector('#attract-banner').hidden = mode !== 'attract';

    if (mode === 'title') this._menu('#title-menu', [
      ['Play', () => this.setMode('select')],
      ...(this.progress.completed.run1 ? [['Endless Seedway', () => this._startEndless()]] : []),
      ['Settings', () => this._openSettings('title')],
      ['Credits', () => this.setMode('credits')],
    ]);
    if (mode === 'select') this._buildSelect();
    if (mode === 'settings') this._buildSettings();
    if (mode === 'results') this._buildResults(data);
    if (mode === 'paused') this._menu('#pause-menu', [
      ['Resume', () => this.togglePause(false)],
      ['Restart Run', () => { this._resume(); this.onStartRun(this.worldDef.id, { fresh: true }); }],
      ['Settings', () => this._openSettings('paused')],
      ['Quit to Runs', () => { this._resume(); this.onQuitRun(); this.setMode('select'); }],
    ]);
    if (mode === 'cutscene') this._startCutscene();
    if (mode === 'credits') this._startCredits();
    this.onModeChange?.(mode);
  }

  get running() { return this.mode === 'run' || this.mode === 'attract'; }

  _menu(sel, items) {
    const host = this.root.querySelector(sel);
    host.innerHTML = '';
    this._buttons = [];
    for (const [label, fn] of items) {
      const b = document.createElement('button');
      b.textContent = label;
      b.addEventListener('click', () => { this.onSfx?.('uiok'); fn(); });
      host.appendChild(b);
      this._buttons.push(b);
    }
    this._focus(0);
  }

  _focus(i) {
    if (!this._buttons?.length) return;
    this._fi = (i + this._buttons.length) % this._buttons.length;
    this._buttons.forEach((b, k) => b.classList.toggle('focus', k === this._fi));
  }

  _keyNav(e) {
    if (this._capturing) {
      e.preventDefault();
      return;   // input.captureNext handles the actual key
    }
    if (this.mode === 'attract' && e.code !== 'F3') { this.onQuitRun(); this.setMode('title'); return; }
    if (this.mode === 'run') return;
    if (this.mode === 'cutscene') { if (e.code !== 'F3') this._advanceCutscene(); return; }
    if (this.mode === 'credits') { if (e.code === 'Escape' || e.code === 'Enter' || e.code === 'Space') this._endCredits(); return; }
    const nav = { ArrowUp: -1, ArrowLeft: -1, ArrowDown: 1, ArrowRight: 1 };
    if (e.code in nav) { e.preventDefault(); this.onSfx?.('uimove'); this._focus((this._fi ?? 0) + nav[e.code]); }
    else if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); this._buttons?.[this._fi]?.click(); }
    else if (e.code === 'Escape') {
      e.preventDefault();
      if (this.mode === 'select' || this.mode === 'settings' || this.mode === 'credits') this._back();
      else if (this.mode === 'paused') this.togglePause(false);
    }
  }

  _back() {
    this.onSfx?.('uibad');
    if (this.mode === 'settings') this.setMode(this._settingsFrom || 'title');
    else this.setMode('title');
  }

  // ------------------------------------------------------------- select --
  _isUnlocked(i) { return i === 0 || this.progress.completed['run' + i]; }

  _buildSelect() {
    const host = this.root.querySelector('#run-cards');
    host.innerHTML = '';
    this._buttons = [];
    RUNS.forEach((def, i) => {
      const unlocked = this._isUnlocked(i);
      const done = this.progress.completed[def.id];
      const b = document.createElement('button');
      b.className = 'card' + (unlocked ? '' : ' locked') + (done ? ' done' : '');
      const best = this.progress.bestTime[def.id];
      b.innerHTML = `<span class="card-n">${['I', 'II', 'III', 'IV', 'V', 'VI'][i]}</span>
        <span class="card-name">${def.name.split('— ')[1]}</span>
        <span class="card-sub">${unlocked ? (best ? `best ${best.toFixed(1)}s · ${this.progress.bestDew[def.id] ?? 0} dew` : 'unsown') : 'locked'}</span>`;
      if (unlocked) b.addEventListener('click', () => { this.onSfx?.('uiok'); this._startRun(def.id); });
      host.appendChild(b);
      if (unlocked) this._buttons.push(b);
    });
    const extra = this.root.querySelector('#select-extra');
    extra.innerHTML = '';
    const mk = (label, fn, enabled = true) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.disabled = !enabled;
      if (enabled) b.addEventListener('click', () => { this.onSfx?.('uiok'); fn(); });
      extra.appendChild(b);
      if (enabled) this._buttons.push(b);
      return b;
    };
    mk(`Endless — best ${Math.floor(this.progress.endlessBest || 0)}m`, () => this._startEndless(), !!this.progress.completed.run1);
    mk('The Feel Gym', () => this._startRun('gym'));
    mk('Back', () => this.setMode('title'));
    this._focus(0);
  }

  _startRun(id, opts = {}) {
    this.worldDef = runById(id);
    this.setMode('run');
    this.onStartRun(id, opts);
  }

  _startEndless() {
    const daily = Math.floor(Date.now() / 86400000);
    this.worldDef = runById('endless');
    this.setMode('run');
    this.onStartRun('endless', { seed: daily });
  }

  // ----------------------------------------------------------- settings --
  _openSettings(from) { this._settingsFrom = from; this.setMode('settings'); }

  _buildSettings() {
    const host = this.root.querySelector('#settings-body');
    const s = this.settings;
    host.innerHTML = '';
    this._buttons = [];

    const row = (label, control) => {
      const div = document.createElement('div');
      div.className = 'set-row';
      const l = document.createElement('span');
      l.textContent = label;
      div.append(l, control);
      host.appendChild(div);
    };
    const slider = (key, cb) => {
      const input = document.createElement('input');
      input.type = 'range'; input.min = 0; input.max = 100;
      input.value = Math.round(this.settings[key] * 100);
      input.addEventListener('input', () => { this.settings[key] = input.value / 100; cb?.(); this._applySettings(); });
      return input;
    };
    const toggle = (key) => {
      const b = document.createElement('button');
      const paint = () => { b.textContent = this.settings[key] ? 'ON' : 'OFF'; b.classList.toggle('on', !!this.settings[key]); };
      paint();
      b.addEventListener('click', () => { this.settings[key] = !this.settings[key]; paint(); this._applySettings(); this.onSfx?.('uiok'); });
      this._buttons.push(b);
      return b;
    };

    row('Music volume', slider('musicVol'));
    row('Sound volume', slider('sfxVol'));
    row('Mute all', toggle('mute'));
    row('Screen shake', slider('shake'));
    row('Reduced motion', toggle('reducedMotion'));

    const remapTitle = document.createElement('h3');
    remapTitle.textContent = 'KEYS — click, then press a key';
    host.appendChild(remapTitle);
    for (const verb of VERBS) {
      if (verb === 'pause') continue;
      const b = document.createElement('button');
      b.className = 'remap';
      const paint = () => { b.textContent = keyLabel(this.input.bindings[verb][0]); };
      paint();
      b.addEventListener('click', () => {
        b.textContent = '…';
        this._capturing = verb;
        this.input.captureNext = (code) => {
          this.input.setBinding(verb, code);
          this.settings.keys = this.input.bindings;
          this._capturing = null;
          paint();
          this._applySettings();
          this.onSfx?.('uiok');
        };
      });
      row(verb.toUpperCase(), b);
      this._buttons.push(b);
    }

    const back = document.createElement('button');
    back.textContent = 'Back';
    back.addEventListener('click', () => this._back());
    host.appendChild(back);
    this._buttons.push(back);
    this._focus(this._buttons.length - 1);
  }

  _applySettings() {
    this.persist();
    this.onSettingsChanged?.();
  }

  // ------------------------------------------------------------ results --
  _buildResults({ world }) {
    const win = world.finished;
    const def = world.def;
    const title = this.root.querySelector('#results-title');
    const stats = this.root.querySelector('#results-stats');
    title.textContent = win
      ? (def.finale ? 'THE LAST SEED IS SOWN' : def.kind === 'campaign' ? `${def.seedName ?? 'the seed'} IS SOWN!` : 'RUN COMPLETE')
      : world.deathCause === 'tide' ? 'THE ROT TIDE TOOK YOU' : 'THE THORNS WON THIS TIME';
    title.className = win ? 'win' : 'lose';
    const time = (world.frame / 60).toFixed(1);
    stats.innerHTML = win
      ? `<b>${time}s</b> · <b>${world.dew}</b> dew · best chain <b>×${world.bestChain}</b> · <b>${world.parries}</b> blooms · <b>${world.stumbles}</b> stumbles`
      : `<b>${Math.floor(world.player.d)}m</b> · <b>${world.dew}</b> dew · <b>${world.parries}</b> blooms`;

    const items = [];
    if (win && def.kind === 'campaign') {
      const idx = RUNS.findIndex((r) => r.id === def.id);
      if (idx >= 0 && idx < RUNS.length - 1) items.push([`Next: ${RUNS[idx + 1].name.split('— ')[1]}`, () => this._startRun(RUNS[idx + 1].id)]);
    }
    if (!win && def.kind === 'campaign' && world.checkpoint) {
      items.push(['From Checkpoint', () => this._startRun(def.id, { checkpoint: world.checkpoint })]);
    }
    items.push([win ? 'Run Again' : 'Restart Run', () => (def.kind === 'endless' ? this._startEndless() : this._startRun(def.id))]);
    items.push(['Runs', () => this.setMode('select')]);
    items.push(['Title', () => this.setMode('title')]);
    this._menu('#results-menu', items);
  }

  // ------------------------------------------------- cutscene & credits --
  _startCutscene() {
    this._cutIdx = 0;
    this._cutT = 0;
    this._showCutLine();
  }

  _showCutLine() {
    const el = this.root.querySelector('#cutscene-text');
    el.textContent = CUTSCENE[this._cutIdx];
    el.classList.remove('fade-in');
    void el.offsetWidth;
    el.classList.add('fade-in');
  }

  _advanceCutscene() {
    this.onSfx?.('uiok');
    this._cutIdx++;
    this._cutT = 0;
    if (this._cutIdx >= CUTSCENE.length) this.setMode('credits');
    else this._showCutLine();
  }

  _startCredits() {
    const roll = this.root.querySelector('#credits-roll');
    roll.innerHTML = CREDITS.map(([text, cls]) => `<div class="cr-${cls || 'name'}">${text || '&nbsp;'}</div>`).join('');
    roll.style.animation = 'none';
    void roll.offsetWidth;
    roll.style.animation = 'credits-roll 38s linear forwards';
    this._creditsT = 0;
  }

  _endCredits() { this.setMode('title'); }

  // -------------------------------------------------------------- pause --
  togglePause(on) {
    if (on && this.mode === 'run') { this.setMode('paused'); this.onSfx?.('pause'); }
    else if (!on && this.mode === 'paused') { this._resume(); this.onSfx?.('unpause'); }
  }

  _resume() {
    this.mode = 'run';
    this.input.swallow('pause');
    for (const s of this.root.querySelectorAll('.screen')) s.classList.remove('active');
    this.onModeChange?.('run');
  }

  // --------------------------------------------------------------- loop --
  // called every frame from main; inp is this frame's polled input (menus
  // only — during 'run' the sim consumes input per step instead)
  update(dtFrames, world) {
    const modeBefore = this.mode;
    // gamepad navigation in menus (keyboard menus go through keydown)
    if (!this.running) {
      const inp = this.input.padPoll();
      if (inp.pressed.left) this._keyNav({ code: 'ArrowUp', preventDefault: () => {} });
      if (inp.pressed.right) this._keyNav({ code: 'ArrowDown', preventDefault: () => {} });
      if (inp.pressed.jump) this._keyNav({ code: 'Enter', preventDefault: () => {} });
      if (inp.pressed.slide || inp.pressed.pause) this._keyNav({ code: 'Escape', preventDefault: () => {} });
    }
    // nav may have started/replaced the run; `world` is now stale
    if (this.mode !== modeBefore) return;

    if (this.mode === 'title') {
      this.idleT += dtFrames;
      if (this.idleT > 60 * 14) { this.setMode('attract'); this.onStartRun('run1', { bot: true }); }
    }
    if (this.mode === 'cutscene') {
      this._cutT += dtFrames;
      if (this._cutT > 60 * 4.5) this._advanceCutscene();
    }
    if (this.mode === 'credits') {
      this._creditsT += dtFrames;
      if (this._creditsT > 60 * 40) this._endCredits();
    }

    // world end handling
    if ((this.mode === 'run' || this.mode === 'attract') && world) {
      if (world.finished && world.finishT > 200) this._worldWon(world);
      else if (world.dead && world.deadT > 80) this._worldLost(world);
    }
  }

  _worldWon(world) {
    if (this.mode === 'attract') { this.onQuitRun(); this.setMode('title'); return; }
    const def = world.def;
    if (def.kind === 'campaign') {
      this.progress.completed[def.id] = true;
      const t = world.frame / 60;
      if (!this.progress.bestTime[def.id] || t < this.progress.bestTime[def.id]) this.progress.bestTime[def.id] = t;
      this.progress.bestDew[def.id] = Math.max(this.progress.bestDew[def.id] ?? 0, world.dew);
      this.persist();
    }
    this.onSfx?.('victory');
    if (def.finale) this.setMode('cutscene');
    else this.setMode('results', { world });
  }

  _worldLost(world) {
    if (this.mode === 'attract') { this.onQuitRun(); this.setMode('title'); return; }
    if (world.def.kind === 'endless') {
      const d = Math.floor(world.player.d);
      if (d > (this.progress.endlessBest || 0)) { this.progress.endlessBest = d; this.persist(); }
    }
    this.setMode('results', { world });
  }
}

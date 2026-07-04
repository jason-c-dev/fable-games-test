// Boot: PIXI app, fixed-timestep sim loop (60 Hz) decoupled from rendering
// with interpolated drawing, and the campaign flow (title/overworld/levels).

import { Application } from 'pixi.js';
import './sim/levels/index.js';
import { getLevel } from './sim/level.js';
import { World } from './sim/world.js';
import { Run } from './sim/run.js';
import { Input } from './core/input.js';
import { loadGame, saveGame, DEFAULT_SETTINGS } from './core/save.js';
import { initGfx } from './render/gfx.js';
import { Renderer } from './render/renderer.js';
import { Hud, makeText } from './render/hud.js';
import { Flow } from './ui/screens.js';
import { Audio } from './audio/audio.js';
import { STEP, WORLD_NAMES } from './config.js';

// wrapped in boot(): top-level await breaks classic-script bundling
async function boot() {

  const app = new Application();
  await app.init({
    resizeTo: window,
    antialias: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true,
    background: '#05070c',
    preference: 'webgl',
  });
  document.getElementById('game').appendChild(app.canvas);

  initGfx();

  const input = new Input();
  input.attach(window);

  // ---- load save ----
  const saved = loadGame();
  const run = saved?.run ? Run.deserialize(saved.run) : new Run();
  if (saved?.mapPos) run.mapPos = saved.mapPos;
  const settings = { ...DEFAULT_SETTINGS, ...(saved?.settings || {}) };
  if (settings.keys) input.bindings = { ...input.bindings, ...settings.keys };

  const renderer = new Renderer(app);
  renderer.input = input;
  const hud = new Hud(input);
  renderer.overlayRoot.addChild(hud.c);
  renderer.shakeScale = settings.shake;
  renderer.postfx.reducedFlash = settings.reducedFlash;

  let world = null;

  function startLevel(id, opts = {}) {
    const parsed = getLevel(id);
    run.currentLevel = id;
    if (!opts.keepCheckpoint) run.checkpoint = null;
    run.refill();
    world = new World(parsed, run, {
      seed: opts.seed ?? ((Math.random() * 0xffff) | 0),
      checkpoint: opts.keepCheckpoint ? run.checkpoint : null,
    });
    renderer.loadLevel(world, parsed.world || 0);
    hud.showCard(parsed.name, id.startsWith('gym') ? 'TRAINING GROVE' : WORLD_NAMES[parsed.world] + (parsed.boss ? ' — BOSS' : ''));
  }

  const flow = new Flow({ app, input, renderer, hud, run, settings, startLevel });
  renderer.overlayRoot.addChild(flow.root);

  // ---- audio ----
  const audio = new Audio(settings);
  const syncScene = () => {
    if (!audio.ready || !audio.music) return;
    const mode = flow.mode;
    if (mode === 'title') audio.music.setScene('title');
    else if (mode === 'overworld' || mode === 'shrine') audio.music.setScene('overworld');
    else if (mode === 'gameover') audio.music.setScene('none');
    else if (mode === 'victory') { audio.music.setScene('none'); audio.music.stinger('victory'); }
    else if (mode === 'credits') audio.music.setScene('level', { world: 0 });
    else if (mode === 'level' && world) {
      if (world.def.boss) audio.music.setScene('boss', { final: world.def.id === '4-B' });
      else audio.music.setScene('level', { world: world.def.world || 0 });
    }
  };
  const unlockAudio = () => { audio.unlock().then(syncScene); };
  window.addEventListener('keydown', unlockAudio, { once: true });
  window.addEventListener('pointerdown', unlockAudio, { once: true });
  renderer.onEvent = (ev, w) => audio.handleEvent(ev, w);
  flow.onSfx = (n) => audio.sfx(n);
  flow.onMode = () => syncScene();
  flow.onSettingsChanged = () => {
    audio.applySettings();
    renderer.shakeScale = settings.shake;
    renderer.postfx.reducedFlash = settings.reducedFlash;
  };

  // ---- debug overlay (F3) ----
  const debugT = makeText('', 6, { fill: 0xa8ffb0, strokeW: 1 });
  debugT.position.set(6, 248);
  debugT.visible = false;
  renderer.overlayRoot.addChild(debugT);
  let fpsAvg = 60;
  window.addEventListener('keydown', (e) => {
    if (e.code === 'F3') { e.preventDefault(); debugT.visible = !debugT.visible; }
  });

  // ---- URL params: direct level boot for QA ----
  const params = new URLSearchParams(location.search);
  if (params.has('level')) {
    startLevel(params.get('level'), { seed: params.has('seed') ? Number(params.get('seed')) : undefined });
    flow.setMode('level');
  }

  // ---- main loop ----
  let acc = 0;
  let last = performance.now();
  app.ticker.add(() => {
    const now = performance.now();
    const dtMs = Math.min(now - last, 100);
    last = now;
    const dtFrames = Math.min(dtMs / (1000 / 60), 3);

    const simActive = flow.update(dtFrames, world) && world;

    if (simActive) {
      acc += dtMs / 1000;
      let steps = 0;
      const scripted = flow.mode === 'credits' ? (w) => flow.creditsPoll(w)
        : flow.mode === 'attract' ? (w) => flow.attractPoll(w) : null;
      while (acc >= STEP && steps < 4) {
        const inp = scripted ? scripted(world) : input.poll();
        world.step(inp);
        if (!scripted && inp.pressed.pause) flow.togglePause(true);
        acc -= STEP;
        steps++;
      }
      if (steps === 4) acc = 0;
    } else {
      acc = 0;
    }

    if (world) {
      renderer.draw(world, simActive ? acc / STEP : 1, dtFrames);
      hud.update(world, run, dtFrames);
    }
    audio.update(world, flow.mode, dtFrames);

    fpsAvg = fpsAvg * 0.95 + (1000 / Math.max(dtMs, 0.01)) * 0.05;
    if (debugT.visible && world) {
      debugT.text = `fps ${fpsAvg.toFixed(0)}  ents ${world.entities.length}  fx ${renderer.particles.live.length}` +
        `  views ${renderer.views.size}  mode ${flow.mode}${flow.paused ? '(paused)' : ''}  state ${world.player.state}` +
        `  x ${world.player.x.toFixed(0)} y ${world.player.y.toFixed(0)}`;
    }

    if (world && flow.mode === 'level' && !flow.wipe) {
      if (world.finished) flow.levelFinished(world);
      else if (world.gameOver) flow.levelGameOver();
    }
  });

  // hooks for headless browser QA
  window.OG = {
    app, run, input, renderer, hud, flow, startLevel, settings, audio,
    get world() { return world; },
  };

}

boot().catch((err) => {
  const el = document.getElementById('boot-error');
  if (el) { el.hidden = false; el.textContent = 'Boot failed: ' + (err && err.stack || err); }
  throw err;
});
// Boot: Three renderer + fixed-timestep 60 Hz sim decoupled from drawing
// with interpolation. The sim never touches Three; Three only draws.
// Wrapped in boot() from day one — top-level await breaks the IIFE standalone.

import { STEP } from './config.js';
import { World } from './sim/world.js';
import { runById } from './sim/runs.js';
import { Bot } from './sim/bot.js';
import { Input } from './core/input.js';
import { loadGame, saveGame, DEFAULT_SETTINGS, freshProgress } from './core/save.js';
import { Renderer } from './render/renderer.js';
import { Hud } from './ui/hud.js';
import { Flow } from './ui/screens.js';
import { Audio } from './audio/audio.js';

function boot() {
  const uiRoot = document.getElementById('ui');
  const renderer = new Renderer(document.getElementById('game'), uiRoot);
  const input = new Input();
  input.attach(window);

  const saved = loadGame();
  const settings = { ...DEFAULT_SETTINGS, ...(saved?.settings || {}) };
  const progress = { ...freshProgress(), ...(saved?.progress || {}) };
  if (settings.keys) input.bindings = { ...input.bindings, ...settings.keys };
  const persist = () => saveGame({ settings, progress });

  const applySettings = () => {
    renderer.shakeScale = settings.shake;
    renderer.reducedMotion = settings.reducedMotion;
    audio?.applySettings?.();
  };

  renderer.props.signLabeler = (verb) => input.labelFor(verb);
  input.onDeviceChange = () => renderer.props.refreshSigns();

  const hud = new Hud(uiRoot, input);

  let world = null;
  let bot = null;

  const audio = new Audio(settings);
  const unlockAudio = () => audio.unlock();
  window.addEventListener('keydown', unlockAudio, { once: true });
  window.addEventListener('pointerdown', unlockAudio, { once: true });

  const flow = new Flow({ uiRoot, input, settings, progress, persist });
  flow.onSfx = (n) => audio.sfx(n);

  flow.onStartRun = (id, opts = {}) => {
    const def = runById(id);
    world = new World(def, { seed: opts.seed, checkpoint: opts.checkpoint });
    bot = opts.bot ? new Bot(world, { demo: true, reaction: 0.12 }) : null;
    hud.setRunName(def.name.toUpperCase());
    hud.root.hidden = false;
    ambient = false;
  };
  // behind menus: a silent bot ambles the endless Seedway
  let ambient = false;
  const startAmbient = () => {
    world = new World(runById('endless'), { seed: 42 });
    bot = new Bot(world, { demo: true, reaction: 0.12 });
    hud.root.hidden = true;
    ambient = true;
  };
  flow.onQuitRun = startAmbient;
  flow.onSettingsChanged = applySettings;
  applySettings();
  startAmbient();

  // URL params drive QA boots: ?run=gym&seed=7&bot=1 (skips the title)
  const params = new URLSearchParams(location.search);
  if (params.has('run')) {
    flow.worldDef = runById(params.get('run'));
    flow.setMode('run');
    flow.onStartRun(params.get('run'), {
      seed: params.has('seed') ? Number(params.get('seed')) : undefined,
      bot: params.has('bot'),
    });
  }

  window.addEventListener('keydown', (e) => {
    if (e.code === 'F3') { e.preventDefault(); hud.toggleF3(); }
    if (e.code === 'KeyR' && flow.mode === 'run' && world && (world.dead || world.finished)) {
      flow.onStartRun(world.def.id, { bot: !!bot });
    }
  });

  // ---- main loop ----
  let acc = 0, last = performance.now(), fpsAvg = 60, t = 0;
  function tick() {
    requestAnimationFrame(tick);
    const now = performance.now();
    const dtMs = Math.min(now - last, 100);
    last = now;
    const dtFrames = Math.min(dtMs / (1000 / 60), 3);
    t += dtMs / 1000;

    const simActive = world && (flow.running || flow.mode !== 'paused');
    if (!flow.running) input.poll();   // keep kb edge state fresh across mode changes

    if (simActive) {
      acc += dtMs / 1000;
      let steps = 0;
      while (acc >= STEP && steps < 4) {
        const inp = flow.running && !bot ? input.poll() : bot ? bot.step() : { held: {}, pressed: {} };
        world.step(inp);
        if (flow.running && !bot && inp.pressed.pause) flow.togglePause(true);
        for (const ev of world.events) {
          renderer.handleEvent(ev, world);
          if (flow.running) {
            hud.handleEvent(ev, world);
            audio.handleEvent(ev, world);
          }
        }
        acc -= STEP;
        steps++;
      }
      if (steps === 4) acc = 0;
      // ambient background world: restart quietly if the Tide catches it
      if (ambient && !flow.running && (world.dead || world.finished)) startAmbient();
    } else {
      acc = 0;
    }

    if (world) {
      renderer.draw(world, simActive ? acc / STEP : 1, dtFrames, t);
      hud.update(world, dtFrames, fpsAvg, renderer);
    }
    flow.update(dtFrames, world);
    audio.update(world, flow.mode, world ? world.track.biomeAt(world.player.d) : 'meadow');

    fpsAvg = fpsAvg * 0.95 + (1000 / Math.max(dtMs, 0.01)) * 0.05;
  }
  tick();

  // hooks for headless QA
  window.SR = {
    renderer, input, hud, flow, settings, progress, persist, audio,
    get world() { return world; },
    get bot() { return bot; },
    get fps() { return fpsAvg; },
    get frame() { return world?.frame ?? 0; },
  };
}

try { boot(); } catch (err) {
  const el = document.getElementById('boot-error');
  if (el) { el.hidden = false; el.textContent = 'Boot failed: ' + (err && err.stack || err); }
  throw err;
}

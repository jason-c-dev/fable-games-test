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

function boot() {
  const uiRoot = document.getElementById('ui');
  const renderer = new Renderer(document.getElementById('game'), uiRoot);
  const input = new Input();
  input.attach(window);

  const saved = loadGame();
  const settings = { ...DEFAULT_SETTINGS, ...(saved?.settings || {}) };
  const progress = { ...freshProgress(), ...(saved?.progress || {}) };
  if (settings.keys) input.bindings = { ...input.bindings, ...settings.keys };
  renderer.shakeScale = settings.shake;
  renderer.reducedMotion = settings.reducedMotion;
  renderer.props.signLabeler = (verb) => input.labelFor(verb);
  input.onDeviceChange = () => renderer.props.refreshSigns();

  const hud = new Hud(uiRoot, input);
  const persist = () => saveGame({ settings, progress });

  let world = null;
  let bot = null;

  function startRun(id, opts = {}) {
    const def = runById(id);
    world = new World(def, opts);
    bot = opts.bot ? new Bot(world, { demo: true, reaction: 0.12 }) : null;
    hud.setRunName(def.name.toUpperCase());
    return world;
  }

  // URL params drive QA boots: ?run=gym&seed=7&bot=1
  const params = new URLSearchParams(location.search);
  startRun(params.get('run') || 'gym', {
    seed: params.has('seed') ? Number(params.get('seed')) : undefined,
    bot: params.has('bot'),
  });

  window.addEventListener('keydown', (e) => {
    if (e.code === 'F3') { e.preventDefault(); hud.toggleF3(); }
    if (e.code === 'KeyR' && world && (world.dead || world.finished)) {
      startRun(world.def.id, { bot: !!bot });
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

    acc += dtMs / 1000;
    let steps = 0;
    while (acc >= STEP && steps < 4) {
      const inp = bot ? bot.step() : input.poll();
      world.step(inp);
      for (const ev of world.events) {
        renderer.handleEvent(ev, world);
        hud.handleEvent(ev, world);
      }
      acc -= STEP;
      steps++;
    }
    if (steps === 4) acc = 0;

    renderer.draw(world, acc / STEP, dtFrames, t);
    hud.update(world, dtFrames, fpsAvg, renderer);
    fpsAvg = fpsAvg * 0.95 + (1000 / Math.max(dtMs, 0.01)) * 0.05;
  }
  tick();

  // hooks for headless QA
  window.SR = {
    renderer, input, hud, startRun, settings, progress, persist,
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

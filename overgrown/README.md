# Sprout Kingdom: Overgrown

A modern HD action-platformer remake of *Sprout Kingdom* — smooth rendered 2D,
dynamic lighting, post-processing, skeletal animation, and a fully synthesized
adaptive soundtrack. Everything (art, music, sounds, levels) is generated in
code; there are no external assets. Rendering is PixiJS v8 (vendored),
audio is Tone.js (vendored), and the 60 Hz fixed-timestep simulation is
entirely custom and Node-importable for headless QA.

## Run

Play online: https://jason-c-dev.github.io/fable-games-test/overgrown/

```bash
# from the repo root
python3 -m http.server 8378
# open http://localhost:8378/overgrown/
```

Or just double-click `standalone.html` — the whole game in one file, no
server needed (rebuild after changes: `node tools/build-standalone.js`,
needs `npm i -g esbuild`). The modular `index.html` requires http(s):
browsers block ES-module loads over `file://`.

The original game lives beside this one in `../sprout-kingdom/`.

## How to play

Cross the four overgrown worlds (Meadow, Cavern, Cloudline, Bramble Keep),
take back the six Sun Seeds, and put General Bramble down. **Arrows/WASD**
move; **Space** jumps (hold for height, hold in air to glide once you have the
cap); **X** swings the Thorn Blade (hold to charge a spin-slash, Down+X in the
air is a down-plunge that pogos off enemies and spikes); **C** dashes (one in
the air, refreshed by landing, walls, pogo hits, and parries); **V** parries —
an 8-frame window that freezes time, reflects projectiles, staggers attackers,
and refunds your dash; **F** charges the Sunbeam Lance (release to fire; found
in World 2; mind the heat); **Q** channels a heal from the Sap Gauge and
**Up+Q** spends it all on a bloom burst. Hidden Dew Stars (3 per level) buy
upgrades at shrines between worlds — spending them never erases the collection
record. Bosses follow a rhythm: parry the glinting attack, dash through the
charge, pogo the dazed. The final duel is won on parry timing alone.
A gamepad works too (prompts switch automatically); Esc pauses; F3 shows the
debug overlay.

## Layout

```
js/config.js       tuning: physics, combat frame data, tiles, DSL legend
js/sim/            Node-safe simulation (physics, player FSM, enemies,
                   bosses, levels as ASCII grids, world orchestration)
js/render/         PixiJS layer (procedural textures, rigs, tilemap,
                   parallax, lighting, particles, post grade, HUD)
js/audio/          Tone.js: SFX bank + adaptive layered themes
js/ui/             title / overworld / shrine / settings / credits flow
tools/             QA (see below)
vendor/            pinned pixi.js 8.19.0 + tone 15.5.27
```

## QA (keep these green after any change)

```bash
node tools/verify-levels.js    # reachability BFS for the dash/wall-jump/pogo
                               # movement model over every level (0 problems)
node tools/sim-probe.js        # 76 headless mechanics probes driving the real
                               # sim: movement, combat frame data, parry
                               # windows, beam puzzles, all four boss fights
node tools/browser-test.js     # 19 Playwright flow tests (save/load, unlocks,
                               # shrine, secret exits, boss flow, audio)
node tools/mechanics-test.js   # 6 in-browser probes via real keyboard input
node tools/screenshot.js LEVEL OUTPREFIX [script...]   # visual spot checks
```

Playwright is the globally installed one (`npm root -g`), using system Chrome.
Level authoring invariants live at the top of `js/sim/level.js`; if you change
jump/dash physics in `config.js`, update the constants at the top of
`tools/verify-levels.js` to match.

## Known trims (deliberate)

- Bloom is glow-sprite based (additive halos), not a bright-pass shader chain.
- Beam sweep is combat-only flourish; mirror routing requires level-aligned
  horizontal shots (by design, so puzzles stay readable).
- No air meter underwater; water is a traversal texture, not a threat.
- Moss can't jump while ridden — he's armor and appetite, not a mount upgrade.

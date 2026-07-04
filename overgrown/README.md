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

## About the prompt

Overgrown grew from [`platformer2-prompt.md`](platformer2-prompt.md) — a
~1,600-word sequel brief written after the original shipped. Its most
consequential choices, with receipts:

**It banned the easy engine.** The tech section allows PixiJS for rendering
but draws a hard line at physics:

> *"Keep the simulation your own: fixed-timestep physics (60Hz) fully
> decoupled from rendering, with interpolated rendering… PixiJS draws; it
> does not decide game logic. No physics engine — platformer feel dies in
> general-purpose physics libraries."*

That one paragraph is why the whole simulation is plain, Node-importable
JavaScript — which in turn is why 86 headless probes can drive the *real*
player through the *real* levels without a browser. The QA story falls
straight out of the architecture the prompt demanded.

**It named the parry as a system, not a move.** The combat spec reads like a
fighting-game design doc:

> *"A dedicated button with a tight (~8 frame) window; a successful parry
> freezes time for a beat, reflects projectiles at the attacker, staggers
> melee enemies, and refunds your air dash. Bosses have telegraphed parryable
> attacks (flagged by a glint + sound) as their core rhythm."*

Window size, reward list, telegraph language, and boss integration — all
specified. The final Bramble duel ("parry timing is the win condition") only
works because every boss taught the same glint-parry-punish grammar first.

**It made the sequel's movement a verifier problem.** The level-design bar
explicitly connects new verbs to QA:

> *"The original's chunked-ASCII DSL and its headless reachability verifier
> are the proven pattern — rebuild them for the new movement model (dash,
> wall jump, and pogo dramatically change the reachability graph; encode them
> as edges)."*

This was prescient: the two shipped level bugs found by early human play were
exactly the cases where the verifier's model diverged from the sim (a jump
edge that tunneled through walls; updrafts modeled as lifting when the sim's
lift lost to gravity). The fix in both cases followed the prompt's own logic
further — encode reality as edges, then *prove the edges against the real
sim* with scripted reality probes.

**It gated progress on feel.** *"Renderer + simulation + movement gym first
(a test level to tune feel — do not proceed until dash/wall-jump/pogo feel
great), then the combat gym…"* — the movement and combat gyms the prompt
required became the Training Grove, which shipped to players as the tutorial.

**It kept the self-contained discipline at HD fidelity.** *"No external
assets of any kind… All art is generated in code at load time… rig characters
as skeletal hierarchies of parts animated with keyframes + easing."* Every
gradient, rim light, boss silhouette and adaptive music layer is code — the
same constraint as the original, executed at a very different quality bar.

**Testing honesty:** as with the original, everything here is verified by
automation — the occlusion-aware level verifier, 86 sim probes (including
scripted kills of all four bosses and a parry-only Bramble duel), 19 browser
flow tests and 6 real-keyboard checks — plus early spot play. **No human has
yet completed a full playthrough.** The first hour of real human contact
found a sealed shaft, lift-less updrafts and a Retina scaling bug that all of
the above had missed; assume more such gaps exist until someone rolls
credits by hand.

## Known trims (deliberate)

- Bloom is glow-sprite based (additive halos), not a bright-pass shader chain.
- Beam sweep is combat-only flourish; mirror routing requires level-aligned
  horizontal shots (by design, so puzzles stay readable).
- No air meter underwater; water is a traversal texture, not a threat.
- Moss can't jump while ridden — he's armor and appetite, not a mount upgrade.

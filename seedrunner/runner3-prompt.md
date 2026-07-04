# Build Prompt: "Sprout Kingdom: Seedrunner" — a 3D runner finale

Build a complete, polished, browser-based **3D runner** that closes the Sprout
Kingdom trilogy. General Bramble has fallen; the kingdom breathes again — but
the six Sun Seeds must be **re-sown** before the last of the bramble rot
spreads. Pip runs the old Seedways: overgrown root-highways that thread all
four regions of the kingdom. Behind him, always, comes the **Rot Tide** — the
dying thorn's final grasp. This must be an **original work**: all characters,
names, art, sounds, and music invented for this game, consistent with the two
predecessors in this repo (`../sprout-kingdom/`, `../overgrown/` — study them
for lore, palettes, enemy families, and QA patterns; **do not modify them**).

## Tech constraints

- Browser-delivered static site. Use **Three.js** (vendor a pinned build into
  `vendor/`, exactly as Overgrown vendored PixiJS — no CDN at runtime, no
  build step for the modular version). **Tone.js** again for all audio, all
  synthesized. **No external assets of any kind**: geometry is procedural
  (lathes, extrusions, instanced primitives), textures are generated canvases,
  every sound and song is code.
- **The simulation is your own and Node-importable.** Fixed-timestep 60 Hz
  sim fully decoupled from rendering with interpolation; Three.js draws, it
  never decides gameplay. All game logic in plain ES modules with zero DOM or
  Three imports so the entire QA suite can drive the real sim headlessly.
  Deterministic given a seed — the campaign runs are fixed-seed.
- **Ship `standalone.html` from day one** (single-file IIFE bundle via
  esbuild, Tone inlined; no top-level await anywhere in `main.js`). The
  modular `index.html` is for dev, Pages, and tests.
- Input: keyboard (remappable) and **gamepad**, prompts switching per device.
- Persist best distances/times, campaign progress, settings in localStorage.

## The game

**Three lanes, one direction, no mercy.** Pip auto-runs down the Seedway at
ever-increasing speed. Player verbs, all frame-data'd in a config the QA
tools import:

- **Lane switch** (left/right, ~8-frame slide between lanes, buffered).
- **Jump** (hold for height; coyote frames off ramp edges; buffered).
- **Slide** (under thorn arches; can cancel into jump).
- **Dash** (brief speed burst + i-frames through one obstacle; on cooldown;
  refreshed by perfect actions — this is the Overgrown dash reborn).
- **Bloom parry** — the trilogy's signature, one last time: rot barriers
  pulse with a glint + sound telegraph; hitting the parry button inside a
  tight window (~10 frames, generous is fine at speed) **shatters the
  barrier**, briefly slows time, banks a burst of dew, and pushes the Rot
  Tide back a beat. Missing it means hitting the barrier (see below).
- Collect **dew drops** (currency/score) and, per campaign run, one
  **Sun Seed** carried to the run's end shrine.

**Damage model:** clipping an obstacle stumbles Pip (speed loss, the Rot Tide
gains); a second hit while stumbling, or being caught by the Tide, ends the
run. Campaign runs have a mid-run checkpoint; endless mode does not. Fast
restart (<1s) always.

**The Rot Tide** is the antagonist and the difficulty knob: a visible wall of
crawling dark growth behind the camera line. It creeps closer with mistakes,
falls back with perfect play (parries, near-miss streaks, dew chains). Its
distance IS the health bar — render it as pressure the player can feel and
hear (music layers, rumble, vignette).

### Structure

- **Campaign: six Sowing Runs** across the four biomes (Meadow, Cavern,
  Cloudline, Bramble Wastes) — fixed-seed, hand-tuned chunk sequences, each
  ~90–120 seconds, each teaching then testing one twist (Cavern darkness with
  lantern pools; Cloudline wind that drifts you across lanes mid-air; Wastes
  rot-barrier gauntlets), each ending by planting a Sun Seed (small
  celebration beat). Run 6 is the **finale chase**: the Rot Tide's last surge,
  all mechanics, scripted intensity, and a proper trilogy-closing cutscene +
  credits (the cast from both prior games lines the final stretch, cheering).
- **Endless mode** unlocks after run 1: procedural chunk assembly from the
  verified chunk library, seeded daily, best-distance leaderboard (local).
- Track is built from **hand-authored chunks** (a compact text/JSON DSL: lane
  obstacles, arches, ramps, rails, dew lines, barrier placements). No free
  procedural obstacle placement — endless mode composes verified chunks only.

### Feel & visual bar

- Stylized low-poly with the trilogy's palettes: chunky shapes, vertex-color
  gradients, fog-graded depth, per-biome color grade + vignette, bloom-ish
  glow on emissives (dew, barriers, the Tide's eyes). Pip is a simple rigged
  low-poly figure with squash/stretch, lean into lane changes, cape/leaf-cap
  secondary motion. The track curves and undulates (bent along a spline) so
  the horizon moves — never a static straight corridor.
- Camera: behind-the-shoulder, speed-reactive FOV (subtle), lane-change tilt,
  landing kick, and a **comfort pass**: no snap cuts, capped shake,
  reduced-motion setting.
- 60fps on a mid laptop: instanced meshes for track/obstacles/dew, object
  pooling, draw-call budget, and an F3 overlay proving it (fps, draws,
  instances).
- **Render correctness across displays is a shipping requirement**: test at
  devicePixelRatio 1 and 2 and at least three window aspect ratios headlessly
  before calling rendering done. (Generation 2 shipped a Retina bug because
  all QA ran at dpr 1. Do not repeat it.)

### Audio bar

Tone.js, all synthesized: per-biome themes as layered arrangements where
intensity follows **speed and Tide proximity** (base → percussion → counter
→ panic layer, crossfaded on the bar). The Pip motif and Bramble motif from
Overgrown return; the finale quotes both. Full SFX pass (footfalls on
material change, lane whoosh, parry shatter + slow-mo swell, dew chimes that
arpeggiate up a scale with combo, Tide rumble that lives on a send bus), UI
sounds, seed-planting stinger. Music/SFX sliders + mute.

### QA bar (this is the heart of the assignment)

Generation 2's core lesson: **a verifier's model of the game and the game
itself will drift apart unless you force them together.** Build both layers:

1. **Chunk verifier** (model layer): every authored chunk, at every speed
   tier it can appear at, must have a survivable action sequence with human
   reaction windows — minimum time-to-obstacle after it becomes visible ≥ a
   stated reaction floor (~300ms + input latency) at that speed; no
   unavoidable overlaps across lane switches; barrier telegraphs always ≥ the
   parry window + reaction floor. Verifies the campaign sequences AND the
   endless composition rules. Zero problems required.
2. **Reality probes** (sim layer): headless Node probes that drive the *real*
   sim — scripted bot completes **every campaign run** and survives N minutes
   of endless at multiple seeds/speeds; frame-data probes for every verb
   (buffering, coyote, slide-cancel, dash i-frames, parry window edges);
   difficulty-curve audit printing the reaction-window distribution per run.
   If the bot can't do it with frame-perfect play, a human can't either —
   treat as verifier failure.
3. **Browser flows** (Playwright): boot, campaign progression + persistence,
   settings, gamepad prompt switching, standalone.html over file://, dpr/
   aspect matrix screenshots, fps sanity.
4. **Playability assists are requirements, not options**: input buffering
   everywhere, latched inputs through hit-stop/slow-mo, generous lane-switch
   forgiveness near obstacle edges, first run is a **tutorial with in-world
   key prompts** (live-remapped, device-aware), and the title screen's
   attract demo uses the real bot and must clear run 1 — the demo is QA.

**Every room ships verified. There are no "dev rooms" exempt from QA.**

## Process

Feel gym first (straight test track: tune run/lane/jump/slide/dash/parry until
crisp — reality probes green before content). Then chunk DSL + verifier +
run 1 end-to-end (tutorialized) → biomes 2–4 and runs 2–5 → endless → finale
chase + credits → audio full pass → polish (comfort, settings, standalone,
perf) → publish. Keep every suite green at every step.

## Publishing (part of the job, not an epilogue)

Follow `PLAN.md` in this directory: integrate into the repo's root README
exactly like the first two games (intro table row, section with **two
animated GIFs** — title + gameplay — clickable to play, differences table
column, prompt retrospective in this game's README, and a new row in the
Fable 5 experiment tables computed from this session's own JSONL usage log).
Run the PII scan, commit with the established co-author format, push, and
verify the Pages deploy serves the game, the standalone file, and the media.
Finish with a one-paragraph "how to play" and the honest cut/improve list —
including the standing trilogy caveat that automated verification is not a
human playthrough.

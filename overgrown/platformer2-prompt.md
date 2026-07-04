# Build Prompt: "Sprout Kingdom: Overgrown" — a modern HD action-platformer

Build a complete, polished, browser-based 2D action-platformer: a modern remake
of *Sprout Kingdom*, trading its 16-bit pixel art for contemporary rendered
2D — smooth vector-style art, dynamic lighting, shader post-processing, and
fluid skeletal animation, in the visual register of modern indie platformers
(think the fidelity of Hollow Knight or Ori, not their content). This must be
an **original work**: all characters, names, art, sounds, and music are
invented for this game. The genre conventions are the inspiration — the
content is yours. Build it in a fresh directory; the original game
(`~/dev/sprout-kingdom`) may be consulted for level layouts, enemy behaviors,
and its headless QA tooling as design reference, but the code is a new build.

## Tech constraints

- Browser-delivered, runnable locally. Use **PixiJS v8** for WebGL/WebGPU
  rendering (sprite batching, filters, particle containers, mesh rendering).
  Prefer a no-build setup via ES-module import maps + CDN pin, so
  `python3 -m http.server` still works; a minimal Vite setup is acceptable if
  you need it, but the final artifact must be servable as static files.
- Keep the **simulation your own**: fixed-timestep physics (60Hz) fully
  decoupled from rendering, with interpolated rendering so the game is smooth
  at any refresh rate. PixiJS draws; it does not decide game logic. No physics
  engine — platformer feel dies in general-purpose physics libraries.
- Use **Tone.js** for all audio — synthesized, no audio files. Everything
  composed originally in code.
- **No external assets of any kind** — no downloaded images, fonts, sounds, or
  sprite sheets. All art is generated in code at load time: draw shapes with
  gradients, curves, and lighting into high-resolution textures (2× the display
  size minimum), and rig characters as skeletal hierarchies of parts animated
  with keyframes + easing. This is the same self-contained discipline as the
  original, executed at modern fidelity.
- Input: keyboard (remappable) **and gamepad** via the Gamepad API, with the
  button prompts in the UI switching automatically to match the active device.
  Presses that land during hit-stop or the parry freeze are latched and
  delivered on the first live frame — freeze frames never eat inputs.
- Persist progress, upgrades, settings, and best times in localStorage.
- Render correctly on **any window shape and any devicePixelRatio**: letterbox
  the fixed logical view with scaling computed in CSS pixels (beware dividing
  by the renderer's resolution twice on Retina), mask the scene to the
  letterbox so world sprites never bleed into the bars, and pin the
  post-processing area to the view rect. Verify at dpr 1 *and* 2 and at
  non-16:9 windows — headless QA defaults (dpr 1, exact 16:9) hide every one
  of these bugs.

## Visual quality bar

- **Rendered look, not pixel art**: characters and tiles built from smooth
  shapes with gradient fills, rim lighting, soft shadows, and subtle texture
  (procedural noise). Anti-aliased, high-DPI aware.
- **Dynamic 2D lighting**: light sources (sun shafts, lanterns, laser glow,
  boss telegraphs) rendered as additive light layers; the Cavern world's
  darkness mechanic becomes real light falloff with warm pooled lamplight.
- **Post-processing stack** (PixiJS filters, custom shaders where needed):
  bloom on emissive elements, vignette, and a per-world color grade — golden
  haze in Meadow, cold teal depth in Cavern, blown-out white sun in Cloudline,
  oppressive red-brown in Bramble Keep.
- **Atmosphere**: GPU particle systems for ambient weather per world — drifting
  pollen and fireflies, cave drips and dust motes, streaming cloud fog, falling
  embers and thorn debris. Parallax backgrounds with 4+ depth layers and
  atmospheric fade on the far ones.
- **Animation is a first-class feature**: skeletal keyframe animation with
  proper easing curves, anticipation and follow-through on every action,
  blended transitions between states (no pops), secondary motion (Pip's leaf
  cap bounces, Moss's antennae lag), squash-and-stretch on impacts, motion
  trails on dashes and sword arcs, and **hit-stop** (2–4 frame freeze) on
  melee impacts and parries so hits land with weight.

## Audio quality bar

- **Adaptive layered music**: each world's theme is built as a base layer plus
  intensity layers (percussion, counter-melody) that fade in near danger and
  during boss phases — crossfaded on the beat, never cut. Boss music shifts
  per phase. A recurring melodic motif for Pip and one for Bramble, woven
  through the soundtrack.
- Real production values from Tone.js: reverb and delay sends (cavern echo in
  World 2 is a feature), chorus/detune for warmth, sidechain-style ducking
  under important SFX and stingers, filter sweeps for tension.
- Full SFX pass: distinct sounds for every action below, plus UI sounds,
  ambient loops per world, and musical stingers (checkpoint, star, secret
  found) that land on the beat. Separate music/SFX volume sliders + mute.

## The game

**Sprout Kingdom: Overgrown.** Years after the first harvest, the kingdom has
grown wild and **General Bramble has returned**, armored in living thorn and
wielding stolen light. **Pip** — older now, quick and armed — crosses the four
overgrown worlds (Meadow, Cavern, Cloudline, Bramble Keep) to take back the
six Sun Seeds again.

### Core feel (still the thing that matters most)

Keep everything the original got right: momentum-based walk→run, skidding,
variable jump height, higher apex at speed, coyote time, jump buffering,
stomping with bounce, and carry/throw shells with chain combos. Then extend:

- **Dash** (ground and air, one air dash, ~10 frames, brief afterimage trail;
  refreshed on landing, wall-grab, or pogo hit).
- **Wall-slide and wall-jump**, with a forgiving regrab window.
- **Ledge grab and clamber** on tile corners.
- **Down-plunge**: aerial down-attack that pogo-bounces off enemies, spikes,
  and certain blocks — replaces the spin-hop and becomes a core traversal verb
  (design sequences around chained pogo bounces).
- Swimming in water zones (new to this remake) with its own physics feel.
- **Updrafts** (Cloudline): lift must decisively beat gravity — a lift weaker
  than gravity is just a slow fall, not a mechanic — and the column should
  gently center the player so holding a direction doesn't fling you out the
  side. Columns top out 1–2 tiles *above* their exit platform, since riders
  hover at the lip rather than overshooting it.
- **Springs** are solid pads you land on (landing is what fires the bounce);
  never float them above the ground where a straddling landing half-misses.

### Combat (new — this is the headline addition)

- **Thorn Blade** (melee, from the start): 3-hit ground combo, up-slash,
  aerial slash, and the down-plunge above. A held **charge spin-slash** hits
  all around. Sword swings deflect small projectiles.
- **Parry**: a dedicated button with a tight (~8 frame) window; a successful
  parry freezes time for a beat, reflects projectiles at the attacker, staggers
  melee enemies, and refunds your air dash. Bosses have telegraphed
  parryable attacks (flagged by a glint + sound) as their core rhythm.
- **Sunbeam Lance** (ranged, unlocked in World 2): hold to charge a laser,
  release to fire a piercing beam; sweep it while firing. Overheats to prevent
  spam. Certain crystals and mirrors in Cavern/Cloudline redirect the beam for
  light-routing puzzles.
- **Sap Gauge**: builds from landed hits and parries; spend it on specials —
  a healing channel (vulnerable while casting) or a screen-clearing bloom
  burst. Risk/reward: healing costs the same resource as offense.
- **Health is hearts now** (start with 3, max 5), not size tiers. Sun Fruit
  drops restore hearts; the Glider Cap remains as an equippable relic (hold
  jump to glide), and **Moss** returns as a rideable companion who eats small
  enemies and absorbs one hit.

### Progression & structure

- **Overworld map** (4 worlds × 4 levels + boss keep, node-and-path, at least
  two secret exits opening shortcut paths) — same skeleton as the original,
  every level redesigned around the new moveset. World gimmicks return
  upgraded: real dynamic darkness (Cavern), physical wind with visible
  streamlines (Cloudline), rising thorn-lava with light bloom (Keep), plus new
  water zones (Meadow/Cavern).
- **Upgrade shrines**: Dew Stars (3 hidden per level) are now currency as well
  as collectibles — spend at shrines between worlds on heart containers, a
  longer dash, wider parry window, faster charge, blade arts (new combo
  enders). Spending stars doesn't lose the collection record.
- **Enemy roster**: the original seven families return redesigned for combat —
  Snapcap shells can be parried into ricochets, Wisps must be lit by the
  Sunbeam before they're vulnerable, Pods' burrs are parry-reflectable —
  plus at least three new enemy types built around the sword (a shielded
  enemy that must be broken with a charge slash or pogoed from above; a
  dueling enemy with its own parry; a laser-armed drone-analog).
- **Bosses**: four multi-phase bosses redesigned around the new verbs — every
  boss has at least one parryable signature attack, one pogo opportunity, and
  one dash-through pattern. Final **General Bramble**: four phases ending in a
  sword-duel phase where parry timing is the win condition. Health bars,
  telegraphs, phase-shift music, victory cutscene per the original.

### Level design quality bar

Hand-author every level (tile arrays or a compact DSL — no random generation).
The original's chunked-ASCII DSL and its **headless reachability verifier**
are the proven pattern — rebuild them for the new movement model (dash, wall
jump, ledge grab, and pogo dramatically change the reachability graph; encode
them as edges). Four-beat rhythm per mechanic (teach safely → test → combine
→ twist); at least one optional risky path per level rewarding a Dew Star;
combat arenas and traversal stretches alternating so neither goes stale.
Playtest every level's completability with an automated headless run before
calling it done, and keep the verifier green after any edit.

The verifier earns trust only if its model matches the sim — two hard rules
learned in playtest:

- **Occlusion-aware edges**: jump/fall edges must check line-of-flight, or the
  BFS happily tunnels through full-height walls and passes sealed levels.
- **Reality probes over assumptions**: keep scripted probes that drive the
  *actual player* through every edge type on real level geometry — wall-jump
  shafts climbed end-to-end, the maximum dash gap measured in-sim (and the
  verifier's constant capped to it), movers boarded, updrafts ridden to their
  exit platforms, springs launched, pools swum. Whenever the model and the sim
  disagree, the sim is the truth and one of them gets fixed the same day.

Authoring rules that keep shafts honest: both wall lines of a wall-jump shaft
must be enterable from the route (open bottom rows or a hop-in slot — never a
wall sealed to the floor across the path), and the exit shelf goes on the side
the final wall-jump throws you. Mirrors sit on the standing row the beam
fires along. **Practice rooms are levels too**: the training gym ships on the
title menu and gets zero QA exemptions.

### Polish checklist

- Title screen with animated logo, attract demo, and settings (volume sliders,
  screen-shake intensity, reduced-flash accessibility toggle, key remapping).
  The attract demo's autopilot must *play competently* — hold jumps for full
  height, back up for a run-up when stuck against a wall, air-dash gaps. A
  demo bot stuck bunny-hopping at the first step is worse than no demo.
- A **Training Grove** on the title menu: every verb taught in order (run →
  jump → gaps → dash gap → wall-jump shaft → ledge grab → pogo spikes → swim
  → spring → mover), with forgiving shallow pits you can always hop out of, a
  mid-room checkpoint, and floating in-world key-prompt signs that switch with
  the active input device. This is most players' first room — build and QA it
  like one.
- HUD: hearts, Sap Gauge, coins, Dew Stars, reserve relic, timer — drawn in
  the same rendered style, animated (hearts pulse when low).
- Juice everywhere: hit-stop, camera kick on heavy hits, screen shake (scaled
  by the settings toggle), particle bursts, slow-mo on parries and boss kills,
  circle-wipe transitions, fast (<1s) respawn.
- Pause, game-over/continue, credits with the cast on parade.
- Performance: hold 60fps on a mid-range laptop — pool particles and
  projectiles, batch draws, and include a debug overlay (F3) with fps/entity
  counts to prove it.

## Process

Work iteratively: renderer + simulation + movement gym first (a test level to
tune feel — do not proceed until dash/wall-jump/pogo feel great), then the
combat gym (sword, parry, hit-stop tuning against dummy enemies), then World 1
complete end-to-end including its boss, then remaining worlds, then the polish
pass. Keep code modular (engine / render / entities / combat / levels / audio /
ui). Port the original's QA approach and go further: a reachability verifier
for the new movement model, headless sim probes that drive the real player
(parry timing, pogo chains, beam puzzles, every boss beaten by script, and
the reality probes above), and browser tests for flows, save/load, and real
keyboard input. Headless QA verifies the map's theory; make something verify
the *play* — and re-check visuals at Retina scale and odd window shapes, not
just the harness defaults. At the end, give me a one-paragraph "how to play"
and list anything you'd cut or improve with more time.

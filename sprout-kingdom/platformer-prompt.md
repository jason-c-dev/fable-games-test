# Build Prompt: "Sprout Kingdom" — a 16-bit-style platformer

Build a complete, polished, browser-based 2D platformer in the spirit of classic
16-bit console platformers. This must be an **original work**: all characters,
names, art, sounds, and music are invented for this game. Do not reference,
imitate, or reproduce any existing game's characters, sprites, level layouts,
or audio. The genre conventions (momentum physics, power-ups, stomping enemies,
overworld map) are the inspiration — the content is yours to invent.

## Tech constraints

- Single-page app: vanilla JavaScript + HTML5 Canvas (no frameworks, no build
  step, no external assets). One `index.html` plus JS/CSS files, runnable by
  opening the file or via `python3 -m http.server`.
- All graphics are **procedurally drawn pixel art** rendered to offscreen
  canvases at load time (sprite sheets generated in code) — crisp, chunky
  16-bit look with `image-rendering: pixelated`, a warm saturated palette,
  parallax background layers, and simple palette-swapped variants per world.
- All audio generated with the Web Audio API — and treat the music as a real
  soundtrack, not a placeholder. Build a small step-sequencer with proper
  chiptune instruments: pulse waves at 25%/12.5% duty (PeriodicWave), delayed
  vibrato on leads, detuned-unison for warmth, pluck envelopes for basses, a
  synthesized drum kit (sine-drop kick, bandpass-noise snare, hats), and a
  tempo-synced feedback-echo bus (lean on it for the cave world). Compose each
  world theme as a genuine multi-voice arrangement — lead, counter-melody or
  off-beat chord stabs, bass line, drums with fills — over a real chord
  progression in a 12–16 bar form, all original. Plus SFX (jump, stomp, coin,
  power-up, hurt, boss roar) and jingles (level-clear, death, game-over, boss
  victory). Include a mute toggle, and a headless checker that validates every
  song's tracks are the same step length.
- 60fps game loop with fixed-timestep physics; keyboard controls
  (arrows/WASD to move, Z/Space to jump, X/Shift to run & carry, Down to
  crouch/enter pipes-analog) **and gamepad support** via the Gamepad API
  (standard mapping; Start pauses). Show a controls overlay on the title
  screen.
- Persist progress (unlocked levels, high score, best times) in localStorage.

## The game

**Working title: Sprout Kingdom.** You play **Pip**, a small round gardener
with a red cap of leaves, on a quest across the kingdom to recover the six
stolen Sun Seeds from **General Bramble**, a thorned tortoise-like warlord,
and his minions.

### Core feel (this matters most — get the physics right)

- Momentum-based movement: walk → run acceleration, skidding when reversing at
  speed, shorter/taller jumps based on button hold time, higher jump apex when
  running. Coyote time (~5 frames) and jump buffering (~5 frames).
- Stomp enemies to defeat them; bounce off with a small hop, higher if jump is
  held. A **spin-hop** (double-tap jump or dedicated key) breaks blocks below
  and safely bounces off spiky enemies.
- A **P-meter** that charges while sprinting at full run speed (shown as
  chevrons in the HUD): a full meter grants sparkles, higher jumps, and — with
  the Glider Cap — a run-up jump becomes a long soaring flight.
- Press Down + jump to **drop through one-way platforms**.
- Pick up and throw defeated shell-type enemies; thrown shells chain-kill for
  escalating point combos.

### Power-up ladder

1. **Small Pip** — one hit = death.
2. **Sprout Pip** (eat a Sun Fruit) — bigger, takes one hit before shrinking.
3. **Blossom Pip** (rare Fire Blossom) — throw seed projectiles.
4. **Glider Cap** (feather-analog: a maple-seed cap) — hold jump to glide,
   run + jump to soar briefly.
- One reserve item slot shown in the HUD; drops in when you take a hit.
- A rideable companion: **Moss**, a friendly green hopping beetle you can
  mount; Moss can eat small enemies with its tongue and gives you one free
  hit (you're dismounted instead of hurt).

### Structure & progression

- **Overworld map**: a node-and-path world map connecting levels across
  **4 worlds** (Meadow, Cavern, Cloudline, Bramble Keep), ~4–5 levels each
  plus a boss castle per world. Completed levels stay unlocked; at least two
  levels hide a **secret exit** that opens a shortcut path on the map.
- Each level: start point, midpoint checkpoint flag, end-of-level goal gate
  with a timing minigame for bonus points. Collect coins (100 = extra life)
  and 3 hidden **Dew Stars** per level (tracked per level on the map).
- Difficulty curve: World 1 teaches mechanics with generous platforms and slow
  enemies; later worlds add moving platforms, crumbling ledges, wind currents,
  darkness with limited light radius (Cavern), bottomless-pit cloud hopping
  (Cloudline), rising thorn-lava and timed gauntlets (Bramble Keep).
- **Enemy roster** (all original, escalating): Bumbles (waddling grubs),
  Snapcaps (shelled beetles — stompable into throwable shells), Spikelets
  (spiky, spin-hop only), Puffhawks (diving birds), Thorn Lobbers (arcing
  projectiles), ghost-house-style **Wisps** that only advance when you face
  away, and cannon-analog **Pods** that fire seeking burrs.
- **Bosses**: each world ends with a distinct multi-phase boss in an arena —
  e.g. World 1: a giant Snapcap that must be stomped 3 times, gaining speed
  and adding a shockwave each phase; final boss General Bramble across 3
  phases (thrown-object tennis, ceiling drops, shrinking platform floor).
  Each boss has a health indicator, telegraphed attacks, and a victory jingle
  + Sun Seed cutscene. The fights must not share a skeleton: give each boss
  its own vulnerability logic, not four variations of "wait for the window,
  stomp three times". Punish passive play (e.g. a flying boss flicks aimed
  projectiles at a player who camps below) and reward aggression with a
  skill-based shortcut (e.g. a spin-hop on the flyer's back knocks it out of
  the sky). Alternate at least two telegraphed attack patterns per boss in
  later phases.

### Level design quality bar

Hand-author every level (tile-based arrays or a compact level DSL — no random
generation). Each level should have a theme mechanic introduced safely, then
tested, then combined with a twist — the classic four-beat rhythm. Include at
least one optional risky path rewarding a Dew Star. Playtest each level's
completability yourself with an automated headless run or documented manual
check before calling it done.

### Polish checklist

- Title screen with animated logo, "press start", and a demo attract-mode.
  The demo bot should look ahead for gaps, walls, spikes and enemies and play
  competently enough to be a real demonstration — and it must never write to
  the save, even if it clears the level.
- HUD: lives, coins, score, P-meter, timer, reserve item, Dew Stars.
- Juice: squash-and-stretch on jumps/landings, particle bursts (coins, stomps,
  block breaks), screen shake on boss hits, smooth camera with look-ahead and
  platform-snapping vertical behavior.
- Pause menu, game-over and continue flow, end-game credits scroll.
- Death/respawn is fast (<1s) to keep frustration low.

## Process

Work iteratively: engine + physics feel first (build a test level and tune it
until movement feels great), then power-ups and enemies, then World 1 complete
end-to-end including its boss, then remaining worlds, then polish. Keep the
code modular (engine / entities / levels / audio / ui). Build QA tooling as
you go and keep it green: a headless reachability verifier for every level
(goal, checkpoint, every Dew Star, every door reachable under conservative
jump physics), the song-alignment checker, browser-driven playtests of all
levels and full boss fights, and focused mechanics probes (stomp, block bump,
power-ups, shell kick, drop-through, P-meter, checkpoint respawn, boss
damage). At the end, give me a one-paragraph "how to play" and list anything
you'd cut or improve with more time.

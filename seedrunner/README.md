# Sprout Kingdom: Seedrunner

The trilogy finale: a 3D lane-runner built with Three.js and Tone.js, no
external assets, no build step, everything procedural. General Bramble has
fallen — but the last of the bramble rot gathers into the **Rot Tide**, and
the six Sun Seeds must be re-sown before it swallows the Seedways.

**[Play it](https://jason-c-dev.github.io/fable-games-test/seedrunner/)** ·
or double-click `standalone.html` — the whole game in one file.

## How to play

Pip auto-runs. You steer the verbs:

| Verb | Keys | Gamepad | Notes |
|---|---|---|---|
| Lane switch | ← / → or A / D | dpad / stick | 8-frame slide, buffered |
| Jump | Space / W / ↑ | Ⓐ | hold for height; coyote frames off edges |
| Slide | ↓ / S | Ⓑ | cancels into jump; ducks thorn arches |
| Dash | Shift / C | Ⓨ / RB | brief burst + i-frames; refreshed by perfect play |
| **Bloom parry** | X / K | Ⓧ | the trilogy's signature — press on the glint |
| Pause | Esc / P | ≡ | settings + remap live there |

Rot barriers pulse with a glint and a chime ~1.1 s before impact. Parry
inside the window and the barrier **shatters**: time slows, dew banks, and
the Rot Tide is shoved back. The Tide's distance is your health bar — it
creeps closer on its own, surges when you stumble, and falls back for
parries, near-misses and dew chains. One hit stumbles you; a second hit
while you're still rattled — or the Tide catching up — ends the run.

Six campaign **Sowing Runs** cross the four biomes (Meadow, Cavern darkness
with lantern pools, Cloudline wind that bends your jumps, Bramble Wastes
barrier gauntlets), each with a mid-run checkpoint and a Sun Seed to carry
to its shrine. Run 6 is the finale chase, ending in a cutscene and credits.
**Endless mode** (unlocked after Run 1) composes verified chunks with a
daily seed; the title screen runs an attract demo if you idle.

F3 toggles the perf overlay (fps, draw calls, sim state).

## Layout

```
index.html          dev/Pages entry (ES modules + import map)
standalone.html     single-file build (esbuild IIFE, Tone inlined)
js/config.js        every tuning number, Node-safe
js/sim/             the real game: 60 Hz fixed-step, zero DOM/Three imports
                    (player verbs, chunk DSL + library, Rot Tide, runs,
                    the bot that plays it)
js/render/          Three.js: curve mapping, deck ring, instanced props,
                    Pip rig, Tide wall, particles, biome grades
js/audio/           Tone.js: SFX bank + 4-layer adaptive themes
js/ui/              DOM screens: title/select/results/settings/cutscene/credits
tools/              the QA suites (below) + build/record/token tooling
vendor/             three.module.min.js r185, tone.js — pinned, no CDN
```

## QA

```bash
node tools/verify-chunks.js    # the heart: every chunk played in the REAL sim
                               # by a bot capped at human reaction speed —
                               # every speed tier × every entry lane (696
                               # playthroughs), plus all 6 campaign runs and
                               # 3×3-minute endless seeds. Zero problems gate.
node tools/sim-probe.js        # 38 frame-data probes: buffers, coyote,
                               # slide-cancel, dash i-frames, parry window
                               # edges, tide math, determinism — including
                               # probes that assert capabilities.js (the only
                               # closed-form model) against the sim itself
node tools/browser-test.js     # 36 Playwright flows: menus, persistence,
                               # remap, pause, finale→credits→title, attract
                               # demo clearing Run 1, standalone over file://,
                               # dpr 1+2 × aspect matrix, 1080p fps gate
node tools/reaction-audit.js   # prints the reaction-window distribution per
                               # run; minimum must clear the human floor
```

The design lesson carried from generation 2: *a verifier's model of the game
drifts from the game unless you force them together.* Seedrunner's verifier
therefore has no independent physics model — survivability is proven by
playing the actual simulation with human-reaction constraints, and the one
closed-form helper the bot plans with (`js/sim/capabilities.js`) is itself
probed against the sim on every test run. The verifier caught real authoring
bugs during the build (a ramp whose high-tier flight landed on a block, a
block pair closer than one top-speed jump arc) — exactly the class of bug
that shipped in generation 2.

## Prompt retrospective

The build prompt is [`runner3-prompt.md`](runner3-prompt.md), executed
against [`PLAN.md`](PLAN.md). What mattered most, with receipts:

- **"The simulation is your own and Node-importable… Three.js draws, it
  never decides gameplay."** The single highest-leverage constraint, for the
  third generation running. The entire QA surface — 696 chunk playthroughs,
  38 probes, endless-seed soak tests — runs headless in Node at thousands of
  frames per second because the sim imports nothing from the DOM.
- **"A verifier's model of the game and the game itself will drift apart
  unless you force them together."** This clause changed the architecture:
  instead of writing a model-based verifier and hoping, the verifier *is* a
  bot in the real sim. It found unfair chunk authoring within minutes of
  existing, at speeds no human tester would have swept.
- **"Playability assists are requirements, not options."** Input buffering,
  coyote frames, latched presses through hit-stop, landing lane-snap after
  wind — each existed because the prompt demanded them, and each was also
  what let the *bot* play cleanly (Lessons Ledger #3: bots and players trip
  on the same papercuts).
- **"Every room ships verified. There are no 'dev rooms' exempt from QA."**
  The Feel Gym, the tutorial chunks, the credits parade stretch — all in the
  verifier's sweep. Generation 2 shipped its Training Grove broken for
  exactly this omission.
- **"Test at devicePixelRatio 1 and 2 and at least three window aspect
  ratios headlessly."** The dpr/aspect matrix runs in the browser suite and
  the canvas backing-store size is asserted, not eyeballed — generation 2's
  Retina bug stayed dead.
- **The Rot Tide as "distance IS the health bar."** One number drives the
  difficulty, the music's panic layer, the vignette, the rumble bed, and the
  camera pressure. Wiring tension to a single legible quantity did more for
  the game's feel than any individual effect.

What the prompt got less right: it asked for rails ("rails" in the track
DSL) which were cut for scope, and its ~90–120 s target per run needed a
second authoring pass on the finale to hit honestly.

## The honest caveat

As with the whole trilogy: **automated verification is not a human
playthrough.** A reaction-limited bot proving a fair no-hit line exists is
not the same as the run feeling fair at 22 m/s in the Cavern dark. No human
had played Seedrunner end-to-end when it shipped. If something feels wrong,
it probably is — generation 2's history says every such report was a real
bug, and each fix became a permanent probe.

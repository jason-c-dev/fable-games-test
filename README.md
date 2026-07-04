# Fable Games Test

Two complete browser platformers, two generations apart, built entirely by
Claude from a pair of prompts. No external assets anywhere — every sprite,
tile, sound and song in both games is generated in code.

| | Play | Source | Prompt |
|---|---|---|---|
| 🌱 **Sprout Kingdom** | [play it](https://jason-c-dev.github.io/fable-games-test/sprout-kingdom/) | [`sprout-kingdom/`](sprout-kingdom/) | [`platformer-prompt.md`](sprout-kingdom/platformer-prompt.md) |
| 🗡️ **Sprout Kingdom: Overgrown** | [play it](https://jason-c-dev.github.io/fable-games-test/overgrown/) | [`overgrown/`](overgrown/) | [`platformer2-prompt.md`](overgrown/platformer2-prompt.md) |

---

## 🌱 Sprout Kingdom (the original)

A complete 16-bit-style platformer in the classic mold: pure vanilla
JavaScript on a Canvas 2D context, zero dependencies, pixel art drawn
tile-by-tile in code, chiptune-flavoured WebAudio sound.

Pip the sprout crosses four worlds — Meadow, Cavern, Cloudline, and Bramble
Keep — to recover the six Sun Seeds from General Bramble. Momentum movement,
stomps, shell-carrying and chain combos, power tiers (Sprout → Blossom →
Glider Cap), spin-hops, secret exits, bonus cellars, three hidden Dew Stars
per level, and four multi-phase bosses.

**Controls:** arrows/WASD move, Z/Space jump, X run/carry, Down enters
burrow doors. Enter to start.

## 🗡️ Sprout Kingdom: Overgrown (the sequel)

The same kingdom years later, remade as a modern HD action-platformer:
PixiJS v8 (WebGL) rendering of smooth vector-style art with dynamic 2D
lighting and a per-world color-grade/vignette post pass, a skeletal-animation
rig for Pip, GPU-friendly pooled particles, and a fully synthesized adaptive
soundtrack in Tone.js — base layers plus percussion and counter-melody that
crossfade in on the bar as danger rises.

Combat is the headline: the Thorn Blade (3-hit combos, charge spin-slash),
an 8-frame parry that freezes time and reflects projectiles, a down-plunge
pogo, the Sunbeam Lance with mirror-routing light puzzles, and a Sap Gauge
spent on healing or a screen-clearing bloom burst. Movement grows dash,
wall-jump, ledge-grab, swimming and gliding. Dew Stars are currency now,
spent at upgrade shrines without losing the collection record. Four bosses
each built around parry/pogo/dash-through — ending in a duel with General
Bramble where parry timing is the only way through.

**Controls:** arrows/WASD move, Space jump, X sword, C dash, V parry,
F beam, Q heal (Up+Q burst), Esc pause, F3 debug. Gamepad supported, keys
remappable in Settings.

## How they differ

| | Sprout Kingdom | Overgrown |
|---|---|---|
| Rendering | Canvas 2D, 16-bit pixel art | PixiJS v8 WebGL, HD vector-style, lighting + post FX |
| Animation | Frame-flip sprites | Skeletal rigs, squash & stretch, procedural secondary motion |
| Audio | WebAudio chiptune | Tone.js adaptive layered themes, beat-quantized stingers |
| Movement | Run, jump, spin-hop, glide | + dash, wall-jump, ledge-grab, down-plunge pogo, swim |
| Combat | Stomps and shells | Sword combos, parry, ranged beam, specials |
| Health | Power-size tiers | Hearts + Sap Gauge |
| Progression | Score, lives, secret exits | + upgrade shrines, best times, relics |
| Dependencies | None | PixiJS + Tone.js, vendored (no CDN, no build) |
| Sim/QA | Reachability verifier + browser tests | + 86 headless probes that drive the real simulation |
| Code | ~6.2k lines | ~10.2k lines |

Both ship with their own headless QA: a level-reachability verifier tuned to
each game's movement physics, Playwright browser flows, and focused
mechanics tests. Overgrown adds "reality probes" that script the actual
player through wall-jump shafts, dash gaps, updrafts and all four boss
fights — every level in both games is machine-verified completable.

## Running locally

```bash
git clone https://github.com/jason-c-dev/fable-games-test.git
cd fable-games-test
python3 -m http.server 8378
# original: http://localhost:8378/sprout-kingdom/
# sequel:   http://localhost:8378/overgrown/
```

No server handy? `overgrown/standalone.html` is the whole sequel in a single
file — double-click it. (The modular `overgrown/index.html` needs http(s)
because browsers block ES-module loading over `file://`; rebuild the
standalone after code changes with `node tools/build-standalone.js`, which
needs `npm i -g esbuild`.) The original game is classic scripts and runs
from `file://` as-is.

## QA

```bash
cd sprout-kingdom
node tools/verify-levels.js                      # level reachability
NODE_PATH=$(npm root -g) node tools/browser-test.js    # needs the server up

cd ../overgrown
node tools/verify-levels.js    # reachability, all 23 rooms
node tools/sim-probe.js        # 86 headless mechanics + boss probes
node tools/browser-test.js     # 19 Playwright flows (server on :8378)
node tools/mechanics-test.js   # real-keyboard input checks
```

---

Built by Claude (Fable 5) over two sessions in July 2026, from prompts by
[@jason-c-dev](https://github.com/jason-c-dev). The prompts are in the repo;
everything else grew from them.

# StratoPilot — Prototype

A working browser prototype: fly a properly-scaled Airbus A380 ("Swiss" livery)
through a procedural score-attack ring course. Built with Three.js, loading the
corrected `assets/aircraft/a380/model.glb` asset.

## Running it

This uses ES modules and `fetch()`s a binary `.glb` file, both of which browsers
block under the `file://` protocol. You need to serve the repo over local HTTP:

```bash
# from the repo root
python3 -m http.server 8000
```

Then open **http://localhost:8000/game/** in a browser (Chrome/Edge/Firefox,
recent version — WebGL2 required).

Any static server works (`npx serve`, VS Code's Live Server extension, etc.) —
the only requirement is that `/game` and `/assets` are served as siblings so
the relative model path (`../assets/aircraft/a380/model.glb`) resolves.

## Controls

| Key | Action |
|---|---|
| ↑ / ↓ | Pitch (climb / dive) |
| ← / → | Roll (bank left / right) |
| A / D | Yaw (rudder left / right) |
| W / S | Throttle up / down |
| Space | Boost (limited meter, regenerates) |
| R | Reset to start position |

Goal: fly through the gold rings. Chaining rings within a few seconds of each
other builds a combo multiplier. Flying into the ground triggers a crash and
auto-respawn (score is kept, combo resets) — fast retry on purpose, per the
"instant fun" pillar in the main README.

## What's actually implemented

- Arcade-style flight model: throttle-driven thrust, speed-dependent lift
  (with a soft stall below ~55 m/s), drag, gravity, boost.
- Full 3-axis control (pitch/roll/yaw) with a touch of yaw→roll coupling for feel.
- Chase camera that follows aircraft orientation (rolls with the plane) with a
  speed-reactive FOV kick for a sense of speed.
- Procedurally generated, endlessly-recycled ring course (score-attack loop)
  with combo scoring.
- Placeholder ground (procedural grid texture) and cloud puffs — there's no
  real terrain asset yet, this is intentionally a stand-in per the project
  roadmap.
- HUD: speed (knots), altitude, throttle %, score, rings hit, combo, boost meter.

## Known limitations / what to verify on first real playtest

I built and wired this in a sandboxed environment with no real browser/WebGL
available to me, so I could not visually test it myself. Two things in
particular were derived analytically rather than confirmed by eye and are
worth double-checking first:

1. **Control sign conventions** (pitch/roll/yaw directions). I worked these
   out from the quaternion math (see code comments in `main.js`) using the
   confirmed nose direction (-Z, see `A380/NOTES.md` for how that was
   determined from the geometry). They should be correct, but a live
   playtest is the real test.
2. **Ring size and collision thresholds** were tuned by calculation against
   the corrected aircraft's real-world dimensions (76m wingspan, 72.7m
   length), not by eye. If rings feel too tight or too loose, `RING_RADIUS`,
   `RING_TUBE`, and the collision thresholds in `checkRingCollisions()` in
   `main.js` are the place to adjust.

Flight-feel constants (thrust, drag, lift coefficients, rotation rates) are a
first-pass tuning, not derived from real A380 performance data — this is an
arcade game, not a study-level sim, so "feels good" should win over realism
when adjusting them.

## Next steps (not done yet)

- Real terrain/world art to replace the placeholder grid ground.
- Touch/gamepad controls.
- Sound (engine, wind, ring-hit chime).
- Menu/restart flow beyond the single start screen.
- Possibly fix the A380 model's non-watertight mesh and missing texture
  linkage at the source (re-export from Blender with materials properly
  connected) — see `A380/analysis_a380_corrected.md` for the full list of
  asset-level issues found.

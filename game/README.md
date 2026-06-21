# StratoPilot — Prototype

A working browser prototype: fly a properly-scaled Airbus A380 ("Swiss" livery)
through a procedural score-attack ring course. Built with Three.js, loading the
corrected `assets/aircraft/a380/model.glb` asset.

## Running it

**⚠️ Do not just double-click `index.html`.** Opening it directly from your file
browser (a `file://` URL) will not work — browsers block the kind of requests
this needs (loading the `.glb` model, loading the JS as ES modules) under
`file://`. You must serve the project over local HTTP. This is the #1 cause of
"it's stuck on Loading aircraft model."

### Step-by-step

1. Open a terminal.
2. `cd` into the **repo root** — the folder that directly contains `game/`,
   `assets/`, `tools/`, etc. (**Not** into `game/` itself — this is the
   second most common mistake. If you `cd` into `game/` and serve from there,
   the page can't reach `../assets/...` and the model fetch will fail.)
3. Start a local server from that root folder. Pick whichever you have available:

   ```bash
   # Python 3 (Mac/Linux, and Windows if "python3" works in your terminal)
   python3 -m http.server 8000

   # Windows, if "python3" isn't recognized, try:
   python -m http.server 8000

   # Or, if you have Node.js installed:
   npx serve -p 8000
   ```

4. Open your browser to:
   - `http://localhost:8000/game/` (for the `http.server` commands)
   - or whatever URL `npx serve` prints, with `/game/` appended

5. Wait for the start screen to say "Ready." then click **TAKE OFF**.

### If it's still stuck on "Loading aircraft model…"

The page now has a built-in 4-second watchdog — if loading hasn't finished by
then, the loading text itself will update with the **exact URL** it's trying
to fetch and a likely cause. Specifically:

- Open that URL it shows you directly in a new browser tab.
  - If you get a 404 / "file not found" → you're almost certainly serving
    from the wrong directory (see step 2 above). The URL should look like
    `http://localhost:8000/assets/aircraft/a380/model.glb` — if instead it's
    trying something like `http://localhost:8000/assets/...` while your
    server root was `game/`, that confirms it.
  - If the model file downloads/displays fine on its own → the issue is
    something else; open the browser console (`F12` → **Console** tab) and
    check for a red error message, which will say exactly what failed.
- Confirm no other process is already using port 8000 (pick a different
  port, e.g. `8001`, and adjust the URL accordingly, if so).
- Make sure you're using a reasonably recent browser (Chrome, Edge, or
  Firefox) — WebGL2 is required.

Any static server works as long as `/game` and `/assets` are served as
siblings from the same root — the only hard requirement is that the relative
model path (`../assets/aircraft/a380/model.glb`) resolves correctly from
wherever `game/index.html` ends up being served.

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

- **Arcade flight model, velocity locked to the nose direction.** The plane's
  velocity is always exactly `forward * speed` — there's no separate momentum
  vector that can drift away from where the aircraft is pointed. Speed itself
  is driven by throttle thrust, drag (quadratic in speed), and a gravity
  component along the pitch axis (diving converts altitude into speed,
  climbing costs speed). A stall-assist nudges the nose down automatically
  below ~60 m/s so the plane can't just hang motionless in midair — it noses
  over and dives to regain speed, the way a real stall behaves. Cruises around
  ~260 m/s at full throttle, ~345 m/s with boost.
- Full 3-axis control (pitch/roll/yaw) with a touch of yaw→roll coupling for feel.
- Chase camera that follows aircraft orientation (rolls with the plane) with a
  speed-reactive FOV kick for a sense of speed.
- Procedurally generated, endlessly-recycled ring course (score-attack loop)
  with combo scoring — ring spacing tuned for the higher cruise speeds above.
- Placeholder ground (procedural grid texture) and cloud puffs — there's no
  real terrain asset yet, this is intentionally a stand-in per the project
  roadmap.
- HUD: speed (knots), altitude, throttle %, score, rings hit, combo, boost
  meter, and a small FPS counter (bottom-left) so you can verify frame rate
  yourself without opening dev tools.

## Performance

The scene is built to hit 60fps on reasonably modern hardware:

- **Clouds are a single `InstancedMesh`.** The first version spawned ~210
  individual `THREE.Mesh` objects (one draw call each) for decorative cloud
  puffs — by far the biggest avoidable cost, especially on integrated/mobile
  GPUs, which tend to be draw-call-bound. They're now one shared geometry
  rendered in a single instanced draw call.
- **Shadow map dropped from 2048→1024px** and switched from
  `PCFSoftShadowMap` to the cheaper `PCFShadowMap` — a 2048 map is 4x the
  fragment cost of 1024 for a difference that's barely visible at normal
  chase-cam viewing distance.
- **Pixel ratio capped at 1.5** instead of the device's full (sometimes 2-3x
  on high-DPI screens) ratio — fragment cost scales with the square of this
  number, so it's one of the cheapest wins available. Raise it in `main.js`
  (`renderer.setPixelRatio(...)`) if your hardware has headroom.
- **No per-frame allocations in the hot path.** Physics, controls, and camera
  code now reuse a handful of scratch `Vector3`/`Quaternion` objects instead
  of creating new ones every frame, avoiding steady GC pressure that can
  cause periodic stutters even when average FPS looks fine.

If you're still not seeing 60fps after this, check the FPS counter and the
in-game category triangle budget (`A380/analysis_a380_corrected.md` — the
aircraft sits right at the "hero asset" budget, ~38k triangles, rendered
twice per frame once shadows are on, since it's a shadow caster). Biggest
remaining lever would be reducing the aircraft's own polycount or further
shrinking its 4096x2160 fuselage texture — neither done yet, see Next Steps.

## Known limitations / what to verify on first real playtest

I built and wired this in a sandboxed environment with no real browser/WebGL
available to me, so I could not visually test it myself, and have been
iterating based on your feedback. Worth double-checking:

1. **Control sign conventions** (pitch/roll/yaw directions) were worked out
   from the quaternion math (see code comments in `main.js`) using the
   confirmed nose direction (-Z, see `A380/NOTES.md`). Same approach was used
   to confirm the stall auto-correction pitches the nose *down*, not up.
2. **Flight-feel constants** (thrust, drag coefficient, stall speed, rotation
   rates) in the "Physics tuning" block at the top of `main.js` are a
   second-pass tuning aimed at "fast and responsive," not derived from real
   A380 performance data — this is an arcade game, so "feels good" should
   keep winning over realism when adjusting them further.
3. **Ring size and collision thresholds** were tuned by calculation against
   the corrected aircraft's real-world dimensions (76m wingspan, 72.7m
   length) and the new higher cruise speeds. `RING_RADIUS`, `RING_TUBE`, and
   the thresholds in `checkRingCollisions()` are the place to adjust if they
   feel too tight or too loose.

## Next steps (not done yet)

- Real terrain/world art to replace the placeholder grid ground.
- Touch/gamepad controls.
- Sound (engine, wind, ring-hit chime).
- Menu/restart flow beyond the single start screen.
- Shrink the aircraft's fuselage texture (currently 4096x2160) and/or reduce
  its polycount if more frame-time headroom is needed on lower-end hardware.
- Possibly fix the A380 model's non-watertight mesh and missing texture
  linkage at the source (re-export from Blender with materials properly
  connected) — see `A380/analysis_a380_corrected.md` for the full list of
  asset-level issues found.

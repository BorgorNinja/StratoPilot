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

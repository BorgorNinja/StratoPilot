# A380 Model — Analysis & Correction Notes

Source files in this folder (`a380.blend`, `a380.obj`/`.mtl`, and four loose
image files) were analyzed with `tools/analyzer_tool.py` and used to build a
corrected, game-ready asset at `assets/aircraft/a380/model.glb`.

## What was in the folder

| File | What it actually is |
|---|---|
| `a380.blend` | Native Blender source (not directly readable by the analyzer — see `tools/analyzer_tool.md`) |
| `a380.obj` / `a380.mtl` | Legacy Blender 2.79 OBJ export — the geometry source used for analysis |
| `Unbenannt.png` (4096×2160) | Fuselage livery texture — Swiss "schweiz" wordmark, window rows, tail flag decal |
| `swiss turbinenaufdruck.png` (225×225) | Engine nacelle decal — Swiss logo on red |
| `untitled.jpg` (1920×1080) | A Blender viewport **render of the finished, textured model** — turned out to be the key to recovering the intended material setup (see below) |
| `a380 top.png` (1280×879) | A modeling reference blueprint (orthographic views, dimensions) — not a texture |

## Findings (raw OBJ, full report in `analysis_a380_obj.md`)

1. **Scale was off by ~8x.** The model's full bounding box measured roughly
   9.9m × 2.9m × 9.4m. A real A380 (and the modeler's own reference blueprint)
   is about 72.7m long. This is the classic "forgot to Apply Scale before
   export" mistake in Blender. *(This bug also exposed a real flaw in
   `analyzer_tool.py` itself: it was comparing each individual sub-mesh —
   wings, fuselage, engines — against the expected whole-aircraft span, so a
   uniformly-scaled multi-part model never tripped the check. Fixed to compare
   the assembled scene's bounding box instead; see the tool's commit history.)*

2. **Materials had no texture links.** The `.mtl` defines 6 materials, none
   of which reference any image file (no `map_Kd` lines at all), while 4
   texture images sat unused in the folder. As exported, the model would
   render as flat gray.

3. **Geometry is not watertight** on all 6 parts (open edges/holes). Cosmetic
   for rendering purposes, but worth knowing if this model is ever used for
   physics/collision boolean operations later.

4. ~14% average duplicate-vertex rate across parts — typical of this export
   style, not a functional problem.

## How the texture mapping was recovered

Since the `.mtl` carries no texture references, I couldn't safely guess which
image belonged to which part — except `untitled.jpg` is a render of the actual
finished model, which makes the mapping unambiguous by inspection:

- **Fuselage** ("plane" mesh) → `Unbenannt.png`
- **Engine nacelles** ("engines" mesh) → `swiss turbinenaufdruck.png`
- **Wings and remaining parts** → no separate texture in the render (plain
  light body color) — given a flat off-white PBR material rather than
  inventing a texture assignment that isn't evidenced anywhere.
- `a380 top.png` was excluded entirely — it's reference art, not a texture.

## Local axis convention (for anyone integrating this model later)

The exported OBJ is already Y-up (X = wingspan/right, Y = up, Z = length).
Which end is the nose wasn't obvious from the bounding box alone, so I
checked where the tall vertical stabilizer (tail fin) sits by binning fuselage
vertex height along Z: it spikes from ~1.18m to ~2.68m right at the +Z end.
The tail fin is always at the tail, so **+Z is the tail and -Z is the nose**.
This conveniently matches Three.js's own default "forward" axis, so no
corrective rotation was needed when wiring this into the `/game` prototype.

## What `build_corrected_glb.py` does

1. Loads the raw OBJ/MTL geometry.
2. Applies a uniform **7.7253x scale** (derived from matching the model's
   length to the real/reference 72.72m A380 length) to every part.
3. Applies the texture/material mapping above.
4. Exports a single `a380_corrected.glb`.

Result (full report in `analysis_a380_corrected.md`): 76.4m wingspan ×
22.3m tall × 72.7m long — within a few percent of the real A380's 79.75m ×
24.09m × 72.72m, close enough for a game asset. Zero errors, only minor/info
warnings remain (non-watertight geometry, harmless duplicate vertices,
non-power-of-two texture dimensions).

## If you go back to Blender

If you re-export from Blender at some point, re-running
`python3 build_corrected_glb.py` from this folder will rebuild
`a380_corrected.glb` from a fresh `a380.obj`/`a380.mtl` — just make sure the
texture filenames here still match, or update `TEXTURE_MAP` in that script.
Worth fixing at the source too: connect the image textures to the material
nodes in Blender so future OBJ/glTF exports carry the texture links natively
instead of needing this reconstruction step.

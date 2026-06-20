# analyzer_tool — StratoPilot Model Analyzer (Claude Skill Notes)

This is my own context file for `tools/analyzer_tool.py`, a script I built to inspect
3D assets for the StratoPilot project with high precision. I should read this file
**before** analyzing any model in this repo, the same way I'd read a SKILL.md — it
tells me what the tool does, how to run it, and how to interpret its output without
re-deriving the design from scratch each session.

## What this tool is for

Rochelle (and contributors) will commit Blender-made aircraft, prop, and environment
models to `/assets`. Before those assets get integrated into gameplay code, I should
run them through `analyzer_tool.py` to catch problems early — bad scale, broken
geometry, missing UVs/normals, oversized textures, polycount blowouts, and to surface
what materials/animations/rigs are actually present. This replaces eyeballing a model
or trusting that "it looked fine in Blender."

**Trigger conditions** — run this tool when:
- A new model file is committed to `/assets` (or any path) in this repo.
- Rochelle asks me to check, validate, inspect, or analyze a 3D model.
- I'm about to write integration code that depends on a model's structure (node
  names for rigged parts, material slots, animation names, etc.) — verify first,
  don't assume.

## Important limitation: no native `.blend` support

This tool **cannot read `.blend` files directly**. Blender's native format requires
Blender's own Python API (`bpy`), which isn't available in this sandboxed
environment and is impractical to install fresh every session.

The asset pipeline (per the repo README) is **glTF-first**. So the expected workflow is:

1. Model is authored in Blender.
2. Model is exported from Blender to `.glb` (preferred) — File > Export > glTF 2.0,
   format "glTF Binary (.glb)".
3. The exported `.glb` is committed to the repo.
4. I run `analyzer_tool.py` against the `.glb`, not the `.blend`.

If only a `.blend` file is committed and no exported version exists, I should ask
Rochelle to export it first, or — if Blender ever becomes available in this
environment — note that headless export is possible via:
```
blender --background model.blend --python export_script.py
```
but I should not assume Blender is installed; check with `which blender` first
and don't spend time installing the full package unless explicitly asked.

## Supported formats

Full precision: **`.glb` / `.gltf`** (materials, textures, animations, skins/armatures
all introspected via `pygltflib` in addition to geometry via `trimesh`).

Geometry-only (no material/animation introspection): `.obj`, `.stl`, `.ply`.

Partial, best-effort: `.fbx` (trimesh's FBX support depends on optional backends
and may fail on complex files — if it errors, ask for a `.glb` export instead).

## Setup

The container this tool runs in does not persist between sessions, so dependencies
need reinstalling each time I use it:

```bash
pip install -r tools/requirements.txt --break-system-packages
```

or directly:

```bash
pip install trimesh pygltflib numpy Pillow --break-system-packages
```

## Usage

```bash
python3 tools/analyzer_tool.py <path-to-model> [options]
```

Options:
- `--json PATH` — write the full structured report as JSON
- `--md PATH` — write a human-readable Markdown report
- `--category {hero,aircraft,prop,terrain,background}` — selects the triangle
  budget used for the over-budget warning (default: `aircraft`)
- `--expected-span N` — expected longest bounding-box dimension in **meters**,
  used to flag scale mistakes (default: `12.0`). Set this per-asset: a fighter
  jet might be ~15m, a Cessna ~9m, a hangar prop much larger, a cockpit handle
  prop much smaller.
- `--quiet` — suppress console output (useful when only `--json`/`--md` matters)

Example, analyzing a freshly committed aircraft model:
```bash
python3 tools/analyzer_tool.py assets/aircraft/cessna172/model.glb \
  --category aircraft --expected-span 8.3 --md report.md
```

Exit codes: `0` = no critical issues, `1` = critical issues found (see `errors`),
`2` = couldn't run at all (bad path, missing deps).

## How to read the output

The report has three issue severities:

- **error** — will actually break something (inconsistent face winding causing
  inverted shading, missing normals, empty geometry). Should be fixed before
  the asset is integrated.
- **warning** — won't necessarily break the game but is worth a second look
  (non-watertight mesh, missing UVs, scale outliers, over triangle budget,
  oversized/non-power-of-two textures).
- **info** — neutral observations, not necessarily problems (duplicate
  vertices, no materials present, non-power-of-two texture noted separately
  from the warning tier in some cases).

Issue codes I should recognize at a glance:

| Code | Meaning |
|---|---|
| `EMPTY_SCENE` / `EMPTY_MESH` | No usable geometry found |
| `NON_MESH_GEOMETRY` | Geometry present but not a triangle mesh (e.g. a curve/point cloud) |
| `NOT_WATERTIGHT` | Mesh has holes/open edges |
| `INCONSISTENT_WINDING` | Mixed face winding — causes inverted-normal shading bugs |
| `MISSING_NORMALS` | No usable vertex normals |
| `UNNORMALIZED_NORMALS` | Normals present but not unit length |
| `MISSING_UVS` | No UV coordinates — textures won't map |
| `DUPLICATE_VERTICES` | Coincident verts (often harmless, sometimes an export artifact) |
| `DEGENERATE_FACES` | Zero-area triangles |
| `SCALE_OUTLIER` | Bounding box wildly off from `--expected-span` — classic "forgot Apply Scale in Blender" bug |
| `OVER_TRIANGLE_BUDGET` | Total tris exceed the budget for `--category` |
| `LARGE_TEXTURE` | Texture exceeds 4096px on its longest side |
| `NPOT_TEXTURE` | Texture isn't power-of-two sized |
| `NO_MATERIALS` | No materials defined in the glTF |

The **scale check is the single most useful signal** for this project specifically —
the most common real-world Blender export mistake is an un-applied object scale,
which silently produces a model that's 100x or 0.01x the intended size. Always set
`--expected-span` to a sensible real-world value for the asset being checked rather
than relying on the 12.0 default.

For rigged assets (landing gear, control surfaces, propellers), check the
`animations` and `skin_count` fields — `target_node_names` tells me which named
nodes actually have animation channels, which is what I'll need to reference
correctly in any engine-side integration code later.

## Design notes / how the tool works internally

- Geometry analysis (vertex/face counts, bounding box, watertightness, winding
  consistency, normals, duplicate verts, degenerate faces) is done with
  **trimesh**, which has solid built-in mesh-validity checks.
- glTF-specific structural data (materials' full PBR graph, textures, animations,
  skins/armatures, node names) is extracted with **pygltflib** by reading the
  raw glTF JSON/binary directly — trimesh's own glTF loader doesn't expose all
  of this cleanly, especially animation/skin data.
- Triangle budgets in `TRIANGLE_BUDGETS` are starting guesses (hero 80k, aircraft
  40k, prop 10k, terrain 250k, background 2k) and should be tuned once the game
  engine and target platform are finalized — they're not authoritative limits,
  just a useful early warning.
- The "up axis" note is a heuristic (thinnest bounding-box axis), not a real
  axis-convention reader — useful as a sanity nudge, not proof. Blender's native
  axis is Z-up; glTF's spec convention is Y-up; Blender's glTF exporter converts
  automatically on export. If orientation looks wrong in-engine, verify manually
  rather than trusting this heuristic alone.

## Extending the tool

If a future task needs something this doesn't cover yet (e.g. armature bone
hierarchy depth, vertex color channels, LOD group detection, collision-mesh
naming convention checks), extend `analyzer_tool.py` rather than writing a
one-off throwaway script — keep this as the single source of truth for model
inspection so the skill doesn't fragment across sessions. Update this file's
issue-code table and usage notes whenever the tool's behavior changes.

#!/usr/bin/env python3
"""
Builds a corrected, game-ready GLB from the raw A380 OBJ export.

Fixes applied, all evidence-based (not guessed):
1. SCALE: raw OBJ measures ~9.9m wingspan / ~9.4m length. Real A380 (and the
   modeler's own reference blueprint, a380 top.png) puts length at 72.72m.
   Scale factor = 72.72 / 9.414114 = 7.7253 applied uniformly to all parts.
2. TEXTURES: the .mtl defines 6 materials with zero texture map references,
   while 3 loose image files sit unused in the folder. The included
   `untitled.jpg` is a Blender viewport render of the FINISHED textured
   model, which makes the intended mapping unambiguous:
     - "plane" mesh (fuselage)  -> Unbenannt.png   (Swiss livery body texture)
     - "engines" mesh (nacelles) -> swiss turbinenaufdruck.png (engine decal)
     - wings / Material / Material.001 / Material.002 -> no separate texture
       in the reference render (plain light body color) — given a flat
       off-white PBR color instead of fabricating a texture that doesn't exist.
   "a380 top.png" is a modeling reference blueprint, not a texture, and is
   intentionally excluded from the material assignment.
"""
import trimesh
import numpy as np
from PIL import Image

SCALE_FACTOR = 72.72 / 9.414114  # ≈ 7.7253, derived from real/reference A380 length

TEXTURE_MAP = {
    "plane": "Unbenannt.png",
    "engines": "swiss turbinenaufdruck.png",
}
FLAT_COLOR_RGBA = [0.85, 0.87, 0.90, 1.0]  # matches the light fuselage/wing tone seen in untitled.jpg

scene = trimesh.load("a380.obj", process=False, force="scene")
out_scene = trimesh.Scene()

for name, geom in scene.geometry.items():
    geom = geom.copy()
    geom.apply_scale(SCALE_FACTOR)

    uv = geom.visual.uv if hasattr(geom.visual, "uv") else None

    if name in TEXTURE_MAP:
        img = Image.open(TEXTURE_MAP[name]).convert("RGBA")
        material = trimesh.visual.material.PBRMaterial(
            baseColorTexture=img,
            metallicFactor=0.1,
            roughnessFactor=0.6,
        )
    else:
        material = trimesh.visual.material.PBRMaterial(
            baseColorFactor=FLAT_COLOR_RGBA,
            metallicFactor=0.15,
            roughnessFactor=0.5,
        )

    geom.visual = trimesh.visual.TextureVisuals(uv=uv, material=material)
    out_scene.add_geometry(geom, node_name=name, geom_name=name)

out_scene.export("a380_corrected.glb")
print("Wrote a380_corrected.glb")
print("Scale factor applied:", SCALE_FACTOR)
print("New scene bounds (m):", out_scene.bounds.tolist())
size = out_scene.bounds[1] - out_scene.bounds[0]
print("New scene size (m):", size.tolist())

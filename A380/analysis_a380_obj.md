# Model Analysis: `a380.obj`

- **Format:** obj
- **File size:** 2636.1 KB
- **Category:** hero
- **Objects/meshes:** 6
- **Total vertices:** 76,606
- **Total triangles:** 38,416
- **Scene bounding box (m):** 9.889 x 2.886 x 9.414
- **Axis note:** Y appears thinnest (consistent with Z-up orientation, e.g. raw Blender axes)
- **Materials:** 6
- **Textures:** 0
- **Animations:** 0
- **Skins/armatures:** 0

## Issues

| Severity | Code | Location | Message |
|---|---|---|---|
| warning | NOT_WATERTIGHT | plane | Mesh 'plane' is not watertight (holes/open edges present). |
| info | DUPLICATE_VERTICES | plane | Mesh 'plane' has 34752 coincident duplicate vertices. |
| warning | NOT_WATERTIGHT | wings | Mesh 'wings' is not watertight (holes/open edges present). |
| info | DUPLICATE_VERTICES | wings | Mesh 'wings' has 1338 coincident duplicate vertices. |
| warning | NOT_WATERTIGHT | Material | Mesh 'Material' is not watertight (holes/open edges present). |
| info | DUPLICATE_VERTICES | Material | Mesh 'Material' has 528 coincident duplicate vertices. |
| warning | NOT_WATERTIGHT | Material.002 | Mesh 'Material.002' is not watertight (holes/open edges present). |
| info | DUPLICATE_VERTICES | Material.002 | Mesh 'Material.002' has 1280 coincident duplicate vertices. |
| warning | NOT_WATERTIGHT | Material.001 | Mesh 'Material.001' is not watertight (holes/open edges present). |
| info | DUPLICATE_VERTICES | Material.001 | Mesh 'Material.001' has 14072 coincident duplicate vertices. |
| warning | NOT_WATERTIGHT | engines | Mesh 'engines' is not watertight (holes/open edges present). |
| info | DUPLICATE_VERTICES | engines | Mesh 'engines' has 4352 coincident duplicate vertices. |
| error | SCALE_OUTLIER | - | Scene's longest dimension is 9.889m vs expected ~79.75m (0.12x). Severe scale mismatch — almost certainly an un-applied object scale in Blender before export. |
| warning | MATERIAL_NO_TEXTURE | Material | Material 'Material' in a380.mtl has no texture map reference (map_Kd/map_Bump/etc.) — it will render as a flat color, not a textured surface. |
| warning | MATERIAL_NO_TEXTURE | Material.001 | Material 'Material.001' in a380.mtl has no texture map reference (map_Kd/map_Bump/etc.) — it will render as a flat color, not a textured surface. |
| warning | MATERIAL_NO_TEXTURE | Material.002 | Material 'Material.002' in a380.mtl has no texture map reference (map_Kd/map_Bump/etc.) — it will render as a flat color, not a textured surface. |
| warning | MATERIAL_NO_TEXTURE | engines | Material 'engines' in a380.mtl has no texture map reference (map_Kd/map_Bump/etc.) — it will render as a flat color, not a textured surface. |
| warning | MATERIAL_NO_TEXTURE | plane | Material 'plane' in a380.mtl has no texture map reference (map_Kd/map_Bump/etc.) — it will render as a flat color, not a textured surface. |
| warning | MATERIAL_NO_TEXTURE | wings | Material 'wings' in a380.mtl has no texture map reference (map_Kd/map_Bump/etc.) — it will render as a flat color, not a textured surface. |
| warning | ORPHANED_TEXTURES | - | 4 image file(s) found alongside the model that no material references: swiss turbinenaufdruck.png, Unbenannt.png, untitled.jpg, a380 top.png. These are likely intended textures that were never linked in the material — re-export from Blender with image textures connected, or relink manually. |

## Mesh Detail

| Mesh | Verts | Tris | BBox (m) | Watertight | Normals | UVs |
|---|---|---|---|---|---|---|
| plane | 46,380 | 23,248 | 1.16x2.83x9.41 | no | yes | 1 |
| wings | 1,810 | 912 | 9.89x0.84x7.14 | no | yes | 1 |
| Material | 768 | 432 | 6.60x0.43x2.36 | no | yes | 1 |
| Material.002 | 2,048 | 1,024 | 6.83x0.39x0.96 | no | yes | 1 |
| Material.001 | 19,456 | 9,728 | 6.96x0.52x1.85 | no | yes | 1 |
| engines | 6,144 | 3,072 | 6.97x0.53x1.54 | no | yes | 1 |

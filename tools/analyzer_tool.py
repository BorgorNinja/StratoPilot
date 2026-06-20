#!/usr/bin/env python3
"""
StratoPilot Model Analyzer
===========================

A high-precision inspection tool for 3D assets (glTF/.glb, .obj, .fbx, .stl, .ply)
destined for the StratoPilot asset pipeline.

Blender does not export `.blend` files directly to this tool — assets must first
be exported from Blender to one of the supported interchange formats (glTF/.glb
is strongly preferred; see analyzer_tool.md). This tool then inspects the exported
file with engine-relevant precision: geometry integrity, scale sanity, materials,
UVs, normals, animations/rigs, and game-performance budget flags.

Usage:
    python3 analyzer_tool.py <path-to-model> [options]

Options:
    --json PATH          Write the full structured report as JSON to PATH
    --md PATH            Write a human-readable Markdown report to PATH
    --category NAME      Asset category for budget checks: hero | aircraft |
                          prop | terrain | background (default: aircraft)
    --expected-span N    Expected longest bounding-box dimension in meters,
                          used for scale sanity checks (default: 12.0, i.e.
                          a small-to-midsize aircraft)
    --quiet              Suppress console summary (still writes --json/--md
                          if given)

Exit codes:
    0  analysis completed, no critical issues
    1  analysis completed, critical issues found (see report "errors")
    2  analysis could not run (bad path, unreadable file, missing deps)
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import dataclass, field, asdict
from typing import Any, Optional

try:
    import numpy as np
except ImportError:
    print("ERROR: numpy is required. Install with: pip install numpy --break-system-packages", file=sys.stderr)
    sys.exit(2)

try:
    import trimesh
except ImportError:
    print("ERROR: trimesh is required. Install with: pip install trimesh --break-system-packages", file=sys.stderr)
    sys.exit(2)

# pygltflib is optional but unlocks deep glTF-specific introspection
# (animations, skins/armatures, raw material graphs).
try:
    from pygltflib import GLTF2
    HAVE_PYGLTFLIB = True
except ImportError:
    HAVE_PYGLTFLIB = False


# ----------------------------------------------------------------------------
# Game-performance budget tiers (triangles). Tune these as the engine choice
# and target platform are finalized; treat as a starting point, not gospel.
# ----------------------------------------------------------------------------
TRIANGLE_BUDGETS = {
    "hero": 80_000,        # player aircraft, cockpit-detail level
    "aircraft": 40_000,    # AI / multiplayer-visible aircraft
    "prop": 10_000,        # hangars, vehicles, small structures
    "terrain": 250_000,    # terrain chunks / large environment meshes
    "background": 2_000,   # distant scenery, impostors
}

TEXTURE_RESOLUTION_WARN = 4096   # warn above this (memory budget)
TEXTURE_RESOLUTION_NPOT_WARN = True  # warn on non-power-of-two textures


@dataclass
class Issue:
    severity: str   # "error" | "warning" | "info"
    code: str
    message: str
    location: Optional[str] = None


@dataclass
class MeshReport:
    name: str
    vertex_count: int
    face_count: int
    triangle_count: int
    bounding_box_size: list
    bounding_box_min: list
    bounding_box_max: list
    centroid: list
    surface_area: float
    volume: Optional[float]
    is_watertight: bool
    is_winding_consistent: bool
    euler_number: int
    has_normals: bool
    normals_consistent: Optional[bool]
    uv_channel_count: int
    duplicate_vertex_count: int
    degenerate_face_count: int


@dataclass
class MaterialReport:
    name: str
    base_color_factor: Optional[list]
    metallic_factor: Optional[float]
    roughness_factor: Optional[float]
    has_base_color_texture: bool
    has_normal_texture: bool
    has_metallic_roughness_texture: bool
    has_emissive_texture: bool
    alpha_mode: Optional[str]
    double_sided: Optional[bool]


@dataclass
class TextureReport:
    name: str
    width: Optional[int]
    height: Optional[int]
    is_power_of_two: Optional[bool]
    mode: Optional[str]
    approx_bytes: Optional[int]


@dataclass
class AnimationReport:
    name: str
    channel_count: int
    target_node_names: list
    duration_seconds: Optional[float]


@dataclass
class ModelReport:
    file_path: str
    file_format: str
    file_size_bytes: int
    asset_category: str
    object_count: int
    total_vertex_count: int
    total_triangle_count: int
    scene_bounding_box_size: list
    up_axis_guess: str
    meshes: list = field(default_factory=list)
    materials: list = field(default_factory=list)
    textures: list = field(default_factory=list)
    animations: list = field(default_factory=list)
    skin_count: int = 0
    node_hierarchy_depth: int = 0
    issues: list = field(default_factory=list)

    def to_dict(self) -> dict:
        d = asdict(self)
        return d


def _is_power_of_two(n: int) -> bool:
    return n > 0 and (n & (n - 1)) == 0


def _bbox_list(bounds) -> tuple:
    mins = bounds[0].tolist()
    maxs = bounds[1].tolist()
    size = (bounds[1] - bounds[0]).tolist()
    return mins, maxs, size


def _analyze_trimesh_geometry(mesh: "trimesh.Trimesh", name: str) -> MeshReport:
    bounds = mesh.bounds
    mins, maxs, size = _bbox_list(bounds)

    has_normals = mesh.vertex_normals is not None and len(mesh.vertex_normals) == len(mesh.vertices)
    normals_consistent = None
    if has_normals:
        try:
            norms = np.linalg.norm(mesh.vertex_normals, axis=1)
            normals_consistent = bool(np.allclose(norms, 1.0, atol=1e-2))
        except Exception:
            normals_consistent = None

    uv_channels = 0
    try:
        if mesh.visual is not None and hasattr(mesh.visual, "uv") and mesh.visual.uv is not None:
            uv_channels = 1
    except Exception:
        uv_channels = 0

    try:
        unique_verts = len(np.unique(np.round(mesh.vertices, 6), axis=0))
        dup_count = len(mesh.vertices) - unique_verts
    except Exception:
        dup_count = 0

    try:
        areas = mesh.area_faces
        degenerate = int(np.sum(areas < 1e-10))
    except Exception:
        degenerate = 0

    try:
        volume = float(mesh.volume) if mesh.is_watertight else None
    except Exception:
        volume = None

    return MeshReport(
        name=name,
        vertex_count=int(len(mesh.vertices)),
        face_count=int(len(mesh.faces)),
        triangle_count=int(len(mesh.triangles)),
        bounding_box_size=size,
        bounding_box_min=mins,
        bounding_box_max=maxs,
        centroid=mesh.centroid.tolist(),
        surface_area=float(mesh.area),
        volume=volume,
        is_watertight=bool(mesh.is_watertight),
        is_winding_consistent=bool(mesh.is_winding_consistent),
        euler_number=int(mesh.euler_number),
        has_normals=bool(has_normals),
        normals_consistent=normals_consistent,
        uv_channel_count=uv_channels,
        duplicate_vertex_count=int(dup_count),
        degenerate_face_count=int(degenerate),
    )


def _guess_up_axis(scene_bounds_size: list) -> str:
    # Heuristic only — true up-axis must be confirmed against source DCC
    # convention (Blender = Z-up, glTF spec = Y-up). This just flags which
    # axis currently holds the least extent, a common tell for "lying flat".
    x, y, z = scene_bounds_size
    smallest = min(x, y, z)
    if smallest == z:
        return "Z appears thinnest (consistent with Y-up orientation, e.g. exported glTF default)"
    elif smallest == y:
        return "Y appears thinnest (consistent with Z-up orientation, e.g. raw Blender axes)"
    else:
        return "X appears thinnest (unusual — verify orientation manually)"


def _extract_gltf_animations_and_skins(path: str) -> tuple:
    animations = []
    skin_count = 0
    if not HAVE_PYGLTFLIB:
        return animations, skin_count
    if not path.lower().endswith((".glb", ".gltf")):
        return animations, skin_count
    try:
        gltf = GLTF2().load(path)
    except Exception:
        return animations, skin_count

    skin_count = len(gltf.skins) if gltf.skins else 0

    node_names = [n.name or f"node_{i}" for i, n in enumerate(gltf.nodes or [])]

    for anim in (gltf.animations or []):
        target_names = []
        for ch in (anim.channels or []):
            if ch.target and ch.target.node is not None and ch.target.node < len(node_names):
                target_names.append(node_names[ch.target.node])

        duration = None
        try:
            sampler_times = []
            for sampler in (anim.samplers or []):
                acc = gltf.accessors[sampler.input]
                if acc.max:
                    sampler_times.append(acc.max[0])
            if sampler_times:
                duration = max(sampler_times)
        except Exception:
            duration = None

        animations.append(AnimationReport(
            name=anim.name or "unnamed_animation",
            channel_count=len(anim.channels or []),
            target_node_names=sorted(set(target_names)),
            duration_seconds=duration,
        ))

    return animations, skin_count


def _extract_gltf_materials(path: str) -> list:
    materials = []
    if not HAVE_PYGLTFLIB or not path.lower().endswith((".glb", ".gltf")):
        return materials
    try:
        gltf = GLTF2().load(path)
    except Exception:
        return materials

    for i, mat in enumerate(gltf.materials or []):
        pbr = mat.pbrMetallicRoughness
        materials.append(MaterialReport(
            name=mat.name or f"material_{i}",
            base_color_factor=list(pbr.baseColorFactor) if pbr and pbr.baseColorFactor else None,
            metallic_factor=pbr.metallicFactor if pbr else None,
            roughness_factor=pbr.roughnessFactor if pbr else None,
            has_base_color_texture=bool(pbr and pbr.baseColorTexture),
            has_normal_texture=bool(mat.normalTexture),
            has_metallic_roughness_texture=bool(pbr and pbr.metallicRoughnessTexture),
            has_emissive_texture=bool(mat.emissiveTexture),
            alpha_mode=mat.alphaMode,
            double_sided=mat.doubleSided,
        ))
    return materials


def _extract_textures(path: str) -> list:
    textures = []
    if not path.lower().endswith((".glb", ".gltf")):
        return textures
    try:
        scene_or_mesh = trimesh.load(path, process=False)
    except Exception:
        return textures

    geometries = []
    if isinstance(scene_or_mesh, trimesh.Scene):
        geometries = list(scene_or_mesh.geometry.values())
    else:
        geometries = [scene_or_mesh]

    seen = set()
    for geom in geometries:
        visual = getattr(geom, "visual", None)
        material = getattr(visual, "material", None) if visual is not None else None
        if material is None:
            continue
        for attr in ("baseColorTexture", "image", "metallicRoughnessTexture", "normalTexture", "emissiveTexture"):
            img = getattr(material, attr, None)
            if img is None:
                continue
            try:
                from PIL import Image
                if not isinstance(img, Image.Image):
                    continue
                key = (attr, img.size, img.mode)
                if key in seen:
                    continue
                seen.add(key)
                w, h = img.size
                textures.append(TextureReport(
                    name=attr,
                    width=w,
                    height=h,
                    is_power_of_two=bool(_is_power_of_two(w) and _is_power_of_two(h)),
                    mode=img.mode,
                    approx_bytes=w * h * len(img.getbands()),
                ))
            except Exception:
                continue
    return textures


def _extract_obj_materials_and_orphans(path: str) -> tuple:
    """For .obj files: parse the referenced .mtl to list materials and flag
    materials with no texture map references, plus image files sitting in
    the same folder that no material actually points to. This catches a
    common real-world export problem: a Blender OBJ export where geometry
    and materials carry over but image texture links are dropped, leaving
    loose PNG/JPG files that nothing in the model actually uses.
    """
    materials = []
    issues = []
    if not path.lower().endswith(".obj"):
        return materials, issues

    folder = os.path.dirname(os.path.abspath(path))
    mtl_path = None
    try:
        with open(path, "r", errors="ignore") as f:
            for line in f:
                if line.strip().lower().startswith("mtllib"):
                    mtl_name = line.strip().split(None, 1)[1]
                    candidate = os.path.join(folder, mtl_name)
                    if os.path.isfile(candidate):
                        mtl_path = candidate
                    break
    except Exception:
        return materials, issues

    if not mtl_path:
        issues.append(Issue("warning", "NO_MTL_FOUND", "OBJ references no resolvable .mtl file; materials cannot be inspected."))
        return materials, issues

    current = None
    mat_has_texture = {}
    texture_refs = set()
    try:
        with open(mtl_path, "r", errors="ignore") as f:
            for line in f:
                line = line.strip()
                if line.startswith("newmtl"):
                    current = line.split(None, 1)[1]
                    mat_has_texture[current] = False
                elif line.lower().startswith("map_") and current is not None:
                    mat_has_texture[current] = True
                    parts = line.split(None, 1)
                    if len(parts) > 1:
                        texture_refs.add(os.path.basename(parts[1].strip()))
    except Exception:
        return materials, issues

    for name, has_tex in mat_has_texture.items():
        materials.append(MaterialReport(
            name=name,
            base_color_factor=None,
            metallic_factor=None,
            roughness_factor=None,
            has_base_color_texture=has_tex,
            has_normal_texture=False,
            has_metallic_roughness_texture=False,
            has_emissive_texture=False,
            alpha_mode=None,
            double_sided=None,
        ))
        if not has_tex:
            issues.append(Issue(
                "warning", "MATERIAL_NO_TEXTURE",
                f"Material '{name}' in {os.path.basename(mtl_path)} has no texture map reference "
                f"(map_Kd/map_Bump/etc.) — it will render as a flat color, not a textured surface.",
                location=name,
            ))

    # Look for image files in the same folder that no material references —
    # a strong signal the textures exist but were never linked during export.
    image_exts = (".png", ".jpg", ".jpeg", ".tga", ".bmp", ".tif", ".tiff")
    try:
        loose_images = [f for f in os.listdir(folder) if f.lower().endswith(image_exts)]
    except Exception:
        loose_images = []
    unreferenced = [f for f in loose_images if f not in texture_refs]
    if unreferenced and not texture_refs:
        issues.append(Issue(
            "warning", "ORPHANED_TEXTURES",
            f"{len(unreferenced)} image file(s) found alongside the model that no material references: "
            f"{', '.join(unreferenced)}. These are likely intended textures that were never linked in "
            f"the material — re-export from Blender with image textures connected, or relink manually.",
        ))

    return materials, issues


def analyze(path: str, category: str = "aircraft", expected_span: float = 12.0) -> ModelReport:
    if not os.path.isfile(path):
        raise FileNotFoundError(f"No such file: {path}")

    file_size = os.path.getsize(path)
    ext = os.path.splitext(path)[1].lower().lstrip(".")

    issues: list = []

    try:
        loaded = trimesh.load(path, process=False, force="scene")
    except Exception as e:
        raise RuntimeError(f"trimesh failed to load '{path}': {e}")

    if isinstance(loaded, trimesh.Scene):
        scene = loaded
    else:
        scene = trimesh.Scene(loaded)

    mesh_reports = []
    total_verts = 0
    total_tris = 0

    if len(scene.geometry) == 0:
        issues.append(Issue("error", "EMPTY_SCENE", "No geometry found in file."))

    for name, geom in scene.geometry.items():
        if not isinstance(geom, trimesh.Trimesh):
            issues.append(Issue("warning", "NON_MESH_GEOMETRY", f"Geometry '{name}' is not a triangle mesh (skipped detailed analysis).", location=name))
            continue
        if len(geom.vertices) == 0:
            issues.append(Issue("warning", "EMPTY_MESH", f"Mesh '{name}' has zero vertices.", location=name))
            continue

        mr = _analyze_trimesh_geometry(geom, name)
        mesh_reports.append(mr)
        total_verts += mr.vertex_count
        total_tris += mr.triangle_count

        if not mr.is_watertight:
            issues.append(Issue("warning", "NOT_WATERTIGHT", f"Mesh '{name}' is not watertight (holes/open edges present).", location=name))
        if not mr.is_winding_consistent:
            issues.append(Issue("error", "INCONSISTENT_WINDING", f"Mesh '{name}' has inconsistent face winding (will cause inverted-normal shading bugs).", location=name))
        if not mr.has_normals:
            issues.append(Issue("error", "MISSING_NORMALS", f"Mesh '{name}' has no usable vertex normals.", location=name))
        elif mr.normals_consistent is False:
            issues.append(Issue("warning", "UNNORMALIZED_NORMALS", f"Mesh '{name}' has non-unit-length normals.", location=name))
        if mr.uv_channel_count == 0:
            issues.append(Issue("warning", "MISSING_UVS", f"Mesh '{name}' has no UV coordinates (textures will not map correctly).", location=name))
        if mr.duplicate_vertex_count > 0:
            issues.append(Issue("info", "DUPLICATE_VERTICES", f"Mesh '{name}' has {mr.duplicate_vertex_count} coincident duplicate vertices.", location=name))
        if mr.degenerate_face_count > 0:
            issues.append(Issue("warning", "DEGENERATE_FACES", f"Mesh '{name}' has {mr.degenerate_face_count} zero-area (degenerate) faces.", location=name))

    budget = TRIANGLE_BUDGETS.get(category, TRIANGLE_BUDGETS["aircraft"])
    if total_tris > budget:
        issues.append(Issue(
            "warning", "OVER_TRIANGLE_BUDGET",
            f"Total triangle count {total_tris:,} exceeds the '{category}' budget of {budget:,}.",
        ))

    scene_bounds = scene.bounds
    if scene_bounds is not None:
        _, _, scene_size = _bbox_list(scene_bounds)
    else:
        scene_size = [0.0, 0.0, 0.0]

    # Scene-level scale check. This MUST run against the whole assembled model,
    # not individual sub-meshes (wings/fuselage/engines are naturally smaller
    # than the full aircraft span — comparing a sub-part against the expected
    # whole-aircraft span produces false negatives on real multi-part models).
    scene_max_dim = max(scene_size) if scene_size else 0
    if scene_max_dim > 0 and expected_span > 0:
        ratio = scene_max_dim / expected_span
        if ratio > 8 or ratio < 1 / 8:
            issues.append(Issue(
                "error", "SCALE_OUTLIER",
                f"Scene's longest dimension is {scene_max_dim:.3f}m vs expected ~{expected_span}m "
                f"({ratio:.2f}x). Severe scale mismatch — almost certainly an un-applied object "
                f"scale in Blender before export.",
            ))
        elif ratio > 3 or ratio < 1 / 3:
            issues.append(Issue(
                "warning", "SCALE_OUTLIER",
                f"Scene's longest dimension is {scene_max_dim:.3f}m vs expected ~{expected_span}m "
                f"({ratio:.2f}x). Worth double-checking 'Apply Scale' (Ctrl+A) was used in Blender "
                f"before export, or that --expected-span matches this specific aircraft.",
            ))

    materials = _extract_gltf_materials(path)
    obj_materials, obj_issues = _extract_obj_materials_and_orphans(path)
    materials.extend(obj_materials)
    issues.extend(obj_issues)
    textures = _extract_textures(path)
    animations, skin_count = _extract_gltf_animations_and_skins(path)

    for tex in textures:
        if tex.width and tex.height:
            if max(tex.width, tex.height) > TEXTURE_RESOLUTION_WARN:
                issues.append(Issue("warning", "LARGE_TEXTURE", f"Texture '{tex.name}' is {tex.width}x{tex.height}, above the {TEXTURE_RESOLUTION_WARN}px guideline."))
            if TEXTURE_RESOLUTION_NPOT_WARN and not tex.is_power_of_two:
                issues.append(Issue("info", "NPOT_TEXTURE", f"Texture '{tex.name}' ({tex.width}x{tex.height}) is not power-of-two."))

    if not materials and ext in ("glb", "gltf"):
        issues.append(Issue("info", "NO_MATERIALS", "No materials found in glTF file."))

    node_depth = 0
    try:
        if hasattr(scene, "graph") and scene.graph is not None:
            node_depth = len(scene.graph.nodes_geometry)
    except Exception:
        node_depth = 0

    report = ModelReport(
        file_path=os.path.abspath(path),
        file_format=ext,
        file_size_bytes=file_size,
        asset_category=category,
        object_count=len(mesh_reports),
        total_vertex_count=total_verts,
        total_triangle_count=total_tris,
        scene_bounding_box_size=scene_size,
        up_axis_guess=_guess_up_axis(scene_size) if any(scene_size) else "unknown (zero-size scene)",
        meshes=[asdict(m) for m in mesh_reports],
        materials=[asdict(m) for m in materials],
        textures=[asdict(t) for t in textures],
        animations=[asdict(a) for a in animations],
        skin_count=skin_count,
        node_hierarchy_depth=node_depth,
        issues=[asdict(i) for i in issues],
    )
    return report


def print_summary(report: ModelReport) -> None:
    print("=" * 70)
    print(f"StratoPilot Model Analyzer — {os.path.basename(report.file_path)}")
    print("=" * 70)
    print(f"Format:            {report.file_format}")
    print(f"File size:         {report.file_size_bytes / 1024:.1f} KB")
    print(f"Category:          {report.asset_category}")
    print(f"Objects/meshes:    {report.object_count}")
    print(f"Total vertices:    {report.total_vertex_count:,}")
    print(f"Total triangles:   {report.total_triangle_count:,}")
    bb = report.scene_bounding_box_size
    print(f"Scene bbox (m):    {bb[0]:.3f} x {bb[1]:.3f} x {bb[2]:.3f}")
    print(f"Axis note:         {report.up_axis_guess}")
    print(f"Materials:         {len(report.materials)}")
    print(f"Textures:          {len(report.textures)}")
    print(f"Animations:        {len(report.animations)}")
    print(f"Skins/armatures:   {report.skin_count}")
    print("-" * 70)

    errors = [i for i in report.issues if i["severity"] == "error"]
    warnings = [i for i in report.issues if i["severity"] == "warning"]
    infos = [i for i in report.issues if i["severity"] == "info"]

    print(f"Issues: {len(errors)} error(s), {len(warnings)} warning(s), {len(infos)} info")
    for i in errors:
        print(f"  [ERROR]   {i['code']}: {i['message']}")
    for i in warnings:
        print(f"  [WARN]    {i['code']}: {i['message']}")
    for i in infos:
        print(f"  [INFO]    {i['code']}: {i['message']}")
    print("=" * 70)


def write_markdown_report(report: ModelReport, path: str) -> None:
    lines = []
    lines.append(f"# Model Analysis: `{os.path.basename(report.file_path)}`\n")
    lines.append(f"- **Format:** {report.file_format}")
    lines.append(f"- **File size:** {report.file_size_bytes / 1024:.1f} KB")
    lines.append(f"- **Category:** {report.asset_category}")
    lines.append(f"- **Objects/meshes:** {report.object_count}")
    lines.append(f"- **Total vertices:** {report.total_vertex_count:,}")
    lines.append(f"- **Total triangles:** {report.total_triangle_count:,}")
    bb = report.scene_bounding_box_size
    lines.append(f"- **Scene bounding box (m):** {bb[0]:.3f} x {bb[1]:.3f} x {bb[2]:.3f}")
    lines.append(f"- **Axis note:** {report.up_axis_guess}")
    lines.append(f"- **Materials:** {len(report.materials)}")
    lines.append(f"- **Textures:** {len(report.textures)}")
    lines.append(f"- **Animations:** {len(report.animations)}")
    lines.append(f"- **Skins/armatures:** {report.skin_count}\n")

    if report.issues:
        lines.append("## Issues\n")
        lines.append("| Severity | Code | Location | Message |")
        lines.append("|---|---|---|---|")
        for i in report.issues:
            loc = i.get("location") or "-"
            lines.append(f"| {i['severity']} | {i['code']} | {loc} | {i['message']} |")
        lines.append("")
    else:
        lines.append("## Issues\n\nNone found.\n")

    if report.meshes:
        lines.append("## Mesh Detail\n")
        lines.append("| Mesh | Verts | Tris | BBox (m) | Watertight | Normals | UVs |")
        lines.append("|---|---|---|---|---|---|---|")
        for m in report.meshes:
            bbs = m["bounding_box_size"]
            bbox_str = f"{bbs[0]:.2f}x{bbs[1]:.2f}x{bbs[2]:.2f}"
            lines.append(f"| {m['name']} | {m['vertex_count']:,} | {m['triangle_count']:,} | {bbox_str} | "
                         f"{'yes' if m['is_watertight'] else 'no'} | {'yes' if m['has_normals'] else 'no'} | "
                         f"{m['uv_channel_count']} |")
        lines.append("")

    if report.animations:
        lines.append("## Animations\n")
        lines.append("| Name | Channels | Targets | Duration (s) |")
        lines.append("|---|---|---|---|")
        for a in report.animations:
            targets = ", ".join(a["target_node_names"][:5])
            lines.append(f"| {a['name']} | {a['channel_count']} | {targets} | {a['duration_seconds']} |")
        lines.append("")

    with open(path, "w") as f:
        f.write("\n".join(lines))


def main():
    parser = argparse.ArgumentParser(description="StratoPilot high-precision 3D model analyzer.")
    parser.add_argument("model_path", help="Path to .glb/.gltf/.obj/.fbx/.stl/.ply file")
    parser.add_argument("--json", dest="json_path", default=None, help="Write JSON report to this path")
    parser.add_argument("--md", dest="md_path", default=None, help="Write Markdown report to this path")
    parser.add_argument("--category", default="aircraft", choices=list(TRIANGLE_BUDGETS.keys()),
                         help="Asset category for triangle-budget checks")
    parser.add_argument("--expected-span", type=float, default=12.0,
                         help="Expected longest bounding-box dimension in meters")
    parser.add_argument("--quiet", action="store_true", help="Suppress console summary")
    args = parser.parse_args()

    try:
        report = analyze(args.model_path, category=args.category, expected_span=args.expected_span)
    except FileNotFoundError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(2)
    except RuntimeError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(2)

    if not args.quiet:
        print_summary(report)

    if args.json_path:
        with open(args.json_path, "w") as f:
            json.dump(report.to_dict(), f, indent=2)
        if not args.quiet:
            print(f"\nJSON report written to {args.json_path}")

    if args.md_path:
        write_markdown_report(report, args.md_path)
        if not args.quiet:
            print(f"Markdown report written to {args.md_path}")

    has_errors = any(i["severity"] == "error" for i in report.issues)
    sys.exit(1 if has_errors else 0)


if __name__ == "__main__":
    main()

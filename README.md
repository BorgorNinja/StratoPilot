# StratoPilot ✈️

**An addictive, arcade-meets-simulation flight game built for "just one more flight" energy.**

StratoPilot blends the satisfying feel of real flight mechanics with fast, rewarding, replayable gameplay loops. Think *Microsoft Flight Simulator* physics meeting *Subway Surfers* dopamine — easy to pick up, hard to put down, deeply satisfying to master.

> 🚧 **Status: Early Prototype**
> A working browser prototype exists in [`/game`](./game) — flyable A380 model, arcade flight physics, score-attack ring course. See **Quick Start** below to run it. Most of the game is still unbuilt; see the roadmap further down.

## 🚀 Quick Start (run the prototype)

```bash
# from the repo root (the folder this README is in)
python3 -m http.server 8000
```
Then open **http://localhost:8000/game/** in Chrome, Edge, or Firefox.

⚠️ Don't double-click `game/index.html` directly — it won't work (browsers
block local module/asset loading under `file://`). Full setup help and
troubleshooting (including what to do if it hangs on "Loading aircraft
model…") is in [`game/README.md`](./game/README.md).

---

## 🎯 Core Vision

StratoPilot should feel **addictive** the way the best mobile and indie sim-hybrids do. That means:

- **Instant fun, deep mastery** — anyone can take off in seconds, but mastering landings, formation flying, and tight canyon runs takes real skill.
- **Tight feedback loops** — every flight ends in a score, a near-miss replay, a new unlock, or a "beat your best" prompt.
- **Momentum-driven progression** — XP, currency, unlockable aircraft, cosmetic liveries, and route challenges that always leave one more goal just within reach.
- **Short session, long retention** — a single flight should be completable in 2–5 minutes, but the meta-game (career mode, leaderboards, daily challenges) should pull players back daily.
- **Satisfying "game feel"** — responsive controls, weighty physics, great camera work, juicy UI/UX, and sound design that makes every takeoff and landing feel good.

---

## 🕹️ Planned Gameplay Pillars

1. **Free Flight** — open-world sandbox flying across varied biomes (mountains, coastlines, cities, deserts, arctic).
2. **Career / Campaign Mode** — progressively unlock aircraft, routes, and challenges (cargo runs, aerobatics, emergency landings, search & rescue).
3. **Score Attack / Challenge Runs** — time trials, canyon races, precision landing challenges, low-fuel "dead-stick" landings.
4. **Multiplayer (Stretch Goal)** — shared skies, ghost replays, leaderboard races, formation flying with friends.
5. **Daily/Weekly Challenges** — rotating objectives to drive recurring engagement.
6. **Progression & Customization** — unlockable aircraft, liveries, cockpits, and pilot profiles.

---

## ✈️ Aircraft & Asset Pipeline

StratoPilot is built around a **Blender-first asset workflow**. The game must support importing and rendering custom 3D aircraft and environment models created in Blender.

### Requirements
- Native support for **Blender-exported models** (via `.glTF`/`.glb` and/or `.fbx` export pipelines).
- A consistent rig/scale/axis convention for all aircraft models (to be defined in `docs/asset-guidelines.md` once finalized).
- Support for PBR materials (albedo, normal, roughness/metallic, emissive) authored in Blender and exported cleanly into the chosen game engine.
- A modular pipeline so new aircraft, props, and environment assets can be dropped in without engine-side code changes wherever possible.
- Placeholder/LOD-friendly structure to keep performance high across many aircraft and large open-world terrain.

### Planned Asset Folder Structure (subject to change)
```
/assets
  /aircraft
    /<aircraft-name>
      model.glb
      textures/
      cockpit.glb
  /environment
    /terrain
    /props
    /skyboxes
  /ui
  /audio
```

> Aircraft, terrain, and prop models will be added by the project owner directly. This README exists to establish context and conventions ahead of that — actual integration code comes later.

### Model Validation

Before integrating any committed asset, run it through `tools/analyzer_tool.py` —
a precision inspector for glTF/.glb (and .obj/.stl/.ply) models that checks scale
sanity, geometry integrity (watertightness, normals, winding), UVs, materials,
textures, and animations/rigs. See `tools/analyzer_tool.md` for full usage and
how to interpret its output.


---

## 🧱 Tech Stack (To Be Finalized)

| Area | Candidate Tools |
|---|---|
| Engine | TBD (Godot / Unity / Unreal / custom) |
| 3D Modeling | **Blender** |
| Physics | Custom flight model or engine-native physics + custom flight dynamics |
| Scripting | TBD based on engine choice |
| Version Control | Git + GitHub |
| Asset Export | glTF 2.0 (`.glb`) preferred for engine portability |

---

## 📋 Roadmap (High-Level)

- [ ] Finalize engine choice
- [ ] Define Blender → engine export pipeline & naming conventions
- [ ] Import first placeholder aircraft model
- [ ] Build core flight physics prototype
- [ ] Build basic open-world terrain test scene
- [ ] Implement camera system (cockpit, chase, cinematic)
- [ ] Build core gameplay loop (takeoff → flight → landing → score)
- [ ] Add progression/unlock system
- [ ] Add challenge/mission system
- [ ] Polish game feel (sound, UI, juice)
- [ ] Multiplayer prototype (stretch)

---

## 🤝 Contributing / Workflow

- Aircraft and environment **Blender models** will be committed directly to `/assets` by the repo owner.
- Code contributions should respect the asset folder structure above once established.
- Keep commits scoped and descriptive — this project will iterate quickly once development begins.

---

## 📄 License

TBD.

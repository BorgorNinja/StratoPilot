import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// ---------------------------------------------------------------------------
// StratoPilot — flight prototype
//
// Model forward axis: confirmed via geometry analysis that the tail fin
// (tallest part of the fuselage) sits at +Z, so the nose points toward -Z —
// which is also Three.js's own default "forward". No corrective rotation
// needed on the loaded asset.
//
// Flight model: velocity is always locked to the aircraft's nose direction
// (velocity = forward * speed). This is a deliberate arcade simplification —
// an earlier version tracked velocity as a free vector independent of
// orientation, which is more "realistic" in principle but felt like
// uncontrolled drifting/sliding whenever the plane turned, since momentum in
// the old direction lingered instead of following the new heading. Locking
// velocity to the nose direction means the plane always flies exactly where
// it's pointed — no drift, no floaty hovering.
// ---------------------------------------------------------------------------

const MODEL_PATH = '../assets/aircraft/a380/model.glb';

// ----- DOM -----
const canvas = document.getElementById('scene');
const startScreen = document.getElementById('start-screen');
const startButton = document.getElementById('start-button');
const loadingStatus = document.getElementById('loading-status');
const messageBanner = document.getElementById('message-banner');
const comboDisplay = document.getElementById('combo-display');
const comboCountEl = document.getElementById('combo-count');
const hudSpeed = document.getElementById('hud-speed');
const hudAlt = document.getElementById('hud-alt');
const hudThrottle = document.getElementById('hud-throttle');
const hudScore = document.getElementById('hud-score');
const hudRings = document.getElementById('hud-rings');
const boostFill = document.getElementById('boost-bar-fill');
const fpsCounter = document.getElementById('fps-counter');

// ----- Renderer / Scene / Camera -----
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
// Capped at 1.5 rather than the device's full pixel ratio (which can be 2-3x
// on high-DPI laptops/phones) — fragment shader cost scales with the square
// of this number, so this is one of the cheapest wins available for hitting
// a stable 60fps. Raise it if you have headroom.
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap; // cheaper than PCFSoftShadowMap, still reasonably smooth

const scene = new THREE.Scene();
const SKY_COLOR = 0x8fd0ff;
scene.background = new THREE.Color(SKY_COLOR);
scene.fog = new THREE.Fog(SKY_COLOR, 800, 9000);

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.5, 20000);
const BASE_FOV = 62;

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', onResize);
onResize();

// ----- Lighting -----
const hemi = new THREE.HemisphereLight(0xbfe3ff, 0x3a4a2e, 0.9);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xfff3d6, 1.6);
sun.position.set(-800, 1200, -400);
sun.castShadow = true;
// 1024 instead of 2048 — a 2048 shadow map is 4x the fragment cost of 1024
// for a difference that's barely visible at the distances this game is
// actually viewed from. This was one of the larger frame-time costs.
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -600;
sun.shadow.camera.right = 600;
sun.shadow.camera.top = 600;
sun.shadow.camera.bottom = -600;
sun.shadow.camera.far = 4000;
scene.add(sun);

// ----- Ground (placeholder — no terrain asset yet, per project roadmap) -----
function buildGridTexture() {
  const size = 512;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#2f5d3a';
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 2;
  const step = size / 8;
  for (let i = 0; i <= 8; i++) {
    ctx.beginPath(); ctx.moveTo(i * step, 0); ctx.lineTo(i * step, size); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * step); ctx.lineTo(size, i * step); ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(400, 400);
  return tex;
}

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(60000, 60000),
  new THREE.MeshStandardMaterial({ map: buildGridTexture(), roughness: 1 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// ----- Cloud puffs for depth cues -----
//
// PERFORMANCE: this used to be ~210 individual THREE.Mesh objects (each with
// its own freshly-created geometry), which is ~210 separate draw calls every
// frame for completely static decoration — by far the single biggest avoidable
// cost in the scene, especially on integrated/mobile GPUs which tend to be
// draw-call-bound rather than fragment-bound. Rewritten as a single
// InstancedMesh sharing one geometry: all puffs now render in ONE draw call.
function buildClouds() {
  const CLUSTER_COUNT = 50;
  const puffCounts = [];
  let total = 0;
  for (let i = 0; i < CLUSTER_COUNT; i++) {
    const n = 3 + Math.floor(Math.random() * 4);
    puffCounts.push(n);
    total += n;
  }

  const geo = new THREE.IcosahedronGeometry(1, 0); // unit size, scaled per-instance below
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true });
  const instanced = new THREE.InstancedMesh(geo, mat, total);
  instanced.castShadow = false;
  instanced.receiveShadow = false;
  instanced.frustumCulled = false; // clouds are spread across a huge radius; per-instance culling isn't worth it here

  const dummy = new THREE.Object3D();
  let idx = 0;
  for (let i = 0; i < CLUSTER_COUNT; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 600 + Math.random() * 4500;
    const cx = Math.cos(angle) * dist;
    const cy = 150 + Math.random() * 700;
    const cz = Math.sin(angle) * dist;
    for (let p = 0; p < puffCounts[i]; p++) {
      const radius = 20 + Math.random() * 25;
      dummy.position.set(
        cx + (Math.random() - 0.5) * 60,
        cy + (Math.random() - 0.5) * 15,
        cz + (Math.random() - 0.5) * 60
      );
      dummy.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      dummy.scale.setScalar(radius);
      dummy.updateMatrix();
      instanced.setMatrixAt(idx, dummy.matrix);
      idx++;
    }
  }
  instanced.instanceMatrix.needsUpdate = true;
  return instanced;
}
scene.add(buildClouds());

// ----- Aircraft -----
const aircraft = new THREE.Group();
scene.add(aircraft);

let modelLoaded = false;
let loadFailed = false;
const loader = new GLTFLoader();

const resolvedModelUrl = new URL(MODEL_PATH, window.location.href).href;
console.log('[StratoPilot] Attempting to load model from:', resolvedModelUrl);
loadingStatus.textContent = 'Loading aircraft model…';

const STALL_WARNING_MS = 4000;
const stallTimer = setTimeout(() => {
  if (!modelLoaded && !loadFailed) {
    loadingStatus.innerHTML =
      `Still loading after ${STALL_WARNING_MS / 1000}s — this usually means it isn't being served correctly.<br>` +
      `Trying to fetch: <code>${resolvedModelUrl}</code><br>` +
      `Open that exact URL directly in a new browser tab. If you see a 404 or "file not found," ` +
      `you're most likely running the local server from the <b>/game</b> folder instead of the ` +
      `repo root — see game/README.md for the exact command. ` +
      `Also check the browser console (F12 → Console) for the real error.`;
  }
}, STALL_WARNING_MS);

loader.load(
  MODEL_PATH,
  (gltf) => {
    clearTimeout(stallTimer);
    const model = gltf.scene;
    model.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = false;
      }
    });
    aircraft.add(model);
    modelLoaded = true;
    loadingStatus.textContent = 'Ready.';
    startButton.disabled = false;
  },
  (xhr) => {
    if (xhr.total) {
      const pct = Math.round((xhr.loaded / xhr.total) * 100);
      loadingStatus.textContent = `Loading aircraft model… ${pct}%`;
    } else if (xhr.loaded) {
      loadingStatus.textContent = `Loading aircraft model… ${(xhr.loaded / 1024 / 1024).toFixed(1)} MB`;
    }
  },
  (err) => {
    clearTimeout(stallTimer);
    loadFailed = true;
    console.error('[StratoPilot] Failed to load model:', err);
    loadingStatus.innerHTML =
      `Failed to load the model.<br>` +
      `Tried: <code>${resolvedModelUrl}</code><br>` +
      `Make sure you're running a local server from the <b>repo root</b> (not the /game folder) — ` +
      `see game/README.md. Check the browser console (F12) for the exact error.`;
  }
);
startButton.disabled = true;

// ----- Physics tuning -----
const GRAVITY = 9.81;
const MAX_THRUST_ACCEL = 70;     // m/s^2 at full throttle — punchy, arcade-fast
const BOOST_ACCEL_BONUS = 55;
const DRAG_COEF = 0.00105;       // tuned so full-throttle level flight settles near ~260 m/s, ~347 m/s with boost
const STALL_SPEED = 60;          // below this, auto nose-down assist kicks in (see stepPhysics)
const STALL_PITCH_RATE = 2.0;    // rad/s max auto nose-down correction when fully stalled
const MAX_SPEED = 420;           // hard safety clamp (drag normally caps it well below this)
const START_SPEED = 220;         // starts already cruising fast, not building up from a crawl
const PITCH_RATE = 1.3;          // rad/s at full input
const ROLL_RATE = 3.0;
const YAW_RATE = 0.9;
const GROUND_LEVEL = 0;
const MIN_SAFE_ALT = 8;

// ----- Flight state -----
const START_POS = new THREE.Vector3(0, 320, 0);
const state = {
  position: START_POS.clone(),
  quaternion: new THREE.Quaternion(),
  speed: START_SPEED,
  throttle: 0.65,
  boost: 100,
  boosting: false,
  crashed: false,
  crashTimer: 0,
};

// Reused scratch objects — avoids allocating new Vector3/Quaternion every
// frame inside the hot physics/camera loops, which otherwise creates steady
// GC pressure and can cause periodic frame hitches even when average FPS
// looks fine.
const AXIS_X = new THREE.Vector3(1, 0, 0);
const AXIS_Y = new THREE.Vector3(0, 1, 0);
const AXIS_Z = new THREE.Vector3(0, 0, 1);
const _forward = new THREE.Vector3();
const _up = new THREE.Vector3();
const _scratchQA = new THREE.Quaternion();
const _scratchQB = new THREE.Quaternion();
const _scratchQC = new THREE.Quaternion();
const _scratchQD = new THREE.Quaternion();
const _ringToShip = new THREE.Vector3();
const _ringLateral = new THREE.Vector3();
const _camDesired = new THREE.Vector3();
const _camLookAhead = new THREE.Vector3();
const _camUp = new THREE.Vector3();

// ----- Input -----
const keys = new Set();
const PREVENT_DEFAULT_KEYS = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
window.addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (PREVENT_DEFAULT_KEYS.has(e.code)) e.preventDefault();
  if (e.code === 'KeyR') respawn();
});
window.addEventListener('keyup', (e) => keys.delete(e.code));

// ----- Rings (score-attack loop) -----
const RING_RADIUS = 85;
const RING_TUBE = 5;
const ringGeo = new THREE.TorusGeometry(RING_RADIUS, RING_TUBE, 10, 28);
const ringMatIdle = new THREE.MeshStandardMaterial({ color: 0xffd95c, emissive: 0x6b4f00, metalness: 0.3, roughness: 0.4 });

class Ring {
  constructor(position, normal) {
    this.mesh = new THREE.Mesh(ringGeo, ringMatIdle.clone());
    this.mesh.position.copy(position);
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.lookAt(position.clone().add(normal));
    this.normal = normal.clone();
    this.popTimer = 0;
    scene.add(this.mesh);
  }
  pop() {
    this.popTimer = 0.35;
    this.mesh.material = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1, transparent: true });
  }
  update(dt) {
    if (this.popTimer > 0) {
      this.popTimer -= dt;
      const s = 1 + (0.35 - this.popTimer) * 2.2;
      this.mesh.scale.setScalar(s);
      this.mesh.material.opacity = Math.max(0, this.popTimer / 0.35);
      if (this.popTimer <= 0) return false; // signal: ready to recycle
    }
    return true;
  }
  reset(position, normal) {
    this.mesh.position.copy(position);
    this.mesh.lookAt(position.clone().add(normal));
    this.normal.copy(normal);
    this.mesh.scale.setScalar(1);
    this.mesh.material = ringMatIdle.clone();
    this.popTimer = 0;
  }
}

const RING_COUNT = 6;
const rings = [];

function generateRingAhead(prevPos) {
  // Spacing tuned for the new faster, drift-free flight model — at ~220-350
  // m/s cruise, the old spacing gave well under 2 seconds between rings.
  const dz = -(700 + Math.random() * 350); // ahead = -Z
  const dx = (Math.random() - 0.5) * 700;
  const dy = (Math.random() - 0.5) * 260;
  const pos = new THREE.Vector3(
    prevPos.x + dx,
    THREE.MathUtils.clamp(prevPos.y + dy, 150, 750),
    prevPos.z + dz
  );
  const normal = new THREE.Vector3(dx, dy, dz).normalize();
  return { pos, normal };
}

function initRings() {
  let prev = state.position.clone();
  prev.z -= 300;
  for (let i = 0; i < RING_COUNT; i++) {
    const { pos, normal } = generateRingAhead(prev);
    rings.push(new Ring(pos, normal));
    prev = pos;
  }
}
initRings();

let score = 0;
let ringsHit = 0;
let combo = 0;
let comboTimer = 0;
const COMBO_WINDOW = 6.0;

function recycleRing(ring) {
  let furthest = rings[0].mesh.position;
  for (const r of rings) {
    if (r.mesh.position.z < furthest.z) furthest = r.mesh.position;
  }
  const { pos, normal } = generateRingAhead(furthest);
  ring.reset(pos, normal);
}

function checkRingCollisions(dt) {
  for (const ring of rings) {
    const stillPopping = ring.update(dt);
    if (ring.popTimer > 0) continue;
    if (!stillPopping) {
      recycleRing(ring);
      continue;
    }
    _ringToShip.copy(ring.mesh.position).sub(state.position);
    const distAlongNormal = Math.abs(_ringToShip.dot(ring.normal));
    _ringLateral.copy(_ringToShip).addScaledVector(ring.normal, -_ringToShip.dot(ring.normal));
    const lateralDist = _ringLateral.length();
    if (distAlongNormal < 30 && lateralDist < RING_RADIUS - 18) {
      ring.pop();
      ringsHit += 1;
      comboTimer = COMBO_WINDOW;
      combo += 1;
      score += 100 * combo;
      flashCombo();
    }
  }
}

function flashCombo() {
  if (combo > 1) {
    comboDisplay.classList.remove('hidden');
    comboCountEl.textContent = combo.toString();
    comboDisplay.style.animation = 'none';
    void comboDisplay.offsetWidth;
    comboDisplay.style.animation = '';
  }
}

let running = false;

function applyControls(dt) {
  let pitchInput = 0, rollInput = 0, yawInput = 0;
  if (keys.has('ArrowUp')) pitchInput += 1;
  if (keys.has('ArrowDown')) pitchInput -= 1;
  if (keys.has('ArrowLeft')) rollInput += 1;
  if (keys.has('ArrowRight')) rollInput -= 1;
  if (keys.has('KeyA')) yawInput += 1;
  if (keys.has('KeyD')) yawInput -= 1;

  if (keys.has('KeyW')) state.throttle = Math.min(1, state.throttle + dt * 0.8);
  if (keys.has('KeyS')) state.throttle = Math.max(0, state.throttle - dt * 0.8);

  state.boosting = keys.has('Space') && state.boost > 0.5;
  if (state.boosting) {
    state.boost = Math.max(0, state.boost - dt * 45);
  } else {
    state.boost = Math.min(100, state.boost + dt * 12);
  }

  const coupledRoll = rollInput + yawInput * 0.25;

  _scratchQA.setFromAxisAngle(AXIS_Y, yawInput * YAW_RATE * dt);
  _scratchQB.setFromAxisAngle(AXIS_X, pitchInput * PITCH_RATE * dt);
  _scratchQC.setFromAxisAngle(AXIS_Z, coupledRoll * ROLL_RATE * dt);

  state.quaternion.multiply(_scratchQA).multiply(_scratchQB).multiply(_scratchQC);
  state.quaternion.normalize();
}

function stepPhysics(dt) {
  if (state.crashed) {
    state.crashTimer -= dt;
    if (state.crashTimer <= 0) respawn();
    return;
  }

  applyControls(dt);

  _forward.set(0, 0, -1).applyQuaternion(state.quaternion);

  let thrustAccel = state.throttle * MAX_THRUST_ACCEL;
  if (state.boosting) thrustAccel += BOOST_ACCEL_BONUS;

  const dragAccel = DRAG_COEF * state.speed * state.speed;

  // Diving converts altitude into speed, climbing costs speed — this is what
  // gives the plane real "weight" without needing a full free-vector
  // momentum model (see the file-level comment for why velocity is locked
  // to the nose direction instead).
  const gravityAlongForward = -GRAVITY * _forward.y;

  state.speed += (thrustAccel - dragAccel + gravityAlongForward) * dt;

  // Stall assist: below STALL_SPEED, force the nose down proportionally to
  // how stalled we are. Without this, a player could hold the nose straight
  // up at zero speed and the plane would just hang motionless in midair
  // (the exact "floaty" bug this physics rework was meant to fix) — real
  // aircraft can't do that, the nose drops. This always wins over player
  // pitch-up input when fully stalled (STALL_PITCH_RATE > PITCH_RATE), by
  // design — that's what a stall is.
  if (state.speed < STALL_SPEED) {
    const stallFactor = 1 - Math.max(0, state.speed) / STALL_SPEED;
    _scratchQD.setFromAxisAngle(AXIS_X, -stallFactor * STALL_PITCH_RATE * dt);
    state.quaternion.multiply(_scratchQD);
    state.quaternion.normalize();
  }

  state.speed = THREE.MathUtils.clamp(state.speed, 0, MAX_SPEED);

  state.position.addScaledVector(_forward, state.speed * dt);

  if (state.position.y <= GROUND_LEVEL + MIN_SAFE_ALT) {
    crash();
  }

  checkRingCollisions(dt);

  if (comboTimer > 0) {
    comboTimer -= dt;
    if (comboTimer <= 0) {
      combo = 0;
      comboDisplay.classList.add('hidden');
    }
  }
}

function crash() {
  if (state.crashed) return;
  state.crashed = true;
  state.crashTimer = 1.6;
  state.speed = 0;
  messageBanner.textContent = 'CRASHED';
  messageBanner.classList.remove('hidden');
  combo = 0;
  comboDisplay.classList.add('hidden');
}

function respawn() {
  state.position.copy(START_POS);
  state.speed = START_SPEED;
  state.quaternion.identity();
  state.throttle = 0.65;
  state.crashed = false;
  messageBanner.classList.add('hidden');
}

// ----- Camera follow -----
const camOffsetLocal = new THREE.Vector3(0, 38, 145);

function updateCamera(dt) {
  _camDesired.copy(camOffsetLocal).applyQuaternion(state.quaternion).add(state.position);
  camera.position.lerp(_camDesired, 1 - Math.pow(0.0001, dt));

  _camLookAhead.set(0, 10, -45).applyQuaternion(state.quaternion).add(state.position);
  _camUp.set(0, 1, 0).applyQuaternion(state.quaternion);
  camera.up.copy(_camUp);
  camera.lookAt(_camLookAhead);

  const targetFov = BASE_FOV + THREE.MathUtils.clamp(state.speed / MAX_SPEED, 0, 1) * 14 + (state.boosting ? 6 : 0);
  camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 4);
  camera.updateProjectionMatrix();
}

// ----- HUD -----
function updateHud() {
  const speedKt = state.speed * 1.94384;
  hudSpeed.textContent = Math.round(speedKt).toString();
  hudAlt.textContent = Math.max(0, Math.round(state.position.y)).toString();
  hudThrottle.textContent = Math.round(state.throttle * 100).toString();
  hudScore.textContent = score.toString();
  hudRings.textContent = ringsHit.toString();
  boostFill.style.width = `${state.boost}%`;
}

// ----- Main loop -----
let lastTime = performance.now();
let fpsAccum = 0;
let fpsFrames = 0;

function tick() {
  requestAnimationFrame(tick);
  const now = performance.now();
  let dt = (now - lastTime) / 1000;
  dt = Math.min(dt, 1 / 20);
  lastTime = now;

  if (running) {
    stepPhysics(dt);
    aircraft.position.copy(state.position);
    aircraft.quaternion.copy(state.quaternion);
    updateCamera(dt);
    updateHud();
  }

  fpsAccum += dt;
  fpsFrames++;
  if (fpsAccum >= 0.5) {
    fpsCounter.textContent = `${Math.round(fpsFrames / fpsAccum)} FPS`;
    fpsAccum = 0;
    fpsFrames = 0;
  }

  renderer.render(scene, camera);
}

startButton.addEventListener('click', () => {
  if (!modelLoaded) return;
  startScreen.classList.add('hidden');
  running = true;
  lastTime = performance.now();
});

camera.position.copy(camOffsetLocal).add(state.position);
camera.lookAt(state.position);

requestAnimationFrame(tick);

import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { GLTFLoader } from 'https://unpkg.com/three@0.160.0/examples/jsm/loaders/GLTFLoader.js';

// ---------------------------------------------------------------------------
// StratoPilot — flight prototype
//
// Model forward axis: confirmed via geometry analysis that the tail fin
// (tallest part of the fuselage) sits at +Z, so the nose points toward -Z —
// which is also Three.js's own default "forward". No corrective rotation
// needed on the loaded asset.
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

// ----- Renderer / Scene / Camera -----
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

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
sun.shadow.mapSize.set(2048, 2048);
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

// ----- Simple cloud puffs for depth cues -----
function buildClouds() {
  const cloudGroup = new THREE.Group();
  const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true });
  for (let i = 0; i < 60; i++) {
    const cluster = new THREE.Group();
    const puffs = 3 + Math.floor(Math.random() * 4);
    for (let p = 0; p < puffs; p++) {
      const geo = new THREE.IcosahedronGeometry(20 + Math.random() * 25, 0);
      const m = new THREE.Mesh(geo, cloudMat);
      m.position.set((Math.random() - 0.5) * 60, (Math.random() - 0.5) * 15, (Math.random() - 0.5) * 60);
      cluster.add(m);
    }
    const angle = Math.random() * Math.PI * 2;
    const dist = 600 + Math.random() * 4500;
    cluster.position.set(Math.cos(angle) * dist, 150 + Math.random() * 700, Math.sin(angle) * dist);
    cloudGroup.add(cluster);
  }
  return cloudGroup;
}
scene.add(buildClouds());

// ----- Aircraft -----
const aircraft = new THREE.Group();
scene.add(aircraft);

let modelLoaded = false;
const loader = new GLTFLoader();
loader.load(
  MODEL_PATH,
  (gltf) => {
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
    }
  },
  (err) => {
    console.error('Failed to load model', err);
    loadingStatus.textContent = 'Failed to load model — check console.';
  }
);
startButton.disabled = true;

// ----- Flight state -----
const START_POS = new THREE.Vector3(0, 320, 0);
const state = {
  position: START_POS.clone(),
  velocity: new THREE.Vector3(0, 0, -140), // start already cruising, nose -Z
  quaternion: new THREE.Quaternion(),
  throttle: 0.55,
  boost: 100,
  boosting: false,
  crashed: false,
  crashTimer: 0,
};

// ----- Input -----
const keys = new Set();
const PREVENT_DEFAULT_KEYS = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
window.addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (PREVENT_DEFAULT_KEYS.has(e.code)) e.preventDefault();
});
window.addEventListener('keyup', (e) => keys.delete(e.code));

// ----- Rings (score-attack loop) -----
const RING_RADIUS = 85;
const RING_TUBE = 5;
const ringGeo = new THREE.TorusGeometry(RING_RADIUS, RING_TUBE, 12, 32);
const ringMatIdle = new THREE.MeshStandardMaterial({ color: 0xffd95c, emissive: 0x6b4f00, metalness: 0.3, roughness: 0.4 });
const ringMatHit = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1 });

class Ring {
  constructor(position, normal) {
    this.mesh = new THREE.Mesh(ringGeo, ringMatIdle.clone());
    this.mesh.position.copy(position);
    this.mesh.castShadow = false;
    this.mesh.lookAt(position.clone().add(normal));
    this.normal = normal.clone();
    this.popTimer = 0;
    scene.add(this.mesh);
  }
  pop() {
    this.popTimer = 0.35;
    this.mesh.material = ringMatHit;
  }
  update(dt) {
    if (this.popTimer > 0) {
      this.popTimer -= dt;
      const s = 1 + (0.35 - this.popTimer) * 2.2;
      this.mesh.scale.setScalar(s);
      this.mesh.material.opacity = Math.max(0, this.popTimer / 0.35);
      this.mesh.material.transparent = true;
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
let nextRingSeed = 1;

function generateRingAhead(prevPos) {
  // Wander gently in X/Y so the course curves, biased to stay near cruise altitude.
  const dz = -(420 + Math.random() * 220); // ahead = -Z
  const dx = (Math.random() - 0.5) * 500;
  const dy = (Math.random() - 0.5) * 220;
  const pos = new THREE.Vector3(
    prevPos.x + dx,
    THREE.MathUtils.clamp(prevPos.y + dy, 120, 700),
    prevPos.z + dz
  );
  const normal = new THREE.Vector3(dx, dy, dz).normalize();
  return { pos, normal };
}

function initRings() {
  let prev = state.position.clone();
  prev.z -= 200;
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
const COMBO_WINDOW = 6.0; // seconds to chain the next ring

function recycleRing(ring) {
  // Find current furthest ring (most negative Z = furthest ahead) to extend from.
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
    const toRing = ring.mesh.position.clone().sub(state.position);
    const distAlongNormal = Math.abs(toRing.dot(ring.normal));
    const lateral = toRing.clone().addScaledVector(ring.normal, -toRing.dot(ring.normal));
    const lateralDist = lateral.length();
    if (distAlongNormal < 26 && lateralDist < RING_RADIUS - 18) {
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
    void comboDisplay.offsetWidth; // restart animation
    comboDisplay.style.animation = '';
  }
}

// ----- Physics tuning -----
const GRAVITY = 9.81;
const MAX_THRUST_ACCEL = 38;     // m/s^2 at full throttle
const BOOST_ACCEL_BONUS = 28;
const DRAG_COEF = 0.012;
const LIFT_COEF = 0.62;          // converts forward speed into upward lift support
const STALL_SPEED = 55;          // m/s below which lift falls off sharply
const PITCH_RATE = 0.9;          // rad/s at full input
const ROLL_RATE = 2.0;
const YAW_RATE = 0.6;
const GROUND_LEVEL = 0;
const MIN_SAFE_ALT = 8;

let lastTime = performance.now();
let running = false;

function applyControls(dt) {
  let pitchInput = 0, rollInput = 0, yawInput = 0;
  if (keys.has('ArrowUp')) pitchInput += 1;
  if (keys.has('ArrowDown')) pitchInput -= 1;
  if (keys.has('ArrowLeft')) rollInput += 1;
  if (keys.has('ArrowRight')) rollInput -= 1;
  if (keys.has('KeyA')) yawInput += 1;
  if (keys.has('KeyD')) yawInput -= 1;

  if (keys.has('KeyW')) state.throttle = Math.min(1, state.throttle + dt * 0.6);
  if (keys.has('KeyS')) state.throttle = Math.max(0, state.throttle - dt * 0.6);

  state.boosting = keys.has('Space') && state.boost > 0.5;
  if (state.boosting) {
    state.boost = Math.max(0, state.boost - dt * 45);
  } else {
    state.boost = Math.min(100, state.boost + dt * 12);
  }

  // A little yaw-induced roll coupling for a more natural arcade feel.
  const coupledRoll = rollInput + yawInput * 0.25;

  const pitchQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), pitchInput * PITCH_RATE * dt);
  const rollQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), coupledRoll * ROLL_RATE * dt);
  const yawQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yawInput * YAW_RATE * dt);

  state.quaternion.multiply(yawQ).multiply(pitchQ).multiply(rollQ);
  state.quaternion.normalize();
}

function stepPhysics(dt) {
  if (state.crashed) {
    state.crashTimer -= dt;
    if (state.crashTimer <= 0) respawn();
    return;
  }

  applyControls(dt);

  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(state.quaternion);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(state.quaternion);

  const speed = state.velocity.length();

  let thrustAccel = state.throttle * MAX_THRUST_ACCEL;
  if (state.boosting) thrustAccel += BOOST_ACCEL_BONUS;

  const thrust = forward.clone().multiplyScalar(thrustAccel);

  const dragAccel = DRAG_COEF * speed * speed;
  const drag = speed > 0.001 ? state.velocity.clone().normalize().multiplyScalar(-dragAccel) : new THREE.Vector3();

  const liftMagnitude = Math.min(speed, STALL_SPEED * 1.6) * LIFT_COEF * Math.max(0, up.y);
  const lift = new THREE.Vector3(0, liftMagnitude, 0);

  const gravity = new THREE.Vector3(0, -GRAVITY, 0);

  const accel = new THREE.Vector3().add(thrust).add(drag).add(lift).add(gravity);
  state.velocity.addScaledVector(accel, dt);

  // Mild speed clamp so boost doesn't run away forever.
  const maxSpeed = 340;
  if (state.velocity.length() > maxSpeed) {
    state.velocity.setLength(maxSpeed);
  }

  state.position.addScaledVector(state.velocity, dt);

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
  state.velocity.set(0, 0, 0);
  messageBanner.textContent = 'CRASHED';
  messageBanner.classList.remove('hidden');
  combo = 0;
  comboDisplay.classList.add('hidden');
}

function respawn() {
  state.position.copy(START_POS);
  state.velocity.set(0, 0, -140);
  state.quaternion.identity();
  state.throttle = 0.55;
  state.crashed = false;
  messageBanner.classList.add('hidden');
}

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyR') respawn();
});

// ----- Camera follow -----
const camOffsetLocal = new THREE.Vector3(0, 38, 145); // behind & above, since forward is -Z
const camTargetPos = new THREE.Vector3();
const camLookPos = new THREE.Vector3();

function updateCamera(dt) {
  const desired = camOffsetLocal.clone().applyQuaternion(state.quaternion).add(state.position);
  camTargetPos.lerp(desired, 1 - Math.pow(0.0001, dt));
  camera.position.copy(camTargetPos);

  const lookAhead = new THREE.Vector3(0, 10, -45).applyQuaternion(state.quaternion).add(state.position);
  camLookPos.lerp(lookAhead, 1 - Math.pow(0.0005, dt));
  camera.up.copy(new THREE.Vector3(0, 1, 0).applyQuaternion(state.quaternion));
  camera.lookAt(camLookPos);

  const speed = state.velocity.length();
  const targetFov = BASE_FOV + THREE.MathUtils.clamp(speed / 340, 0, 1) * 14 + (state.boosting ? 6 : 0);
  camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 4);
  camera.updateProjectionMatrix();
}

// ----- HUD -----
function updateHud() {
  const speedKt = state.velocity.length() * 1.94384;
  hudSpeed.textContent = Math.round(speedKt).toString();
  hudAlt.textContent = Math.max(0, Math.round(state.position.y)).toString();
  hudThrottle.textContent = Math.round(state.throttle * 100).toString();
  hudScore.textContent = score.toString();
  hudRings.textContent = ringsHit.toString();
  boostFill.style.width = `${state.boost}%`;
}

// ----- Main loop -----
function tick() {
  requestAnimationFrame(tick);
  const now = performance.now();
  let dt = (now - lastTime) / 1000;
  dt = Math.min(dt, 1 / 20); // clamp huge steps (tab switch, etc.)
  lastTime = now;

  if (running) {
    stepPhysics(dt);
    aircraft.position.copy(state.position);
    aircraft.quaternion.copy(state.quaternion);
    updateCamera(dt);
    updateHud();
  }

  renderer.render(scene, camera);
}

startButton.addEventListener('click', () => {
  if (!modelLoaded) return;
  startScreen.classList.add('hidden');
  running = true;
  lastTime = performance.now();
});

camTargetPos.copy(camOffsetLocal.clone().add(state.position));
camera.position.copy(camTargetPos);
camera.lookAt(state.position);

requestAnimationFrame(tick);

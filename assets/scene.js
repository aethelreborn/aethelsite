import { THREE, PlayerObject, IdleAnimation, WalkingAnimation, WaveAnimation } from "./lib.bundle.js";

const canvas = document.getElementById("world");
const loader = document.getElementById("loader");
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

function webglOK() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch (e) { return false; }
}
if (!webglOK()) {
  document.documentElement.classList.add("no3d");
  if (loader) loader.remove();
  throw new Error("no webgl");
}

// ---------- renderer ----------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setClearColor(0x0b1013, 1);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
const DPR = Math.min(window.devicePixelRatio || 1, 1.75);
renderer.setPixelRatio(DPR);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b1013);
scene.fog = new THREE.FogExp2(0x0b1013, 0.0042);

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1600);

// ---------- lights ----------
// three r155+ defaults to physically-correct lights: point/candela intensities
// are large numbers and hemisphere/directional sit around 1-3.
scene.add(new THREE.HemisphereLight(0x3d5a6e, 0x12181a, 1.5));
scene.add(new THREE.AmbientLight(0x2a3038, 0.7));
const moon = new THREE.DirectionalLight(0x9db8d0, 1.6);
moon.position.set(-260, 340, 140);
scene.add(moon);
const torchLight = new THREE.PointLight(0xe8a44c, 420, 260, 2);
scene.add(torchLight);

// ---------- helpers ----------
const rng = (() => { let s = 1337; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
const BLOCK = 16;
function hash(x, z) {
  const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

// ---------- terrain ----------
const GRID_X = 44, GRID_Z = 78; // blocks
const dirt = new THREE.Color(0x4a3a2c), stone = new THREE.Color(0x39424a);
const grassA = new THREE.Color(0x2e4a38), grassB = new THREE.Color(0x3a5a45);
const boxGeo = new THREE.BoxGeometry(BLOCK, BLOCK, BLOCK);
const terrainMat = new THREE.MeshLambertMaterial();
const count = GRID_X * GRID_Z + 180;
const terrain = new THREE.InstancedMesh(boxGeo, terrainMat, count);
const m4 = new THREE.Matrix4(), col = new THREE.Color();
let idx = 0;
for (let gx = 0; gx < GRID_X; gx++) {
  for (let gz = 0; gz < GRID_Z; gz++) {
    const x = (gx - GRID_X / 2) * BLOCK;
    const z = 14 * BLOCK - gz * BLOCK; // z from +224 down to -1024
    const fx = x / 60, fz = z / 90;
    let h = Math.sin(fx * 1.7) * 14 + Math.cos(fz * 1.3) * 12 + hash(gx, gz) * 10;
    const dPath = Math.abs(x);
    if (dPath < 40) h *= dPath / 40;           // flat walking path corridor
    h -= 10;                                     // sink so path top ≈ -10..0
    const sy = Math.max(1, Math.round((h + 22) / BLOCK) + 1);
    m4.makeScale(1, sy, 1).setPosition(x, -BLOCK * sy / 2 + (h - 22) * 0.12, z);
    // simpler: keep tops near y≈0 along path, rolling elsewhere
    const topY = h * 0.9;
    m4.makeScale(1, sy, 1).setPosition(x, topY - BLOCK * sy / 2 + BLOCK / 2 - BLOCK, z);
    terrain.setMatrixAt(idx, m4);
    const r = hash(gx * 3, gz * 7);
    if (sy > 6) col.copy(stone); else col.copy(dirt);
    col.lerp(r > 0.5 ? grassA : grassB, r);
    col.multiplyScalar(0.85 + hash(gx, gz * 2) * 0.3);
    terrain.setColorAt(idx, col);
    idx++;
  }
}
// path slabs (flat stones along the walk) — a few extra raised blocks
for (let i = 0; i < 60; i++) {
  const z = 120 - i * 18 - hash(i, 9) * 8;
  const x = (hash(i, 3) - 0.5) * 44;
  m4.makeScale(1, 1, 1).setPosition(x, -BLOCK + BLOCK / 2 - BLOCK, z);
  terrain.setMatrixAt(idx, m4);
  col.set(0x59503f).multiplyScalar(0.8 + hash(i, 5) * 0.4);
  terrain.setColorAt(idx, col);
  idx++;
}
terrain.count = idx;
terrain.instanceMatrix.needsUpdate = true;
if (terrain.instanceColor) terrain.instanceColor.needsUpdate = true;
scene.add(terrain);

// ---------- torches & campfire ----------
const torchGeo = new THREE.BoxGeometry(4, 20, 4);
const emberGeo = new THREE.BoxGeometry(6, 6, 6);
const emberMat = new THREE.MeshBasicMaterial({ color: 0xffb35c });
const woodMat = new THREE.MeshLambertMaterial({ color: 0x5a3d26 });
function torch(x, z, ry = 0) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(torchGeo, woodMat);
  pole.position.y = -8;
  const ember = new THREE.Mesh(emberGeo, emberMat);
  ember.position.y = 4;
  g.add(pole, ember);
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  scene.add(g);
  return g;
}
const torches = [torch(-34, 96), torch(36, 40), torch(-30, -28), torch(34, -96), torch(-26, -160), torch(20, -196)];

// campfire at z ≈ -244
const fire = new THREE.Group();
for (let i = 0; i < 3; i++) {
  const log = new THREE.Mesh(new THREE.BoxGeometry(26, 6, 7), woodMat);
  log.rotation.y = (i / 3) * Math.PI;
  log.position.y = -3;
  fire.add(log);
}
const emberCore = new THREE.Mesh(new THREE.BoxGeometry(10, 8, 10), emberMat);
emberCore.position.y = 1;
fire.add(emberCore);
const fireLight = new THREE.PointLight(0xe8a44c, 700, 320, 2);
fireLight.position.y = 14;
fire.add(fireLight);
fire.position.set(0, 0, -244);
scene.add(fire);

// ---------- monolith (featured project) ----------
const mono = new THREE.Group();
const slab = new THREE.Mesh(
  new THREE.BoxGeometry(20, 130, 20),
  new THREE.MeshLambertMaterial({ color: 0x171e24 })
);
slab.position.y = 55;
const rune = new THREE.Mesh(
  new THREE.BoxGeometry(3, 90, 3),
  new THREE.MeshBasicMaterial({ color: 0x56b896 })
);
rune.position.set(10.5, 60, 0);
mono.add(slab, rune);
mono.position.set(42, 0, -20);
scene.add(mono);

// ---------- beacon ridge (7 projects) ----------
const beaconMats = [
  new THREE.MeshBasicMaterial({ color: 0xe8a44c }),
  new THREE.MeshBasicMaterial({ color: 0x56b896 }),
];
for (let i = 0; i < 7; i++) {
  const z = -70 - i * 24;
  const side = i % 2 === 0 ? 1 : -1;
  const g = new THREE.Group();
  const post = new THREE.Mesh(new THREE.BoxGeometry(10, 34, 10), new THREE.MeshLambertMaterial({ color: 0x2b3339 }));
  post.position.y = 10;
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(8, 8, 8), beaconMats[i % 2]);
  lamp.position.y = 31;
  g.add(post, lamp);
  g.position.set(side * 38, 0, z);
  scene.add(g);
}

// ---------- sky ----------
const starGeo = new THREE.BufferGeometry();
const starPos = new Float32Array(360 * 3);
for (let i = 0; i < 360; i++) {
  starPos[i * 3] = (rng() - 0.5) * 1400;
  starPos[i * 3 + 1] = 180 + rng() * 420;
  starPos[i * 3 + 2] = (rng() - 0.5) * 1400;
}
starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xcfe3dd, size: 2.2, sizeAttenuation: false, fog: false })));
// moon disc
const moonTex = (() => {
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const g = c.getContext("2d");
  const grd = g.createRadialGradient(32, 32, 6, 32, 32, 30);
  grd.addColorStop(0, "rgba(230,240,248,1)"); grd.addColorStop(0.75, "rgba(230,240,248,0.9)"); grd.addColorStop(1, "rgba(230,240,248,0)");
  g.fillStyle = grd; g.beginPath(); g.arc(32, 32, 30, 0, 7); g.fill();
  return new THREE.CanvasTexture(c);
})();
const moonSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: moonTex, fog: false, transparent: true }));
moonSprite.scale.set(90, 90, 1);
moonSprite.position.set(-420, 340, -760);
scene.add(moonSprite);

// ---------- player ----------
const player = new PlayerObject();
const skinTex = new THREE.TextureLoader().load("assets/skin.png", () => {
  if (loader) { loader.classList.add("done"); setTimeout(() => loader.remove(), 650); }
  document.documentElement.classList.remove("no3d");
});
skinTex.magFilter = THREE.NearestFilter;
skinTex.minFilter = THREE.NearestFilter;
skinTex.colorSpace = THREE.SRGBColorSpace;
player.skin.map = skinTex;
player.position.set(0, 0, 96);
scene.add(player);

// contact shadow
const shadowTex = (() => {
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const g = c.getContext("2d");
  const grd = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grd.addColorStop(0, "rgba(0,0,0,0.5)"); grd.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();
const shadow = new THREE.Mesh(
  new THREE.PlaneGeometry(44, 44),
  new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false })
);
shadow.rotation.x = -Math.PI / 2;
shadow.position.y = 0.3;
scene.add(shadow);

const anims = {
  idle: new IdleAnimation(),
  walk: new WalkingAnimation(),
  wave: new WaveAnimation(),
};
let curAnim = "idle";
function setAnim(name) {
  if (name === curAnim) return;
  curAnim = name;
  player.resetJoints();
  anims[name].progress = 0;
}

// ---------- choreography ----------
// character keyframes: { p, x, z, stop, face }  face = yaw at stop (toward camera side)
const charKeys = [
  { p: 0.00, x: 0, z: 96 },
  { p: 0.10, x: 0, z: 96 },
  { p: 0.30, x: 0, z: -2, stop: 1, face: 0.5 },
  { p: 0.36, x: 0, z: -2 },
  { p: 0.58, x: 0, z: -186, stop: 0 },
  { p: 0.66, x: 0, z: -198 },
  { p: 0.78, x: 0, z: -214, stop: 1, face: 2.6, wave: 1 },
  { p: 0.86, x: 0, z: -214, stop: 1, face: 2.6 },
  { p: 1.00, x: 0, z: -214, stop: 1, face: 2.6 },
];
// camera keyframes: { p, pos:[x,y,z], look:[x,y,z] }
// distances ~110-260: the skinview3d player is ~32 units tall (16 = one block).
const camKeys = [
  { p: 0.00, pos: [85, 52, 210], look: [0, 18, 96] },
  { p: 0.12, pos: [95, 46, 175], look: [0, 16, 88] },
  { p: 0.30, pos: [-135, 72, 110], look: [25, 42, -12] },
  { p: 0.38, pos: [-150, 62, 55], look: [30, 46, -20] },
  { p: 0.58, pos: [-145, 56, -115], look: [0, 22, -168] },
  { p: 0.70, pos: [-95, 46, -155], look: [0, 18, -200] },
  { p: 0.80, pos: [128, 78, -52], look: [0, 16, -232] },
  { p: 0.90, pos: [120, 70, -96], look: [0, 14, -238] },
  { p: 1.00, pos: [210, 250, -20], look: [0, 8, -220] },
];
const smooth = (t) => t * t * (3 - 2 * t);
function sampleKeys(keys, p, out) {
  let a = keys[0], b = keys[keys.length - 1];
  if (p <= keys[0].p) { a = b = keys[0]; }
  else if (p >= b.p) { a = b = keys[keys.length - 1]; }
  else {
    for (let i = 0; i < keys.length - 1; i++) {
      if (p >= keys[i].p && p <= keys[i + 1].p) { a = keys[i]; b = keys[i + 1]; break; }
    }
  }
  const t = a === b ? 0 : smooth((p - a.p) / (b.p - a.p));
  return { a, b, t };
}
const lerp = (x, y, t) => x + (y - x) * t;
function lerpArr(a, b, t, o) { o[0] = lerp(a[0], b[0], t); o[1] = lerp(a[1], b[1], t); o[2] = lerp(a[2], b[2], t); return o; }
const wrapAngle = (x) => Math.atan2(Math.sin(x), Math.cos(x));

// ---------- scroll & loop ----------
let targetP = 0, curP = 0;
function readScroll() {
  const max = document.documentElement.scrollHeight - innerHeight;
  targetP = max > 0 ? Math.min(1, Math.max(0, scrollY / max)) : 0;
}
addEventListener("scroll", readScroll, { passive: true });
readScroll();

const isMobile = () => innerWidth / innerHeight < 0.85 || innerWidth < 720;
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = isMobile() ? 58 : 45;
  camera.updateProjectionMatrix();
}
addEventListener("resize", resize);
resize();

const tmpPos = [0, 0, 0], tmpLook = [0, 0, 0], prevPos = new THREE.Vector3(0, 0, 96);
let yaw = Math.PI, lastT = performance.now();

let firstFrame = true;
function frame(now) {
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;

  if (firstFrame) {
    firstFrame = false;
    window.__worldReady = true;
    if (loader) { loader.classList.add("done"); setTimeout(() => loader.remove(), 650); }
    document.documentElement.classList.remove("no3d");
  }

  curP = reduceMotion ? 0 : curP + (targetP - curP) * (1 - Math.pow(0.001, dt));

  // character
  const cs = sampleKeys(charKeys, curP);
  const cx = lerp(cs.a.x, cs.b.x, cs.t), cz = lerp(cs.a.z, cs.b.z, cs.t);
  player.position.set(cx, 0, cz);
  shadow.position.set(cx, 0.3, cz);
  const dx = cx - prevPos.x, dz = cz - prevPos.z;
  const speed = Math.hypot(dx, dz) / Math.max(dt, 1e-4);
  prevPos.set(cx, 0, cz);

  const stopKey = cs.t < 0.5 ? cs.a : cs.b;
  if (speed > 2) {
    setAnim("walk");
    const targetYaw = Math.atan2(dx, dz);
    yaw += wrapAngle(targetYaw - yaw) * Math.min(1, dt * 10);
  } else if (stopKey.wave && curP > 0.76) {
    setAnim("wave");
    yaw += wrapAngle(stopKey.face - yaw) * Math.min(1, dt * 4);
  } else {
    setAnim("idle");
    yaw += wrapAngle((stopKey.face ?? 0.4) - yaw) * Math.min(1, dt * 4);
  }
  player.rotation.y = yaw;
  anims.walk.speed = Math.min(3, 0.6 + speed / 26);
  anims[curAnim].update(player, dt);

  // camera
  const ks = sampleKeys(camKeys, curP);
  lerpArr(ks.a.pos, ks.b.pos, ks.t, tmpPos);
  lerpArr(ks.a.look, ks.b.look, ks.t, tmpLook);
  if (isMobile()) { // pull camera further from subject on narrow screens
    tmpPos[0] = tmpLook[0] + (tmpPos[0] - tmpLook[0]) * 1.45;
    tmpPos[1] = tmpLook[1] + (tmpPos[1] - tmpLook[1]) * 1.3;
    tmpPos[2] = tmpLook[2] + (tmpPos[2] - tmpLook[2]) * 1.45;
  }
  const breathe = reduceMotion ? 0 : Math.sin(now * 0.00045) * 1.6;
  camera.position.set(tmpPos[0], tmpPos[1] + breathe, tmpPos[2]);
  camera.lookAt(tmpLook[0], tmpLook[1], tmpLook[2]);

  // torchlight follows the character + flicker
  torchLight.position.set(cx + 22, 26, cz + 16);
  torchLight.intensity = 420 + Math.sin(now * 0.012) * 70 + Math.sin(now * 0.031) * 40;
  fireLight.intensity = 650 + Math.sin(now * 0.017) * 120;
  emberCore.scale.y = 1 + Math.sin(now * 0.02) * 0.15;

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// debug/diagnostics hook (harmless in production)
window.__a = {
  camera, player, scene, renderer,
  get p() { return curP; },
  get anim() { return curAnim; },
  setP(v) { curP = targetP = Math.min(1, Math.max(0, v)); },
};

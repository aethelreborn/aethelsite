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

// campfire at z ≈ -244 — smooth 4K-style flame
const fire = new THREE.Group();
const logGeo = new THREE.CylinderGeometry(2.6, 3.2, 26, 16);
for (let i = 0; i < 3; i++) {
  const log = new THREE.Mesh(logGeo, woodMat);
  log.rotation.z = Math.PI / 2;
  log.rotation.y = (i / 3) * Math.PI + Math.PI / 6;
  log.position.y = -2;
  fire.add(log);
}
// flame cone (smooth)
const flameMat = new THREE.MeshBasicMaterial({ color: 0xffb35c, transparent: true, opacity: 0.92, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
const flame = new THREE.Mesh(new THREE.ConeGeometry(7, 22, 24, 1, true), flameMat);
flame.position.y = 10;
fire.add(flame);
const flameCore = new THREE.Mesh(new THREE.ConeGeometry(3.5, 16, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff1c2, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
flameCore.position.y = 7;
fire.add(flameCore);
// ember particles
const emberGeo2 = new THREE.SphereGeometry(0.9, 8, 8);
const emberMat2 = new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
const embers = [];
for (let i = 0; i < 18; i++) {
  const e = new THREE.Mesh(emberGeo2, emberMat2.clone());
  e.userData.seed = i * 1.37;
  fire.add(e);
  embers.push(e);
}
const fireLight = new THREE.PointLight(0xe8a44c, 700, 320, 2);
fireLight.position.y = 14;
fire.add(fireLight);
fire.position.set(0, 0, -244);
scene.add(fire);

// ---------- project data (7 ridge beacons + featured monolith) ----------
const PROJECTS = [
  { name: "Aethel", stack: "Rust · Java · TS · Dart", blurb: "Building ideas into experiences — Minecraft clients, anticheats, zero-knowledge tools, self-hosted everything.", color: 0x56b896, url: "aethel/", logo: "assets/logos/aethel.png" },
  { name: "AethelONE", stack: "Rust", blurb: "OneClient fork — offline accounts, self-hosted auto-update, minisign-signed releases.", color: 0xe8a44c, url: "https://github.com/aethelreborn/AethelONE", logo: "assets/logos/aethelone.png" },
  { name: "AethelLauncher", stack: "Rust · egui · Axum", blurb: "A Minecraft launcher built to run well on a laggy laptop.", color: 0x56b896, url: "https://github.com/aethelreborn/AethelLauncher", logo: "assets/logos/aethellauncher.png" },
  { name: "AethelAC", stack: "Java", blurb: "Anticheat that re-simulates vanilla physics and compares — math, not guesses.", color: 0xe8a44c, url: "https://github.com/aethelreborn/AethelAC", logo: "assets/logos/aethelac.png" },
  { name: "AethelOnePLUS", stack: "Kotlin", blurb: "PolyPlus — world hosting, friends, cosmetics. On Modrinth & CurseForge.", color: 0x56b896, url: "https://github.com/aethelreborn/AethelOnePLUS", logo: "assets/logos/aetheloneplus.png" },
  { name: "anyupload", stack: "TypeScript", blurb: "Cross-device file handoff, straight to Vercel Blob — no serverless size limit.", color: 0xe8a44c, url: "https://anyupload.vercel.app", logo: "assets/logos/anyupload.png" },
  { name: "firstboot", stack: "Go", blurb: "TUI that turns a fresh OS into a dev machine, one checkbox at a time.", color: 0x56b896, url: "https://github.com/aethelreborn/firstboot", logo: null },
  { name: "AethelPanel", stack: "TypeScript", blurb: "Self-hosted game-server panel with a daemon per machine and HMAC auth.", color: 0xe8a44c, url: "https://github.com/aethelreborn/AethelPanel", logo: "assets/logos/aethelpanel.png" },
];

// draw a holographic info panel onto a canvas and return a CanvasTexture.
// If proj.logo points at a real image it is composited in (async); the canvas
// redraws itself on load. A null/failed logo falls back to the initial letter.
function makeHoloCanvas(proj) {
  const W = 512, H = 360;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d");
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;

  function draw(logo) {
    g.clearRect(0, 0, W, H);
    g.fillStyle = "rgba(8,16,20,0.72)";
    g.fillRect(0, 0, W, H);
    g.strokeStyle = "rgba(86,184,150,0.85)";
    g.lineWidth = 3;
    g.strokeRect(6, 6, W - 12, H - 12);
    for (let y = 0; y < H; y += 4) {
      g.fillStyle = "rgba(157,255,224,0.06)";
      g.fillRect(0, y, W, 1);
    }
    const cx = W / 2;
    if (logo && logo.complete && logo.naturalWidth > 0) {
      // real asset: square crop (GitHub OG cards use the left half — avatar + title)
      const S = 96, x0 = (W - S) / 2, y0 = 18;
      const wide = logo.naturalWidth / logo.naturalHeight > 1.6;
      const sw = wide ? logo.naturalHeight : Math.min(logo.naturalWidth, logo.naturalHeight);
      const sx = wide ? 0 : (logo.naturalWidth - sw) / 2;
      g.save();
      g.beginPath();
      if (g.roundRect) g.roundRect(x0, y0, S, S, 10);
      else g.rect(x0, y0, S, S);
      g.clip();
      g.drawImage(logo, sx, 0, sw, sw, x0, y0, S, S);
      // teal duotone so white source cards read as holographic, not paper
      g.globalCompositeOperation = "multiply";
      g.fillStyle = "#7fe0c4";
      g.fillRect(x0, y0, S, S);
      g.globalCompositeOperation = "source-over";
      g.restore();
      g.strokeStyle = "rgba(157,255,224,0.9)";
      g.lineWidth = 2;
      g.beginPath();
      if (g.roundRect) g.roundRect(x0, y0, S, S, 10);
      else g.rect(x0, y0, S, S);
      g.stroke();
    } else {
      // fallback: glowing disc with the project initial
      const dx = cx, dy = 66;
      g.beginPath();
      g.arc(dx, dy, 46, 0, Math.PI * 2);
      g.fillStyle = "rgba(86,184,150,0.18)";
      g.fill();
      g.strokeStyle = "rgba(157,255,224,0.9)";
      g.lineWidth = 2;
      g.stroke();
      g.font = "bold 44px system-ui, sans-serif";
      g.fillStyle = "#9dffe0";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(proj.name.charAt(0), dx, dy);
    }
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = "bold 30px system-ui, sans-serif";
    g.fillStyle = "#e8f2ee";
    g.fillText(proj.name, cx, 150);
    g.font = "14px ui-monospace, monospace";
    g.fillStyle = "#e8a44c";
    g.fillText(proj.stack, cx, 178);
    g.font = "15px system-ui, sans-serif";
    g.fillStyle = "#cfe3dd";
    const words = proj.blurb.split(" ");
    let line = "", lines = [], y = 210;
    for (const w of words) {
      const test = line ? line + " " + w : w;
      if (g.measureText(test).width > W - 60) { lines.push(line); line = w; }
      else line = test;
    }
    if (line) lines.push(line);
    for (const ln of lines.slice(0, 4)) {
      g.fillText(ln, cx, y); y += 22;
    }
    g.font = "11px ui-monospace, monospace";
    g.fillStyle = "rgba(157,255,224,0.6)";
    g.fillText(proj.url, cx, H - 24);
    tex.needsUpdate = true;
  }

  draw(null);
  if (proj.logo) {
    const img = new Image();
    img.onload = () => draw(img);
    img.onerror = () => draw(null); // keep the initial-letter fallback
    img.src = proj.logo;
  }
  return tex;
}

// ---------- monolith (featured project) ----------
const mono = new THREE.Group();
const slabMat = new THREE.MeshLambertMaterial({ color: 0x171e24 });
slabMat.transparent = true;
slabMat.depthWrite = false; // ghost pillar must never occlude the hologram content
const slab = new THREE.Mesh(new THREE.BoxGeometry(20, 130, 20), slabMat);
slab.position.y = 55;
const runeMat = new THREE.MeshBasicMaterial({ color: 0x56b896, transparent: true, opacity: 0.16, fog: false });
const rune = new THREE.Mesh(new THREE.BoxGeometry(3, 90, 3), runeMat);
rune.position.set(-10.4, 60, 0);
const monoEdges = new THREE.LineSegments(
  new THREE.EdgesGeometry(slab.geometry),
  new THREE.LineBasicMaterial({ color: 0x56b896, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })
);
monoEdges.position.copy(slab.position);
const emitterMat = new THREE.MeshBasicMaterial({ color: 0x9dffe0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
const emitter = new THREE.Mesh(new THREE.BoxGeometry(5, 5, 5), emitterMat);
emitter.position.set(-10.2, 62, 0);

// holographic content panel that replaces the solid pillar when the player idles beside it.
// Vertical budget: camera at the stop tops out at y≈123 — panel spans y29..115 (group y72).
const holoGroup = new THREE.Group();
holoGroup.position.set(-14, 72, 0); // offset toward the viewer so the slab never occludes content
const holoTex = makeHoloCanvas(PROJECTS[0]);
const holoPanelMat = new THREE.MeshBasicMaterial({ map: holoTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.FrontSide, fog: false });
const holoPanel = new THREE.Mesh(new THREE.PlaneGeometry(120, 86), holoPanelMat);
holoGroup.add(holoPanel);
// wireframe border: a single flat outline (no 3-deep box → no double edges)
const frameMat = new THREE.LineBasicMaterial({ color: 0x56b896, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
const holoFrame = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(122, 88)), frameMat);
holoFrame.position.z = 0.2;
holoGroup.add(holoFrame);
// scan bar: a thin bright band sweeping the panel instead of a solid wash sheet
const scanMat = new THREE.MeshBasicMaterial({ color: 0x9dffe0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
const scanPlane = new THREE.Mesh(new THREE.PlaneGeometry(120, 5), scanMat);
scanPlane.position.z = 0.4;
holoGroup.add(scanPlane);
// projection beam: rises from the pillar base to the panel underside
const beamMat = new THREE.MeshBasicMaterial({ color: 0x56b896, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
const holoBeam = new THREE.Mesh(new THREE.CylinderGeometry(40, 6, 29, 20, 1, true), beamMat);
holoBeam.position.set(0, -57.5, 0); // rel y −72..−29 → world 0..29 (ground → panel underside)
holoGroup.add(holoBeam);
mono.add(slab, rune, monoEdges, emitter, holoGroup);
mono.position.set(42, 0, -20);
scene.add(mono);

// ---------- beacon ridge (7 projects) ----------
const beaconMats = [
  new THREE.MeshBasicMaterial({ color: 0xe8a44c }),
  new THREE.MeshBasicMaterial({ color: 0x56b896 }),
];
const beacons = [];
for (let i = 0; i < 7; i++) {
  const proj = PROJECTS[i + 1];
  const z = -70 - i * 24;
  const side = i % 2 === 0 ? 1 : -1;
  const g = new THREE.Group();
  const postMat = new THREE.MeshLambertMaterial({ color: 0x2b3339 });
  postMat.transparent = true;
  const post = new THREE.Mesh(new THREE.BoxGeometry(10, 34, 10), postMat);
  post.position.y = 10;
  const lampMat = beaconMats[i % 2].clone();
  lampMat.transparent = true;
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(8, 8, 8), lampMat);
  lamp.position.y = 31;
  // holographic content rig (hidden until player idles beside it).
  // The rig is yawed 45° toward the centre path so the panel reads as a
  // three-quarter view for the passing camera instead of edge-on.
  const rig = new THREE.Group();
  const bTex = makeHoloCanvas(proj);
  const bPanelMat = new THREE.MeshBasicMaterial({ map: bTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.FrontSide, fog: false });
  // panel sized so the near camera stop (p≈0.51) frames the whole rig
  const bPanel = new THREE.Mesh(new THREE.PlaneGeometry(64, 46), bPanelMat);
  bPanel.position.set(0, 46, 6); // z+6 clears the 10-wide post axis (half-width 5)
  const bFrameMat = new THREE.LineBasicMaterial({ color: 0x56b896, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const bFrame = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(64, 46)), bFrameMat);
  bFrame.position.set(0, 46, 6.2);
  const bScanMat = new THREE.MeshBasicMaterial({ color: 0x9dffe0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const bScan = new THREE.Mesh(new THREE.PlaneGeometry(64, 3.5), bScanMat);
  bScan.position.set(0, 26, 6.4); // sweeps panel height, driven per frame
  // projection beam: lamp top (y≈40) → panel underside
  const bBeamMat = new THREE.MeshBasicMaterial({ color: proj.color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const bBeam = new THREE.Mesh(new THREE.CylinderGeometry(18, 3, 16, 16, 1, true), bBeamMat);
  bBeam.position.set(0, 38, 0);
  rig.add(bPanel, bFrame, bScan, bBeam);
  rig.rotation.y = 0; // yawed to face the camera every frame in the loop
  g.add(post, lamp, rig);
  g.position.set(side * 38, 0, z);
  scene.add(g);
  beacons.push({ group: g, side, z, rig, panel: bPanel, panelMat: bPanelMat, frame: bFrame, frameMat: bFrameMat, scan: bScan, scanMat: bScanMat, beamMat: bBeamMat, lamp, lampMat, post, postMat, blend: 0 });
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
let lastScrollTime = performance.now();
let holoBlend = 0;
function readScroll() {
  const max = document.documentElement.scrollHeight - innerHeight;
  targetP = max > 0 ? Math.min(1, Math.max(0, scrollY / max)) : 0;
  lastScrollTime = performance.now();
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

const tmpPos = [0, 0, 0], tmpLook = [0, 0, 0];
const prevPos = new THREE.Vector3(0, 0, 96);
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

  // hologram trigger: player idling beside the monolith while the user is not scrolling
  const inMonoZone = curP > 0.26 && curP < 0.42;
  const scrollIdle = (now - lastScrollTime) > 1100;
  const holoTarget = (!reduceMotion && inMonoZone && scrollIdle) ? 1 : 0;
  // holoBlend declared below? ensure global
  holoBlend += (holoTarget - holoBlend) * Math.min(1, dt * 2.2);

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

  // hologram activation on the monolith: replaces solid pillar with content panel
  const hb = holoBlend;
  slabMat.opacity = Math.max(0.12, 1 - hb * 0.88);
  runeMat.opacity = 0.16 + hb * 0.62;
  const edgesMat = monoEdges.material;
  edgesMat.opacity = hb * (0.75 + Math.sin(now * 0.004) * 0.15);
  emitterMat.opacity = hb * (0.5 + Math.sin(now * 0.008) * 0.4);
  emitter.scale.setScalar(1 + hb * (0.6 + Math.sin(now * 0.01) * 0.4));
  holoPanelMat.opacity = hb * (0.78 + Math.sin(now * 0.003) * 0.08);
  frameMat.opacity = hb * (0.55 + Math.sin(now * 0.004) * 0.1);
  scanMat.opacity = hb * (0.11 + Math.sin(now * 0.006) * 0.05);
  scanPlane.position.y = -40 + ((now * 0.03) % 80); // sweep the full panel height
  beamMat.opacity = hb * (0.07 + Math.sin(now * 0.005) * 0.025);
  // billboard: yaw only toward the viewer at this stop, with a subtle sway
  holoGroup.rotation.y = Math.atan2(camera.position.x - 42, camera.position.z - (-20)) + Math.sin(now * 0.0006) * 0.06 * hb;
  holoGroup.position.y = 72 + Math.sin(now * 0.0012) * 3 * hb;

  // beacon holograms: activate when player stands beside a beacon and user is not scrolling
  for (const b of beacons) {
    const bx = b.group.position.x, bz = b.group.position.z;
    const dist = Math.hypot(cx - bx, cz - bz);
    // player walks the centre path (x=0) and beacons sit at x=±38, so the
    // closest possible approach is 38 — anything under 40 is "beside it"
    const near = dist < 40;
    const target = (!reduceMotion && near && scrollIdle) ? 1 : 0;
    b.blend += (target - b.blend) * Math.min(1, dt * 2.6);
    const bb = b.blend;
    if (bb > 0.003) {
      b.panelMat.opacity = bb * (0.78 + Math.sin(now * 0.003 + bx) * 0.08);
      b.frameMat.opacity = bb * (0.55 + Math.sin(now * 0.004 + bz) * 0.1);
      b.scanMat.opacity = bb * (0.11 + Math.sin(now * 0.006) * 0.05);
      b.scan.position.y = 25 + ((now * 0.03 + bx) % 42); // sweep panel height
      b.beamMat.opacity = bb * (0.1 + Math.sin(now * 0.005 + bx) * 0.035);
      b.lampMat.opacity = 1 - bb * 0.6;
      // whole rig floats and yaws to face the viewer
      b.rig.position.y = Math.sin(now * 0.0012 + bx) * 3 * bb;
      b.rig.rotation.y = Math.atan2(camera.position.x - bx, camera.position.z - bz);
      if (b.postMat) b.postMat.opacity = 1 - bb * 0.5;
    } else {
      // hard zero: a guarded loop must clear stale opacity, not strand it
      b.panelMat.opacity = b.frameMat.opacity = b.scanMat.opacity = b.beamMat.opacity = 0;
      b.lampMat.opacity = 1;
      b.rig.position.y = 0;
      if (b.postMat) b.postMat.opacity = 1;
    }
  }
  // torchlight follows the character + flicker
  torchLight.position.set(cx + 22, 26, cz + 16);
  torchLight.intensity = 420 + Math.sin(now * 0.012) * 70 + Math.sin(now * 0.031) * 40;
  fireLight.intensity = 650 + Math.sin(now * 0.017) * 120;
  const flick = 1 + Math.sin(now * 0.023) * 0.18 + Math.sin(now * 0.061) * 0.09;
  flame.scale.set(1 + Math.sin(now*0.03)*0.12, flick, 1 + Math.sin(now*0.03)*0.12);
  flameCore.scale.set(1 + Math.sin(now*0.04)*0.1, 1 + Math.sin(now*0.05)*0.22, 1 + Math.sin(now*0.04)*0.1);
  flame.rotation.y = now * 0.001;
  embers.forEach((e, i) => {
    const s = e.userData.seed;
    const t = (now * 0.001 + s) % 1.6;
    e.position.set(Math.sin(s*3.1 + t*2) * (4 + t*3), t * 26 + 2, Math.cos(s*2.7 + t*2) * (4 + t*3));
    e.scale.setScalar(1 - t * 0.6);
    e.material.opacity = (1 - t) * 0.9;
  });

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// debug/diagnostics hook (harmless in production)
window.__a = {
  camera, player, scene, renderer,
  get p() { return curP; },
  get anim() { return curAnim; },
  get holo() { return holoBlend; },
  beaconBlends() { return beacons.map(b => +b.blend.toFixed(3)); },
  // capture helper: force holograms to full power (headless GL is too slow to lerp there).
  // onlyIdx: -1 = monolith only, 0..6 = that beacon only, undefined = all.
  setHolo(v, onlyIdx) {
    holoBlend = onlyIdx === undefined || onlyIdx === -1 ? v : 0;
    beacons.forEach((b, i) => { b.blend = onlyIdx === undefined || onlyIdx === i ? v : 0; });
  },
  setP(v) { curP = targetP = Math.min(1, Math.max(0, v)); },
  shot() { renderer.render(scene, camera); return canvas.toDataURL("image/png"); },
  // offline capture: render to an FBO and read it back as PNG without touching
  // the swapchain (headless software GL crashes on default-framebuffer readback)
  shotRT(w = 960, h = 600) {
    const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.UnsignedByteType });
    rt.texture.colorSpace = THREE.SRGBColorSpace;
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(rt);
    renderer.render(scene, camera);
    const buf = new Uint8Array(w * h * 4);
    renderer.readRenderTargetPixels(rt, 0, 0, w, h, buf);
    renderer.setRenderTarget(prev);
    rt.dispose();
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const ctx = c.getContext("2d");
    const img = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) img.data.set(buf.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
    ctx.putImageData(img, 0, 0);
    return c.toDataURL("image/png");
  },
};

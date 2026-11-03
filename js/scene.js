import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const BOOK_COLORS = ['#c91a09', '#0055bf', '#f2cd37', '#237841', '#f4f4f4', '#f0a0b0', '#fe8a18', '#5c9dd1', '#7d3f98', '#1b2a34'];

function seeded(seed) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function canvasTexture(w, h, draw, { repeat = null, srgb = true } = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  if (repeat) {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeat[0], repeat[1]);
  }
  return tex;
}

function grain(ctx, w, h, rnd, count, dark, alpha) {
  for (let i = 0; i < count; i++) {
    ctx.strokeStyle = dark;
    ctx.globalAlpha = rnd() * alpha;
    ctx.lineWidth = 0.5 + rnd() * 1.6;
    const x = rnd() * w;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.bezierCurveTo(x + rnd() * 8 - 4, h * 0.3, x + rnd() * 8 - 4, h * 0.6, x + rnd() * 6 - 3, h);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function floorTexture() {
  // 사진의 짙은 호두나무 마루: 한 장이 가로세로 4m를 덮는다.
  return canvasTexture(1024, 1024, (ctx, w, h) => {
    const rnd = seeded(77);
    const planks = 8;
    const pw = w / planks;
    const tones = ['#8a5a36', '#7d4f2e', '#96653d', '#74492b', '#8f5e38', '#835431'];
    for (let i = 0; i < planks; i++) {
      let y = -rnd() * h * 0.5;
      while (y < h) {
        const len = h * (0.45 + rnd() * 0.4);
        ctx.fillStyle = tones[Math.floor(rnd() * tones.length)];
        ctx.fillRect(i * pw, y, pw, len);
        ctx.fillStyle = 'rgba(30,14,5,.55)';
        ctx.fillRect(i * pw, y + len - 1.5, pw, 1.5);
        y += len;
      }
      ctx.fillStyle = 'rgba(30,14,5,.5)';
      ctx.fillRect(i * pw, 0, 1.5, h);
    }
    grain(ctx, w, h, rnd, 700, '#3a2010', 0.28);
  }, { repeat: [0.25, 0.25] });
}

function oakTexture() {
  return canvasTexture(512, 512, (ctx, w, h) => {
    const rnd = seeded(41);
    ctx.fillStyle = '#d9a767';
    ctx.fillRect(0, 0, w, h);
    grain(ctx, w, h, rnd, 260, '#9c6a33', 0.3);
    grain(ctx, w, h, rnd, 90, '#f0cf9c', 0.35);
  });
}

function concreteTexture(tone = 170) {
  return canvasTexture(512, 512, (ctx, w, h) => {
    const rnd = seeded(13 + tone);
    ctx.fillStyle = `rgb(${tone},${tone - 4},${tone - 10})`;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 1800; i++) {
      const v = tone + (rnd() - 0.5) * 34;
      ctx.fillStyle = `rgba(${v},${v - 3},${v - 8},.28)`;
      const r = 1 + rnd() * 16;
      ctx.beginPath();
      ctx.arc(rnd() * w, rnd() * h, r, 0, 7);
      ctx.fill();
    }
  }, { repeat: [3, 2] });
}

function noteTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffe14d';
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = '#f2c81f';
  ctx.fillRect(0, 0, 64, 12);
  ctx.fillStyle = '#5c4a12';
  for (const [y, w] of [[24, 44], [36, 48], [48, 30]]) ctx.fillRect(9, y, w, 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function glowTexture() {
  return canvasTexture(128, 128, (ctx, w) => {
    const g = ctx.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    g.addColorStop(0, 'rgba(255,240,205,1)');
    g.addColorStop(0.22, 'rgba(255,196,110,.5)');
    g.addColorStop(1, 'rgba(255,170,70,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, w);
  });
}

const SKIES = {
  day: { top: '#6fa9dc', mid: '#b4d5ea', low: '#f0ead8', river: '#6f9fb4', lit: 0.04, tint: null, cloud: 'rgba(255,255,255,.75)' },
  dusk: { top: '#37407a', mid: '#d97f68', low: '#ffc27a', river: '#a8796e', lit: 0.4, tint: 'rgba(120,60,50,.35)', cloud: 'rgba(255,190,150,.5)' },
  night: { top: '#090e22', mid: '#141b3c', low: '#2a2f55', river: '#121a33', lit: 0.65, tint: 'rgba(5,8,25,.72)', cloud: 'rgba(90,100,140,.12)' },
};

// 창밖 강변 도시 풍경. 카메라 눈높이가 캔버스 57.5% 지점이 되도록 그린다.
function paintOutside(ctx, w, h, key) {
  const sky = SKIES[key];
  const rnd = seeded(2024);
  const horizon = h * 0.575;
  const g = ctx.createLinearGradient(0, 0, 0, horizon);
  g.addColorStop(0, sky.top);
  g.addColorStop(0.65, sky.mid);
  g.addColorStop(1, sky.low);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = sky.cloud;
  for (let i = 0; i < 60; i++) {
    const x = rnd() * w;
    const y = horizon * (0.25 + rnd() * 0.6);
    ctx.beginPath();
    ctx.ellipse(x, y, 40 + rnd() * 150, 5 + rnd() * 14, 0, 0, 7);
    ctx.fill();
  }
  for (let layer = 0; layer < 3; layer++) {
    let x = -20;
    const shade = [168, 128, 92][layer];
    while (x < w) {
      const bw = 34 + rnd() * 90;
      const bh = (60 + rnd() * (190 - layer * 40)) * (layer === 2 ? 0.75 : 1);
      const v = shade + rnd() * 26;
      ctx.fillStyle = `rgb(${v},${v + 8},${v + 20})`;
      ctx.fillRect(x, horizon - bh, bw, bh);
      for (let wy = horizon - bh + 6; wy < horizon - 5; wy += 9) {
        for (let wx = x + 4; wx < x + bw - 4; wx += 8) {
          const on = rnd() < sky.lit;
          ctx.fillStyle = on ? 'rgba(255,214,140,.95)' : 'rgba(30,50,75,.3)';
          ctx.fillRect(wx, wy, 4.5, 5);
        }
      }
      x += bw + rnd() * 16;
    }
  }
  ctx.fillStyle = key === 'night' ? '#0d1a18' : '#54805a';
  for (let x = 0; x < w; x += 16) {
    const r = 9 + rnd() * 13;
    ctx.beginPath();
    ctx.arc(x, horizon - 1, r, 0, 7);
    ctx.fill();
  }
  ctx.fillStyle = sky.river;
  ctx.fillRect(0, horizon, w, h * 0.13);
  ctx.fillStyle = 'rgba(255,255,255,.14)';
  for (let i = 0; i < 260; i++) {
    ctx.fillRect(rnd() * w, horizon + rnd() * h * 0.13, 12 + rnd() * 44, 1.5);
  }
  ctx.fillStyle = key === 'night' ? '#141b1c' : '#6a8a5d';
  ctx.fillRect(0, horizon + h * 0.13, w, h);
  ctx.fillStyle = key === 'night' ? '#20242b' : '#a9a69c';
  ctx.fillRect(0, horizon + h * 0.17, w, h * 0.05);
  if (sky.tint) {
    ctx.fillStyle = sky.tint;
    ctx.fillRect(0, horizon - 1, w, h);
  }
}

// 움직이지 않는 가구를 재질별로 합쳐 그리기 호출을 크게 줄인다.
function mergeStatic(root) {
  root.updateMatrixWorld(true);
  const groups = new Map();
  const walk = (o) => {
    if (o.userData.noMerge) return;
    o.children.slice().forEach(walk);
    if (!o.isMesh || o.isInstancedMesh || o.userData.floor || o.userData.seat !== undefined || o.material.transparent) return;
    const key = `${o.material.uuid}|${o.castShadow}|${o.receiveShadow}`;
    if (!groups.has(key)) groups.set(key, { material: o.material, cast: o.castShadow, receive: o.receiveShadow, geos: [] });
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    Object.keys(g.attributes).forEach((name) => {
      if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    });
    g.applyMatrix4(o.matrixWorld);
    groups.get(key).geos.push(g);
    o.parent.remove(o);
  };
  root.children.slice().forEach(walk);
  groups.forEach(({ material, cast, receive, geos }) => {
    const mesh = new THREE.Mesh(mergeGeometries(geos, false), material);
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    root.add(mesh);
    geos.forEach((g) => g.dispose());
  });
}

class Nav {
  constructor(rects) {
    this.step = 0.35;
    this.x0 = -12.5;
    this.z0 = -8.5;
    this.nx = Math.ceil(25 / this.step);
    this.nz = Math.ceil(16.8 / this.step);
    this.grid = new Uint8Array(this.nx * this.nz);
    const pad = 0.26;
    for (let iz = 0; iz < this.nz; iz++) {
      for (let ix = 0; ix < this.nx; ix++) {
        const x = this.x0 + ix * this.step;
        const z = this.z0 + iz * this.step;
        if (rects.some((r) => x > r[0] - pad && x < r[2] + pad && z > r[1] - pad && z < r[3] + pad)) {
          this.grid[ix + iz * this.nx] = 1;
        }
      }
    }
  }

  cell(x, z) {
    const ix = Math.max(0, Math.min(this.nx - 1, Math.round((x - this.x0) / this.step)));
    const iz = Math.max(0, Math.min(this.nz - 1, Math.round((z - this.z0) / this.step)));
    return [ix, iz];
  }

  nearestOpen(ix, iz) {
    if (!this.grid[ix + iz * this.nx]) return [ix, iz];
    for (let r = 1; r < 30; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const a = ix + dx;
          const b = iz + dz;
          if (a >= 0 && b >= 0 && a < this.nx && b < this.nz && !this.grid[a + b * this.nx]) return [a, b];
        }
      }
    }
    return [ix, iz];
  }

  clear(ax, az, bx, bz) {
    const n = Math.ceil(Math.hypot(bx - ax, bz - az) / (this.step / 2));
    for (let i = 0; i <= n; i++) {
      const t = n ? i / n : 0;
      const [ix, iz] = this.cell(ax + (bx - ax) * t, az + (bz - az) * t);
      if (this.grid[ix + iz * this.nx]) return false;
    }
    return true;
  }

  // 격자 A* 후 보이는 지점끼리 이어 경로를 곧게 편다.
  findPath(from, to) {
    const [sx, sz] = this.nearestOpen(...this.cell(from.x, from.z));
    const [tx, tz] = this.nearestOpen(...this.cell(to.x, to.z));
    const { nx, nz, grid } = this;
    const start = sx + sz * nx;
    const goal = tx + tz * nx;
    const cost = new Float32Array(nx * nz).fill(Infinity);
    const prev = new Int32Array(nx * nz).fill(-1);
    const done = new Uint8Array(nx * nz);
    const open = [start];
    cost[start] = 0;
    const h = (i) => Math.hypot((i % nx) - tx, Math.floor(i / nx) - tz);
    while (open.length) {
      let best = 0;
      for (let i = 1; i < open.length; i++) {
        if (cost[open[i]] + h(open[i]) < cost[open[best]] + h(open[best])) best = i;
      }
      const cur = open.splice(best, 1)[0];
      if (cur === goal) break;
      done[cur] = 1;
      const cx = cur % nx;
      const cz = Math.floor(cur / nx);
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dz) continue;
          const ax = cx + dx;
          const az = cz + dz;
          if (ax < 0 || az < 0 || ax >= nx || az >= nz) continue;
          const n = ax + az * nx;
          if (grid[n] || done[n]) continue;
          if (dx && dz && (grid[cx + dx + cz * nx] || grid[cx + (cz + dz) * nx])) continue;
          const c = cost[cur] + Math.hypot(dx, dz);
          if (c < cost[n]) {
            cost[n] = c;
            prev[n] = cur;
            if (!open.includes(n)) open.push(n);
          }
        }
      }
    }
    if (prev[goal] === -1 && goal !== start) return [{ x: to.x, z: to.z }];
    const raw = [];
    for (let i = goal; i !== -1; i = prev[i]) {
      raw.unshift({ x: this.x0 + (i % nx) * this.step, z: this.z0 + Math.floor(i / nx) * this.step });
    }
    raw[raw.length - 1] = this.clear(raw[raw.length - 1].x, raw[raw.length - 1].z, to.x, to.z) ? { x: to.x, z: to.z } : raw[raw.length - 1];
    const path = [];
    let anchor = { x: from.x, z: from.z };
    for (let i = 0; i < raw.length - 1; i++) {
      if (!this.clear(anchor.x, anchor.z, raw[i + 1].x, raw[i + 1].z)) {
        path.push(raw[i]);
        anchor = raw[i];
      }
    }
    path.push(raw[raw.length - 1]);
    return path;
  }
}

export function createCafe(renderer) {
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();

  const rnd = seeded(9001);
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const oak = std({ map: oakTexture(), roughness: 0.62 });
  const oakPale = std({ color: '#efd9b4', map: oak.map, roughness: 0.7 });
  const walnut = std({ color: '#6c3f22', roughness: 0.55 });
  const shelfWood = std({ color: '#6d3218', roughness: 0.58 });
  const steel = std({ color: '#191a1c', roughness: 0.45, metalness: 0.6 });
  const whiteMetal = std({ color: '#e9e6df', roughness: 0.4, metalness: 0.25 });
  const plaster = std({ color: '#efe9dd', roughness: 0.92 });
  const concrete = std({ map: concreteTexture(176), roughness: 0.95 });
  const ceilingMat = std({ map: concreteTexture(140), roughness: 1 });
  const duct = std({ color: '#c9c8c2', roughness: 0.5, metalness: 0.35 });
  const stepMat = std({ color: '#d8d4ca', roughness: 0.75 });
  const glass = std({ color: '#cfe6ee', transparent: true, opacity: 0.1, roughness: 0.05, metalness: 0.2, depthWrite: false });
  const leaf = std({ color: '#3f8a45', roughness: 0.7, side: THREE.DoubleSide });
  const bulbMat = new THREE.MeshStandardMaterial({ color: '#ffcf8a', emissive: '#ffae4d', emissiveIntensity: 2 });
  const glowTex = glowTexture();
  const glowMat = new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.55 });

  const unit = new THREE.BoxGeometry(1, 1, 1);
  const pickables = [];
  const hitMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });

  function box(w, h, d, mat, x, y, z, { cast = true, parent = scene, ry = 0 } = {}) {
    const m = new THREE.Mesh(unit, mat);
    m.scale.set(w, h, d);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    m.castShadow = cast;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  function cyl(rt, rb, h, mat, x, y, z, { seg = 20, cast = true, parent = scene } = {}) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
    m.position.set(x, y, z);
    m.castShadow = cast;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  function glow(x, y, z, size, parent = scene) {
    const s = new THREE.Sprite(glowMat);
    s.position.set(x, y, z);
    s.scale.setScalar(size);
    parent.add(s);
    return s;
  }

  // ───── 바닥과 계단실 ─────
  const floorShape = new THREE.Shape();
  floorShape.moveTo(-14, -10);
  floorShape.lineTo(14, -10);
  floorShape.lineTo(14, 10);
  floorShape.lineTo(-14, 10);
  floorShape.closePath();
  const hole = new THREE.Path();
  hole.moveTo(-0.3, -5.2);
  hole.lineTo(2.3, -5.2);
  hole.lineTo(2.3, 1.5);
  hole.lineTo(-0.3, 1.5);
  hole.closePath();
  floorShape.holes.push(hole);
  const floorGeo = new THREE.ShapeGeometry(floorShape);
  floorGeo.rotateX(-Math.PI / 2);
  const floor = new THREE.Mesh(floorGeo, std({ map: floorTexture(), roughness: 0.48 }));
  floor.receiveShadow = true;
  floor.userData.floor = true;
  scene.add(floor);
  pickables.push(floor);

  const stepCount = 16;
  for (let i = 0; i < stepCount; i++) {
    box(2.6, 0.2, 0.37, stepMat, 1, -(i + 0.5) * 0.2, 5.02 - i * 0.36, { cast: false });
    box(2.6, 0.03, 0.04, steel, 1, -i * 0.2 - 0.015, 5.2 - i * 0.36, { cast: false });
  }
  box(2.6, 0.1, 2, oak, 1, -3.25, -1, { cast: false });
  box(0.1, 3.6, 7, oak, -0.32, -1.75, 1.8, { cast: false });
  box(0.1, 3.6, 7, oak, 2.32, -1.75, 1.8, { cast: false });
  const landing = std({ color: '#e8c083', emissive: '#d99b4b', emissiveIntensity: 0.65 });
  box(2.6, 3.4, 0.1, landing, 1, -1.6, -1.55, { cast: false });
  for (let i = 0; i < 2; i++) {
    const x = i ? 2.2 : -0.2;
    box(0.035, 0.035, 6.5, steel, x, 0.9, 2, { cast: false });
    for (let j = 0; j < 12; j++) box(0.02, 0.9, 0.02, steel, x, 0.45, -1.1 + j * 0.56, { cast: false });
  }

  // ───── 말굽 모양 나무 카운터 (사진 2) ─────
  const cx = 1;
  const zCurve = -0.2;
  const zOpen = 5.4;
  function uShape(ro, ri) {
    const s = new THREE.Shape();
    s.moveTo(cx - ro, -zOpen);
    s.lineTo(cx - ro, -zCurve);
    s.absarc(cx, -zCurve, ro, Math.PI, 0, true);
    s.lineTo(cx + ro, -zOpen);
    s.lineTo(cx + ri, -zOpen);
    s.lineTo(cx + ri, -zCurve);
    s.absarc(cx, -zCurve, ri, 0, Math.PI, false);
    s.lineTo(cx - ri, -zOpen);
    s.closePath();
    return s;
  }
  function uBlock(ro, ri, h, y, mat) {
    const g = new THREE.ExtrudeGeometry(uShape(ro, ri), { depth: h, bevelEnabled: false, curveSegments: 28 });
    g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, mat);
    m.position.y = y;
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
  }
  uBlock(1.95, 1.3, 0.09, 0.82, oak);
  uBlock(1.62, 1.36, 0.82, 0, walnut);
  const slatMatrices = [];
  const dummy = new THREE.Object3D();
  const addSlat = (x, z, ry) => {
    dummy.position.set(x, 0.41, z);
    dummy.rotation.set(0, ry, 0);
    dummy.scale.set(0.05, 0.82, 0.03);
    dummy.updateMatrix();
    slatMatrices.push(dummy.matrix.clone());
  };
  for (let z = zCurve; z < zOpen; z += 0.1) {
    addSlat(cx - 1.64, z, Math.PI / 2);
    addSlat(cx + 1.64, z, Math.PI / 2);
  }
  for (let a = 0; a <= Math.PI; a += 0.062) {
    addSlat(cx + Math.cos(a) * 1.64, zCurve - Math.sin(a) * 1.64, a + Math.PI / 2);
  }
  const slats = new THREE.InstancedMesh(unit, oak, slatMatrices.length);
  slatMatrices.forEach((m, i) => slats.setMatrixAt(i, m));
  scene.add(slats);

  // ───── 벽, 창, 천장 ─────
  // 위에서 내려다볼 때 걷어 내는 것들을 한 묶음에 모은다.
  const roof = new THREE.Group();
  roof.userData.noMerge = true;
  scene.add(roof);
  const addWallBox = (w, h, d, mat, x, y, z) => box(w, h, d, mat, x, y, z);
  addWallBox(0.4, 7, 19, concrete, 13.2, 3.5, 0);
  addWallBox(27, 7, 0.4, plaster, 0, 3.5, 9.2);
  box(27, 0.4, 19, ceilingMat, 0, 6.7, 0, { parent: roof });
  addWallBox(27, 0.9, 0.3, concrete, 0, 6.05, -9.15);
  addWallBox(0.3, 0.9, 19, concrete, -13.15, 6.05, 0);
  addWallBox(27, 0.25, 0.3, steel, 0, 0.12, -9.15);
  addWallBox(0.3, 0.25, 19, steel, -13.15, 0.12, 0);

  for (let x = -13; x <= 13.01; x += 3.25) box(0.09, 5.7, 0.16, steel, x, 2.85, -9.05);
  for (let z = -9; z <= 9.01; z += 3) box(0.16, 5.7, 0.09, steel, -13.05, 2.85, z);
  for (const y of [2.1, 4.1]) {
    box(26, 0.07, 0.14, steel, 0, y, -9.05);
    box(0.14, 0.07, 18, steel, -13.05, y, 0);
  }
  box(26, 5.6, 0.02, glass, 0, 2.9, -9.08, { cast: false });
  box(0.02, 5.6, 18, glass, -13.08, 2.9, 0, { cast: false });

  const outsideCanvas = document.createElement('canvas');
  outsideCanvas.width = 4096;
  outsideCanvas.height = 1024;
  const outsideTex = new THREE.CanvasTexture(outsideCanvas);
  outsideTex.colorSpace = THREE.SRGBColorSpace;
  outsideTex.wrapS = THREE.RepeatWrapping;
  const outside = new THREE.Mesh(
    new THREE.CylinderGeometry(70, 70, 80, 48, 1, true),
    new THREE.MeshBasicMaterial({ map: outsideTex, side: THREE.BackSide, toneMapped: false, fog: false }),
  );
  outside.position.y = 8;
  outside.userData.noMerge = true;
  scene.add(outside);

  // 천장 설비 (사진 1, 3의 노출 덕트와 시스템 에어컨)
  for (const z of [-5.5, 4.5]) {
    const t = cyl(0.26, 0.26, 25, duct, 0, 6.05, z, { seg: 18, cast: false, parent: roof });
    t.rotation.z = Math.PI / 2;
  }
  for (const [x, z] of [[-6, 3], [7, -2], [7, 3.2]]) {
    box(1.25, 0.12, 1.25, whiteMetal, x, 6.38, z, { cast: false, parent: roof });
    box(0.72, 0.02, 0.72, steel, x, 6.31, z, { cast: false, parent: roof });
  }

  // ───── 조명 ─────
  // 사진 1의 나무 원판 + 에디슨 전구
  cyl(2.5, 2.5, 0.12, oak, cx, 5.95, 1.5, { seg: 48, parent: roof });
  const wire = std({ color: '#111', roughness: 0.8 });
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.3;
    const r = i % 2 ? 1.5 : 0.75;
    const x = cx + Math.cos(a) * r;
    const z = 1.5 + Math.sin(a) * r;
    const y = 3.5 + rnd() * 1.35;
    cyl(0.008, 0.008, 5.9 - y, wire, x, (5.9 + y) / 2, z, { seg: 5, cast: false, parent: roof });
    cyl(0.03, 0.03, 0.07, steel, x, y + 0.13, z, { seg: 10, cast: false, parent: roof });
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), bulbMat);
    bulb.position.set(x, y, z);
    roof.add(bulb);
    glow(x, y, z, 1.05, roof);
  }

  // 사진 1의 철사 구형 조명
  const orbGroup = new THREE.Group();
  orbGroup.position.set(-7.5, 3.75, -1.5);
  orbGroup.userData.noMerge = true;
  const orbGeo = new THREE.IcosahedronGeometry(0.95, 2);
  orbGroup.add(new THREE.Mesh(orbGeo, new THREE.MeshBasicMaterial({ color: '#c9a35b', wireframe: true })));
  orbGroup.add(new THREE.Points(orbGeo, new THREE.PointsMaterial({ color: '#ffd58a', size: 0.07, toneMapped: false })));
  roof.add(orbGroup);
  glow(0, 0, 0, 2.3, orbGroup);
  cyl(0.008, 0.008, 2, wire, -7.5, 5.6, -1.5, { seg: 5, cast: false, parent: roof });

  // 사진 3의 검은 갓 조명
  const domeProfile = [[0.46, 0], [0.42, 0.1], [0.3, 0.27], [0.1, 0.36], [0.04, 0.42]].map((p) => new THREE.Vector2(p[0], p[1]));
  const domeGeo = new THREE.LatheGeometry(domeProfile, 28);
  const domeMat = std({ color: '#141516', roughness: 0.45, side: THREE.DoubleSide });
  for (const [x, z] of [[8, -6], [8, -2.8], [8, 0.5], [5.8, 3], [10, 3]]) {
    const y = 3.5;
    const d = new THREE.Mesh(domeGeo, domeMat);
    d.position.set(x, y, z);
    d.castShadow = true;
    roof.add(d);
    const disk = new THREE.Mesh(new THREE.CircleGeometry(0.42, 24), bulbMat);
    disk.rotation.x = Math.PI / 2;
    disk.position.set(x, y + 0.04, z);
    roof.add(disk);
    glow(x, y - 0.05, z, 1.3, roof);
    cyl(0.008, 0.008, 2.6, wire, x, y + 1.7, z, { seg: 5, cast: false, parent: roof });
  }

  const hemi = new THREE.HemisphereLight('#fff6e8', '#7a5436', 1);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#ffe2b8', 3);
  sun.position.set(-19, 19, -17);
  sun.castShadow = true;
  sun.shadow.mapSize.set(renderer.capabilities.maxTextureSize >= 4096 && !matchMedia('(pointer:coarse)').matches ? 4096 : 2048, 2048);
  sun.shadow.mapSize.y = sun.shadow.mapSize.x;
  Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 1, far: 70 });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.025;
  scene.add(sun);
  const lamps = [[1, 4, 1.5, 3], [-7.5, 3.4, -1.5, 2], [8, 3.2, -2.5, 2.2], [8, 3.2, 3.2, 2.2]].map(([x, y, z, power]) => {
    const l = new THREE.PointLight('#ffc98a', 0, 15, 1.6);
    l.position.set(x, y, z);
    l.userData.power = power;
    scene.add(l);
    return l;
  });

  // ───── 책 ─────
  const books = [];
  function shelfBooks(x0, x1, y, fixed, depth, axis) {
    let p = x0;
    while (p < x1) {
      const w = 0.05 + rnd() * 0.07;
      const h = 0.25 + rnd() * 0.13;
      if (rnd() > 0.1) books.push({ axis, along: p + w / 2, y: y + h / 2, fixed, w, h, d: depth * (0.75 + rnd() * 0.25), color: BOOK_COLORS[Math.floor(rnd() * BOOK_COLORS.length)] });
      p += w + 0.003;
    }
  }

  // 남쪽 벽 전체를 채우는 짙은 나무 책장
  for (const [a, b] of [[-13, -1.4], [3.4, 13]]) {
    const cxx = (a + b) / 2;
    box(b - a, 3.4, 0.08, shelfWood, cxx, 1.7, 8.97);
    box(b - a, 0.08, 0.56, shelfWood, cxx, 3.42, 8.72);
    for (let y = 0.05; y < 3.3; y += 0.64) {
      box(b - a, 0.07, 0.56, shelfWood, cxx, y, 8.72);
      shelfBooks(a + 0.05, b - 0.05, y + 0.04, 8.72, 0.42, 'x');
    }
    for (let x = a; x <= b + 0.01; x += 1.6) box(0.08, 3.4, 0.56, shelfWood, x, 1.7, 8.72);
  }

  // 복층과 유리 난간, 위층 서가 (사진 1)
  box(26.5, 0.22, 2, oak, 0, 3.62, 8.1);
  box(26.5, 0.06, 2, oakPale, 0, 3.76, 8.1, { cast: false });
  box(26.5, 1, 0.02, glass, 0, 4.25, 7.13, { cast: false });
  box(26.5, 0.05, 0.06, steel, 0, 4.76, 7.13);
  box(26.5, 2.6, 0.3, oak, 0, 5.2, 8.88);
  for (const y of [4.1, 4.85, 5.6]) {
    box(26.5, 0.05, 0.42, walnut, 0, y, 8.68);
    shelfBooks(-13, 13, y + 0.03, 8.68, 0.32, 'x');
  }
  for (let x = -13; x <= 13; x += 2.6) box(0.05, 0.08, 0.05, steel, x, 3.42, 7.2);

  // 창가의 나무 기둥 책장 (사진 1)
  box(1.2, 5.8, 1, oak, 6.5, 2.9, -8.35);
  for (let y = 0.4; y < 5.2; y += 0.62) {
    box(1.02, 0.5, 0.5, walnut, 6.5, y + 0.25, -7.92, { cast: false });
    shelfBooks(6.05, 6.95, y + 0.02, -7.84, 0.32, 'x');
  }
  // 서쪽 창 앞 사다리형 전시 선반 (사진 1)
  for (const z of [-3.6, 2.4]) {
    box(0.1, 5.4, 0.1, oak, -12.1, 2.7, z - 0.55);
    box(0.1, 5.4, 0.1, oak, -12.1, 2.7, z + 0.55);
    for (let y = 0.7; y < 5; y += 0.82) {
      box(0.34, 0.05, 1.2, oak, -12.1, y, z);
      shelfBooks(z - 0.48, z + 0.48, y + 0.03, -12.1, 0.26, 'z');
    }
  }

  // 사진 1의 곡선 집성목 아치
  const archShape = new THREE.Shape();
  archShape.absellipse(0, 0, 7.2, 5.9, 0, Math.PI, false);
  archShape.absellipse(0, 0, 6.65, 5.35, Math.PI, 0, true);
  const archGeo = new THREE.ExtrudeGeometry(archShape, { depth: 0.42, bevelEnabled: false, curveSegments: 50 });
  archGeo.rotateY(Math.PI / 2);
  const arch = new THREE.Mesh(archGeo, oak);
  arch.position.set(-11.5, 0, 0);
  arch.castShadow = arch.receiveShadow = true;
  scene.add(arch);
  const archLine = new THREE.ExtrudeGeometry(archShape, { depth: 0.1, bevelEnabled: false, curveSegments: 50 });
  archLine.rotateY(Math.PI / 2);
  const archDark = new THREE.Mesh(archLine, walnut);
  archDark.position.set(-11.36, 0, 0);
  archDark.scale.set(1, 1, 1);
  scene.add(archDark);

  // 동쪽 벽: 포스터 (사진 3의 포스터 벽을 책 표지로 바꿈)
  const posterTitles = ['고요', '문장', '오후', '서재', '연필', '여백', '한 페이지', '밑줄'];
  const posterTextures = [];
  posterTitles.forEach((title, i) => {
    const color = BOOK_COLORS[i % BOOK_COLORS.length];
    const draw = (ctx, w, h) => {
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = i % 3 === 0 ? 'rgba(255,255,255,.2)' : 'rgba(0,0,0,.14)';
      for (let k = 0; k < 4; k++) {
        ctx.beginPath();
        ctx.arc(w * ((k * 37 + i * 19) % 10) / 10, h * ((k * 53 + i * 11) % 10) / 10, 34 + k * 26, 0, 7);
        ctx.fill();
      }
      ctx.fillStyle = color === '#f4f4f4' || color === '#f2cd37' ? '#1b2a34' : '#fff';
      ctx.font = '700 58px "Gowun Batang", serif';
      ctx.textAlign = 'center';
      ctx.fillText(title, w / 2, h * 0.78);
    };
    const tex = canvasTexture(320, 448, draw);
    posterTextures.push({ tex, draw });
    const p = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 1.6), std({ map: tex, roughness: 0.75 }));
    p.rotation.y = -Math.PI / 2;
    p.position.set(12.97, 3.15 + (i % 2) * 1.75, -7.2 + Math.floor(i / 2) * 2.1 + (i % 2) * 0.5);
    scene.add(p);
  });

  // 복층 위 간판
  const signDraw = (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#2b190c';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#f4d9a8';
    ctx.font = '700 150px "Gowun Batang", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('스터디카페', w / 2, h / 2 + 6);
  };
  const signTex = canvasTexture(1024, 256, signDraw);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.85), std({ map: signTex, roughness: 0.6 }));
  sign.position.set(1, 3.0, 8.92);
  scene.add(sign);
  box(4.8, 3.42, 0.1, plaster, 1, 1.71, 8.93, { cast: false });
  document.fonts?.ready.then(() => {
    signDraw(signTex.image.getContext('2d'), 1024, 256);
    signTex.needsUpdate = true;
    posterTextures.forEach(({ tex, draw }) => {
      draw(tex.image.getContext('2d'), 320, 448);
      tex.needsUpdate = true;
    });
  });

  // ───── 식물 ─────
  const leaves = [];
  const leafGeo = new THREE.SphereGeometry(1, 8, 6);
  function plant(x, y, z, size = 1, count = 26) {
    const potMat = whiteMetal;
    cyl(0.17 * size, 0.12 * size, 0.28 * size, potMat, x, y + 0.14 * size, z, { seg: 16 });
    for (let i = 0; i < count; i++) {
      const a = rnd() * Math.PI * 2;
      const r = rnd() * 0.32 * size;
      leaves.push({ x: x + Math.cos(a) * r, y: y + (0.32 + rnd() * 0.62) * size, z: z + Math.sin(a) * r, s: 0.14 * size, a });
    }
  }
  function vine(x, z, topY, len) {
    let px = x;
    let pz = z;
    for (let i = 0; i < len * 9; i++) {
      px += (rnd() - 0.5) * 0.07;
      pz += (rnd() - 0.5) * 0.09;
      leaves.push({ x: px, y: topY - (i / 9) * (0.85 + rnd() * 0.3), z: pz, s: 0.1, a: rnd() * 6 });
    }
  }
  plant(-7.5, 0.84, -1.5, 0.75);
  plant(11.9, 0, -8.2, 3, 90);
  plant(-12, 0, -7.9, 2.6, 70);
  plant(-12, 0, 6.8, 2.4, 60);
  plant(-5.5, 0.48, 4.2, 0.7);
  plant(8, 0.4, 5.2, 0.55);
  for (let i = 0; i < 12; i++) vine(12.85, -8 + i * 0.9 + rnd() * 0.3, 6.45, 1.4 + rnd() * 1.9);
  const leafMesh = new THREE.InstancedMesh(leafGeo, leaf, leaves.length);
  const c = new THREE.Color();
  leaves.forEach((l, i) => {
    dummy.position.set(l.x, l.y, l.z);
    dummy.rotation.set(rnd(), l.a, rnd());
    dummy.scale.set(l.s, l.s * 0.22, l.s * 0.55);
    dummy.updateMatrix();
    leafMesh.setMatrixAt(i, dummy.matrix);
    leafMesh.setColorAt(i, c.setHSL(0.31 + rnd() * 0.06, 0.45, 0.25 + rnd() * 0.16));
  });
  leafMesh.castShadow = true;
  scene.add(leafMesh);

  // ───── 가구 부품 ─────
  function chair(x, z, rot) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    box(0.48, 0.04, 0.46, oak, 0, 0.45, 0, { parent: g });
    const back = box(0.46, 0.34, 0.035, oak, 0, 0.74, -0.24, { parent: g });
    back.rotation.x = -0.14;
    for (const [lx, lz] of [[-0.2, -0.19], [0.2, -0.19], [-0.2, 0.19], [0.2, 0.19]]) {
      const leg = box(0.035, 0.46, 0.035, oak, lx, 0.22, lz, { parent: g });
      leg.rotation.set(lz > 0 ? 0.1 : -0.1, 0, lx > 0 ? -0.08 : 0.08);
    }
    box(0.03, 0.34, 0.03, oak, 0, 0.56, -0.22, { parent: g });
    scene.add(g);
    return g;
  }

  function stool(x, z) {
    cyl(0.19, 0.19, 0.04, whiteMetal, x, 0.58, z);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.4;
      const m = cyl(0.014, 0.014, 0.6, whiteMetal, x + Math.cos(a) * 0.12, 0.28, z + Math.sin(a) * 0.12, { seg: 6 });
      m.rotation.set(Math.sin(a) * 0.14, 0, -Math.cos(a) * 0.14);
    }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.01, 6, 24), whiteMetal);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(x, 0.24, z);
    scene.add(ring);
  }

  function beanbag(x, z, color, scale = 1) {
    const g = new THREE.Mesh(new THREE.SphereGeometry(0.72 * scale, 28, 20), std({ color, roughness: 0.82 }));
    g.scale.set(1, 0.58, 1);
    g.position.set(x, 0.36 * scale, z);
    g.castShadow = g.receiveShadow = true;
    scene.add(g);
    const dent = new THREE.Mesh(new THREE.SphereGeometry(0.36 * scale, 18, 12), g.material);
    dent.scale.set(1, 1.2, 0.5);
    return g;
  }

  function deskLamp(x, y, z, rot) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = rot;
    cyl(0.07, 0.08, 0.02, steel, 0, 0.01, 0, { parent: g, seg: 14 });
    const a = cyl(0.01, 0.01, 0.34, steel, 0, 0.17, 0, { parent: g, seg: 6 });
    a.rotation.x = 0.12;
    const b = cyl(0.01, 0.01, 0.2, steel, 0, 0.36, 0.07, { parent: g, seg: 6 });
    b.rotation.x = 1.2;
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.1, 16, 1, true), domeMat);
    shade.position.set(0, 0.37, 0.17);
    g.add(shade);
    const mat = new THREE.MeshStandardMaterial({ color: '#fff1d6', emissive: '#ffcb7e', emissiveIntensity: 0.1 });
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.036, 10, 8), mat);
    bulb.position.set(0, 0.345, 0.17);
    g.add(bulb);
    const light = glow(0, 0.3, 0.17, 0.7, g);
    light.visible = false;
    scene.add(g);
    return (on) => {
      mat.emissiveIntensity = on ? 3 : 0.1;
      light.visible = on;
    };
  }

  const paperMat = std({ color: '#f7f2e4', roughness: 0.9 });
  const coverMat = std({ color: '#0055bf', roughness: 0.4 });
  const mugMat = std({ color: '#f2efe8', roughness: 0.3 });
  const coffeeMat = std({ color: '#3a2112', roughness: 0.35 });

  function deskProps(seat, d = 0.68) {
    const fx = Math.sin(seat.rot);
    const fz = Math.cos(seat.rot);
    const set = new THREE.Group();
    set.position.set(seat.x + fx * d, seat.deskY, seat.z + fz * d);
    set.rotation.y = seat.rot;
    box(0.44, 0.012, 0.3, coverMat, 0, 0.006, 0, { parent: set, cast: false });
    const pl = box(0.205, 0.022, 0.285, paperMat, -0.105, 0.022, 0, { parent: set, cast: false });
    pl.rotation.z = 0.035;
    const pr = box(0.205, 0.022, 0.285, paperMat, 0.105, 0.022, 0, { parent: set, cast: false });
    pr.rotation.z = -0.035;
    const pencil = box(0.012, 0.012, 0.18, std({ color: '#f2cd37' }), -0.13, 0.045, 0.02, { parent: set, cast: false });
    pencil.rotation.y = 0.7;
    set.visible = false;
    set.userData.noMerge = true;
    scene.add(set);
    seat.book = set;
    const mug = new THREE.Group();
    mug.position.set(seat.x + fx * d + Math.cos(seat.rot) * 0.34, seat.deskY, seat.z + fz * d - Math.sin(seat.rot) * 0.34);
    cyl(0.045, 0.04, 0.095, mugMat, 0, 0.048, 0, { parent: mug, seg: 14, cast: false });
    cyl(0.038, 0.038, 0.002, coffeeMat, 0, 0.096, 0, { parent: mug, seg: 14, cast: false });
    mug.visible = false;
    mug.userData.noMerge = true;
    scene.add(mug);
    seat.mug = mug;
    noteSpot(seat, seat.x + fx * d - Math.cos(seat.rot) * 0.36, seat.deskY, seat.z + fz * d + Math.sin(seat.rot) * 0.36);
  }

  // 자리에 붙는 쪽지. 많이 받아도 세 장까지만 겹쳐 놓는다.
  const noteMat = new THREE.MeshBasicMaterial({ map: noteTexture(), toneMapped: false });
  const noteGeo = new THREE.PlaneGeometry(0.2, 0.2);
  noteGeo.rotateX(-Math.PI / 2);
  function noteSpot(seat, x, y, z) {
    const group = new THREE.Group();
    group.position.set(x, y, z);
    group.rotation.y = seat.rot;
    group.userData.noMerge = true;
    const sheets = [[0, 0, 0.1], [0.03, -0.02, -0.16], [-0.025, 0.025, 0.28]].map(([dx, dz, turn], i) => {
      const sheet = new THREE.Mesh(noteGeo, noteMat);
      sheet.position.set(dx, 0.004 + i * 0.002, dz);
      sheet.rotation.y = turn;
      sheet.visible = false;
      group.add(sheet);
      return sheet;
    });
    scene.add(group);
    const hit = new THREE.Mesh(unit, hitMat);
    hit.scale.set(0.34, 0.14, 0.34);
    hit.position.set(x, y + 0.05, z);
    hit.visible = false;
    hit.userData.noMerge = true;
    hit.userData.noteSeat = seat.i;
    scene.add(hit);
    pickables.push(hit);
    seat.noteCount = 0;
    seat.setNotes = (count) => {
      seat.noteCount = count;
      sheets.forEach((sheet, i) => { sheet.visible = i < count; });
    };
  }

  // ───── 20석 ─────
  const seats = [];
  const ringGeo = new THREE.RingGeometry(0.33, 0.4, 36);
  const ringMat = new THREE.MeshBasicMaterial({ color: '#ffd24a', transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false });
  function addSeat(zone, type, x, z, rot, y, deskY) {
    const seat = { i: seats.length, zone, type, x, z, rot, y, deskY, lampSet: null, book: null, mug: null };
    const backOff = type === 'bean' ? 1 : 0.68;
    seat.approach = { x: x - Math.sin(rot) * backOff, z: z - Math.cos(rot) * backOff };
    const hit = new THREE.Mesh(unit, hitMat);
    hit.scale.set(0.8, 1.3, 0.8);
    hit.position.set(x, 0.65, z);
    hit.userData.seat = seat.i;
    scene.add(hit);
    pickables.push(hit);
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.015, z);
    scene.add(ring);
    seat.ring = ring;
    seats.push(seat);
    return seat;
  }

  // 창가 바 테이블 4석 (사진 1)
  box(10.4, 0.05, 0.8, oak, 0, 0.77, -8.3);
  for (const x of [-5, 0, 5]) {
    box(0.05, 0.75, 0.7, steel, x, 0.375, -8.3);
  }
  for (const x of [-3.6, -1.2, 1.2, 3.6]) {
    chair(x, -7.42, Math.PI);
    const s = addSeat('창가 바', 'chair', x, -7.42, Math.PI, 0.47, 0.795);
    deskProps(s);
    s.lampSet = deskLamp(x + 0.48, 0.795, -8.42, 0);
  }

  // 공용 긴 테이블 4석 (사진 1 앞쪽)
  box(1.5, 0.08, 4.6, oak, -7.5, 0.78, -1.5);
  for (const [lx, lz] of [[-8.15, -3.65], [-6.85, -3.65], [-8.15, 0.65], [-6.85, 0.65]]) box(0.05, 0.75, 0.05, steel, lx, 0.375, lz);
  box(1.3, 0.05, 0.05, steel, -7.5, 0.7, -3.65);
  box(1.3, 0.05, 0.05, steel, -7.5, 0.7, 0.65);
  for (const z of [-2.9, -0.1]) {
    chair(-8.72, z, Math.PI / 2);
    deskProps(addSeat('긴 테이블', 'chair', -8.72, z, Math.PI / 2, 0.47, 0.82));
    chair(-6.28, z, -Math.PI / 2);
    deskProps(addSeat('긴 테이블', 'chair', -6.28, z, -Math.PI / 2, 0.47, 0.82));
  }

  // 말굽 카운터 6석 (사진 2)
  for (const z of [0.3, 2.1, 3.9]) {
    stool(cx - 2.37, z);
    deskProps(addSeat('말굽 카운터', 'stool', cx - 2.37, z, Math.PI / 2, 0.6, 0.91), 0.62);
    stool(cx + 2.37, z);
    deskProps(addSeat('말굽 카운터', 'stool', cx + 2.37, z, -Math.PI / 2, 0.6, 0.91), 0.62);
  }

  // 칸막이 책상 4석 (사진 3 오른쪽)
  box(1.15, 0.05, 7.4, oak, 12.27, 0.77, -4.3);
  box(0.1, 2.2, 7.4, oak, 12.82, 1.1, -4.3);
  for (let k = 0; k < 5; k++) box(1.15, 1.45, 0.05, oak, 12.27, 0.725, -8 + k * 1.85);
  box(1.15, 0.05, 7.4, oak, 12.27, 1.48, -4.3);
  for (let k = 0; k < 4; k++) {
    const z = -7.08 + k * 1.85;
    shelfBooks(z - 0.7, z + 0.7, 1.51, 12.5, 0.34, 'z');
    chair(11.15, z, Math.PI / 2);
    const s = addSeat('칸막이 책상', 'chair', 11.15, z, Math.PI / 2, 0.47, 0.795);
    deskProps(s);
    s.lampSet = deskLamp(12.22, 0.795, z + 0.55, -Math.PI / 2);
  }

  // 빈백 라운지 2석 (사진 3)
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(7.4, 4.6), std({ color: '#a7a198', roughness: 1 }));
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(8, 0.008, 4.6);
  rug.receiveShadow = true;
  scene.add(rug);
  beanbag(6, 4.9, '#e8701f');
  beanbag(10, 4.9, '#2f5d73');
  noteSpot(addSeat('빈백 라운지', 'bean', 6, 4.9, Math.PI / 2, 0.44, 0), 7.68, 0.405, 5.42);
  noteSpot(addSeat('빈백 라운지', 'bean', 10, 4.9, -Math.PI / 2, 0.44, 0), 8.32, 0.405, 5.42);
  beanbag(12.1, 6.7, '#7d7a72', 0.85);
  box(1.1, 0.05, 0.8, oak, 8, 0.38, 5.2);
  box(0.9, 0.36, 0.05, steel, 8, 0.18, 5.2);
  box(0.26, 0.03, 0.34, std({ color: '#c91a09', roughness: 0.4 }), 7.75, 0.42, 5.1, { cast: false });

  // 비어 있는 큰 탁자와 벤치 (사진 1 앞쪽의 낮은 탁자)
  box(2.2, 0.07, 1.25, oak, -5.5, 0.45, 4.2);
  for (const [lx, lz] of [[-6.5, 3.7], [-4.5, 3.7], [-6.5, 4.7], [-4.5, 4.7]]) box(0.05, 0.43, 0.05, steel, lx, 0.215, lz);
  box(2.3, 0.3, 0.5, oak, -5.5, 0.15, 5.4);

  // 책 인스턴싱
  const bookMesh = new THREE.InstancedMesh(unit, std({ roughness: 0.42 }), books.length);
  books.forEach((b, i) => {
    if (b.axis === 'x') {
      dummy.position.set(b.along, b.y, b.fixed);
      dummy.scale.set(b.w, b.h, b.d);
    } else {
      dummy.position.set(b.fixed, b.y, b.along);
      dummy.scale.set(b.d, b.h, b.w);
    }
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    bookMesh.setMatrixAt(i, dummy.matrix);
    bookMesh.setColorAt(i, c.set(b.color));
  });
  bookMesh.receiveShadow = true;
  scene.add(bookMesh);
  mergeStatic(roof);
  mergeStatic(scene);

  const nav = new Nav([
    [-5.3, -9, 5.3, -7.85],
    [5.85, -9, 7.15, -7.7],
    [-8.3, -3.85, -6.7, 0.85],
    [-1.0, -2.2, 3.0, 5.5],
    [11.65, -8.1, 13, -0.5],
    [7.4, 4.75, 8.6, 5.65],
    [-6.7, 3.5, -4.3, 5.7],
    [-11.8, -7.5, -11.2, -6.9],
    [-11.8, 6.9, -11.2, 7.5],
    [-13, -4.3, -11.9, -2.9],
    [-13, 1.7, -11.9, 3.1],
    [-13, -9, -11.5, -7.4],
    [-13, 6.3, -11.5, 7.4],
    [11.4, -9, 13, -7.8],
    [11.4, 6, 13, 7.4],
    [-13, 8.3, 13, 9],
  ]);

  function setTime(key) {
    const presets = {
      day: { sun: 3.3, sunColor: '#ffdcae', hemi: 1.15, env: 0.34, bulb: 3, lamp: 0, glow: 0.45, exposure: 1 },
      dusk: { sun: 1.7, sunColor: '#ff9d5e', hemi: 0.72, env: 0.26, bulb: 3, lamp: 0.65, glow: 0.55, exposure: 1.02 },
      night: { sun: 0, sunColor: '#ffffff', hemi: 0.34, env: 0.12, bulb: 4.5, lamp: 1, glow: 0.85, exposure: 1.08 },
    };
    const p = presets[key];
    sun.intensity = p.sun;
    sun.color.set(p.sunColor);
    sun.visible = p.sun > 0;
    hemi.intensity = p.hemi;
    scene.environmentIntensity = p.env;
    bulbMat.emissiveIntensity = p.bulb;
    glowMat.opacity = p.glow;
    renderer.toneMappingExposure = p.exposure;
    lamps.forEach((l) => {
      l.intensity = p.lamp * l.userData.power * 9;
    });
    paintOutside(outsideCanvas.getContext('2d'), outsideCanvas.width, outsideCanvas.height, key);
    outsideTex.needsUpdate = true;
    // 태양 그림자는 가구가 움직이지 않으므로 시간대가 바뀔 때만 다시 굽는다.
    renderer.shadowMap.needsUpdate = true;
  }

  return {
    scene,
    seats,
    pickables,
    spawn: { x: 1, z: 6.5 },
    findPath: (from, to) => nav.findPath(from, to),
    setTime,
    setRoof(on) {
      roof.visible = on;
      outside.visible = on;
    },
    tick(t) {
      orbGroup.rotation.y = t * 0.03;
    },
  };
}

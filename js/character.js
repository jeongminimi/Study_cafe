import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { SKIN, faceMap, petFaceMap, topMap, plaidMap } from './character-art.js';
import { addPetParts } from './character-pets.js';
import { browColor, defaultGlasses, furOf, hairColor, isPet } from './config.js';

const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));

const LOOK = {
  man: { scale: 1.06, headScale: 1, tagY: 1.5, pants: '#34372f', shoes: '#4e2e1a', sleeve: '#4c5145', cuff: '#4c5145' },
  woman: { scale: 0.98, headScale: 1, tagY: 1.4, pants: '#f6cfb2', shoes: '#5e3620', sleeve: '#8f6242', cuff: '#7a5236' },
  child: { scale: 0.8, headScale: 1.14, tagY: 1.3, pants: '#2b2d33', shoes: '#1c1c20', sleeve: '#b6222c', cuff: '#8f1520' },
  dog: { scale: 0.94, headScale: 1.12, tagY: 1.42 },
  cat: { scale: 0.9, headScale: 1.12, headY: 0.456, tagY: 1.36 },
};

// 머리 색(동물은 털 색)과 안경은 사람마다 고른다.
export const defaultStyle = (type) => ({ hair: 'base', glasses: defaultGlasses(type) });
const styleOf = (type, style) => ({ ...defaultStyle(type), ...style });

// 같은 옷과 얼굴은 여러 사람이 함께 쓴다.
const shared2d = new Map();
const once = (key, make) => {
  if (!shared2d.has(key)) shared2d.set(key, make());
  return shared2d.get(key);
};

const flat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.52 });
const furry = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78 });
const textured = (map, extra = {}) => new THREE.MeshStandardMaterial({ color: '#ffffff', map, roughness: 0.56, ...extra });

function lathe(points, seg = 32) {
  const curve = new THREE.SplineCurve(points.map(([r, y]) => new THREE.Vector2(r, y)));
  return new THREE.LatheGeometry(curve.getPoints(20).map((p) => new THREE.Vector2(Math.max(0.0001, p.x), p.y)), seg, Math.PI);
}

function matrixOf({ p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1] }) {
  const o = new THREE.Object3D();
  o.position.set(...p);
  o.rotation.set(...r);
  o.scale.set(...s);
  o.updateMatrix();
  return o.matrix.clone();
}

// 관절마다 조각을 색칠해 하나로 구워 사람 한 명당 그리기 호출을 10개 안팎으로 줄인다.
function buildParts(type, style) {
  const look = LOOK[type];
  const flatGeos = {};
  const texGeos = new Map();
  const color = new THREE.Color();
  const ball = new THREE.SphereGeometry(1, 22, 16);
  const small = new THREE.SphereGeometry(1, 12, 9);
  const skin = SKIN[type];

  const prep = (geo, t) => {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.applyMatrix4(t.m ? t.m.clone().multiply(matrixOf(t)) : matrixOf(t));
    return g;
  };
  const put = (bone, geo, paint, t = {}) => {
    const g = prep(geo, t);
    g.deleteAttribute('uv');
    color.set(paint);
    const n = g.attributes.position.count;
    const colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) colors.set([color.r, color.g, color.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    (flatGeos[bone] ||= []).push(g);
  };
  const putTex = (bone, geo, material, t = {}) => {
    const key = `${bone}|${material.uuid}`;
    if (!texGeos.has(key)) texGeos.set(key, { bone, material, geos: [] });
    texGeos.get(key).geos.push(prep(geo, t));
  };
  const finish = (faceOn, faceOff) => {
    const paint = isPet(type) ? furry : flat;
    const merged = [];
    Object.entries(flatGeos).forEach(([bone, geos]) => merged.push({ bone, material: paint, geometry: mergeGeometries(geos, false) }));
    texGeos.forEach(({ bone, material, geos }) => merged.push({ bone, material, geometry: mergeGeometries(geos, false) }));
    return { merged, faceGeo: new THREE.SphereGeometry(0.2, 36, 24, -Math.PI / 2), faceOn, faceOff, faceY: 0.2 };
  };

  if (isPet(type)) {
    addPetParts(type, style, { put, putTex, textured, once, lathe, matrixOf });
    const fur = furOf(style.hair, type);
    return finish(
      once(`on|${type}|${fur.fur}`, () => textured(petFaceMap(type, fur, false), { roughness: 0.78 })),
      once(`off|${type}|${fur.fur}`, () => textured(petFaceMap(type, fur, true), { roughness: 0.78 })),
    );
  }

  // 다리
  for (const bone of ['legL', 'legR']) {
    if (type === 'man') {
      put(bone, new THREE.CapsuleGeometry(0.094, 0.2, 6, 14), look.pants, { p: [0, -0.16, 0] });
    } else if (type === 'woman') {
      put(bone, new THREE.CapsuleGeometry(0.062, 0.25, 6, 12), skin, { p: [0, -0.17, 0] });
      put(bone, new THREE.CapsuleGeometry(0.067, 0.05, 5, 12), '#fbf8f1', { p: [0, -0.29, 0] });
    } else {
      put(bone, new THREE.CapsuleGeometry(0.076, 0.12, 6, 12), skin, { p: [0, -0.1, 0] });
      put(bone, new THREE.CapsuleGeometry(0.082, 0.1, 6, 12), '#6d7078', { p: [0, -0.26, 0] });
    }
    put(bone, ball, look.shoes, { p: [0, -0.345, 0.04], s: [0.095, 0.058, 0.142] });
  }

  // 몸통과 허리 아래
  const topMat = once(`top|${type}`, () => textured(topMap(type)));
  const hem = type === 'man' ? [[0.2, -0.13], [0.205, -0.03]] : [[0.17, -0.03]];
  putTex('torso', lathe([...hem, [0.2, 0.03], [0.21, 0.16], [0.2, 0.28], [0.15, 0.37], [0.075, 0.425]], 36), topMat, { s: [1, 1, 0.76] });
  put('torso', ball, look.sleeve, { p: [0, 0.42, 0], s: [0.075, 0.018, 0.058] });
  put('torso', new THREE.CylinderGeometry(0.066, 0.078, 0.06, 14), skin, { p: [0, 0.44, 0] });

  if (type === 'woman') {
    const geo = lathe([[0.17, 0.04], [0.2, -0.02], [0.25, -0.12], [0.295, -0.24]], 54);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const a = Math.atan2(pos.getX(i), pos.getZ(i));
      const k = 1 + Math.sin(a * 18) * 0.035 * Math.min(1, Math.max(0, (0.02 - pos.getY(i)) / 0.2));
      pos.setX(i, pos.getX(i) * k);
      pos.setZ(i, pos.getZ(i) * k * 0.86);
    }
    geo.computeVertexNormals();
    putTex('skirt', geo, once('skirt', () => textured(plaidMap('#d9c2a0', '#a67c52', '#6f4a2c', [10, 2]), { side: THREE.DoubleSide })));
  } else if (type === 'child') {
    put('hips', lathe([[0.15, 0.04], [0.17, -0.03], [0.178, -0.1], [0.178, -0.165]], 28), look.pants, { s: [1, 1, 0.76] });
    put('hips', new THREE.CircleGeometry(0.17, 20), look.pants, { p: [0, -0.16, 0], s: [1, 0.76, 1], r: [Math.PI / 2, 0, 0] });
  } else {
    put('hips', ball, look.pants, { p: [0, -0.03, 0], s: [0.175, 0.08, 0.13] });
  }

  // 팔
  for (const [bone, side] of [['armL', 1], ['armR', -1]]) {
    put(bone, ball, look.sleeve, { s: [0.066, 0.066, 0.066] });
    put(bone, new THREE.CapsuleGeometry(0.063, 0.17, 6, 12), look.sleeve, { p: [side * 0.004, -0.105, 0] });
    put(bone, new THREE.CylinderGeometry(0.07, 0.07, 0.035, 14), look.cuff, { p: [side * 0.004, -0.21, 0] });
    if (type === 'man') put(bone, new THREE.CylinderGeometry(0.058, 0.058, 0.02, 12), '#fbf8f1', { p: [side * 0.004, -0.235, 0] });
    put(bone, ball, skin, { p: [side * 0.004, -0.275, 0.004], s: [0.064, 0.07, 0.06] });
    put(bone, small, skin, { p: [-side * 0.046, -0.262, 0.03], s: [0.024, 0.032, 0.024] });
  }

  // 머리: 얼굴은 표정을 바꾸기 위해 따로 그린다
  const cy = 0.2;
  const R = 0.2;
  put('head', small, skin, { p: [0, cy - 0.04, R - 0.006], s: [0.022, 0.018, 0.02] });
  for (const s of [-1, 1]) put('head', small, skin, { p: [s * 0.2, cy - 0.015, 0], s: [0.03, 0.044, 0.026] });

  const hair = hairColor(style.hair, type);
  const blob = (x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) => put('head', ball, hair, { p: [x, cy + y, z], s: [sx, sy, sz], r: [rx, ry, rz] });
  if (type === 'man') {
    put('head', new THREE.SphereGeometry(0.213, 28, 14, 0, Math.PI * 2, 0, Math.PI * 0.5), hair, { p: [0, cy + 0.005, -0.012], s: [1, 0.98, 1], r: [-0.34, 0, 0] });
    blob(0.0, 0.135, 0.04, 0.195, 0.105, 0.165);
    blob(0.07, 0.135, 0.125, 0.125, 0.052, 0.085, 0.3, 0, -0.42);
    blob(-0.085, 0.13, 0.125, 0.105, 0.05, 0.08, 0.3, 0, 0.5);
    blob(-0.165, 0.055, 0.075, 0.042, 0.08, 0.055, 0, 0, 0.1);
    blob(0.165, 0.055, 0.075, 0.042, 0.08, 0.055, 0, 0, -0.1);
    blob(0, -0.03, -0.095, 0.165, 0.145, 0.115);
  } else if (type === 'woman') {
    blob(0, 0.03, -0.045, 0.238, 0.205, 0.2);
    put('head', new THREE.SphereGeometry(0.216, 28, 14, 0, Math.PI * 2, 0, Math.PI * 0.46), hair, { p: [0, cy + 0.005, -0.004], r: [-0.12, 0, 0] });
    blob(0.075, 0.135, 0.115, 0.135, 0.058, 0.09, 0.42, 0, -0.5);
    blob(-0.11, 0.115, 0.115, 0.082, 0.05, 0.074, 0.4, 0, 0.72);
    blob(0.182, -0.075, 0.07, 0.066, 0.135, 0.078, 0, 0, -0.08);
    blob(-0.182, -0.075, 0.07, 0.066, 0.135, 0.078, 0, 0, 0.08);
    blob(0.178, -0.175, 0.055, 0.062, 0.042, 0.082, 0, 0, 0.32);
    blob(-0.178, -0.175, 0.055, 0.062, 0.042, 0.082, 0, 0, -0.32);
  } else {
    put('head', new THREE.SphereGeometry(0.21, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.54), hair, { p: [0, cy, -0.006], r: [-0.22, 0, 0] });
    blob(0.075, 0.105, 0.145, 0.078, 0.042, 0.06, 0.2, 0, -0.32);
    blob(-0.03, 0.115, 0.158, 0.078, 0.042, 0.055, 0.2);
    blob(-0.12, 0.09, 0.122, 0.058, 0.04, 0.055, 0.2, 0, 0.5);
    const hat = matrixOf({ p: [0, cy + 0.11, -0.012], r: [-0.2, 0, 0] });
    const felt = '#7c5c38';
    put('head', new THREE.CylinderGeometry(0.312, 0.312, 0.018, 36), felt, { m: hat });
    put('head', new THREE.TorusGeometry(0.31, 0.014, 8, 40), felt, { m: hat, r: [Math.PI / 2, 0, 0] });
    put('head', lathe([[0.215, 0], [0.208, 0.07], [0.17, 0.135], [0.08, 0.165], [0.0001, 0.17]], 28), felt, { m: hat });
    put('head', new THREE.CylinderGeometry(0.214, 0.219, 0.048, 32, 1, true), '#4a3420', { m: hat, p: [0, 0.03, 0] });
  }

  // 안경
  if (style.glasses) {
    const frame = type === 'man' ? '#c9a65e' : '#26211f';
    const y = cy - (type === 'child' ? 0.026 : 0.016);
    const z = 0.184;
    const rimX = type === 'child' ? 0.081 : 0.077;
    const rimR = type === 'man' ? 0.058 : 0.056;
    for (const s of [-1, 1]) {
      const rim = matrixOf({ p: [s * rimX, y, z], r: [0, s * 0.38, 0] });
      put('head', new THREE.TorusGeometry(rimR, type === 'woman' ? 0.0034 : 0.0042, 8, 28), frame, { m: rim });
      if (type === 'woman') put('head', new THREE.TorusGeometry(rimR, 0.0098, 8, 18, Math.PI * 0.82), frame, { m: rim, r: [0, 0, Math.PI * 0.09] });
      put('head', new THREE.CylinderGeometry(0.0035, 0.0035, 0.17, 5), frame, { p: [s * 0.15, y + 0.006, 0.075], r: [Math.PI / 2, 0, -s * 0.28] });
    }
    put('head', new THREE.TorusGeometry(0.022, 0.0042, 6, 12, Math.PI), frame, { p: [0, y + 0.002, 0.2] });
  }

  // 아이의 체크 가방
  if (type === 'child') {
    const plaid = once('bag', () => textured(plaidMap('#b81f2a', '#2c2c33', '#f2d76a', [1.6, 1.2])));
    put('torso', new THREE.TorusGeometry(0.235, 0.014, 6, 44), '#7a4b28', { p: [0, 0.2, 0], s: [1, 1, 0.8], r: [0, 0, -0.78] });
    const bag = matrixOf({ p: [0.17, 0.035, 0.11], r: [0, 0.55, 0] });
    putTex('torso', new RoundedBoxGeometry(0.255, 0.19, 0.078, 3, 0.03), plaid, { m: bag });
    putTex('torso', new RoundedBoxGeometry(0.262, 0.1, 0.09, 3, 0.03), plaid, { m: bag, p: [0, 0.058, 0.004] });
    for (const s of [-1, 1]) put('torso', new RoundedBoxGeometry(0.026, 0.09, 0.008, 2, 0.004), '#7a4b28', { m: bag, p: [s * 0.07, 0.03, 0.052] });
  }

  const brow = browColor(style.hair, type);
  return finish(
    once(`on|${type}|${brow}`, () => textured(faceMap(type, false, brow), { roughness: 0.62 })),
    once(`off|${type}|${brow}`, () => textured(faceMap(type, true, brow), { roughness: 0.62 })),
  );
}

const partsByKey = {};
const styleKey = (type, style) => `${type}|${style.hair}|${style.glasses ? 1 : 0}`;
const getParts = (type, style) => (partsByKey[styleKey(type, style)] ||= buildParts(type, style));

let shared = null;
function getShared() {
  if (shared) return shared;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.font = '700 54px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Z', 32, 34);
  const zTex = new THREE.CanvasTexture(c);
  zTex.colorSpace = THREE.SRGBColorSpace;
  shared = {
    zMat: new THREE.SpriteMaterial({ map: zTex, transparent: true, depthWrite: false, color: '#dbe8ff' }),
    phone: new THREE.BoxGeometry(0.13, 0.22, 0.015),
    phoneMat: new THREE.MeshStandardMaterial({ color: '#17181c', roughness: 0.25 }),
    screen: new THREE.PlaneGeometry(0.11, 0.195),
    screenMat: new THREE.MeshStandardMaterial({ color: '#bfe2ff', emissive: '#a8d8ff', emissiveIntensity: 1.3 }),
    handBook: new THREE.BoxGeometry(0.34, 0.24, 0.035),
    handBookMat: new THREE.MeshStandardMaterial({ color: '#0055bf', roughness: 0.4 }),
    blob: new THREE.CircleGeometry(0.34, 20),
    blobMat: new THREE.MeshBasicMaterial({ color: '#1a0d04', transparent: true, opacity: 0.22, depthWrite: false }),
  };
  return shared;
}

const POSES = {
  stand: { torso: 0, head: 0, aL: [0.03, 0.13], aR: [0.03, -0.13] },
  sitIdle: { torso: 0, head: 0, aL: [-0.5, 0.05], aR: [-0.5, -0.05] },
  study: { torso: 0.2, head: 0.28, aL: [-1.1, -0.3], aR: [-1.14, 0.32] },
  rest: { torso: -0.12, head: -0.1, aL: [-0.32, 0.06], aR: [-0.32, -0.06] },
  phone: { torso: 0.1, head: 0.3, aL: [-1.28, -0.34], aR: [-1.28, 0.34] },
  sleep: { torso: 0.95, head: 0.12, aL: [-1.45, -0.4], aR: [-1.45, 0.4] },
  beanStudy: { torso: -0.3, head: 0.22, aL: [-1.25, -0.28], aR: [-1.25, 0.28] },
  beanRest: { torso: -0.46, head: -0.05, aL: [-0.2, 0.2], aR: [-0.2, -0.2] },
  beanPhone: { torso: -0.3, head: 0.24, aL: [-1.25, -0.34], aR: [-1.25, 0.34] },
  beanSleep: { torso: -0.5, head: -0.22, aL: [-0.15, 0.15], aR: [-0.15, -0.15] },
};

export class Character {
  constructor(scene, findPath, type = 'man', style) {
    this.findPath = findPath;
    this.phase = Math.random() * 40;
    this.root = new THREE.Group();
    this.path = [];
    this.seat = null;
    this.mode = 'stand';
    this.state = 'stand'; // stand | walk | sitting | seated | rising
    this.walkAmount = 0;
    this.transition = 0;
    this.rotY = 0;
    this.pendingSeat = null;
    this.build(type, styleOf(type, style));
    scene.add(this.root);
  }

  build(type, style) {
    const s = getShared();
    const parts = getParts(type, style);
    const look = LOOK[type];
    this.type = type;
    this.key = styleKey(type, style);
    this.scale = look.scale;
    this.tagY = look.tagY;
    this.root.clear();
    this.root.scale.setScalar(look.scale);

    const group = (parent, x = 0, y = 0, z = 0) => {
      const g = new THREE.Group();
      g.position.set(x, y, z);
      parent.add(g);
      return g;
    };
    this.hips = group(this.root, 0, 0.4, 0);
    this.legL = group(this.hips, 0.104, -0.015, 0);
    this.legR = group(this.hips, -0.104, -0.015, 0);
    this.skirt = group(this.hips);
    this.tail = group(this.hips);
    this.torso = group(this.hips, 0, 0.03, 0);
    const shoulder = type === 'dog' ? 0.2 : 0.178;
    this.armL = group(this.torso, shoulder, 0.325, 0);
    this.armR = group(this.torso, -shoulder, 0.325, 0);
    this.head = group(this.torso, 0, look.headY ?? 0.45, 0);
    this.head.scale.setScalar(look.headScale);
    const bones = { hips: this.hips, legL: this.legL, legR: this.legR, skirt: this.skirt, tail: this.tail, torso: this.torso, armL: this.armL, armR: this.armR, head: this.head };
    parts.merged.forEach(({ bone, material, geometry }) => bones[bone].add(new THREE.Mesh(geometry, material)));
    this.hasSkirt = type === 'woman' || type === 'cat';

    this.faceOn = parts.faceOn;
    this.faceOff = parts.faceOff;
    this.face = new THREE.Mesh(parts.faceGeo, parts.faceOn);
    this.face.position.y = parts.faceY;
    this.head.add(this.face);

    this.phone = group(this.torso, 0, 0.23, 0.33);
    this.phone.rotation.x = -0.42;
    this.phone.add(new THREE.Mesh(s.phone, s.phoneMat));
    const scr = new THREE.Mesh(s.screen, s.screenMat);
    scr.position.z = -0.009;
    scr.rotation.y = Math.PI;
    this.phone.add(scr);
    this.heldBook = new THREE.Mesh(s.handBook, s.handBookMat);
    this.heldBook.position.set(0, 0.24, 0.33);
    this.heldBook.rotation.x = -0.35;
    this.torso.add(this.heldBook);

    this.blob = new THREE.Mesh(s.blob, s.blobMat);
    this.blob.rotation.x = -Math.PI / 2;
    this.blob.position.y = 0.012;
    this.root.add(this.blob);

    this.zs = [0, 1, 2].map(() => {
      const z = new THREE.Sprite(s.zMat);
      z.visible = false;
      this.root.add(z);
      return z;
    });
    this.applyProps();
  }

  setType(type, style) {
    if (!LOOK[type]) return;
    const next = styleOf(type, style);
    if (styleKey(type, next) === this.key) return;
    this.build(type, next);
    if (this.state === 'seated') this.root.position.y = this.seat.y - 0.3 * this.scale;
  }

  get x() { return this.root.position.x; }
  get z() { return this.root.position.z; }

  place(x, z, rot = 0) {
    this.root.position.set(x, 0, z);
    this.rotY = rot;
    this.root.rotation.y = rot;
    this.path = [];
    this.seat = null;
    this.mode = 'stand';
    this.state = 'stand';
    this.applyProps();
  }

  placeSeated(seat, mode) {
    this.seat = seat;
    this.pendingSeat = null;
    this.path = [];
    this.root.position.set(seat.x, seat.y - 0.3 * this.scale, seat.z);
    this.rotY = seat.rot;
    this.root.rotation.y = seat.rot;
    this.state = 'seated';
    this.mode = mode;
    this.applyProps();
  }

  walkTo(x, z) {
    this.pendingSeat = null;
    if (this.state === 'seated' || this.state === 'sitting') {
      this.standUp(() => this.startPath({ x, z }));
      return;
    }
    this.startPath({ x, z });
  }

  goSit(seat, mode, onSeated) {
    if (this.state === 'seated' || this.state === 'sitting') {
      if (this.seat === seat) return;
      this.standUp(() => this.goSit(seat, mode, onSeated));
      return;
    }
    this.pendingSeat = { seat, mode, onSeated };
    this.startPath(seat.approach);
  }

  standUp(after) {
    const seat = this.seat;
    if (!seat) {
      after?.();
      return;
    }
    this.seat = null;
    this.mode = 'stand';
    this.state = 'rising';
    this.transition = 0;
    this.from = { x: this.x, y: this.root.position.y, z: this.z };
    this.to = seat.approach;
    this.afterRise = after;
    this.applyProps();
  }

  startPath(target) {
    this.path = this.findPath({ x: this.x, z: this.z }, target);
    this.state = 'walk';
  }

  setMode(mode) {
    this.mode = mode;
    this.applyProps();
  }

  // 학습을 마치면 크게 기지개를 켠다.
  stretch(seconds = 3) {
    this.stretchLeft = seconds;
  }

  applyProps() {
    const seated = this.state === 'seated' || this.state === 'sitting';
    const bean = this.seat?.type === 'bean';
    this.phone.visible = seated && this.mode === 'phone';
    this.heldBook.visible = seated && bean && this.mode === 'study';
    this.face.material = seated && this.mode === 'sleep' ? this.faceOff : this.faceOn;
    this.blob.visible = !seated && this.state !== 'rising';
    this.zs.forEach((z) => { z.visible = seated && this.mode === 'sleep'; });
    if (this.hasSkirt) {
      // 앉으면 치마가 다리를 따라 앞으로 눕는다.
      this.skirt.rotation.x = seated ? -1.38 : 0;
      this.skirt.scale.set(seated ? 0.86 : 1, seated ? 0.9 : 1, seated ? 0.8 : 1);
      this.skirt.position.set(0, seated ? 0.05 : 0, seated ? 0.03 : 0);
    }
    // 등받이가 있는 의자와 빈백에서는 꼬리가 가구를 뚫으므로 감추고, 스툴에서는 뒤로 내린다.
    this.tail.visible = !seated || this.seat?.type === 'stool';
    this.tail.rotation.x = seated && this.type === 'dog' ? -1.35 : 0;
  }

  dispose(scene) {
    scene.remove(this.root);
  }

  update(dt, time) {
    const t = time + this.phase;
    const root = this.root;
    let moving = false;

    if (this.state === 'walk') {
      const next = this.path[0];
      if (!next) {
        const pending = this.pendingSeat;
        if (pending) {
          this.pendingSeat = null;
          this.seat = pending.seat;
          this.mode = pending.mode;
          this.state = 'sitting';
          this.transition = 0;
          this.from = { x: this.x, y: 0, z: this.z };
          this.onSeated = pending.onSeated;
          this.applyProps();
        } else {
          this.state = 'stand';
          root.position.y = 0;
        }
      } else {
        const dx = next.x - this.x;
        const dz = next.z - this.z;
        const dist = Math.hypot(dx, dz);
        const step = 2.3 * dt;
        if (dist <= step) {
          root.position.x = next.x;
          root.position.z = next.z;
          this.path.shift();
        } else {
          root.position.x += (dx / dist) * step;
          root.position.z += (dz / dist) * step;
          this.turnTo(Math.atan2(dx, dz), dt, 10);
          moving = true;
        }
      }
    } else if (this.state === 'sitting') {
      this.transition = Math.min(1, this.transition + dt / 0.5);
      const s = this.seat;
      const e = this.transition * this.transition * (3 - 2 * this.transition);
      root.position.x = this.from.x + (s.x - this.from.x) * e;
      root.position.z = this.from.z + (s.z - this.from.z) * e;
      root.position.y = (s.y - 0.3 * this.scale) * e + Math.sin(e * Math.PI) * 0.1;
      this.turnTo(s.rot, dt, 12);
      if (this.transition >= 1) {
        this.state = 'seated';
        this.rotY = s.rot;
        root.rotation.y = s.rot;
        this.applyProps();
        const cb = this.onSeated;
        this.onSeated = null;
        cb?.();
      }
    } else if (this.state === 'rising') {
      this.transition = Math.min(1, this.transition + dt / 0.4);
      const e = this.transition;
      root.position.x = this.from.x + (this.to.x - this.from.x) * e;
      root.position.z = this.from.z + (this.to.z - this.from.z) * e;
      root.position.y = this.from.y * (1 - e) + Math.sin(e * Math.PI) * 0.08;
      if (this.transition >= 1) {
        root.position.y = 0;
        this.state = 'stand';
        this.applyProps();
        const after = this.afterRise;
        this.afterRise = null;
        after?.();
      }
    }

    this.walkAmount = damp(this.walkAmount, moving ? 1 : 0, 12, dt);
    const seated = this.state === 'seated' || this.state === 'sitting';
    const bean = this.seat?.type === 'bean';

    let poseName = 'stand';
    if (seated) {
      if (bean) poseName = { study: 'beanStudy', rest: 'beanRest', phone: 'beanPhone', sleep: 'beanSleep' }[this.mode] || 'beanRest';
      else poseName = POSES[this.mode] ? this.mode : 'sitIdle';
    }
    const pose = POSES[poseName];
    const k = 7;
    let headY = 0;
    let headX = pose.head;
    let torsoX = pose.torso;
    let aLx = pose.aL[0];
    const aLz = pose.aL[1];
    let aRx = pose.aR[0];
    let aRz = pose.aR[1];

    if (seated) {
      if (this.mode === 'study') {
        aRx += Math.sin(t * 8.5) * 0.025;
        aRz += Math.sin(t * 5.1) * 0.06;
        headX += Math.sin(t * 0.8) * 0.035;
        headY = Math.sin(t * 0.33) * 0.07;
      } else if (this.mode === 'rest') {
        headY = Math.sin(t * 0.4) * 0.42;
        headX += Math.sin(t * 0.27) * 0.06;
        // 가끔 크게 기지개를 켠다.
        if ((t % 26 < 2.4 || this.stretchLeft > 0) && !bean) {
          aLx = -2.85;
          aRx = -2.85;
          torsoX = -0.2;
        }
        if (this.stretchLeft > 0) this.stretchLeft -= dt;
      } else if (this.mode === 'phone') {
        aRx += Math.sin(t * 7) * 0.02;
        headY = Math.sin(t * 0.3) * 0.04;
      } else if (this.mode === 'sleep') {
        torsoX += Math.sin(t * 1.25) * 0.018;
        headX += Math.sin(t * 1.25) * 0.018;
      }
    } else {
      torsoX += Math.sin(t * 1.3) * 0.006;
    }

    const swing = Math.sin(t * 11) * this.walkAmount;
    aLx += swing * 0.62;
    aRx -= swing * 0.62;
    this.armL.rotation.x = damp(this.armL.rotation.x, aLx, moving ? 30 : k, dt);
    this.armL.rotation.z = damp(this.armL.rotation.z, aLz, k, dt);
    this.armR.rotation.x = damp(this.armR.rotation.x, aRx, moving ? 30 : k, dt);
    this.armR.rotation.z = damp(this.armR.rotation.z, aRz, k, dt);
    this.torso.rotation.x = damp(this.torso.rotation.x, torsoX, k, dt);
    this.head.rotation.x = damp(this.head.rotation.x, headX, k, dt);
    this.head.rotation.y = damp(this.head.rotation.y, headY, k, dt);

    const legBase = seated ? (bean ? -1.18 : -1.52) : 0;
    const dangle = seated && !bean ? Math.sin(t * 0.9) * 0.03 : 0;
    this.legL.rotation.x = damp(this.legL.rotation.x, legBase + swing * 0.7 + dangle, moving ? 30 : 9, dt);
    this.legR.rotation.x = damp(this.legR.rotation.x, legBase - swing * 0.7 - dangle, moving ? 30 : 9, dt);
    if (this.state === 'walk') root.position.y = Math.abs(swing) * 0.025;

    if (this.zs[0].visible) {
      this.zs.forEach((z, i) => {
        const cycle = (t * 0.28 + i / 3) % 1;
        const baseY = bean ? 1.2 : 1.1;
        const baseZ = bean ? -0.12 : 0.42;
        z.position.set(0.12 + cycle * 0.24, baseY + cycle * 0.5, baseZ);
        z.scale.setScalar((0.07 + cycle * 0.1) * Math.sin(cycle * Math.PI) * 1.6 + 0.001);
      });
    }
  }

  turnTo(target, dt, k) {
    let diff = target - this.rotY;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.rotY += diff * (1 - Math.exp(-k * dt));
    this.root.rotation.y = this.rotY;
  }
}

// 입장 화면의 캐릭터 고르기 그림. 입장하면 closeThumbnails로 치운다.
let stage = null;
function getStage() {
  if (stage) return stage;
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(220, 260, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#fff6e8', '#9c7b58', 2.2));
  const sun = new THREE.DirectionalLight('#ffe7c4', 2.4);
  sun.position.set(-2, 4, 5);
  scene.add(sun);
  const camera = new THREE.PerspectiveCamera(24, 220 / 260, 0.1, 30);
  camera.position.set(0, 0.92, 3.6);
  camera.lookAt(0, 0.68, 0);
  stage = { renderer, scene, camera };
  return stage;
}

export function renderThumbnail(type, style) {
  const { renderer, scene, camera } = getStage();
  const fig = new Character(scene, () => [], type, style);
  fig.place(0, 0, 0.22);
  fig.blob.visible = false;
  fig.update(1, 0);
  renderer.render(scene, camera);
  fig.dispose(scene);
  return renderer.domElement.toDataURL('image/png');
}

export function closeThumbnails() {
  if (!stage) return;
  stage.renderer.dispose();
  stage.renderer.forceContextLoss();
  stage = null;
}

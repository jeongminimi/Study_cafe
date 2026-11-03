import * as THREE from 'three';
import { furOf } from './config.js';
import { jacketMap, blouseDressMap, dressSkirtMap, tweedMap } from './character-art.js';

const OLIVE = '#4f5b36';
const CORD = '#6f4a2c';
const COLLAR = '#6b4a2b';
const PEACH = '#f0c8ae';
const FRILL = '#f4d0b8';
const INK = '#20150f';

// 끝으로 갈수록 가늘어지는 풍성한 꼬리. 굵기만 바꿔 매끄럽게 잇는다.
function fluffyTail(points, wide) {
  const path = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const rows = 32;
  const sides = 12;
  const geo = new THREE.TubeGeometry(path, rows, 1, sides);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i <= rows; i++) {
    const center = path.getPointAt(i / rows);
    const radius = 0.028 + wide * Math.pow(Math.sin(Math.PI * Math.min(1, i / rows + 0.05)), 0.75);
    for (let j = 0; j <= sides; j++) {
      const k = i * (sides + 1) + j;
      v.fromBufferAttribute(pos, k).sub(center).multiplyScalar(radius).add(center);
      pos.setXYZ(k, v.x, v.y, v.z);
    }
  }
  geo.computeVertexNormals();
  return geo;
}

// 강아지와 고양이. 사람과 같은 관절을 쓰므로 자세를 그대로 함께 쓴다.
export function addPetParts(type, style, { put, putTex, textured, once, lathe, matrixOf }) {
  const isDog = type === 'dog';
  const { fur, light, dark } = furOf(style.hair, type);
  const ball = new THREE.SphereGeometry(1, 22, 16);
  const small = new THREE.SphereGeometry(1, 12, 9);
  const cy = 0.2;
  const R = 0.2;

  // 다리와 신발
  for (const [bone, x] of [['legL', 0.104], ['legR', -0.104]]) {
    if (isDog) {
      put(bone, new THREE.CapsuleGeometry(0.094, 0.14, 6, 14), CORD, { p: [0, -0.1, 0] });
      put(bone, new THREE.CylinderGeometry(0.104, 0.104, 0.04, 16), '#a07a4c', { p: [0, -0.205, 0] });
      put(bone, new THREE.CylinderGeometry(0.092, 0.086, 0.12, 16), '#3f5236', { p: [0, -0.27, 0] });
      put(bone, ball, '#3f5236', { p: [0, -0.345, 0.04], s: [0.098, 0.062, 0.145] });
      put(bone, ball, '#23291c', { p: [0, -0.388, 0.04], s: [0.098, 0.018, 0.145] });
    } else {
      put(bone, new THREE.CapsuleGeometry(0.066, 0.25, 6, 12), '#55636f', { p: [0, -0.17, 0] });
      put(bone, ball, '#5a161d', { p: [0, -0.345, 0.04], s: [0.09, 0.056, 0.14] });
      put(bone, new THREE.TorusGeometry(0.07, 0.009, 6, 18, Math.PI), '#5a161d', { p: [0, -0.325, 0.03], s: [1, 0.8, 1], r: [0, Math.PI / 2, 0] });
      put(bone, small, '#d9b777', { p: [x > 0 ? 0.07 : -0.07, -0.325, 0.03], s: [0.012, 0.012, 0.012] });
    }
  }

  // 허리 아래
  if (isDog) {
    put('hips', lathe([[0.16, 0.05], [0.178, -0.03], [0.188, -0.1], [0.186, -0.15]], 28), CORD, { s: [1, 1, 0.78] });
    put('hips', new THREE.CircleGeometry(0.18, 20), CORD, { p: [0, -0.145, 0], s: [1, 0.78, 1], r: [Math.PI / 2, 0, 0] });
  } else {
    const geo = lathe([[0.17, 0.04], [0.2, -0.02], [0.25, -0.12], [0.295, -0.24]], 54);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const a = Math.atan2(pos.getX(i), pos.getZ(i));
      const k = 1 + Math.sin(a * 9) * 0.02 * Math.min(1, Math.max(0, (0.02 - pos.getY(i)) / 0.2));
      pos.setX(i, pos.getX(i) * k);
      pos.setZ(i, pos.getZ(i) * k * 0.86);
    }
    geo.computeVertexNormals();
    putTex('skirt', geo, once('skirt|cat', () => textured(dressSkirtMap(), { side: THREE.DoubleSide, roughness: 0.85 })));
  }

  // 몸통과 목
  const top = isDog
    ? once('top|dog', () => textured(jacketMap(), { roughness: 0.8 }))
    : once('top|cat', () => textured(blouseDressMap(), { roughness: 0.8 }));
  const bodyPts = isDog
    ? [[0.2, -0.05], [0.22, 0.03], [0.232, 0.16], [0.215, 0.28], [0.155, 0.37], [0.08, 0.425]]
    : [[0.17, -0.03], [0.2, 0.03], [0.21, 0.16], [0.2, 0.28], [0.15, 0.37], [0.075, 0.425]];
  putTex('torso', lathe(bodyPts, 36), top, { s: [1, 1, 0.78] });
  if (isDog) {
    put('torso', new THREE.CylinderGeometry(0.07, 0.082, 0.06, 14), fur, { p: [0, 0.44, 0] });
    put('torso', new THREE.TorusGeometry(0.1, 0.03, 10, 28), COLLAR, { p: [0, 0.405, 0], s: [1, 1, 0.84], r: [Math.PI / 2, 0, 0] });
    put('torso', ball, light, { p: [0, 0.425, 0.05], s: [0.105, 0.052, 0.07] });
  } else {
    const neck = new THREE.Color(fur).multiplyScalar(0.95).getStyle();
    put('torso', new THREE.CylinderGeometry(0.068, 0.078, 0.07, 16), neck, { p: [0, 0.44, 0] });
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      put('torso', small, FRILL, { p: [Math.sin(a) * 0.1, 0.403 + (i % 2) * 0.008, Math.cos(a) * 0.082], s: [0.031, 0.021, 0.031] });
    }
  }

  // 팔
  for (const [bone, side] of [['armL', 1], ['armR', -1]]) {
    const sleeve = isDog ? OLIVE : PEACH;
    put(bone, ball, sleeve, { s: isDog ? [0.076, 0.076, 0.076] : [0.088, 0.085, 0.085] });
    put(bone, new THREE.CapsuleGeometry(isDog ? 0.07 : 0.072, 0.16, 6, 12), sleeve, { p: [side * 0.004, -0.105, 0] });
    if (isDog) {
      put(bone, new THREE.CylinderGeometry(0.076, 0.076, 0.035, 14), COLLAR, { p: [side * 0.004, -0.21, 0] });
    } else {
      put(bone, new THREE.TorusGeometry(0.066, 0.02, 8, 18), FRILL, { p: [side * 0.004, -0.21, 0], r: [Math.PI / 2, 0, 0] });
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        put(bone, small, FRILL, { p: [side * 0.004 + Math.sin(a) * 0.07, -0.222, Math.cos(a) * 0.07], s: [0.018, 0.016, 0.018] });
      }
    }
    put(bone, ball, light, { p: [side * 0.004, -0.275, 0.004], s: [0.074, 0.078, 0.07] });
  }

  // 머리
  if (isDog) {
    put('head', ball, '#3a1c1a', { p: [0, cy - 0.095, R - 0.008], s: [0.062, 0.042, 0.03] });
    put('head', ball, light, { p: [0, cy - 0.05, R - 0.028], s: [0.105, 0.072, 0.082] });
    put('head', ball, '#e8818c', { p: [0, cy - 0.118, R + 0.024], s: [0.038, 0.046, 0.014] });
    put('head', ball, INK, { p: [0, cy - 0.016, R + 0.048], s: [0.04, 0.03, 0.024] });
    put('head', new THREE.CapsuleGeometry(0.0035, 0.038, 4, 6), INK, { p: [0, cy - 0.052, R + 0.052] });
    for (const s of [-1, 1]) {
      put('head', new THREE.TorusGeometry(0.03, 0.0048, 6, 14, Math.PI), INK, { p: [s * 0.03, cy - 0.07, R + 0.042], r: [0, 0, Math.PI] });
      put('head', ball, dark, { p: [s * 0.192, cy - 0.012, 0.032], s: [0.09, 0.135, 0.05], r: [0.08, s * -0.3, s * 0.2] });
    }
    // 트위드 모자
    const hat = matrixOf({ p: [0, cy + 0.145, -0.008], r: [-0.1, 0, 0] });
    const tweed = once('tweed', () => textured(tweedMap(), { roughness: 0.92 }));
    putTex('head', ball, tweed, { m: hat, p: [0, 0.02, -0.012], s: [0.212, 0.088, 0.215] });
    putTex('head', ball, tweed, { m: hat, p: [0, -0.02, 0.17], s: [0.135, 0.016, 0.085], r: [0.1, 0, 0] });
    putTex('head', small, tweed, { m: hat, p: [0, 0.098, -0.012], s: [0.022, 0.012, 0.022] });
    put('tail', fluffyTail([[0, 0, -0.16], [0, 0.03, -0.28], [0.02, 0.1, -0.37], [0.05, 0.2, -0.42], [0.08, 0.31, -0.44]], 0.05), fur);
    put('tail', small, fur, { p: [0.08, 0.31, -0.44], s: [0.026, 0.026, 0.026] });
  } else {
    put('head', ball, light, { p: [0, cy - 0.062, R - 0.022], s: [0.08, 0.052, 0.054] });
    put('head', new THREE.ConeGeometry(0.02, 0.023, 3), '#e29a9c', { p: [0, cy - 0.03, R + 0.032], s: [1.25, 1, 0.5], r: [Math.PI, 0, 0] });
    for (const s of [-1, 1]) {
      put('head', new THREE.TorusGeometry(0.018, 0.0034, 6, 14, Math.PI), '#8e6f6a', { p: [s * 0.018, cy - 0.054, R + 0.031], r: [0, 0, Math.PI] });
      const ear = matrixOf({ p: [s * 0.13, cy + 0.17, -0.008], r: [0, 0, -s * 0.22] });
      put('head', new THREE.ConeGeometry(0.086, 0.18, 18), fur, { m: ear, s: [1, 1, 0.5] });
      put('head', new THREE.ConeGeometry(0.056, 0.13, 14), '#f2b9bb', { m: ear, p: [0, -0.016, 0.018], s: [1, 1, 0.38] });
      for (const [dy, tilt] of [[-0.052, 0.16], [-0.068, 0], [-0.084, -0.16]]) {
        put('head', new THREE.CylinderGeometry(0.0022, 0.0022, 0.12, 4), '#c9c2b6', { p: [s * 0.128, cy + dy, R - 0.012], r: [0, 0, s * (Math.PI / 2 + tilt)] });
      }
    }
    put('head', ball, fur, { p: [0, cy + 0.17, 0.02], s: [0.08, 0.05, 0.075] });
    put('tail', fluffyTail([[0.02, -0.08, -0.17], [0.07, -0.19, -0.27], [0.15, -0.27, -0.36], [0.27, -0.31, -0.4], [0.38, -0.3, -0.38]], 0.058), fur);
    put('tail', small, fur, { p: [0.38, -0.3, -0.38], s: [0.03, 0.03, 0.03] });
  }

  // 안경
  if (style.glasses) {
    const frame = '#26211f';
    const y = cy - 0.016;
    for (const s of [-1, 1]) {
      put('head', new THREE.TorusGeometry(0.066, 0.0052, 8, 28), frame, { p: [s * 0.084, y, 0.186], r: [0, s * 0.38, 0] });
      put('head', new THREE.CylinderGeometry(0.0035, 0.0035, 0.17, 5), frame, { p: [s * 0.157, y + 0.006, 0.075], r: [Math.PI / 2, 0, -s * 0.28] });
    }
    put('head', new THREE.TorusGeometry(0.018, 0.0045, 6, 12, Math.PI), frame, { p: [0, y + 0.002, 0.205] });
  }
}

import * as THREE from 'three';

function tex(w, h, draw, repeat) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

export const SKIN = { man: '#f3c7a4', woman: '#f6cfb2', child: '#f8d2b6' };

export function faceMap(type, asleep, brow) {
  return tex(1024, 512, (ctx, w, h) => {
    ctx.fillStyle = SKIN[type];
    ctx.fillRect(0, 0, w, h);
    const cx = w / 2;
    const ey = type === 'child' ? 276 : 268;
    const dx = type === 'child' ? 66 : 62;
    ctx.fillStyle = 'rgba(235,120,105,.3)';
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(cx + s * (dx + 32), ey + 42, 34, 21, 0, 0, 7);
      ctx.fill();
    }
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#2a1a12';
    ctx.fillStyle = '#2a1a12';
    for (const s of [-1, 1]) {
      if (asleep) {
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(cx + s * dx, ey - 4, 15, 0.25, Math.PI - 0.25);
        ctx.stroke();
      } else {
        ctx.fillStyle = '#2a1a12';
        ctx.beginPath();
        ctx.ellipse(cx + s * dx, ey, 14, 18, 0, 0, 7);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(cx + s * dx + 4, ey - 7, 5, 0, 7);
        ctx.fill();
      }
      ctx.strokeStyle = brow;
      ctx.lineWidth = type === 'man' ? 8 : 6;
      ctx.beginPath();
      ctx.moveTo(cx + s * (dx - 22), ey - 44);
      ctx.quadraticCurveTo(cx + s * dx, ey - 54, cx + s * (dx + 24), ey - 44);
      ctx.stroke();
      ctx.strokeStyle = '#2a1a12';
    }
    if (type === 'child') {
      ctx.fillStyle = 'rgba(170,90,50,.6)';
      for (const [x, y] of [[-96, 28], [-78, 40], [-110, 44], [-64, 28], [96, 28], [78, 40], [110, 44], [64, 28]]) {
        ctx.beginPath();
        ctx.arc(cx + x, ey + y, 3.4, 0, 7);
        ctx.fill();
      }
    }
    const my = ey + 66;
    if (asleep) {
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.ellipse(cx, my, 9, 6, 0, 0, 7);
      ctx.stroke();
    } else if (type === 'child') {
      ctx.fillStyle = '#8e2a26';
      ctx.beginPath();
      ctx.moveTo(cx - 44, my - 12);
      ctx.quadraticCurveTo(cx, my - 4, cx + 44, my - 12);
      ctx.quadraticCurveTo(cx + 34, my + 34, cx, my + 36);
      ctx.quadraticCurveTo(cx - 34, my + 34, cx - 44, my - 12);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.moveTo(cx - 36, my - 10);
      ctx.quadraticCurveTo(cx, my - 3, cx + 36, my - 10);
      ctx.quadraticCurveTo(cx, my + 8, cx - 36, my - 10);
      ctx.fill();
    } else {
      ctx.strokeStyle = type === 'woman' ? '#b64f4a' : '#8c4a3a';
      ctx.lineWidth = 6.5;
      ctx.beginPath();
      ctx.moveTo(cx - 28, my - 3);
      ctx.quadraticCurveTo(cx, my + (type === 'woman' ? 10 : 15), cx + 28, my - 3);
      ctx.stroke();
    }
  });
}

function noise(ctx, w, h, count, colors, alpha) {
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[i % colors.length];
    ctx.globalAlpha = Math.random() * alpha;
    ctx.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 4, 1 + Math.random() * 2);
  }
  ctx.globalAlpha = 1;
}

// 앞면은 u=0.5(가로 가운데)에 그린다.
export function topMap(type) {
  return tex(1024, 512, (ctx, w, h) => {
    const cx = w / 2;
    if (type === 'man') {
      ctx.fillStyle = '#4c5145';
      ctx.fillRect(0, 0, w, h);
      noise(ctx, w, h, 9000, ['#3b3f36', '#6a6e5f', '#2f332c'], 0.6);
      ctx.strokeStyle = 'rgba(190,190,165,.2)';
      ctx.lineWidth = 2;
      for (let x = 0; x < w; x += 26) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      ctx.fillStyle = '#f7f4ec';
      ctx.beginPath();
      ctx.moveTo(cx - 58, 0);
      ctx.lineTo(cx + 58, 0);
      ctx.lineTo(cx + 8, 330);
      ctx.lineTo(cx - 8, 330);
      ctx.fill();
      // 넥타이
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(cx - 13, 40);
      ctx.lineTo(cx + 13, 40);
      ctx.lineTo(cx + 22, 66);
      ctx.lineTo(cx + 24, 262);
      ctx.lineTo(cx, 296);
      ctx.lineTo(cx - 24, 262);
      ctx.lineTo(cx - 22, 66);
      ctx.closePath();
      ctx.clip();
      ctx.fillStyle = '#7a3a22';
      ctx.fillRect(cx - 40, 0, 80, 330);
      for (let y = -20; y < 340; y += 30) {
        ctx.strokeStyle = '#d9a06b';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(cx - 40, y + 30);
        ctx.lineTo(cx + 40, y - 20);
        ctx.stroke();
        ctx.strokeStyle = '#4e2212';
        ctx.lineWidth = 9;
        ctx.beginPath();
        ctx.moveTo(cx - 40, y + 44);
        ctx.lineTo(cx + 40, y - 6);
        ctx.stroke();
      }
      ctx.restore();
      ctx.fillStyle = '#6a2f1a';
      ctx.beginPath();
      ctx.moveTo(cx - 16, 16);
      ctx.lineTo(cx + 16, 16);
      ctx.lineTo(cx + 12, 46);
      ctx.lineTo(cx - 12, 46);
      ctx.fill();
      // 옷깃
      ctx.fillStyle = '#fbf8f1';
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(cx + s * 8, 8);
        ctx.lineTo(cx + s * 62, 0);
        ctx.lineTo(cx + s * 40, 72);
        ctx.fill();
      }
      // 라펠
      ctx.fillStyle = '#42463c';
      ctx.strokeStyle = '#25271f';
      ctx.lineWidth = 4;
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(cx + s * 60, 0);
        ctx.lineTo(cx + s * 118, 96);
        ctx.lineTo(cx + s * 72, 124);
        ctx.lineTo(cx + s * 10, 332);
        ctx.lineTo(cx + s * 22, 200);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      ctx.fillStyle = '#25271f';
      ctx.fillRect(cx - 3, 330, 6, 182);
      for (const y of [352, 430]) {
        ctx.beginPath();
        ctx.arc(cx + 14, y, 10, 0, 7);
        ctx.fill();
      }
      // 주머니와 펜
      ctx.strokeStyle = '#25271f';
      ctx.lineWidth = 4;
      ctx.strokeRect(cx + 92, 384, 94, 40);
      ctx.strokeRect(cx - 186, 384, 94, 40);
      ctx.beginPath();
      ctx.moveTo(cx + 112, 196);
      ctx.lineTo(cx + 190, 188);
      ctx.stroke();
      ctx.fillStyle = '#e4cf9b';
      ctx.fillRect(cx + 150, 150, 7, 44);
      // 스터디카페 책 문양
      ctx.fillStyle = '#c9a15a';
      ctx.beginPath();
      ctx.moveTo(cx - 172, 200);
      ctx.quadraticCurveTo(cx - 150, 188, cx - 134, 204);
      ctx.quadraticCurveTo(cx - 118, 188, cx - 96, 200);
      ctx.lineTo(cx - 96, 240);
      ctx.quadraticCurveTo(cx - 118, 228, cx - 134, 244);
      ctx.quadraticCurveTo(cx - 150, 228, cx - 172, 240);
      ctx.fill();
    } else if (type === 'woman') {
      ctx.fillStyle = '#8f6242';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(70,40,22,.28)';
      ctx.lineWidth = 2;
      for (let x = 0; x < w; x += 7) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      ctx.fillStyle = '#f1e6d3';
      ctx.fillRect(cx - 42, 0, 84, h);
      ctx.fillStyle = '#e0d2b9';
      ctx.fillRect(cx - 5, 0, 10, h);
      ctx.fillStyle = '#fff';
      for (let y = 90; y < h; y += 72) {
        ctx.beginPath();
        ctx.arc(cx, y, 6, 0, 7);
        ctx.fill();
      }
      ctx.fillStyle = '#7a5236';
      for (const s of [-1, 1]) ctx.fillRect(cx + s * 42 + (s < 0 ? -22 : 0), 0, 22, h);
      ctx.fillStyle = '#f5ecd2';
      for (let y = 130; y < h; y += 88) {
        ctx.beginPath();
        ctx.arc(cx - 53, y, 10.5, 0, 7);
        ctx.fill();
        ctx.strokeStyle = '#c8b98f';
        ctx.stroke();
      }
      ctx.fillStyle = '#fff';
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(cx + s * 44, 30, 56, 42, s * 0.3, 0, 7);
        ctx.fill();
      }
      ctx.fillStyle = '#7a5236';
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(cx + s * 78, 0);
        ctx.lineTo(cx + s * 150, 0);
        ctx.lineTo(cx + s * 110, 96);
        ctx.lineTo(cx + s * 64, 60);
        ctx.fill();
      }
    } else {
      ctx.fillStyle = '#b6222c';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(120,10,20,.3)';
      ctx.lineWidth = 2;
      for (let x = 0; x < w; x += 8) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      ctx.fillStyle = '#8f1520';
      ctx.fillRect(0, h - 34, w, 34);
      ctx.fillStyle = '#fbf8f1';
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(cx, 0);
        ctx.lineTo(cx + s * 106, 0);
        ctx.quadraticCurveTo(cx + s * 110, 58, cx + s * 66, 96);
        ctx.quadraticCurveTo(cx + s * 22, 70, cx, 34);
        ctx.fill();
      }
      ctx.strokeStyle = '#8f1520';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(cx, 34);
      ctx.lineTo(cx, h - 34);
      ctx.stroke();
      ctx.fillStyle = '#fbf8f1';
      for (let y = 120; y < h - 40; y += 90) {
        ctx.beginPath();
        ctx.arc(cx + 15, y, 9, 0, 7);
        ctx.fill();
      }
    }
  });
}

export function plaidMap(a, b, line, repeat) {
  return tex(256, 256, (ctx, w, h) => {
    ctx.fillStyle = a;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = b;
    ctx.globalAlpha = 0.6;
    ctx.fillRect(0, 0, w / 2, h);
    ctx.fillRect(0, 0, w, h / 2);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = line;
    ctx.lineWidth = 5;
    for (const p of [64, 192]) {
      ctx.beginPath();
      ctx.moveTo(p, 0);
      ctx.lineTo(p, h);
      ctx.moveTo(0, p);
      ctx.lineTo(w, p);
      ctx.stroke();
    }
  }, repeat);
}

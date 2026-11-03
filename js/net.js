import { APP_ID, CHARACTERS, HAIR, NOTE_LIMIT, cleanName, cleanNote, MODES } from './config.js';

const TRYSTERO = 'https://cdn.jsdelivr.net/npm/trystero@0.26.0/+esm';

const num = (v, min, max, fallback = 0) => (Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : fallback);

// 다른 브라우저가 보낸 값은 믿지 않고 형식을 모두 다시 맞춘다.
function sanitize(d, seatCount) {
  if (!d || typeof d !== 'object') return null;
  const seat = Number.isInteger(d.s) && d.s >= 0 && d.s < seatCount ? d.s : -1;
  const char = Object.hasOwn(CHARACTERS, d.c) ? d.c : 'man';
  return {
    name: cleanName(d.n) || '이름 없는 작가',
    char,
    hair: Object.hasOwn(HAIR, d.h) ? d.h : 'base',
    glasses: typeof d.g === 'boolean' ? d.g : char !== 'child',
    notes: Math.floor(num(d.k, 0, NOTE_LIMIT)),
    noteOff: d.o === true,
    seat,
    mode: seat >= 0 && MODES[d.m] ? d.m : 'stand',
    x: num(d.x, -12.6, 12.6, 1),
    z: num(d.z, -8.6, 8.3, 6.5),
    sitAt: num(d.a, 0, 9e15),
    joinedAt: num(d.j, 0, 9e15),
    todayMin: Math.floor(num(d.t, 0, 1440)),
  };
}

export async function connectRoom({ room, seatCount, onState, onNote, onLeave, onJoin }) {
  if (!window.RTCPeerConnection) return { ok: false, send() {}, sendTo() {}, sendNote() {}, leave() {}, id: 'me' };
  try {
    const { joinRoom, selfId } = await import(TRYSTERO);
    const r = joinRoom({ appId: APP_ID }, `hall-${room}`);
    const state = r.makeAction('state');
    state.onMessage = (data, meta) => {
      const clean = sanitize(data, seatCount);
      if (clean) onState(meta.peerId, clean);
    };
    // 쪽지 내용은 받는 사람에게만 직접 보낸다.
    const note = r.makeAction('note');
    note.onMessage = (data, meta) => {
      const text = cleanNote(data?.x);
      if (text) onNote(meta.peerId, text);
    };
    r.onPeerJoin = (id) => onJoin(id);
    r.onPeerLeave = (id) => onLeave(id);
    return {
      ok: true,
      id: selfId,
      send: (d) => state.send(d),
      sendTo: (d, id) => state.send(d, { target: id }),
      sendNote: (text, id) => note.send({ x: text }, { target: id }),
      leave: () => r.leave(),
    };
  } catch (err) {
    console.warn('접속 라이브러리를 불러오지 못했습니다', err);
    return { ok: false, send() {}, sendTo() {}, sendNote() {}, leave() {}, id: 'me' };
  }
}

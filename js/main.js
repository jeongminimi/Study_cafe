import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createCafe } from './scene.js';
import { Character, closeThumbnails, defaultStyle, renderThumbnail } from './character.js';
import { Sound, BEDS } from './sound.js';
import { connectRoom } from './net.js';
import { CAPACITY, CHARACTERS, HAIR, MAX_ROOMS, MODES, NOTE_GAP_MS, NOTE_LIMIT, NOTE_MAX, cleanName, cleanNote, hairColor, randomAuthor, store } from './config.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const room = Math.max(1, Math.min(MAX_ROOMS, parseInt(params.get('room'), 10) || 1));
const NPC_SEATS = [1, 5, 9, 12, 15, 19];

const canvas = $('scene');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch {
  $('loading').hidden = true;
  $('nogl').hidden = false;
  throw new Error('WebGL을 사용할 수 없습니다');
}
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.shadowMap.autoUpdate = false;

const cafe = createCafe(renderer);
const { scene, seats } = cafe;
const camera = new THREE.PerspectiveCamera(46, innerWidth / innerHeight, 0.1, 200);
camera.position.set(10.5, 5.5, 7.6);
const controls = new OrbitControls(camera, canvas);
controls.target.set(-1.2, 1, -1);
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = 2.4;
controls.maxDistance = 15;
controls.minPolarAngle = 0.35;
controls.maxPolarAngle = 1.5;
controls.enabled = false;

const sound = new Sound(store.get('sound', null));
const prefs = {
  npc: store.get('npc', true),
  time: store.get('time', params.get('time') || 'auto'),
  plan: { study: 50, rest: 10, sets: 4, ...store.get('plan', null) },
  notify: store.get('notify', false),
  noteOff: store.get('noteOff', false),
};

function timeKey() {
  if (prefs.time !== 'auto') return prefs.time;
  const h = new Date().getHours();
  if (h >= 7 && h < 16) return 'day';
  if (h >= 16 && h < 19) return 'dusk';
  return 'night';
}
let currentTime = timeKey();
cafe.setTime(currentTime);

// ───── 사람들 ─────
const dateKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};
const firstName = store.get('name', null);
const CHAR_KEYS = Object.keys(CHARACTERS);
const randomChar = () => CHAR_KEYS[Math.floor(Math.random() * CHAR_KEYS.length)];
const savedChar = store.get('char', null);
// 캐릭터마다 머리 색과 안경을 따로 기억한다.
const savedLooks = store.get('looks', {});
const looks = Object.fromEntries(CHAR_KEYS.map((type) => {
  const saved = savedLooks[type] || {};
  return [type, {
    hair: Object.hasOwn(HAIR, saved.hair) ? saved.hair : 'base',
    glasses: typeof saved.glasses === 'boolean' ? saved.glasses : defaultStyle(type).glasses,
  }];
}));
const me = {
  id: 'me', isMe: true, name: firstName || randomAuthor(), char: CHARACTERS[savedChar] ? savedChar : randomChar(), seat: -1, mode: 'stand',
  sitAt: 0, joinedAt: 0, fig: null, tag: null, target: { ...cafe.spawn },
  studyMs: store.get('study', {})[dateKey()] || 0,
};
// 학습 흐름: idle → study → break → waiting(다음 세트 대기) → study … → idle
const session = { state: 'idle', plan: null, set: 1, remainMs: 0, totalMs: 0, elapsedMs: 0, studiedMs: 0 };
const others = new Map();
const npcs = [];
// 내 자리에 붙은 쪽지. 서버가 없으므로 이번 접속 동안 자리에 앉아 있을 때만 남는다.
const myNotes = [];
const blocked = new Set();
const lastNoteFrom = new Map();
const lastNoteTo = new Map();
let net = { ok: false, send() {}, sendTo() {}, sendNote() {}, leave() {}, id: 'me' };
let entered = false;

function makeTag(person, kind) {
  const el = document.createElement('div');
  el.className = `tag ${kind}`;
  const icon = document.createElement('span');
  icon.className = 'tag-icon';
  const name = document.createElement('span');
  name.className = 'tag-name';
  el.append(icon, name);
  $('tags').append(el);
  person.tag = el;
  renderTag(person);
}

function renderTag(p) {
  if (!p.tag) return;
  p.tag.children[0].textContent = MODES[p.mode]?.icon || '';
  p.tag.children[1].textContent = p.isNpc ? `단골 ${p.name}` : p.name;
}

function removePerson(p) {
  p.fig.dispose(scene);
  p.tag?.remove();
}

function seatOwner(i) {
  if (me.seat === i) return me;
  for (const p of others.values()) if (p.seat === i) return p;
  return npcs.find((n) => n.seat === i) || null;
}

function freeSeatIndexes() {
  return seats.filter((s) => !seatOwner(s.i)).map((s) => s.i);
}

// ───── 단골 손님 (빈 방을 채우는 자동 캐릭터, 내 화면에만 존재) ─────
function npcMode() {
  const r = Math.random();
  if (r < 0.66) return 'study';
  if (r < 0.8) return 'rest';
  if (r < 0.92) return 'phone';
  return 'sleep';
}

function addNpc(seatIndex) {
  const taken = [me.name, ...npcs.map((n) => n.name)];
  const hairKeys = Object.keys(HAIR);
  const style = { hair: hairKeys[Math.floor(Math.random() * hairKeys.length)], glasses: Math.random() < 0.4 };
  const npc = {
    isNpc: true, name: randomAuthor(taken), seat: seatIndex, mode: npcMode(),
    fig: new Character(scene, cafe.findPath, randomChar(), style), next: performance.now() + 30000 + Math.random() * 120000,
  };
  npc.fig.placeSeated(seats[seatIndex], npc.mode);
  makeTag(npc, 'npc');
  npcs.push(npc);
}

function syncNpcs() {
  if (!prefs.npc) {
    while (npcs.length) removePerson(npcs.pop());
    return;
  }
  if (npcs.length) return;
  NPC_SEATS.forEach((i) => {
    if (!seatOwner(i)) addNpc(i);
  });
}

function evictNpc(seatIndex) {
  const idx = npcs.findIndex((n) => n.seat === seatIndex);
  if (idx < 0) return;
  const npc = npcs[idx];
  const free = freeSeatIndexes().filter((i) => i !== seatIndex && i !== me.seat);
  if (!free.length) {
    removePerson(npc);
    npcs.splice(idx, 1);
    return;
  }
  npc.seat = free[Math.floor(Math.random() * free.length)];
  npc.fig.standUp(() => npc.fig.goSit(seats[npc.seat], npc.mode));
}

function tickNpcs(now) {
  for (const npc of npcs) {
    if (now > npc.next && npc.fig.state === 'seated') {
      npc.mode = npcMode();
      npc.fig.setMode(npc.mode);
      npc.next = now + 60000 + Math.random() * 180000;
      renderTag(npc);
    }
  }
}

// ───── 네트워크 상태 ─────
function myPacket() {
  return {
    n: me.name, c: me.char, h: myLook().hair, g: myLook().glasses, s: me.seat, m: me.seat >= 0 ? me.mode : 'stand',
    k: myNotes.length, o: prefs.noteOff,
    x: +me.target.x.toFixed(2), z: +me.target.z.toFixed(2),
    a: me.sitAt, j: me.joinedAt, t: Math.floor(me.studyMs / 60000),
  };
}

const broadcast = () => {
  if (entered) net.send(myPacket());
};

function onPeerState(id, d) {
  let p = others.get(id);
  const fresh = !p;
  if (fresh) {
    p = { id, fig: new Character(scene, cafe.findPath, d.char, d), seat: -1, mode: 'stand' };
    others.set(id, p);
    makeTag(p, 'peer');
  }
  p.fig.setType(d.char, d);
  const changedSeat = p.seat !== d.seat;
  const prevMode = p.mode;
  Object.assign(p, { name: d.name, notes: d.notes, noteOff: d.noteOff, sitAt: d.sitAt, joinedAt: d.joinedAt, todayMin: d.todayMin, tx: d.x, tz: d.z });

  if (d.seat >= 0) {
    // 같은 자리를 동시에 고르면 먼저 앉은 사람이 자리를 지킨다.
    if (me.seat === d.seat) {
      const iKeep = me.sitAt < d.sitAt || (me.sitAt === d.sitAt && net.id < id);
      if (iKeep) {
        net.sendTo(myPacket(), id);
      } else {
        leaveSeat(true);
        toast('그 자리는 다른 분이 먼저 앉았어요. 다른 자리를 골라 주세요.');
      }
    }
    evictNpc(d.seat);
  }

  p.seat = d.seat;
  p.mode = d.mode;
  if (fresh) {
    if (d.seat >= 0) p.fig.placeSeated(seats[d.seat], d.mode);
    else p.fig.place(d.x, d.z);
  } else if (changedSeat) {
    if (d.seat >= 0) p.fig.goSit(seats[d.seat], d.mode);
    else p.fig.walkTo(d.x, d.z);
  } else if (d.seat >= 0) {
    if (prevMode !== d.mode) p.fig.setMode(d.mode);
  } else {
    const last = p.fig.path[p.fig.path.length - 1];
    const dest = last || { x: p.fig.x, z: p.fig.z };
    if (Math.hypot(dest.x - d.x, dest.z - d.z) > 0.3) p.fig.walkTo(d.x, d.z);
  }
  renderTag(p);
  refreshPeople();
  checkOverflow();
}

function onPeerLeft(id) {
  const p = others.get(id);
  if (!p) return;
  removePerson(p);
  others.delete(id);
  if (noteTarget === p) closeNoteWrite();
  if (!$('noteBoard').hidden) renderNoteBoard();
  refreshPeople();
}

function checkOverflow() {
  if (others.size + 1 <= CAPACITY || room >= MAX_ROOMS) return;
  const iAmLatest = [...others.values()].every((p) => p.joinedAt <= me.joinedAt);
  if (iAmLatest) {
    params.set('room', room + 1);
    location.search = params.toString();
  }
}

// ───── 내 행동 ─────
function sitDown(i) {
  const owner = seatOwner(i);
  if (owner && !owner.isNpc) {
    if (!owner.isMe) toast(`${owner.name} 님이 앉아 있는 자리예요.`);
    return;
  }
  if (owner?.isNpc) evictNpc(i);
  endSession();
  clearNotes();
  me.seat = i;
  me.sitAt = Date.now();
  me.mode = 'rest';
  me.target = { ...seats[i].approach };
  me.fig.goSit(seats[i], 'rest', () => {
    refreshDock();
    if (me.seat === i) toast('휴식 상태로 앉았어요. 공부를 시작하려면 아래 학습 버튼을 누르세요.');
  });
  renderTag(me);
  refreshDock();
  broadcast();
}

function leaveSeat(silent) {
  if (me.seat < 0) return;
  endSession();
  closeStudyDialog();
  clearNotes();
  me.target = { ...seats[me.seat].approach };
  me.seat = -1;
  me.mode = 'stand';
  me.fig.standUp();
  renderTag(me);
  refreshDock();
  if (!silent) broadcast();
}

function setMyMode(mode) {
  if (me.seat < 0 || me.mode === mode) return;
  me.mode = mode;
  me.fig.setMode(mode);
  renderTag(me);
  refreshDock();
  broadcast();
}

// ───── 쪽지 ─────
function onNote(id, text) {
  const from = others.get(id);
  const now = Date.now();
  // 보낸 쪽의 제한은 믿을 수 없으므로 받는 쪽에서 다시 막는다. 이름도 받은 값이 아닌 접속 정보에서 찾는다.
  if (!from || prefs.noteOff || blocked.has(id) || me.seat < 0 || myNotes.length >= NOTE_LIMIT) return;
  if (now - (lastNoteFrom.get(id) || 0) < NOTE_GAP_MS * 0.8) return;
  lastNoteFrom.set(id, now);
  myNotes.push({ key: now + Math.random(), id, name: from.name, text, at: now });
  syncNotes();
}

function syncNotes() {
  refreshDock();
  refreshSeatProps();
  if (!$('noteBoard').hidden) {
    if (myNotes.length) renderNoteBoard();
    else closeNoteBoard();
  }
  broadcast();
}

function clearNotes() {
  if (!myNotes.length) return;
  myNotes.length = 0;
  closeNoteBoard();
  toast('자리를 옮겨 붙어 있던 쪽지가 사라졌어요.');
  syncNotes();
}

function removeNote(key) {
  const i = myNotes.findIndex((n) => n.key === key);
  if (i >= 0) myNotes.splice(i, 1);
  syncNotes();
}

function blockSender(id, name) {
  blocked.add(id);
  for (let i = myNotes.length - 1; i >= 0; i--) if (myNotes[i].id === id) myNotes.splice(i, 1);
  toast(`${name} 님의 쪽지를 이번 접속 동안 받지 않아요.`);
  syncNotes();
}

let noteTarget = null;
function openNoteWrite(person) {
  if (person.seat < 0) {
    toast(`${person.name} 님은 지금 자리에 앉아 있지 않아요.`);
    return;
  }
  if (person.noteOff) {
    toast(`${person.name} 님은 쪽지를 받지 않아요.`);
    return;
  }
  if (person.notes >= NOTE_LIMIT) {
    toast(`${person.name} 님의 자리에 쪽지가 가득 찼어요.`);
    return;
  }
  closeStudyDialog();
  closeNoteBoard();
  togglePanel(null);
  noteTarget = person;
  $('noteWriteTitle').textContent = `${person.name} 님에게 쪽지`;
  $('noteText').value = '';
  syncNoteCount();
  $('noteWrite').hidden = false;
  $('noteText').focus({ preventScroll: true });
}

function closeNoteWrite() {
  noteTarget = null;
  $('noteWrite').hidden = true;
}

function syncNoteCount() {
  const length = $('noteText').value.length;
  $('noteCount').textContent = `${length}/${NOTE_MAX}`;
  $('noteSend').disabled = !$('noteText').value.trim();
}

function sendNote() {
  const person = noteTarget;
  if (!person) return;
  const text = cleanNote($('noteText').value);
  if (!text) {
    toast('이 내용은 보낼 수 없어요. 다시 써 주세요.');
    return;
  }
  if (person.seat < 0) {
    toast(`${person.name} 님이 자리를 떠났어요.`);
    closeNoteWrite();
    return;
  }
  const wait = NOTE_GAP_MS - (Date.now() - (lastNoteTo.get(person.id) || 0));
  if (wait > 0) {
    toast(`같은 분에게는 ${Math.ceil(wait / 1000)}초 뒤에 다시 보낼 수 있어요.`);
    return;
  }
  lastNoteTo.set(person.id, Date.now());
  net.sendNote(text, person.id);
  closeNoteWrite();
  toast(`${person.name} 님에게 쪽지를 보냈어요.`);
}

function openNoteBoard() {
  closeStudyDialog();
  closeNoteWrite();
  togglePanel(null);
  renderNoteBoard();
  $('noteBoard').hidden = false;
}

function closeNoteBoard() {
  $('noteBoard').hidden = true;
}

function renderNoteBoard() {
  $('noteList').replaceChildren(...myNotes.map((note) => {
    const li = document.createElement('li');
    const from = document.createElement('strong');
    from.textContent = `${note.name} 님`;
    const text = document.createElement('p');
    text.textContent = note.text;
    const actions = document.createElement('div');
    actions.className = 'note-actions';
    const button = (label, run) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.addEventListener('click', run);
      actions.append(b);
    };
    button('떼기', () => removeNote(note.key));
    const sender = others.get(note.id);
    if (sender) button('답장', () => openNoteWrite(sender));
    button('차단', () => blockSender(note.id, note.name));
    li.append(from, text, actions);
    return li;
  }));
}

// ───── 학습 세션 ─────
function onStudyButton() {
  if (me.seat < 0) return;
  if (session.state === 'study' && me.mode !== 'study') {
    setMyMode('study');
  } else if (session.state === 'break' || session.state === 'waiting') {
    closeAlert();
    startSet(session.set + 1);
  } else {
    openStudyDialog();
  }
}

function beginPhase(state, ms) {
  session.state = state;
  session.remainMs = ms;
  session.totalMs = ms;
  sound.setDuck(state !== 'study');
  refreshDock();
}

function startSet(set) {
  session.set = set;
  session.elapsedMs = 0;
  beginPhase('study', session.plan.study * 60000);
  setMyMode('study');
}

function startSession(plan) {
  session.plan = { ...plan, sets: plan.study === 0 ? 1 : plan.sets };
  session.studiedMs = 0;
  closeAlert();
  startSet(1);
}

function endSession() {
  if (session.state === 'idle') return;
  session.state = 'idle';
  session.plan = null;
  sound.setDuck(false);
  closeAlert();
  flashText = '';
  refreshDock();
}

const SET_TEXT = () => (session.plan?.sets > 1 ? `${session.set}/${session.plan.sets}세트` : '');

function finishStudy() {
  const { plan, set } = session;
  sound.bell(3);
  setMyMode('rest');
  me.fig.stretch(3);
  if (set >= plan.sets) {
    const total = Math.round(session.studiedMs / 60000);
    endSession();
    attention('학습 완료', `${plan.sets}세트, 총 ${total}분 학습을 마쳤어요.`);
    showAlert({
      tone: '#f5c21a',
      title: `${plan.sets}세트를 모두 마쳤어요!`,
      body: `오늘 ${total}분 집중했어요. 고생했어요.`,
      actions: [['확인', closeAlert], ['한 번 더 하기', () => { closeAlert(); openStudyDialog(); }]],
    });
    return;
  }
  beginPhase('break', plan.rest * 60000);
  attention('쉬는 시간이에요', `${plan.rest}분 쉬고 ${set + 1}세트를 시작해요.`);
  showAlert({
    tone: '#3f9f6a',
    title: '수고했어요! 쉬는 시간이에요',
    body: `${plan.study}분 학습을 마쳤어요. ${plan.rest}분 쉬고 ${set + 1}세트를 시작해요. 일어나서 물 한 잔 어때요?`,
    actions: [
      ['쉬기', closeAlert],
      ['5분 더 학습', () => {
        closeAlert();
        session.remainMs = 5 * 60000;
        session.totalMs = 5 * 60000;
        session.state = 'study';
        sound.setDuck(false);
        setMyMode('study');
        refreshDock();
      }],
      ['쉬지 않고 다음 세트', () => { closeAlert(); startSet(set + 1); }],
    ],
  });
}

function finishBreak() {
  const next = session.set + 1;
  sound.bell(1);
  beginPhase('waiting', 30000);
  attention('쉬는 시간이 끝났어요', `곧 ${next}세트를 시작해요.`);
  showAlert({
    tone: '#e8512f',
    title: '쉬는 시간이 끝났어요',
    body: '',
    live: () => `${Math.ceil(session.remainMs / 1000)}초 뒤 ${next}세트 학습을 시작해요.`,
    actions: [
      ['지금 시작', () => { closeAlert(); startSet(next); }],
      ['5분 더 쉬기', () => { closeAlert(); beginPhase('break', 5 * 60000); }],
      ['오늘은 그만', () => { endSession(); }],
    ],
  });
}

function tickSession(delta) {
  if (session.state === 'idle') return;
  if (session.state === 'study') {
    if (me.mode !== 'study') return;
    me.studyMs += delta;
    session.studiedMs += delta;
    session.elapsedMs += delta;
    if (session.plan.study > 0) {
      session.remainMs -= delta;
      if (session.remainMs <= 0) finishStudy();
    }
  } else {
    session.remainMs -= delta;
    if (session.remainMs <= 0) {
      if (session.state === 'break') finishBreak();
      else {
        closeAlert();
        startSet(session.set + 1);
      }
    } else if (alertLive) {
      $('alertBody').textContent = alertLive();
    }
  }
}

// ───── 알림 ─────
let alertLive = null;
function showAlert({ tone, title, body, live, actions }) {
  const el = $('studyAlert');
  el.style.setProperty('--alert-tone', tone);
  $('alertTitle').textContent = title;
  alertLive = live || null;
  $('alertBody').textContent = live ? live() : body;
  $('alertActions').replaceChildren(...actions.map(([label, run]) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.addEventListener('click', run);
    return b;
  }));
  el.hidden = false;
  $('alertActions').firstChild.focus({ preventScroll: true });
}

function closeAlert() {
  alertLive = null;
  $('studyAlert').hidden = true;
}

// 다른 탭에 있어도 알 수 있도록 탭 제목을 깜빡이고, 허용했다면 브라우저 알림도 보낸다.
let flashText = '';
function attention(title, body) {
  if (!document.hidden) return;
  flashText = `⏰ ${title}`;
  if (prefs.notify && window.Notification?.permission === 'granted') {
    try {
      const n = new Notification(`스터디카페 · ${title}`, { body, tag: 'ohuseojae-timer' });
      n.onclick = () => {
        window.focus();
        n.close();
      };
    } catch {
      /* 일부 휴대폰 브라우저는 페이지에서 바로 알림을 만들 수 없다 */
    }
  }
}
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    flashText = '';
    updateClock();
  }
});

// ───── 학습 설정창 ─────
const draft = { ...prefs.plan };

function openStudyDialog() {
  closeSoundTip();
  togglePanel(null);
  Object.assign(draft, prefs.plan);
  $('customStudy').value = [25, 50, 0].includes(draft.study) ? '' : draft.study;
  $('customRest').value = [5, 10].includes(draft.rest) ? '' : draft.rest;
  $('notifyToggle').checked = prefs.notify && window.Notification?.permission === 'granted';
  $('studyStart').textContent = session.state === 'idle' ? '학습 시작' : '이 설정으로 다시 시작';
  sound.start();
  syncDraft();
  $('studyDialog').hidden = false;
  $('studyStart').focus({ preventScroll: true });
}

function closeStudyDialog() {
  $('studyDialog').hidden = true;
}

function syncDraft() {
  const mark = (attr, value) => document.querySelectorAll(`[${attr}]`).forEach((b) => {
    b.setAttribute('aria-pressed', Number(b.getAttribute(attr)) === value ? 'true' : 'false');
  });
  mark('data-plan-study', draft.study);
  mark('data-plan-rest', draft.rest);
  mark('data-plan-sets', draft.sets);
  $('customStudy').classList.toggle('on', Number($('customStudy').value) === draft.study && draft.study > 0);
  $('customRest').classList.toggle('on', Number($('customRest').value) === draft.rest);
  $('breakFields').hidden = draft.study === 0;
  const total = draft.sets * draft.study + (draft.sets - 1) * draft.rest;
  $('studySummary').textContent = draft.study === 0
    ? '끝나는 시간 없이 학습 시간을 재요. 끝내기 버튼으로 마칠 수 있어요.'
    : `${draft.study}분 학습 → ${draft.rest}분 휴식을 ${draft.sets}번 반복해요. 총 ${Math.floor(total / 60) ? `${Math.floor(total / 60)}시간 ` : ''}${total % 60 ? `${total % 60}분` : ''}`.trim();
}

function walkMe(x, z) {
  me.target = { x, z };
  if (me.seat >= 0) {
    endSession();
    closeStudyDialog();
    clearNotes();
    me.seat = -1;
    me.mode = 'stand';
    renderTag(me);
    refreshDock();
  }
  me.fig.walkTo(x, z);
  broadcast();
}

// ───── 화면 ─────
let toastTimer;
function toast(text) {
  const el = $('toast');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3800);
}

function fmt(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const pad = (v) => String(v).padStart(2, '0');
  return h ? `${h}:${pad(m % 60)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
}

function refreshDock() {
  const seated = me.seat >= 0;
  $('dockStand').hidden = seated;
  $('dockSeat').hidden = !seated;
  $('timer').hidden = !seated || session.state === 'idle';
  $('seatLabel').textContent = seated ? `${seats[me.seat].zone} ${me.seat + 1}번` : '';
  $('noteBtn').hidden = !seated || !myNotes.length;
  $('noteBtnCount').textContent = myNotes.length;
  document.querySelectorAll('[data-mode]').forEach((b) => {
    b.setAttribute('aria-pressed', b.dataset.mode === me.mode ? 'true' : 'false');
  });
  updateClock();
}

function updateClock() {
  const blink = flashText && Math.floor(Date.now() / 1000) % 2 === 0;
  if (session.state === 'idle') {
    document.title = blink ? flashText : '스터디카페';
    return;
  }
  const { plan } = session;
  const paused = session.state === 'study' && me.mode !== 'study';
  const free = session.state === 'study' && plan.study === 0;
  const sets = SET_TEXT();
  const name = { study: paused ? '일시정지 · 학습을 누르면 이어져요' : '학습 중', break: '쉬는 시간', waiting: '곧 다음 세트' }[session.state];
  const text = free ? fmt(session.elapsedMs) : fmt(Math.max(0, session.remainMs) + 999);
  $('timerLabel').textContent = sets && !paused ? `${name} · ${sets}` : name;
  $('timerValue').textContent = text;
  const pie = $('timerPie');
  pie.style.setProperty('--p', free ? 1 : Math.max(0, session.remainMs / session.totalMs).toFixed(4));
  pie.dataset.kind = paused ? 'paused' : session.state === 'study' ? 'study' : 'break';
  document.title = blink ? flashText : `${text} ${name.split(' · ')[0]} · 스터디카페`;
}

function refreshPeople() {
  const count = others.size + 1;
  $('countNow').textContent = entered ? count : others.size;
  $('countMax').textContent = CAPACITY;
  $('peopleCount').textContent = `${count}명`;
  const list = $('peopleList');
  list.replaceChildren();
  const rows = [me, ...others.values()];
  for (const p of rows) {
    const li = document.createElement('li');
    if (p.isMe) li.className = 'mine';
    const name = document.createElement('span');
    name.className = 'p-name';
    name.textContent = p.isMe ? `${p.name} (나)` : p.name;
    const state = document.createElement('span');
    state.className = 'p-state';
    state.textContent = p.seat >= 0 ? (MODES[p.mode]?.doing || '앉아 있음') : '둘러보는 중';
    const mins = document.createElement('span');
    mins.className = 'p-min';
    const m = p.isMe ? Math.floor(me.studyMs / 60000) : p.todayMin || 0;
    mins.textContent = m >= 60 ? `${Math.floor(m / 60)}시간 ${m % 60}분` : `${m}분`;
    li.append(name, state, mins);
    if (!p.isMe && p.seat >= 0 && !p.noteOff) {
      const write = document.createElement('button');
      write.className = 'ghost p-note';
      write.textContent = '쪽지';
      write.setAttribute('aria-label', `${p.name} 님에게 쪽지 쓰기`);
      write.addEventListener('click', () => openNoteWrite(p));
      li.append(write);
    }
    list.append(li);
  }
  const npcNote = $('npcNote');
  npcNote.hidden = !npcs.length;
  npcNote.textContent = `‘단골’ 표시가 붙은 ${npcs.length}명은 빈 공간을 채우는 자동 캐릭터예요. 실제 사람이 아니며 인원수에 포함되지 않아요.`;
  const myTotal = $('todayTotal');
  const mins = Math.floor(me.studyMs / 60000);
  myTotal.textContent = mins >= 60 ? `${Math.floor(mins / 60)}시간 ${mins % 60}분` : `${mins}분`;
}

function applyName(value) {
  const name = cleanName(value);
  if (!name) {
    toast('사용할 수 없는 닉네임이에요. 다른 이름을 입력해 주세요.');
    return false;
  }
  me.name = name;
  store.set('name', name);
  renderTag(me);
  refreshPeople();
  broadcast();
  return true;
}

function myLook() {
  return looks[me.char];
}

function setCharacter(type) {
  if (!CHARACTERS[type]) return;
  me.char = type;
  store.set('char', type);
  me.fig?.setType(type, myLook());
  syncCharacter();
  broadcast();
}

function setLook(patch) {
  Object.assign(myLook(), patch);
  store.set('looks', looks);
  me.fig?.setType(me.char, myLook());
  drawThumb(me.char);
  syncCharacter();
  broadcast();
}

function syncCharacter() {
  const look = myLook();
  document.querySelectorAll('[data-char]').forEach((b) => {
    b.setAttribute('aria-pressed', b.dataset.char === me.char ? 'true' : 'false');
  });
  document.querySelectorAll('[data-hair]').forEach((b) => {
    b.style.setProperty('--swatch', hairColor(b.dataset.hair, me.char));
    b.setAttribute('aria-pressed', b.dataset.hair === look.hair ? 'true' : 'false');
  });
  document.querySelectorAll('[data-glasses]').forEach((b) => {
    b.setAttribute('aria-pressed', look.glasses ? 'true' : 'false');
  });
}

function drawThumb(type) {
  if (entered) return;
  const img = document.querySelector(`.char-pick [data-char="${type}"] img`);
  try {
    img.src = renderThumbnail(type, looks[type]);
    img.hidden = false;
  } catch (err) {
    console.warn('캐릭터 그림을 만들지 못했습니다', err);
  }
}

function refreshRings() {
  const show = entered && me.seat < 0;
  seats.forEach((s) => {
    const owner = seatOwner(s.i);
    s.ring.visible = show && !owner;
  });
}

function refreshSeatProps() {
  const occupant = new Array(seats.length).fill(null);
  const all = [me, ...others.values(), ...npcs];
  for (const p of all) {
    if (p.fig && p.fig.seat && p.fig.state === 'seated') occupant[p.fig.seat.i] = p;
  }
  seats.forEach((s, i) => {
    const p = occupant[i];
    if (s.book) s.book.visible = !!p && (p.mode === 'study' || p.mode === 'sleep');
    if (s.mug) s.mug.visible = !!p;
    s.lampSet?.(!!p && p.mode === 'study');
    s.setNotes(!p || p.isNpc ? 0 : p.isMe ? myNotes.length : p.notes || 0);
  });
  const everyone = [...others.values(), ...npcs];
  sound.setActivity({
    meStudying: me.seat >= 0 && me.mode === 'study' && me.fig?.state === 'seated',
    othersStudying: everyone.filter((p) => p.mode === 'study').length,
    others: everyone.length,
  });
}

function saveStudy() {
  const all = store.get('study', {});
  all[dateKey()] = me.studyMs;
  const keys = Object.keys(all);
  if (keys.length > 60) delete all[keys[0]];
  store.set('study', all);
}

// ───── 시계 ─────
let lastClock = Date.now();
let lastDate = dateKey();
setInterval(() => {
  const now = Date.now();
  // 컴퓨터가 잠들었던 시간은 공부 시간에 넣지 않는다.
  const delta = Math.min(now - lastClock, 5 * 60000);
  lastClock = now;
  if (!entered) return;
  if (lastDate !== dateKey()) {
    lastDate = dateKey();
    me.studyMs = 0;
  }
  tickSession(delta);
  updateClock();
}, 1000);

setInterval(() => {
  if (!entered) return;
  saveStudy();
  broadcast();
  refreshPeople();
  const key = timeKey();
  if (key !== currentTime) {
    currentTime = key;
    cafe.setTime(key);
  }
}, 15000);

setInterval(() => {
  refreshRings();
  refreshSeatProps();
  tickNpcs(performance.now());
}, 500);

// ───── 입력 ─────
const ray = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let downAt = null;
let lastInput = 0;

function pick(e) {
  pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(pointer, camera);
  // 쪽지가 없는 자리의 쪽지 영역은 건너뛴다.
  return ray.intersectObjects(cafe.pickables, false).find(({ object }) => {
    const spot = object.userData.noteSeat;
    return spot === undefined || seats[spot].noteCount > 0;
  }) || null;
}

canvas.addEventListener('pointerdown', (e) => {
  downAt = { x: e.clientX, y: e.clientY };
  lastInput = performance.now();
});
canvas.addEventListener('pointerup', (e) => {
  lastInput = performance.now();
  if (!entered || !downAt) return;
  const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
  downAt = null;
  if (moved > 7) return;
  const hit = pick(e);
  if (!hit) return;
  const seatI = hit.object.userData.seat ?? hit.object.userData.noteSeat;
  if (seatI !== undefined) {
    const owner = seatOwner(seatI);
    if (owner?.isMe) {
      if (myNotes.length) openNoteBoard();
    } else if (owner && !owner.isNpc) {
      openNoteWrite(owner);
    } else {
      sitDown(seatI);
    }
  } else if (hit.object.userData.floor) {
    walkMe(hit.point.x, hit.point.z);
  }
});
canvas.addEventListener('pointermove', (e) => {
  if (!entered || e.buttons) return;
  const hit = pick(e);
  const seatI = hit?.object.userData.seat ?? hit?.object.userData.noteSeat;
  canvas.style.cursor = seatI !== undefined ? 'pointer' : 'grab';
});
canvas.addEventListener('wheel', () => { lastInput = performance.now(); }, { passive: true });

document.querySelectorAll('[data-mode]').forEach((b) => {
  b.addEventListener('click', () => {
    if (b.dataset.mode === 'study') onStudyButton();
    else setMyMode(b.dataset.mode);
  });
});
for (const [attr, key] of [['data-plan-study', 'study'], ['data-plan-rest', 'rest'], ['data-plan-sets', 'sets']]) {
  document.querySelectorAll(`[${attr}]`).forEach((b) => {
    b.addEventListener('click', () => {
      draft[key] = Number(b.getAttribute(attr));
      if (key === 'study') $('customStudy').value = '';
      if (key === 'rest') $('customRest').value = '';
      syncDraft();
    });
  });
}
for (const [id, key, max] of [['customStudy', 'study', 180], ['customRest', 'rest', 60]]) {
  $(id).addEventListener('input', (e) => {
    const value = Math.floor(Number(e.target.value));
    if (value >= 1) draft[key] = Math.min(value, max);
    syncDraft();
  });
  $(id).addEventListener('change', (e) => {
    if (e.target.value !== '') e.target.value = draft[key];
    syncDraft();
  });
}
$('studyStart').addEventListener('click', async () => {
  prefs.plan = { ...draft };
  store.set('plan', prefs.plan);
  closeStudyDialog();
  startSession(prefs.plan);
  // 권한 요청 창 때문에 학습 시작이 늦어지지 않도록 시작한 뒤에 묻는다.
  const wantsNotify = $('notifyToggle').checked;
  if (wantsNotify && window.Notification?.permission === 'default') {
    try {
      await Notification.requestPermission();
    } catch {
      /* 권한을 물을 수 없는 환경이면 탭 제목 알림만 쓴다 */
    }
  }
  prefs.notify = wantsNotify && window.Notification?.permission === 'granted';
  store.set('notify', prefs.notify);
  if (wantsNotify && !prefs.notify) toast('브라우저 알림을 쓸 수 없어요. 대신 탭 제목과 종소리로 알려 드릴게요.');
});
$('studyClose').addEventListener('click', closeStudyDialog);
$('timerSetup').addEventListener('click', openStudyDialog);
$('timerEnd').addEventListener('click', () => {
  endSession();
  setMyMode('rest');
});
$('standUp').addEventListener('click', () => {
  leaveSeat();
});
$('findSeat').addEventListener('click', () => {
  let free = freeSeatIndexes();
  if (!free.length) free = npcs.map((n) => n.seat);
  if (!free.length) {
    toast('빈자리가 없어요. 다른 관으로 옮겨 보세요.');
    return;
  }
  const f = me.fig;
  free.sort((a, b) => Math.hypot(seats[a].x - f.x, seats[a].z - f.z) - Math.hypot(seats[b].x - f.x, seats[b].z - f.z));
  sitDown(free[0]);
});
addEventListener('keydown', (e) => {
  if (!entered) return;
  if (e.key === 'Escape') {
    closeStudyDialog();
    closeNoteWrite();
    closeNoteBoard();
    return;
  }
  if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName) || !$('studyDialog').hidden) return;
  const mode = Object.keys(MODES).find((m) => MODES[m].key === e.key);
  if (mode === 'study') onStudyButton();
  else if (mode) setMyMode(mode);
});

function togglePanel(id) {
  if (id === 'soundPanel') closeSoundTip();
  ['soundPanel', 'peoplePanel'].forEach((p) => {
    const el = $(p);
    const open = p === id ? el.hidden : false;
    el.hidden = !open;
    $(p === 'soundPanel' ? 'soundBtn' : 'peopleBtn').setAttribute('aria-expanded', String(open));
  });
}
$('soundBtn').addEventListener('click', () => togglePanel('soundPanel'));
$('peopleBtn').addEventListener('click', () => {
  $('nameEdit').value = me.name;
  togglePanel('peoplePanel');
});
document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => togglePanel(null)));

function syncBed() {
  $('soundNow').textContent = sound.bed === 'off' ? '' : `· ${BEDS[sound.bed]}`;
  document.querySelectorAll('[data-bed]').forEach((b) => {
    b.setAttribute('aria-pressed', b.dataset.bed === sound.bed ? 'true' : 'false');
  });
}
document.querySelectorAll('[data-bed]').forEach((b) => {
  b.addEventListener('click', () => {
    sound.start();
    sound.setBed(b.dataset.bed);
    // 소리를 고른 사람에게 음소거 때문에 안 들리는 일이 없게 한다.
    if (b.dataset.bed !== 'off' && sound.muted) {
      sound.setMuted(false);
      syncMute();
    }
    store.set('sound', sound.prefs());
    syncBed();
    if (b.closest('#soundTip')) {
      store.set('soundTipSeen', true);
      $('soundDot').hidden = true;
      clearTimeout(tipTimer);
      tipTimer = setTimeout(() => { $('soundTip').hidden = true; }, 2500);
    }
  });
});

// 소리 기능 안내: 직접 고르거나 닫을 때까지 입장할 때마다 보여 준다.
let tipTimer;
function closeSoundTip() {
  clearTimeout(tipTimer);
  $('soundTip').hidden = true;
  $('soundDot').hidden = true;
  store.set('soundTipSeen', true);
}
function showSoundTip() {
  if (store.get('soundTipSeen', false)) return;
  const tip = $('soundTip');
  tip.hidden = false;
  $('soundDot').hidden = false;
  const btn = $('soundBtn').getBoundingClientRect();
  const center = innerWidth - (btn.left + btn.width / 2);
  const tipRight = innerWidth - tip.getBoundingClientRect().right;
  tip.style.setProperty('--arrow-right', `${Math.max(10, center - tipRight - 7)}px`);
  tipTimer = setTimeout(() => { tip.hidden = true; }, 20000);
}
$('soundTipClose').addEventListener('click', closeSoundTip);

$('muteBtn').addEventListener('click', () => {
  sound.setMuted(!sound.muted);
  store.set('sound', sound.prefs());
  syncMute();
});
function syncMute() {
  $('muteBtn').textContent = sound.muted ? '소리 켜기' : '소리 끄기';
  $('soundBtn').classList.toggle('off', sound.muted);
}
document.querySelectorAll('[data-level]').forEach((input) => {
  const name = input.dataset.level;
  input.value = sound.levels[name];
  input.addEventListener('input', () => {
    sound.setLevel(name, Number(input.value));
    store.set('sound', sound.prefs());
    document.querySelectorAll(`[data-level="${name}"]`).forEach((other) => {
      if (other !== input) other.value = input.value;
    });
  });
});
document.querySelectorAll('[data-try]').forEach((b) => {
  b.addEventListener('click', () => {
    sound.start();
    sound[b.dataset.try](1, 0);
  });
});
$('npcToggle').checked = prefs.npc;
$('npcToggle').addEventListener('change', (e) => {
  prefs.npc = e.target.checked;
  store.set('npc', prefs.npc);
  syncNpcs();
  refreshPeople();
});
$('timeSelect').value = prefs.time;
$('timeSelect').addEventListener('change', (e) => {
  prefs.time = e.target.value;
  store.set('time', prefs.time);
  currentTime = timeKey();
  cafe.setTime(currentTime);
});

for (let i = 1; i <= MAX_ROOMS; i++) {
  const o = document.createElement('option');
  o.value = i;
  o.textContent = `${i}관`;
  $('roomSelect').append(o);
}
$('roomSelect').value = room;
$('roomSelect').addEventListener('change', (e) => {
  params.set('room', e.target.value);
  location.search = params.toString();
});

$('inviteBtn').addEventListener('click', async () => {
  const url = new URL(location.href);
  url.searchParams.set('room', room);
  try {
    await navigator.clipboard.writeText(url.href);
    toast(`${room}관 초대 링크를 복사했어요.`);
  } catch {
    toast(url.href);
  }
});

$('leaveBtn').addEventListener('click', () => location.reload());

$('nameEdit').addEventListener('change', (e) => {
  if (!applyName(e.target.value)) e.target.value = me.name;
});
$('nameReroll').addEventListener('click', () => {
  const name = randomAuthor([me.name]);
  $('nameEdit').value = name;
  applyName(name);
});

document.querySelectorAll('[data-char]').forEach((b) => {
  b.addEventListener('click', () => setCharacter(b.dataset.char));
});
document.querySelectorAll('.hair-pick').forEach((row) => {
  Object.entries(HAIR).forEach(([key, { label }]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.hair = key;
    b.title = label;
    b.setAttribute('aria-label', `머리 색 ${label}`);
    b.addEventListener('click', () => setLook({ hair: key }));
    row.append(b);
  });
});
document.querySelectorAll('[data-glasses]').forEach((b) => {
  b.addEventListener('click', () => setLook({ glasses: !myLook().glasses }));
});
CHAR_KEYS.forEach(drawThumb);

// 쪽지 입력
$('noteText').maxLength = NOTE_MAX;
$('noteText').addEventListener('input', syncNoteCount);
$('noteText').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.isComposing) {
    e.preventDefault();
    sendNote();
  }
});
$('noteSend').addEventListener('click', sendNote);
$('noteWriteClose').addEventListener('click', closeNoteWrite);
$('noteBoardClose').addEventListener('click', closeNoteBoard);
$('noteBtn').addEventListener('click', openNoteBoard);
$('noteOffToggle').checked = prefs.noteOff;
$('noteOffToggle').addEventListener('change', (e) => {
  prefs.noteOff = e.target.checked;
  store.set('noteOff', prefs.noteOff);
  broadcast();
});

// 입장 화면
$('entryName').value = me.name;
if (firstName) $('entryHint').textContent = '지난번 닉네임이에요. 바꿔도 돼요.';
$('entryReroll').addEventListener('click', () => {
  $('entryName').value = randomAuthor([$('entryName').value]);
});
$('entryRoom').textContent = `${room}관`;
$('entryForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!applyName($('entryName').value || randomAuthor())) return;
  setCharacter(me.char);
  sound.start();
  $('entry').hidden = true;
  $('hud').hidden = false;
  me.joinedAt = Date.now();
  closeThumbnails();
  me.fig = new Character(scene, cafe.findPath, me.char, myLook());
  me.fig.place(cafe.spawn.x, cafe.spawn.z, Math.PI);
  makeTag(me, 'mine');
  entered = true;
  controls.enabled = true;
  flyIn = 1;
  refreshDock();
  refreshPeople();
  toast('노란 동그라미가 있는 빈자리를 누르면 앉아요.');
  setTimeout(showSoundTip, 1800);
  connect();
});

async function connect() {
  $('netState').textContent = '연결 중';
  net = await connectRoom({
    room,
    seatCount: seats.length,
    onState: onPeerState,
    onNote,
    onLeave: onPeerLeft,
    onJoin: (id) => net.sendTo(myPacket(), id),
  });
  $('netState').textContent = net.ok ? '' : '혼자 모드';
  $('netState').title = net.ok ? '' : '이 환경에서는 다른 사람과 연결할 수 없어요. 공부 기능은 그대로 쓸 수 있어요.';
  if (!net.ok) toast('이 환경에서는 다른 사람과 연결할 수 없어 혼자 모드로 열었어요.');
  broadcast();
}

// ───── 렌더 루프 ─────
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  lastInput = performance.now();
  if (topOn && !topMove) {
    controls.maxDistance = topHeight() * 1.15;
    controls.target.set(0, 0, 0);
    topPosition(camera.position);
  }
});

// ───── 위에서 보기 ─────
const TOP_SECONDS = 0.9;
let topOn = false;
let topMove = null;
const backOffset = new THREE.Vector3();

// 화면 비율에 맞춰 카페 바닥 전체가 들어오는 높이. 세로 화면은 카페를 눕혀서 보여 준다.
function topHeight() {
  const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const across = camera.aspect < 1 ? 19 : 27;
  const along = camera.aspect < 1 ? 27 : 19;
  return Math.max((along * 1.22) / (2 * tan), (across * 1.06) / (2 * tan * camera.aspect));
}

function topPosition(p) {
  const turn = camera.aspect < 1 ? Math.PI / 2 : 0;
  return p.set(Math.sin(turn) * 0.01, topHeight(), Math.cos(turn) * 0.01);
}

function clampToRoom(p) {
  p.x = Math.max(-12.4, Math.min(12.4, p.x));
  p.z = Math.max(-8.4, Math.min(8.05, p.z));
  p.y = Math.max(0.5, Math.min(p.z > 6.9 ? 3.25 : 5.7, p.y));
  return p;
}

function setOrbitForTop(on) {
  controls.enablePan = on;
  controls.enableRotate = !on;
  controls.minPolarAngle = on ? 0 : 0.35;
  controls.maxPolarAngle = on ? 0.001 : 1.5;
  controls.minDistance = on ? 5 : 2.4;
  controls.maxDistance = on ? topHeight() * 1.15 : 15;
  controls.mouseButtons.LEFT = on ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
  controls.touches.ONE = on ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE;
}

function setTopView(on) {
  if (on === topOn || !entered) return;
  topOn = on;
  flyIn = 0;
  controls.enabled = false;
  lastInput = performance.now();
  $('viewBtn').setAttribute('aria-pressed', String(on));
  $('viewTop').hidden = on;
  $('viewBack').hidden = !on;
  const toTarget = new THREE.Vector3();
  const toPos = new THREE.Vector3();
  if (on) {
    backOffset.copy(camera.position).sub(controls.target);
    cafe.setRoof(false);
    topPosition(toPos);
  } else {
    toTarget.set(me.fig.x, me.fig.root.position.y + 1.05, me.fig.z);
    toPos.copy(toTarget).add(backOffset);
  }
  topMove = {
    t: matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : 0,
    fromPos: camera.position.clone(),
    fromTarget: controls.target.clone(),
    toPos,
    showPos: on ? toPos : clampToRoom(toPos.clone()),
    toTarget,
  };
}

function stepTopMove(dt) {
  const m = topMove;
  m.t = Math.min(1, m.t + dt / TOP_SECONDS);
  const e = m.t * m.t * (3 - 2 * m.t);
  camera.position.lerpVectors(m.fromPos, m.showPos, e);
  controls.target.lerpVectors(m.fromTarget, m.toTarget, e);
  lastInput = performance.now();
  if (m.t < 1) return;
  topMove = null;
  camera.position.copy(m.toPos);
  setOrbitForTop(topOn);
  if (!topOn) cafe.setRoof(true);
  controls.enabled = true;
  controls.update();
}
$('viewBtn').addEventListener('click', () => setTopView(!topOn));

let lastFrame = performance.now();
const followTo = new THREE.Vector3();
const delta = new THREE.Vector3();
const saved = new THREE.Vector3();
const headPos = new THREE.Vector3();
let flyIn = 0;
let time = 0;
let frame = 0;

function placeTag(p) {
  if (!p.tag || !p.fig) return;
  headPos.set(p.fig.x, p.fig.root.position.y + p.fig.tagY, p.fig.z);
  const dist = camera.position.distanceTo(headPos);
  headPos.project(camera);
  if (headPos.z > 1) {
    p.tag.style.opacity = 0;
    return;
  }
  const x = (headPos.x * 0.5 + 0.5) * innerWidth;
  const y = (-headPos.y * 0.5 + 0.5) * innerHeight;
  p.tag.style.transform = `translate(-50%,-100%) translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`;
  const base = p.isMe ? 1 : p.isNpc ? 0.7 : 0.95;
  p.tag.style.opacity = dist > 19 && !topOn ? base * 0.45 : base;
}

function animate() {
  requestAnimationFrame(animate);
  frame++;
  // 앉아서 오래 켜 두는 서비스이므로 조작이 없으면 프레임을 낮춰 배터리를 아낀다.
  const idle = me.fig?.state === 'seated' && performance.now() - lastInput > 4000 && !downAt;
  if (idle && frame % 3) return;
  const nowFrame = performance.now();
  const dt = Math.min((nowFrame - lastFrame) / 1000, 0.5);
  lastFrame = nowFrame;
  time += dt;

  me.fig?.update(dt, time);
  others.forEach((p) => p.fig.update(dt, time));
  npcs.forEach((p) => p.fig.update(dt, time));
  cafe.tick(time);

  if (topMove) {
    stepTopMove(dt);
  } else if (topOn) {
    // 내려다보는 동안에는 나를 따라가지 않고, 카페 밖으로 너무 멀리 밀리지 않게만 막는다.
    delta.copy(controls.target);
    controls.target.x = Math.max(-13, Math.min(13, controls.target.x));
    controls.target.z = Math.max(-9, Math.min(9, controls.target.z));
    camera.position.add(delta.subVectors(controls.target, delta));
  } else if (entered && me.fig) {
    followTo.set(me.fig.x, me.fig.root.position.y + 1.05, me.fig.z);
    delta.copy(followTo).sub(controls.target).multiplyScalar(1 - Math.exp(-(flyIn > 0 ? 2.2 : 5) * dt));
    controls.target.add(delta);
    camera.position.add(delta);
    if (flyIn > 0) {
      flyIn = Math.max(0, flyIn - dt / 1.6);
      // 입장 직후에는 창가가 보이도록 책장 반대편 위로 카메라를 옮긴다.
      const desired = saved.set(me.fig.x + 4.6, 3.1, 6.7);
      if (flyIn > 0) camera.position.lerp(desired, 1 - Math.exp(-3 * dt));
    }
  } else {
    // 입장 전에는 카페를 천천히 둘러본다.
    camera.position.x = 10.5 + Math.sin(time * 0.12) * 1.1;
    camera.position.z = 7.6 + Math.cos(time * 0.09) * 0.45;
  }
  if (!topMove) controls.update();

  // 카메라가 벽 밖으로 나가면 렌더할 때만 안쪽으로 당긴다 (궤도 거리는 유지).
  saved.copy(camera.position);
  if (!topOn && !topMove) clampToRoom(camera.position);
  camera.lookAt(controls.target);
  // 천장을 걷어 낸 동안 시간대가 바뀌면 천장 그림자까지 넣어 구운 뒤 다시 그린다.
  if (renderer.shadowMap.needsUpdate && (topOn || topMove)) {
    cafe.setRoof(true);
    renderer.render(scene, camera);
    cafe.setRoof(false);
  }
  renderer.render(scene, camera);
  renderer.shadowMap.needsUpdate = false;

  if (me.tag) placeTag(me);
  others.forEach(placeTag);
  npcs.forEach(placeTag);
  camera.position.copy(saved);
}

syncNpcs();
refreshPeople();
syncMute();
syncBed();
syncCharacter();
$('loading').hidden = true;
$('entry').hidden = false;
animate();

if (params.has('debug')) {
  window.__cafe = { me, others, npcs, seats, sound, sitDown, setMyMode, leaveSeat, walkMe, onPeerState, onNote, myNotes, setTopView, camera, controls, renderer, session, prefs, get net() { return net; } };
}

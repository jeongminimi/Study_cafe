export const CAPACITY = 20;
export const MAX_ROOMS = 9;
export const APP_ID = 'ohuseojae-study-cafe-v1';
export const CHARACTERS = { man: '남', woman: '여', child: '아이' };
export const NOTE_MAX = 60;
export const NOTE_LIMIT = 6;
export const NOTE_GAP_MS = 30000;

// 'base'는 캐릭터마다 원래 정해진 머리 색이다.
export const HAIR = {
  base: { label: '기본', color: { man: '#b08d5a', woman: '#cb8c4c', child: '#c9622a' }, brow: { man: '#7a5a34', woman: '#a0683a', child: '#b0562a' } },
  black: { label: '검정', color: '#2a2422', brow: '#1f1a18' },
  brown: { label: '진갈색', color: '#5b3a25', brow: '#3f2718' },
  blond: { label: '금색', color: '#d9b565', brow: '#9c7a3e' },
  auburn: { label: '적갈색', color: '#8a3f26', brow: '#5f2a18' },
};
export const hairColor = (hair, type) => HAIR[hair].color[type] || HAIR[hair].color;
export const browColor = (hair, type) => HAIR[hair].brow[type] || HAIR[hair].brow;

// 세계적으로 유명한 외국 작가를 먼저 고르고, 다 쓰면 한국 작가를 고른다.
const WORLD_AUTHORS = [
  '셰익스피어', '톨스토이', '도스토옙스키', '헤밍웨이', '카프카', '괴테', '제인 오스틴', '버지니아 울프',
  '마크 트웨인', '찰스 디킨스', '빅토르 위고', '생텍쥐페리', '헤르만 헤세', '조지 오웰', '애거사 크리스티',
  '안데르센', '세르반테스', '단테', '알베르 카뮈', '에밀리 브론테', '나쓰메 소세키', '오 헨리',
];
const KOREAN_AUTHORS = ['윤동주', '박경리', '박완서', '김유정', '이상', '황순원', '이육사', '현진건', '나혜석', '백석'];

export const MODES = {
  study: { label: '학습', doing: '학습 중', icon: '✏️', key: '1' },
  rest: { label: '휴식', doing: '휴식 중', icon: '☕', key: '2' },
  phone: { label: '핸드폰', doing: '핸드폰 하는 중', icon: '📱', key: '3' },
  sleep: { label: '자기', doing: '자는 중', icon: '💤', key: '4' },
};

const BLOCKED = ['씨발', '시발', '병신', '좆', '지랄', '섹스', 'fuck', 'shit', 'sex'];

export function randomAuthor(except = []) {
  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  const free = (list) => list.filter((a) => !except.includes(a));
  return pick(free(WORLD_AUTHORS)) || pick(free(KOREAN_AUTHORS)) || pick(WORLD_AUTHORS);
}

// 내 입력과 다른 사람이 보낸 이름 모두 이 함수를 거친다.
export function cleanName(value) {
  if (typeof value !== 'string') return '';
  const name = value.replace(/[\p{C}<>]/gu, '').trim().slice(0, 12);
  const squashed = name.replace(/\s/g, '').toLowerCase();
  return BLOCKED.some((word) => squashed.includes(word)) ? '' : name;
}

// 내가 쓴 쪽지와 다른 사람이 보낸 쪽지 모두 이 함수를 거친다.
export function cleanNote(value) {
  if (typeof value !== 'string') return '';
  const text = value.replace(/[\p{C}<>]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, NOTE_MAX);
  const squashed = text.replace(/\s/g, '').toLowerCase();
  return BLOCKED.some((word) => squashed.includes(word)) ? '' : text;
}

export const store = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem('ohu.' + key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem('ohu.' + key, JSON.stringify(value));
    } catch {
      /* 저장할 수 없는 브라우저에서는 이번 접속 동안만 유지한다 */
    }
  },
};

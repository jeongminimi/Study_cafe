export const CAPACITY = 20;
export const MAX_ROOMS = 9;
export const APP_ID = 'ohuseojae-study-cafe-v1';
export const CHARACTERS = { man: '남', woman: '여', child: '아이' };

export const AUTHORS = [
  '윤동주', '박경리', '박완서', '김유정', '이상', '황순원', '이육사', '현진건', '나혜석', '백석',
  '셰익스피어', '톨스토이', '도스토옙스키', '헤밍웨이', '카프카', '괴테', '제인 오스틴', '버지니아 울프',
  '마크 트웨인', '찰스 디킨스', '빅토르 위고', '생텍쥐페리', '헤르만 헤세', '조지 오웰', '애거사 크리스티',
  '안데르센', '세르반테스', '단테', '알베르 카뮈', '에밀리 브론테', '나쓰메 소세키', '오 헨리',
];

export const MODES = {
  study: { label: '학습', doing: '학습 중', icon: '✏️', key: '1' },
  rest: { label: '휴식', doing: '휴식 중', icon: '☕', key: '2' },
  phone: { label: '핸드폰', doing: '핸드폰 하는 중', icon: '📱', key: '3' },
  sleep: { label: '자기', doing: '자는 중', icon: '💤', key: '4' },
};

const BLOCKED = ['씨발', '시발', '병신', '좆', '지랄', '섹스', 'fuck', 'shit', 'sex'];

export function randomAuthor(except = []) {
  const pool = AUTHORS.filter((a) => !except.includes(a));
  return pool[Math.floor(Math.random() * pool.length)] || AUTHORS[0];
}

// 내 입력과 다른 사람이 보낸 이름 모두 이 함수를 거친다.
export function cleanName(value) {
  if (typeof value !== 'string') return '';
  const name = value.replace(/[\p{C}<>]/gu, '').trim().slice(0, 12);
  const squashed = name.replace(/\s/g, '').toLowerCase();
  return BLOCKED.some((word) => squashed.includes(word)) ? '' : name;
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

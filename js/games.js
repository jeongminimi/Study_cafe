// 휴식할 때 하는 작은 게임: 테트리스와 핑퐁. 소리는 내지 않고, 다른 사람에게 전달하지도 않는다.
import { store } from './config.js';

const $ = (id) => document.getElementById(id);
const W = 280;
const H = 400;
const FONT = "'IBM Plex Sans KR', 'Malgun Gothic', sans-serif";

// ───── 테트리스 ─────
const COLS = 10;
const ROWS = 20;
const CELL = 20;
const PIECES = [
  { color: '#4fb6d8', m: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]] },
  { color: '#f5c21a', m: [[1, 1], [1, 1]] },
  { color: '#a56cc1', m: [[0, 1, 0], [1, 1, 1], [0, 0, 0]] },
  { color: '#4caf6d', m: [[0, 1, 1], [1, 1, 0], [0, 0, 0]] },
  { color: '#e0523c', m: [[1, 1, 0], [0, 1, 1], [0, 0, 0]] },
  { color: '#4a7fd6', m: [[1, 0, 0], [1, 1, 1], [0, 0, 0]] },
  { color: '#ee8a33', m: [[0, 0, 1], [1, 1, 1], [0, 0, 0]] },
];
const LINE_SCORE = [0, 100, 300, 500, 800];
const rotated = (m) => m.map((row, r) => row.map((_, c) => m[m.length - 1 - c][r]));

function block(g, x, y, size, color) {
  g.fillStyle = color;
  g.fillRect(x + 0.5, y + 0.5, size - 1, size - 1);
  g.fillStyle = 'rgba(255, 255, 255, .28)';
  g.fillRect(x + 0.5, y + 0.5, size - 1, size * 0.16);
  g.fillStyle = 'rgba(0, 0, 0, .2)';
  g.fillRect(x + 0.5, y + size * 0.84, size - 1, size * 0.16 - 0.5);
}

function makeTetris(onEnd) {
  const board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  let bag = [];
  let score = 0;
  let lines = 0;
  let fall = 0;
  let cur;
  let best = store.get('tetrisBest', 0);

  // 일곱 조각을 한 번씩 섞어 내보내 같은 조각만 계속 나오지 않게 한다.
  const draw = () => {
    if (!bag.length) bag = [...PIECES].sort(() => Math.random() - 0.5);
    return bag.pop();
  };
  let next = draw();

  const hits = (m, x, y) => m.some((row, r) => row.some((on, c) => {
    if (!on) return false;
    const bx = x + c;
    const by = y + r;
    return bx < 0 || bx >= COLS || by >= ROWS || (by >= 0 && board[by][bx]);
  }));

  const spawn = () => {
    const { m, color } = next;
    next = draw();
    cur = { m, color, x: Math.floor((COLS - m.length) / 2), y: m === PIECES[0].m ? -1 : 0 };
    if (hits(cur.m, cur.x, cur.y)) over();
  };

  const over = () => {
    const newBest = score > best;
    if (newBest) {
      best = score;
      store.set('tetrisBest', best);
    }
    onEnd(newBest ? '최고 기록이에요!' : '게임 끝', `점수 ${score}점 · ${lines}줄`);
  };

  const land = () => {
    let topped = false;
    cur.m.forEach((row, r) => row.forEach((on, c) => {
      if (!on) return;
      if (cur.y + r < 0) topped = true;
      else board[cur.y + r][cur.x + c] = cur.color;
    }));
    if (topped) {
      over();
      return;
    }
    let cleared = 0;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (board[r].every(Boolean)) {
        board.splice(r, 1);
        cleared++;
      }
    }
    for (let i = 0; i < cleared; i++) board.unshift(Array(COLS).fill(null));
    score += LINE_SCORE[cleared];
    lines += cleared;
    spawn();
  };

  const moveDown = () => {
    fall = 0;
    if (hits(cur.m, cur.x, cur.y + 1)) land();
    else cur.y++;
  };

  const landingY = () => {
    let y = cur.y;
    while (!hits(cur.m, cur.x, y + 1)) y++;
    return y;
  };

  spawn();

  return {
    act(action) {
      if (action === 'left' && !hits(cur.m, cur.x - 1, cur.y)) cur.x--;
      else if (action === 'right' && !hits(cur.m, cur.x + 1, cur.y)) cur.x++;
      else if (action === 'down') moveDown();
      else if (action === 'drop') {
        cur.y = landingY();
        moveDown();
      } else if (action === 'rotate') {
        const m = rotated(cur.m);
        // 벽이나 다른 조각에 걸리면 옆으로 조금 밀어서 돌린다.
        const push = [0, -1, 1, -2, 2].find((d) => !hits(m, cur.x + d, cur.y));
        if (push !== undefined) {
          cur.m = m;
          cur.x += push;
        }
      }
    },
    step(dt) {
      // 5줄마다 조금씩 빨라진다.
      fall += dt;
      if (fall >= Math.max(0.15, 0.8 - Math.floor(lines / 5) * 0.07)) moveDown();
    },
    draw(g) {
      g.fillStyle = '#2b190c';
      g.fillRect(0, 0, W, H);
      g.fillStyle = 'rgba(255, 244, 222, .05)';
      for (let c = 1; c < COLS; c++) g.fillRect(c * CELL, 0, 1, H);
      for (let r = 1; r < ROWS; r++) g.fillRect(0, r * CELL, COLS * CELL, 1);
      board.forEach((row, r) => row.forEach((color, c) => {
        if (color) block(g, c * CELL, r * CELL, CELL, color);
      }));

      // 조각이 떨어질 자리를 옅게 보여 준다.
      const ghost = landingY();
      g.fillStyle = 'rgba(255, 244, 222, .16)';
      cur.m.forEach((row, r) => row.forEach((on, c) => {
        if (on && ghost + r >= 0) g.fillRect((cur.x + c) * CELL + 1, (ghost + r) * CELL + 1, CELL - 2, CELL - 2);
      }));
      cur.m.forEach((row, r) => row.forEach((on, c) => {
        if (on && cur.y + r >= 0) block(g, (cur.x + c) * CELL, (cur.y + r) * CELL, CELL, cur.color);
      }));

      g.fillStyle = '#3a2414';
      g.fillRect(COLS * CELL, 0, W - COLS * CELL, H);
      g.fillStyle = '#d7c9b1';
      g.font = `500 12px ${FONT}`;
      g.textAlign = 'center';
      g.fillText('다음', COLS * CELL + 40, 24);
      const size = 15;
      const n = next.m.length;
      next.m.forEach((row, r) => row.forEach((on, c) => {
        if (on) block(g, COLS * CELL + 40 + (c - n / 2) * size, 62 + (r - n / 2) * size, size, next.color);
      }));
      g.fillStyle = '#d7c9b1';
      g.fillText('줄', COLS * CELL + 40, 130);
      g.fillStyle = '#fbf5e8';
      g.font = `700 20px ${FONT}`;
      g.fillText(lines, COLS * CELL + 40, 156);
    },
    status: () => `점수 ${score} · 최고 ${best}`,
  };
}

// ───── 핑퐁 ─────
const WIN_SCORE = 5;
// 쉬운 게임이 되도록 내 라켓을 더 넓게, 컴퓨터는 느리게 둔다.
const MY_W = 76;
const ITS_W = 56;
const PADDLE_H = 9;
const BALL = 5;
const MY_Y = H - 26;
const ITS_Y = 26;
const START_SPEED = 170;
const MAX_SPEED = 340;
const ITS_SPEED = 135;
const KEY_SPEED = 320;

function makePong(onEnd) {
  let mine = 0;
  let its = 0;
  let myX = W / 2;
  let itsX = W / 2;
  let ball = { x: W / 2, y: H / 2, vx: 0, vy: 0 };
  let wait = 0;
  let aimOff = 0;
  let held = 0;
  let toMe = true;

  const serve = () => {
    const angle = (Math.random() - 0.5) * 1.1;
    const dir = toMe ? 1 : -1;
    ball = { x: W / 2, y: H / 2, vx: Math.sin(angle) * START_SPEED, vy: Math.cos(angle) * START_SPEED * dir };
    wait = 0.7;
    aimOff = 0;
  };

  // 받은 위치가 라켓 끝일수록 공이 비스듬히 나가고, 받을 때마다 조금씩 빨라진다.
  const bounce = (paddleX, width, dir) => {
    const speed = Math.min(MAX_SPEED, Math.hypot(ball.vx, ball.vy) * 1.05);
    const angle = Math.max(-1, Math.min(1, (ball.x - paddleX) / (width / 2 + BALL))) * 1.05;
    ball.vx = Math.sin(angle) * speed;
    ball.vy = Math.cos(angle) * speed * dir;
    // 컴퓨터는 매번 조금 빗나간 곳을 노려서 가끔 공을 놓친다.
    aimOff = (Math.random() - 0.5) * 80;
  };

  const point = (forMe) => {
    if (forMe) mine++;
    else its++;
    toMe = !forMe;
    if (mine >= WIN_SCORE || its >= WIN_SCORE) {
      onEnd(mine > its ? '이겼어요!' : '아쉽게 졌어요', `${mine} : ${its}`);
      return;
    }
    serve();
  };

  const clampPaddle = (x, width) => Math.max(width / 2, Math.min(W - width / 2, x));
  serve();

  return {
    act(action) {
      if (action === 'left') held = -1;
      else if (action === 'right') held = 1;
      else if (action === 'stop') held = 0;
    },
    point(x) {
      myX = clampPaddle(x, MY_W);
    },
    step(dt) {
      myX = clampPaddle(myX + held * KEY_SPEED * dt, MY_W);
      const aim = ball.vy < 0 ? ball.x + aimOff : W / 2;
      const gap = aim - itsX;
      itsX = clampPaddle(itsX + Math.sign(gap) * Math.min(Math.abs(gap), ITS_SPEED * dt), ITS_W);
      if (wait > 0) {
        wait -= dt;
        return;
      }
      const prevY = ball.y;
      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;
      if (ball.x < BALL || ball.x > W - BALL) {
        ball.x = Math.max(BALL, Math.min(W - BALL, ball.x));
        ball.vx *= -1;
      }
      // 빠른 공이 한 프레임에 라켓을 지나쳐도 놓치지 않도록, 라켓 면을 넘었는지로 판단한다.
      const myFace = MY_Y - PADDLE_H / 2 - BALL;
      if (ball.vy > 0 && prevY <= myFace && ball.y >= myFace && Math.abs(ball.x - myX) <= MY_W / 2 + BALL) {
        ball.y = myFace;
        bounce(myX, MY_W, -1);
      }
      const itsFace = ITS_Y + PADDLE_H / 2 + BALL;
      if (ball.vy < 0 && prevY >= itsFace && ball.y <= itsFace && Math.abs(ball.x - itsX) <= ITS_W / 2 + BALL) {
        ball.y = itsFace;
        bounce(itsX, ITS_W, 1);
      }
      if (ball.y > H + BALL) point(false);
      else if (ball.y < -BALL) point(true);
    },
    draw(g) {
      g.fillStyle = '#2b190c';
      g.fillRect(0, 0, W, H);
      g.fillStyle = 'rgba(255, 244, 222, .16)';
      for (let x = 6; x < W; x += 20) g.fillRect(x, H / 2 - 1, 10, 2);
      g.font = `700 54px ${FONT}`;
      g.textAlign = 'center';
      g.fillStyle = 'rgba(255, 244, 222, .14)';
      g.fillText(its, W / 2, H / 2 - 26);
      g.fillText(mine, W / 2, H / 2 + 66);
      g.fillStyle = '#d7c9b1';
      g.fillRect(itsX - ITS_W / 2, ITS_Y - PADDLE_H / 2, ITS_W, PADDLE_H);
      g.fillStyle = '#f5c21a';
      g.fillRect(myX - MY_W / 2, MY_Y - PADDLE_H / 2, MY_W, PADDLE_H);
      g.fillStyle = '#fbf5e8';
      g.beginPath();
      g.arc(ball.x, ball.y, BALL, 0, Math.PI * 2);
      g.fill();
    },
    status: () => `나 ${mine} : ${its} 컴퓨터 · ${WIN_SCORE}점 내기`,
  };
}

// ───── 게임 창 ─────
const GAMES = {
  tetris: {
    title: '테트리스',
    make: makeTetris,
    help: '줄을 가득 채우면 사라져요.',
    keys: '← → 이동 · ↑ 돌리기 · ↓ 빠르게 · 스페이스 바로 내리기',
    touch: '버튼으로 움직이고 돌려요.',
  },
  pong: {
    title: '핑퐁',
    make: makePong,
    help: `컴퓨터와 공을 주고받아요. ${WIN_SCORE}점을 먼저 내면 이겨요.`,
    keys: '마우스를 좌우로 움직이거나 ← → 키를 눌러요.',
    touch: '화면을 좌우로 문질러 라켓을 움직여요.',
  },
};
const KEYS = { ArrowLeft: 'left', ArrowRight: 'right', ArrowDown: 'down', ArrowUp: 'rotate', ' ': 'drop' };

export function setupGames() {
  const root = $('game');
  const canvas = $('gameCanvas');
  const g = canvas.getContext('2d');
  let kind = store.get('game', 'tetris');
  if (!GAMES[kind]) kind = 'tetris';
  let current = null;
  let running = false;
  let raf = 0;
  let last = 0;
  let shownStatus = '';

  const fit = () => {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width) return;
    const dpr = Math.min(devicePixelRatio, 2);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
  };

  const render = () => {
    g.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
    current.draw(g);
    const status = current.status();
    if (status !== shownStatus) {
      shownStatus = status;
      $('gameScore').textContent = status;
    }
  };

  const frame = (now) => {
    raf = requestAnimationFrame(frame);
    // 탭을 다녀오는 등 프레임이 길게 끊겨도 게임이 한꺼번에 진행되지 않게 한다.
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    if (running) current.step(dt);
    if (current) render();
  };

  const showOverlay = (title, body, button, run) => {
    running = false;
    $('gameMessage').textContent = title;
    $('gameDetail').textContent = body;
    const go = $('gameGo');
    go.textContent = button;
    go.onclick = run;
    $('gameOverlay').hidden = false;
    go.focus({ preventScroll: true });
  };

  const help = () => {
    const game = GAMES[kind];
    return `${game.help} ${matchMedia('(pointer: coarse)').matches ? game.touch : game.keys}`;
  };

  const play = () => {
    $('gameOverlay').hidden = true;
    canvas.focus({ preventScroll: true });
    running = true;
  };

  const newGame = () => {
    current = GAMES[kind].make((title, body) => showOverlay(title, body, '다시 하기', start));
  };

  const start = () => {
    newGame();
    play();
  };

  const choose = (next) => {
    kind = next;
    store.set('game', kind);
    document.querySelectorAll('[data-game]').forEach((b) => {
      b.setAttribute('aria-pressed', b.dataset.game === kind ? 'true' : 'false');
    });
    $('gamePad').hidden = kind !== 'tetris';
    newGame();
    showOverlay(GAMES[kind].title, help(), '시작', play);
    fit();
  };

  const pause = () => {
    if (running) showOverlay('잠깐 멈췄어요', '이어서 할 수 있어요.', '계속하기', play);
  };

  const onKey = (e) => {
    if (!running) return;
    const action = KEYS[e.key];
    if (!action) return;
    e.preventDefault();
    if (e.repeat && (action === 'rotate' || action === 'drop')) return;
    current.act(action);
  };
  const onKeyUp = (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') current?.act('stop');
  };
  const onPointer = (e) => {
    if (!running || !current.point) return;
    const rect = canvas.getBoundingClientRect();
    current.point(((e.clientX - rect.left) / rect.width) * W);
  };

  document.querySelectorAll('[data-game]').forEach((b) => {
    b.addEventListener('click', () => choose(b.dataset.game));
  });
  root.addEventListener('pointermove', onPointer);
  root.addEventListener('pointerdown', onPointer);

  // 터치 버튼: 왼쪽, 오른쪽, 아래는 누르고 있으면 계속 움직인다.
  let holdTimer = 0;
  const release = () => {
    clearTimeout(holdTimer);
    clearInterval(holdTimer);
  };
  document.querySelectorAll('[data-game-act]').forEach((b) => {
    const action = b.dataset.gameAct;
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      release();
      if (!running) return;
      current.act(action);
      if (action === 'rotate') return;
      holdTimer = setTimeout(() => {
        holdTimer = setInterval(() => {
          if (running) current.act(action);
        }, 60);
      }, 170);
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((type) => b.addEventListener(type, release));
    b.addEventListener('contextmenu', (e) => e.preventDefault());
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause();
  });

  const close = () => {
    if (root.hidden) return;
    release();
    running = false;
    current = null;
    cancelAnimationFrame(raf);
    removeEventListener('keydown', onKey);
    removeEventListener('keyup', onKeyUp);
    removeEventListener('resize', fit);
    root.hidden = true;
  };

  $('gameClose').addEventListener('click', close);

  return {
    open() {
      root.hidden = false;
      addEventListener('keydown', onKey);
      addEventListener('keyup', onKeyUp);
      addEventListener('resize', fit);
      choose(kind);
      last = performance.now();
      raf = requestAnimationFrame(frame);
    },
    close,
    pause,
    isOpen: () => !root.hidden,
  };
}

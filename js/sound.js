// 연필, 장작불, 카페 웅성임은 녹음 파일을 쓰고, 나머지 소리는 Web Audio로 합성한다.
const PENCIL_URL = new URL('../audio/pencil.wav', import.meta.url);
const FILE_BEDS = {
  fire: new URL('../audio/fire.flac', import.meta.url),
  cafe: new URL('../audio/cafe.flac', import.meta.url),
};
const CLIP_RATE = 44100;
const rand = (a, b) => a + Math.random() * (b - a);

// 합친 소리가 커질 때만 부드럽게 눌러 찌그러짐을 막는다. 0.85 아래의 소리는 전혀 바꾸지 않는다.
const SAFE_RANGE = 4;
function safetyCurve() {
  const size = 65537;
  const curve = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    const v = ((i / (size - 1)) * 2 - 1) * SAFE_RANGE;
    const over = Math.abs(v) - 0.85;
    curve[i] = over <= 0 ? v : Math.sign(v) * (0.85 + 0.14 * Math.tanh(over / 0.14));
  }
  return curve;
}

export const BEDS = { air: '잔잔한 바람', cafe: '카페 웅성임', fire: '장작불', off: '끄기' };

// 효과음의 가장 큰 순간이 백색소음 평소 크기의 이 비율을 넘지 않는다 (슬라이더 최대일 때).
const EFFECT_CEILING = 0.7;
// 책장 소리는 매번 합성하므로, 40번 재서 가장 컸던 0.14에 여유를 둔 값을 쓴다. 크기는 0.1초 단위로 잰다.
const PAGE_LOUDEST = 0.2;
// 백색소음을 꺼 둔 채 ‘듣기’를 누를 때 기준으로 삼는 작은 크기.
const PREVIEW_BED = 0.012;

// 평소 크기: 가끔 터지는 큰 소리에 끌려가지 않도록 0.1초 단위 크기의 중앙값을 쓴다.
const typicalOf = (buffer) => {
  const win = Math.floor(buffer.sampleRate * 0.1);
  const sizes = [];
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    for (let start = 0; start + win <= d.length; start += win) {
      let sum = 0;
      for (let i = start; i < start + win; i++) sum += d[i] * d[i];
      sizes.push(Math.sqrt(sum / win));
    }
  }
  sizes.sort((a, b) => a - b);
  return sizes[sizes.length >> 1];
};

const loudestOf = (buffer) => {
  const win = Math.floor(buffer.sampleRate * 0.1);
  let loudest = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    for (let start = 0; start + win <= d.length; start += Math.floor(win / 4)) {
      let sum = 0;
      for (let i = start; i < start + win; i++) sum += d[i] * d[i];
      loudest = Math.max(loudest, Math.sqrt(sum / win));
    }
  }
  return loudest;
};

export class Sound {
  constructor(prefs) {
    this.levels = { noise: 0.4, pencil: 1, page: 1, ...prefs?.levels };
    this.muted = !!prefs?.muted;
    this.bed = BEDS[prefs?.bed] ? prefs.bed : 'fire';
    this.fileBeds = {};
    this.bedTypical = {};
    this.timers = {};
  }

  prefs() {
    return { levels: this.levels, muted: this.muted, bed: this.bed };
  }

  start() {
    if (this.ctx) {
      this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    // 녹음 파일과 같은 빠르기로 돌려 파일을 변환할 때 생기는 차이를 없앤다.
    let ctx;
    try {
      ctx = new Ctx({ sampleRate: CLIP_RATE });
    } catch {
      ctx = new Ctx();
    }
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = this.muted ? 0 : 1;
    this.out.connect(ctx.destination);

    // 녹음 파일은 압축기와 잔향을 거치지 않고 clean으로 바로 나간다.
    this.clean = ctx.createGain();
    this.clean.gain.value = 1 / SAFE_RANGE;
    this.safety = ctx.createWaveShaper();
    this.safety.curve = safetyCurve();
    this.clean.connect(this.safety).connect(this.out);

    this.master = ctx.createGain();
    const limiter = ctx.createDynamicsCompressor();
    this.master.connect(limiter).connect(this.clean);

    this.pencilClip = this.loadClip(PENCIL_URL).then((clip) => {
      if (clip) this.pencilLoudest = loudestOf(clip);
      return clip;
    });
    this.noiseBuf = this.makeNoise(4, false);
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.makeImpulse(1.5);
    const wet = ctx.createGain();
    wet.gain.value = 0.28;
    this.reverb.connect(wet).connect(this.master);

    this.noiseGain = ctx.createGain();
    this.noiseGain.gain.value = this.levels.noise * 0.6;
    this.noiseGain.connect(this.master);
    this.fileNoiseGain = ctx.createGain();
    this.fileNoiseGain.gain.value = this.levels.noise * 4;
    this.fileNoiseGain.connect(this.clean);
    this.setBed(this.bed);

    // 효과음은 5~10분 간격으로 불규칙하게 하나씩 나온다.
    this.loop('effect', () => rand(300, 600), () => {
      if (this.bedLoudness() > 0) this[Math.random() < 0.5 ? 'pencil' : 'page']();
    });
  }

  loadClip(url) {
    return fetch(url)
      .then((res) => res.arrayBuffer())
      .then((data) => this.ctx.decodeAudioData(data))
      .catch((err) => {
        console.warn('소리 파일을 불러오지 못했습니다', url.pathname, err);
        return null;
      });
  }

  loop(name, delay, fire) {
    const tick = () => {
      try {
        fire();
      } catch {
        /* 소리 하나가 실패해도 다음 예약은 유지한다 */
      }
      this.timers[name] = setTimeout(tick, delay() * 1000);
    };
    this.timers[name] = setTimeout(tick, delay() * 1000);
  }

  setLevel(name, value) {
    this.levels[name] = value;
    if (name === 'noise') this.applyNoiseLevel(0.1);
    this.refreshEffect();
  }

  // 지금 들리는 백색소음의 평소 크기. 들리지 않으면 0이다.
  bedLoudness() {
    if (!this.bedVoice) return 0;
    const level = this.levels.noise * (this.ducked ? 0.5 : 1);
    return FILE_BEDS[this.bed] ? this.bedTypical[this.bed] * 4 * level : 0.15 * 0.6 * level;
  }

  // 슬라이더는 ‘백색소음보다 작은 범위’ 안에서의 비율이다. 그래서 어떻게 움직여도 백색소음을 넘지 않는다.
  effectLevel(name, preview) {
    const loudest = name === 'pencil' ? this.pencilLoudest : PAGE_LOUDEST;
    const bed = this.bedLoudness() || (preview ? PREVIEW_BED : 0);
    return (this.levels[name] * EFFECT_CEILING * bed) / loudest;
  }

  effectOutput(name, preview) {
    const gain = this.ctx.createGain();
    gain.gain.value = this.effectLevel(name, preview);
    gain.connect(this.clean);
    this.effectVoice = { name, preview, gain };
    return gain;
  }

  // 효과음이 나오는 도중에 백색소음을 줄이거나 꺼도 곧바로 함께 줄어든다.
  refreshEffect() {
    const voice = this.effectVoice;
    if (voice) voice.gain.gain.setTargetAtTime(this.effectLevel(voice.name, voice.preview), this.ctx.currentTime, 0.02);
  }

  // 쉬는 시간에는 배경 소리를 절반으로 줄인다.
  setDuck(on) {
    this.ducked = on;
    this.applyNoiseLevel(0.8);
  }

  applyNoiseLevel(smooth) {
    if (!this.noiseGain) return;
    const duck = this.ducked ? 0.5 : 1;
    this.noiseGain.gain.setTargetAtTime(this.levels.noise * 0.6 * duck, this.ctx.currentTime, smooth);
    this.fileNoiseGain.gain.setTargetAtTime(this.levels.noise * 4 * duck, this.ctx.currentTime, smooth);
    this.refreshEffect();
  }

  // 배경 소리를 끊김 없이 겹쳐 가며 바꾼다.
  setBed(type) {
    if (!BEDS[type]) return;
    this.bed = type;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (this.bedVoice) {
      this.bedVoice.gain.gain.setTargetAtTime(0, t, 0.2);
      this.bedVoice.src.stop(t + 1.2);
      this.bedVoice = null;
      this.refreshEffect();
    }
    if (type === 'off') return;
    if (FILE_BEDS[type]) {
      this.fileBeds[type] ||= this.loadClip(FILE_BEDS[type]).then((clip) => {
        if (clip) this.bedTypical[type] = typicalOf(clip);
        return clip;
      });
      this.fileBeds[type].then((clip) => {
        // 파일을 받는 동안 다른 소리를 골랐으면 틀지 않는다.
        if (clip && this.bed === type && !this.bedVoice) this.playBed(clip, this.fileNoiseGain, clip.duration);
      });
      return;
    }
    this.airBuffer ||= this.bakeAir();
    this.playBed(this.airBuffer, this.noiseGain, this.airBuffer.duration - 0.25);
  }

  playBed(buffer, target, loopEnd) {
    const { ctx } = this;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.loopEnd = loopEnd;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.setTargetAtTime(1, t, 0.3);
    src.connect(gain).connect(target);
    src.start();
    this.bedVoice = { src, gain };
    this.refreshEffect();
  }

  // 잔잔한 바람: 공조기처럼 살짝 먹먹한 분홍빛 잡음
  bakeAir() {
    const { sampleRate: sr } = this.ctx;
    const buf = this.ctx.createBuffer(2, Math.floor(sr * 6), sr);
    const L = buf.getChannelData(0);
    const R = buf.getChannelData(1);
    const k = 1 - Math.exp((-2 * Math.PI * 6000) / sr);
    for (const d of [L, R]) {
      let b0 = 0;
      let b1 = 0;
      let b2 = 0;
      let lp = 0;
      for (let i = 0; i < d.length; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.99765 * b0 + w * 0.099046;
        b1 = 0.963 * b1 + w * 0.2965164;
        b2 = 0.57 * b2 + w * 1.0526913;
        lp += k * (b0 + b1 + b2 + w * 0.1848 - lp);
        d[i] = lp;
      }
    }

    // 반복 지점이 들리지 않게 끝부분을 시작에 겹치고 크기를 맞춘다.
    const fade = Math.floor(sr * 0.25);
    let sum = 0;
    let peak = 0;
    for (const d of [L, R]) {
      for (let i = 0; i < fade; i++) {
        const a = i / fade;
        d[i] = d[i] * a + d[d.length - fade + i] * (1 - a);
      }
      for (let i = 0; i < d.length - fade; i++) {
        sum += d[i] * d[i];
        peak = Math.max(peak, Math.abs(d[i]));
      }
    }
    const rms = Math.sqrt(sum / (2 * (L.length - fade)));
    const norm = Math.min(0.15 / rms, 0.95 / peak);
    for (const d of [L, R]) for (let i = 0; i < d.length; i++) d[i] *= norm;
    return buf;
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.out) this.out.gain.setTargetAtTime(muted ? 0 : 1, this.ctx.currentTime, 0.05);
  }

  makeNoise(seconds, pink) {
    const { sampleRate } = this.ctx;
    const buf = this.ctx.createBuffer(1, sampleRate * seconds, sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      if (pink) {
        b0 = 0.99765 * b0 + w * 0.099046;
        b1 = 0.963 * b1 + w * 0.2965164;
        b2 = 0.57 * b2 + w * 1.0526913;
        d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.11;
      } else {
        d[i] = w;
      }
    }
    // 반복 지점에서 잡음이 튀지 않도록 앞뒤를 겹친다.
    if (pink) {
      const fade = Math.floor(sampleRate * 0.05);
      for (let i = 0; i < fade; i++) {
        const a = i / fade;
        d[i] = d[i] * a + d[d.length - fade + i] * (1 - a);
      }
    }
    return buf;
  }

  makeImpulse(seconds) {
    const { sampleRate } = this.ctx;
    const buf = this.ctx.createBuffer(2, sampleRate * seconds, sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < d.length; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3.2);
      }
    }
    return buf;
  }

  noiseSource(at, duration) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    s.start(at, Math.random() * 3, duration + 0.05);
    return s;
  }

  output(level, pan, send = 0.2) {
    const { ctx } = this;
    const g = ctx.createGain();
    g.gain.value = level;
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    const dry = g.connect(p);
    dry.connect(this.master);
    const s = ctx.createGain();
    s.gain.value = send;
    dry.connect(s).connect(this.reverb);
    return g;
  }

  // 연필: 녹음 파일을 빠르기나 음색을 바꾸지 않고 그대로 튼다.
  async pencil(preview = false) {
    if (!this.ctx) return;
    const clip = await this.pencilClip;
    if (!clip) return;
    const { ctx } = this;
    if (this.pencilSrc) {
      this.effectVoice?.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.005);
      this.pencilSrc.stop(ctx.currentTime + 0.04);
    }
    const src = ctx.createBufferSource();
    src.buffer = clip;
    src.connect(this.effectOutput('pencil', preview));
    src.start();
    this.pencilSrc = src;
  }

  // 책장: 종이가 넘어가는 바스락 + 내려앉는 소리
  page(preview = false) {
    if (!this.ctx) return;
    const { ctx } = this;
    const out = this.effectOutput('page', preview);
    const t = ctx.currentTime + 0.02;
    const dur = rand(0.32, 0.5);
    const src = this.noiseSource(t, dur);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 0.65;
    bp.frequency.setValueAtTime(1000, t);
    bp.frequency.exponentialRampToValueAtTime(4300, t + dur * 0.6);
    bp.frequency.exponentialRampToValueAtTime(1700, t + dur);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    const flutter = 10;
    for (let i = 1; i <= flutter; i++) {
      const at = t + (dur * i) / flutter;
      const shape = Math.sin((i / flutter) * Math.PI);
      env.gain.linearRampToValueAtTime(Math.max(0.001, shape * rand(0.2, 0.55)), at);
    }
    src.connect(bp).connect(env).connect(out);

    const thumpAt = t + dur - 0.02;
    const thump = this.noiseSource(thumpAt, 0.09);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    const te = ctx.createGain();
    te.gain.setValueAtTime(0.5, thumpAt);
    te.gain.exponentialRampToValueAtTime(0.0001, thumpAt + 0.09);
    thump.connect(lp).connect(te).connect(out);
  }

  // 타이머 종료 종: times번 울린다
  bell(times = 1) {
    if (!this.ctx) return;
    const { ctx } = this;
    const out = this.output(0.35, 0, 0.5);
    for (let n = 0; n < times; n++) {
      const t = ctx.currentTime + 0.02 + n * 0.85;
      [[880, 1.8], [1320, 1.1], [2217, 0.6]].forEach(([freq, dur], i) => {
        const o = ctx.createOscillator();
        o.frequency.value = freq;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.5 / (i + 1), t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g).connect(out);
        o.start(t);
        o.stop(t + dur + 0.05);
      });
    }
  }
}

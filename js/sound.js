// 연필 소리만 녹음 파일을 쓰고, 나머지 소리는 Web Audio로 합성한다.
const PENCIL_URL = new URL('../audio/pencil.wav', import.meta.url);
const rand = (a, b) => a + Math.random() * (b - a);

export const BEDS = { air: '잔잔한 바람', rain: '빗소리', cafe: '카페 웅성임', fire: '장작불', off: '끄기' };

export class Sound {
  constructor(prefs) {
    this.levels = { noise: 0.4, pencil: 0.7, page: 0.7, cough: 0.4, ...prefs?.levels };
    this.muted = !!prefs?.muted;
    this.bed = BEDS[prefs?.bed] ? prefs.bed : 'air';
    this.bedBuffers = {};
    this.activity = { meStudying: false, othersStudying: 0, others: 0 };
    this.timers = [];
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
    const ctx = (this.ctx = new Ctx());
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 1;
    const limiter = ctx.createDynamicsCompressor();
    this.master.connect(limiter).connect(ctx.destination);

    this.pencilClip = fetch(PENCIL_URL)
      .then((res) => res.arrayBuffer())
      .then((data) => ctx.decodeAudioData(data))
      .catch((err) => {
        console.warn('연필 소리를 불러오지 못했습니다', err);
        return null;
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
    this.setBed(this.bed);

    this.loop('pencil', () => this.pencilDelay(), () => {
      if (this.activity.meStudying) this.pencil(1, 0);
      else if (this.activity.othersStudying > 0) this.pencil(0.42, rand(-0.8, 0.8));
    });
    this.loop('page', () => this.pageDelay(), () => {
      if (this.activity.meStudying) this.page(1, rand(-0.1, 0.1));
      else if (this.activity.othersStudying > 0) this.page(0.45, rand(-0.8, 0.8));
    });
    this.loop('cough', () => rand(70, 190), () => {
      if (this.activity.others > 0) this.cough(rand(0.7, 1), rand(-0.9, 0.9));
    }, rand(25, 50));
  }

  // 5초짜리 녹음이 겹치지 않도록 간격을 둔다.
  pencilDelay() {
    return this.activity.meStudying ? rand(6.5, 12) : rand(14, 30);
  }

  pageDelay() {
    return this.activity.meStudying ? rand(24, 65) : rand(30, 80);
  }

  loop(name, delay, fire, first) {
    const tick = () => {
      try {
        fire();
      } catch {
        /* 소리 하나가 실패해도 다음 예약은 유지한다 */
      }
      this.timers[name] = setTimeout(tick, delay() * 1000);
    };
    this.timers[name] = setTimeout(tick, (first ?? delay()) * 1000);
  }

  setActivity(a) {
    this.activity = a;
  }

  setLevel(name, value) {
    this.levels[name] = value;
    if (name === 'noise') this.applyNoiseLevel(0.1);
  }

  // 쉬는 시간에는 배경 소리를 절반으로 줄인다.
  setDuck(on) {
    this.ducked = on;
    this.applyNoiseLevel(0.8);
  }

  applyNoiseLevel(smooth) {
    if (!this.noiseGain) return;
    const level = this.levels.noise * 0.6 * (this.ducked ? 0.5 : 1);
    this.noiseGain.gain.setTargetAtTime(level, this.ctx.currentTime, smooth);
  }

  // 배경 소리를 끊김 없이 겹쳐 가며 바꾼다.
  setBed(type) {
    if (!BEDS[type]) return;
    this.bed = type;
    if (!this.ctx) return;
    const { ctx } = this;
    const t = ctx.currentTime;
    if (this.bedVoice) {
      this.bedVoice.gain.gain.setTargetAtTime(0, t, 0.2);
      this.bedVoice.src.stop(t + 1.2);
      this.bedVoice = null;
    }
    if (type === 'off') return;
    const src = ctx.createBufferSource();
    src.buffer = this.bedBuffers[type] ||= this.bakeBed(type);
    src.loop = true;
    src.loopEnd = src.buffer.duration - 0.25;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.setTargetAtTime(1, t, 0.3);
    src.connect(gain).connect(this.noiseGain);
    src.start();
    this.bedVoice = { src, gain };
  }

  bakeBed(type) {
    const { sampleRate: sr } = this.ctx;
    const seconds = { air: 6, rain: 8, cafe: 12, fire: 10 }[type];
    const buf = this.ctx.createBuffer(2, Math.floor(sr * seconds), sr);
    const L = buf.getChannelData(0);
    const R = buf.getChannelData(1);
    if (type === 'air') this.bakeAir(L, sr, R);
    else if (type === 'rain') this.bakeRain(L, R, sr, seconds);
    else if (type === 'fire') this.bakeFire(L, R, sr, seconds);
    else this.bakeCafe(L, R, sr, seconds);

    // 반복 지점이 들리지 않게 끝부분을 시작에 겹치고, 세 소리의 크기를 맞춘다.
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

  // 잔잔한 바람: 공조기처럼 살짝 먹먹한 분홍빛 잡음
  bakeAir(L, sr, R) {
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
  }

  // 빗소리: 쏴아 하는 고음, 낮은 울림, 흩어지는 빗방울
  bakeRain(L, R, sr, seconds) {
    const kHigh = 1 - Math.exp((-2 * Math.PI * 900) / sr);
    const kLow = 1 - Math.exp((-2 * Math.PI * 320) / sr);
    for (const d of [L, R]) {
      let hp = 0;
      let low = 0;
      for (let i = 0; i < d.length; i++) {
        const w = Math.random() * 2 - 1;
        hp += kHigh * (w - hp);
        low += kLow * (w - low);
        d[i] = (w - hp) * 0.34 + low * 0.9;
      }
      const drops = Math.floor(seconds * 70);
      for (let n = 0; n < drops; n++) {
        const start = Math.floor(Math.random() * (d.length - sr * 0.05));
        const freq = rand(1500, 5200);
        const decay = rand(0.006, 0.024);
        const amp = Math.pow(Math.random(), 3) * 0.9;
        const len = Math.floor(decay * 4 * sr);
        for (let i = 0; i < len; i++) {
          const time = i / sr;
          d[start + i] += Math.sin(2 * Math.PI * freq * time) * Math.exp(-time / decay) * amp;
        }
      }
    }
  }

  // 장작불: 낮게 타오르는 울림과 타닥거리는 소리
  bakeFire(L, R, sr, seconds) {
    const kLow = 1 - Math.exp((-2 * Math.PI * 170) / sr);
    const kAir = 1 - Math.exp((-2 * Math.PI * 1400) / sr);
    for (const d of [L, R]) {
      let low = 0;
      let air = 0;
      let flicker = 0.7;
      for (let i = 0; i < d.length; i++) {
        const w = Math.random() * 2 - 1;
        low += kLow * (w - low);
        air += kAir * (w - air);
        if (i % 2000 === 0) flicker = Math.max(0.45, Math.min(1, flicker + (Math.random() - 0.5) * 0.18));
        d[i] = low * 2.6 * flicker + air * 0.09;
      }
    }
    const pops = Math.floor(seconds * 24);
    for (let n = 0; n < pops; n++) {
      const start = Math.floor(Math.random() * (L.length - sr * 0.05));
      const big = Math.random() < 0.1;
      const decay = big ? rand(0.006, 0.016) : rand(0.0008, 0.004);
      const amp = big ? rand(0.5, 1) : Math.pow(Math.random(), 2) * 0.55;
      const pan = Math.random();
      const len = Math.floor(decay * 5 * sr);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const raw = Math.random() * 2 - 1;
        lp += 0.5 * (raw - lp);
        const v = (raw - lp) * Math.exp(-i / sr / decay) * amp;
        L[start + i] += v * (1 - pan);
        R[start + i] += v * pan;
      }
    }
  }

  // 카페 웅성임: 알아들을 수 없는 여러 사람의 말소리와 가끔 나는 잔 소리
  bakeCafe(L, R, sr, seconds) {
    const room = 1 - Math.exp((-2 * Math.PI * 500) / sr);
    const talkers = 8;
    for (let n = 0; n < talkers; n++) {
      const pan = rand(0.15, 0.85);
      const pitch = rand(100, 235);
      let phase = 0;
      let low = 0;
      let band = 0;
      let env = 0;
      let target = 0;
      let nextChange = 0;
      let center = 600;
      const envK = 1 - Math.exp(-1 / (0.03 * sr));
      for (let i = 0; i < L.length; i++) {
        if (i >= nextChange) {
          const speaking = target === 0;
          const pause = !speaking ? false : Math.random() < 0.12;
          target = speaking && !pause ? rand(0.5, 1) : 0;
          center = rand(380, 1250);
          const hold = pause ? rand(0.5, 2) : speaking ? rand(0.09, 0.28) : rand(0.04, 0.15);
          nextChange = i + Math.floor(hold * sr);
        }
        env += envK * (target - env);
        phase = (phase + pitch / sr) % 1;
        const source = (phase * 2 - 1) * 0.7 + (Math.random() * 2 - 1) * 0.3;
        const f = 2 * Math.sin((Math.PI * center) / sr);
        low += f * band;
        const high = source - low - 0.45 * band;
        band += f * high;
        const v = band * env;
        L[i] += v * (1 - pan);
        R[i] += v * pan;
      }
    }
    for (const d of [L, R]) {
      let lp = 0;
      for (let i = 0; i < d.length; i++) {
        lp += room * (d[i] - lp);
        d[i] = lp * 0.75 + d[i] * 0.25 + (Math.random() * 2 - 1) * 0.012;
      }
    }
    const clinks = Math.floor(seconds * 0.5);
    for (let n = 0; n < clinks; n++) {
      const start = Math.floor(Math.random() * (L.length - sr * 0.5));
      const freq = rand(2400, 4300);
      const amp = rand(0.03, 0.09);
      const pan = Math.random();
      const decay = rand(0.05, 0.13);
      const len = Math.floor(decay * 4 * sr);
      for (let i = 0; i < len; i++) {
        const time = i / sr;
        const v = (Math.sin(2 * Math.PI * freq * time) + 0.5 * Math.sin(2 * Math.PI * freq * 1.52 * time)) * Math.exp(-time / decay) * amp;
        L[start + i] += v * (1 - pan);
        R[start + i] += v * pan;
      }
    }
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.setTargetAtTime(muted ? 0 : 1, this.ctx.currentTime, 0.05);
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

  // 연필: 녹음한 사각거림. 똑같이 들리지 않도록 빠르기를 조금씩 바꾼다.
  async pencil(amount = 1, pan = 0) {
    if (!this.ctx) return;
    const clip = await this.pencilClip;
    if (!clip) return;
    this.pencilVoice?.stop();
    const src = this.ctx.createBufferSource();
    src.buffer = clip;
    src.playbackRate.value = rand(0.95, 1.05);
    src.connect(this.output(this.levels.pencil * amount * 2.5, pan, 0.08));
    src.start();
    this.pencilVoice = src;
  }

  // 책장: 종이가 넘어가는 바스락 + 내려앉는 소리
  page(amount = 1, pan = 0) {
    if (!this.ctx) return;
    const { ctx } = this;
    const out = this.output(this.levels.page * amount * 0.65, pan, 0.2);
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

  // 기침: 멀리 앉은 사람의 작은 기침 2~3번
  cough(amount = 1, pan = 0) {
    if (!this.ctx) return;
    const { ctx } = this;
    const out = this.output(this.levels.cough * amount * 0.65, pan, 0.75);
    const room = ctx.createBiquadFilter();
    room.type = 'lowpass';
    room.frequency.value = 3200;
    room.connect(out);
    const count = 2 + (Math.random() < 0.35 ? 1 : 0);
    const pitch = rand(105, 165);
    let t = ctx.currentTime + 0.02;
    for (let i = 0; i < count; i++) {
      const dur = rand(0.14, 0.24);
      const amp = (i === 0 ? 1 : rand(0.55, 0.8));
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, t);
      env.gain.exponentialRampToValueAtTime(amp, t + 0.014);
      env.gain.exponentialRampToValueAtTime(amp * 0.35, t + dur * 0.45);
      env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      env.connect(room);

      const src = this.noiseSource(t, dur);
      for (const [freq, q, gain] of [[620, 1.3, 1], [1450, 2, 0.75], [2500, 2.5, 0.4]]) {
        const f = ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.value = freq * rand(0.94, 1.06);
        f.Q.value = q;
        const g = ctx.createGain();
        g.gain.value = gain;
        src.connect(f).connect(g).connect(env);
      }

      const voice = ctx.createOscillator();
      voice.type = 'sawtooth';
      voice.frequency.setValueAtTime(pitch, t);
      voice.frequency.exponentialRampToValueAtTime(pitch * 0.68, t + dur);
      const vg = ctx.createGain();
      vg.gain.value = 0.2;
      const vf = ctx.createBiquadFilter();
      vf.type = 'lowpass';
      vf.frequency.value = 850;
      voice.connect(vf).connect(vg).connect(env);
      voice.start(t);
      voice.stop(t + dur + 0.02);
      t += dur + rand(0.07, 0.15);
    }
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

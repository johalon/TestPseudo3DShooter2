// BGM：素材がないので Web Audio でその場で合成する簡易シーケンサー
// ベース・アルペジオ・キック・スネア・ハイハットの4パート。16分音符単位で先読みしてスケジュールする
import { sfx } from './audio.js';

const MINOR = [0, 2, 3, 5, 7, 8, 10];
// root: MIDIノート番号 / prog: 1小節ごとのコード（音階の度数） / kick: 16分のどこで鳴らすか
const TRACKS = {
  title:  { bpm: 96,  root: 57, prog: [0, 5, 3, 6], kick: [0, 8],        bass: [0, null, null, 0, null, null, 0, null, 0, null, null, 0, null, 7, null, null], arpVol: 0.05, soft: true },
  s1:     { bpm: 128, root: 50, prog: [0, 5, 3, 6], kick: [0, 4, 8, 12], bass: [0, null, 0, 7, 0, null, 0, 12, 0, null, 0, 7, 0, null, 10, 12], arpVol: 0.045 },
  s2:     { bpm: 120, root: 52, prog: [0, 3, 5, 4], kick: [0, 6, 8, 14],  bass: [0, null, 0, null, 3, null, 0, null, 0, null, 7, null, 5, null, 3, null], arpVol: 0.04 },
  s3:     { bpm: 110, root: 54, prog: [0, 5, 2, 6], kick: [0, 10],        bass: [0, null, null, null, 7, null, null, null, 0, null, null, null, 10, null, 7, null], arpVol: 0.06, soft: true },
  s4:     { bpm: 136, root: 48, prog: [0, 6, 5, 4], kick: [0, 4, 8, 12], bass: [0, 0, 12, 0, 0, 12, 0, 0, 0, 0, 12, 0, 10, 0, 7, 0], arpVol: 0.04 },
  s5:     { bpm: 132, root: 55, prog: [0, 3, 6, 4], kick: [0, 4, 8, 12], bass: [0, null, 12, null, 0, null, 12, 0, null, 0, 12, null, 0, 10, 7, 5], arpVol: 0.045 },
  s6:     { bpm: 144, root: 45, prog: [0, 1, 5, 4], kick: [0, 3, 6, 8, 11, 14], bass: [0, 0, 0, 12, 0, 0, 1, 0, 0, 0, 0, 12, 0, 13, 12, 10], arpVol: 0.04 },
  boss:   { bpm: 152, root: 47, prog: [0, 0, 5, 6], kick: [0, 4, 8, 10, 12], bass: [0, 12, 0, 12, 0, 12, 0, 13, 0, 12, 0, 12, 10, 12, 7, 5], arpVol: 0.05 },
};

const midi = m => 440 * Math.pow(2, (m - 69) / 12);

export const bgm = {
  on: true, want: null, cur: null, timer: null, nextT: 0, step: 0, out: null, noise: null,

  play(name) { this.want = name; if (!this.timer) this.timer = setInterval(() => this.tick(), 25); },
  stop() { this.want = null; },
  setOn(v) { this.on = v; if (this.out) this.out.gain.value = v ? 0.28 : 0; },

  ensure() {
    const c = sfx.ctx;
    if (!c) return null;
    if (!this.out) {
      this.out = c.createGain(); this.out.gain.value = this.on ? 0.28 : 0; this.out.connect(c.destination);
      const n = c.createBuffer(1, c.sampleRate * 0.3, c.sampleRate), d = n.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.noise = n;
    }
    return c;
  },

  tick() {
    const c = this.ensure();
    if (!c || c.state !== 'running') return;
    if (this.want !== this.cur) { this.cur = this.want; this.step = 0; this.nextT = c.currentTime + 0.08; }
    if (!this.cur) return;
    const tr = TRACKS[this.cur], sd = 60 / tr.bpm / 4;
    if (this.nextT < c.currentTime - 0.3) this.nextT = c.currentTime + 0.05; // 復帰直後に溜まった分は捨てる
    while (this.nextT < c.currentTime + 0.15) {
      this.note(c, tr, this.step, this.nextT, sd);
      this.nextT += sd; this.step++;
    }
  },

  note(c, tr, step, t, sd) {
    const s = step % 16, bar = Math.floor(step / 16) % tr.prog.length;
    const deg = tr.prog[bar];
    const chordRoot = tr.root + MINOR[deg % 7] + (deg >= 7 ? 12 : 0);
    // ドラム
    if (tr.kick.includes(s)) this.kick(c, t, tr.soft ? 0.5 : 0.9);
    if (!tr.soft && (s === 4 || s === 12)) this.hit(c, t, 0.35, 1800, 0.12);
    if (s % 4 === 2) this.hit(c, t, tr.soft ? 0.06 : 0.12, 8000, 0.04);
    // ベース
    const b = tr.bass[s];
    if (b !== null) this.tone(c, 'sawtooth', midi(chordRoot - 12 + b), t, sd * 0.9, 0.16, 900);
    // アルペジオ（コードの構成音を上下）
    const tones = [0, 2, 4, 7].map(k => {
      const d = deg + (k === 7 ? 7 : k); return tr.root + 12 + MINOR[d % 7] + Math.floor(d / 7) * 12;
    });
    const order = [0, 1, 2, 3, 2, 1];
    this.tone(c, 'square', midi(tones[order[step % order.length]]), t, sd * 0.7, tr.arpVol, 3000);
  },

  tone(c, type, f, t, dur, vol, cutoff) {
    const o = c.createOscillator(), g = c.createGain(), fl = c.createBiquadFilter();
    o.type = type; o.frequency.value = f;
    fl.type = 'lowpass'; fl.frequency.value = cutoff;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(fl); fl.connect(g); g.connect(this.out);
    o.start(t); o.stop(t + dur + 0.02);
  },
  kick(c, t, vol) {
    const o = c.createOscillator(), g = c.createGain();
    o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    o.connect(g); g.connect(this.out); o.start(t); o.stop(t + 0.2);
  },
  hit(c, t, vol, freq, dur) {
    const s = c.createBufferSource(), g = c.createGain(), f = c.createBiquadFilter();
    s.buffer = this.noise; f.type = freq > 5000 ? 'highpass' : 'bandpass'; f.frequency.value = freq;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.out); s.start(t); s.stop(t + dur + 0.02);
  },
};

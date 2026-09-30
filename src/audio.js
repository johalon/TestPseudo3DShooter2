// 効果音（Web Audio）。iOS/Android とも最初のタップで unlock() を呼ぶ必要がある。
const NAMES = ['shot', 'laser', 'lock', 'explode', 'bigexplode', 'boom', 'hit',
  'charge', 'item', 'damage', 'shield', 'lose', 'zap'];

export const sfx = {
  ctx: null, buf: {}, last: {}, master: null, muted: false,

  async unlock() {
    if (this.ctx) { if (this.ctx.state !== 'running') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.6;
    this.master.connect(this.ctx.destination);
    // 無音を1回鳴らして iOS のロックを解除
    const b = this.ctx.createBuffer(1, 1, 22050), s = this.ctx.createBufferSource();
    s.buffer = b; s.connect(this.master); s.start(0);
    await Promise.all(NAMES.map(async n => {
      try {
        const r = await fetch(`assets/sfx/${n}.mp3`);
        const a = await r.arrayBuffer();
        this.buf[n] = await new Promise((ok, ng) => this.ctx.decodeAudioData(a, ok, ng));
      } catch (_) { /* 読めなくてもゲームは続行 */ }
    }));
  },

  play(name, vol = 1, rate = 1) {
    const c = this.ctx, b = this.buf[name];
    if (!c || !b || this.muted) return;
    const now = c.currentTime;
    if (this.last[name] && now - this.last[name] < 0.035) return; // 同音の連打を間引く
    this.last[name] = now;
    const s = c.createBufferSource(), g = c.createGain();
    s.buffer = b; s.playbackRate.value = rate; g.gain.value = vol;
    s.connect(g); g.connect(this.master); s.start(now);
  },

  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); },
  resume() { if (this.ctx && this.ctx.state !== 'running') this.ctx.resume(); },
};

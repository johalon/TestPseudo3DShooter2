// ゲーム本体：擬似3D投影、自機、敵、弾、ロックオン、スコア、ボス、ステージ進行
import { W, H } from './view.js';
import { drawSpr, drawGlow, glow } from './assets.js';
import { sfx } from './audio.js';
import { input } from './input.js';
import { STAGES, BOSSES } from './stage.js';
import { SHIPS } from './ships.js';

// ---- 投影パラメータ ----
export const F = 300, VPX = 180, VPY = 250, ZP = 3, ZFAR = 40;
const XR = 2.2, YMIN = -1.6, YMAX = 1.1;   // 自機の移動範囲
const CAMF = 0.3;                           // カメラが自機を追う割合
const SENS = 1.35;                          // ドラッグ感度
const SHOT_SPEED = 46;

const ETYPES = {
  fighter:  { spr: 'enemyRed1',        size: 0.8,  hp: 1,  score: 100,  r: 0.42 },
  fighter2: { spr: 'enemyGreen2',      size: 0.8,  hp: 2,  score: 150,  r: 0.42 },
  shooter:  { spr: 'enemyBlack1',      size: 0.9,  hp: 4,  score: 300,  r: 0.48, fire: 1.5 },
  heavy:    { spr: 'enemyGreen4',      size: 1.0,  hp: 8,  score: 600,  r: 0.52, fire: 2.0, fan: 3 },
  sniper:   { spr: 'enemyBlack3',      size: 0.85, hp: 4,  score: 400,  r: 0.46, fire: 1.8, fast: 1.7 },
  dasher:   { spr: 'enemyBlue4',       size: 0.85, hp: 3,  score: 350,  r: 0.46 },
  missile:  { spr: 'spaceMissiles_001', size: 0.5, hp: 1,  score: 80,   r: 0.3, flip: true },
  ufo:      { spr: 'ufoGreen',         size: 0.75, hp: 5,  score: 800,  r: 0.42, drop: 'shield' },
  ufoStar:  { spr: 'ufoBlue',          size: 0.75, hp: 6,  score: 800,  r: 0.42, drop: 'star' },
  ufoS:     { spr: 'ufoRed',           size: 0.5,  hp: 1,  score: 120,  r: 0.32, spin: 3 },
  meteor:   { spr: 'meteorBrown_big1', size: 1.3,  hp: 6,  score: 60,   r: 0.62, spin: 1 },
  meteorS:  { spr: 'meteorBrown_med1', size: 0.55, hp: 2,  score: 30,   r: 0.3,  spin: 1 },
  rocket:   { spr: 'spaceRockets_002', size: 1.1,  hp: 24, score: 2000, r: 0.7, flip: true },
  mid:      { spr: 'spaceShips_004',   size: 1.9,  hp: 48, score: 3000, r: 0.9,  flip: true, fire: 1.2, fan: 3 },
};

// ================= 背景 =================
export class Backdrop {
  constructor() {
    this.stars = [];
    for (let i = 0; i < 140; i++) this.stars.push(this.newStar(Math.random() * 60 + 1));
    this.clouds = [];
    for (let i = 0; i < 7; i++) this.clouds.push(this.newCloud(Math.random() * 60 + 5));
    this.gridOff = 0;
    this.setTheme(STAGES[0].theme);
  }
  setTheme(th) {
    this.theme = th; this.skyCache = null; this.cloudImg = null;
    if (th.clouds) { // 雲は事前描画した画像を拡大して使う（毎フレームのグラデーション生成を避ける）
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const x = c.getContext('2d'), gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, th.clouds + '1)'); gr.addColorStop(1, th.clouds + '0)');
      x.fillStyle = gr; x.fillRect(0, 0, 128, 128); this.cloudImg = c;
    }
  }
  newStar(z) { return { x: (Math.random() * 2 - 1) * 14, y: (Math.random() * 2 - 1) * 10 - 2, z }; }
  newCloud(z) { return { x: (Math.random() * 2 - 1) * 9, y: (Math.random() * 2 - 1) * 5 - 1, z, s: 2 + Math.random() * 3 }; }
  update(dt, speed) {
    for (const s of this.stars) { s.z -= speed * dt; if (s.z < 0.8) Object.assign(s, this.newStar(60)); }
    for (const c of this.clouds) { c.z -= speed * dt * 0.8; if (c.z < 1.5) Object.assign(c, this.newCloud(65)); }
    this.gridOff = (this.gridOff + speed * dt) % 4;
  }
  draw(ctx, cx, cy) {
    const th = this.theme;
    if (!this.skyCache) {
      const g = ctx.createLinearGradient(0, 0, 0, H), st = [0, 0.36, 0.42, 0.5, 1];
      th.sky.forEach((c, i) => g.addColorStop(st[i], c));
      this.skyCache = g;
    }
    ctx.fillStyle = this.skyCache; ctx.fillRect(0, 0, W, H);
    // 星雲などの雲
    if (this.cloudImg) {
      for (const c of this.clouds) {
        const k = F / c.z, x = VPX + (c.x - cx * 0.5) * k, y = VPY + (c.y - cy * 0.5) * k, r = c.s * k;
        if (r > 500) continue;
        ctx.globalAlpha = Math.min(0.22, (65 - c.z) / 60 * 0.22) * Math.min(1, c.z / 6);
        ctx.drawImage(this.cloudImg, x - r, y - r, r * 2, r * 2);
      }
      ctx.globalAlpha = 1;
    }
    // 星
    ctx.fillStyle = th.star;
    for (const s of this.stars) {
      const k = F / s.z, x = VPX + (s.x - cx * 0.2) * k, y = VPY + (s.y - cy * 0.2) * k;
      if (x < -4 || x > W + 4 || y < -4 || y > H + 4) continue;
      const r = Math.min(2.6, 0.35 + 18 / s.z * 0.12);
      ctx.globalAlpha = Math.min(1, (60 - s.z) / 20);
      ctx.fillRect(x - r / 2, y - r / 2, r, r * (1 + 6 / s.z));
    }
    ctx.globalAlpha = 1;
    // 床グリッド（y = 2.6 の平面）
    const gy = 2.6 - cy, gc = th.grid;
    ctx.strokeStyle = `rgba(${gc},0.22)`; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = -14; x <= 14; x += 2) {
      const X = x - cx;
      ctx.moveTo(VPX + X * F / 1.5, VPY + gy * F / 1.5);
      ctx.lineTo(VPX + X * F / 60, VPY + gy * F / 60);
    }
    ctx.stroke();
    for (let z = 4 - this.gridOff; z < 60; z += 4) {
      if (z < 1.5) continue;
      const y = VPY + gy * F / z;
      ctx.strokeStyle = `rgba(${gc},${Math.min(0.35, 6 / z * 0.35)})`;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
  }
}

// ================= ゲーム =================
export class Game {
  constructor(opts = {}) {
    this.opts = opts;
    this.ship = SHIPS[opts.ship || 0];
    this.bg = new Backdrop();
    this.stageIdx = Math.max(0, Math.min(STAGES.length - 1, opts.stage || 0));
    this.continues = opts.continues || 0;
    this.score = 0; this.kills = 0; this.maxVolley = 0; this.hits = 0;
    this.rank = this.stageIdx * 0.7;
    this.player = { x: 0, y: 0, vx: 0, shield: this.ship.shield, inv: 0, bank: 0, alive: true };
    this.cam = { x: 0, y: -2 };
    this.over = false; this.allClear = false; this.deadT = 0;
    this.shake = 0; this.flash = 0;
    this.startStage(opts.t || 0);
  }

  get stage() { return STAGES[this.stageIdx]; }

  startStage(t0 = 0) {
    this.t = t0; this.ev = 0;
    const evs = this.stage.events;
    while (this.ev < evs.length && evs[this.ev][0] < t0) this.ev++;
    this.enemies = []; this.eBullets = []; this.shots = []; this.lasers = []; this.parts = [];
    this.items = []; this.popups = []; this.locks = []; this.timers = [];
    this.bosses = []; this.bossActive = false; this.msg = null; this.clearT = 0;
    this.shotT = 0; this.lockT = 0; this.shotSide = 1; this.stageHits = 0;
    this.rank = Math.max(this.rank, this.stageIdx * 0.7);
    this.bg.setTheme(this.stage.theme);
    if (t0 > 0 && t0 >= evs[evs.length - 1][0]) this.spawnBoss();
  }

  // ---- 投影 ----
  proj(x, y, z) {
    const k = F / z;
    return [VPX + (x - this.cam.x) * k, VPY + (y - this.cam.y) * k, k];
  }

  // ステージごとのランク上限（1面は最大3、6面で最大9.99）
  get rankCap() { return Math.min(9.99, 3 + this.stageIdx * 1.4); }
  get rankMul() { return (1 + Math.floor(this.rank) * 0.1) * this.ship.scoreMul; }
  get fireMul() { return 1 + this.rank * 0.12; }
  get bulletSpeed() { return 10.5 * (1 + this.rank * 0.05); }

  cancelLocks() { this.locks.forEach(e => e.lockN = Math.max(0, e.lockN - 1)); this.locks = []; }
  later(d, fn) { this.timers.push([this.t + d, fn]); }
  message(title, sub, dur = 2.5) { this.msg = { title, sub, t: dur }; }
  stageIntro() {
    const s = this.stage;
    this.message(`STAGE ${this.stageIdx + 1}`, `${s.name} ─ ${s.jp}`, 3);
    if (this.stageIdx === 0) this.later(3.2, () => this.message('', 'ドラッグで移動 / ショットは自動', 3));
  }
  warning() {
    this.message('WARNING', BOSSES[this.stage.boss].name + ' 接近', 3.5);
    sfx.play('charge', 0.8, 0.7);
  }

  spawn(type, x, y, z, mv) {
    const d = ETYPES[type];
    const e = { type, d, x, y, z, mv, hp: d.hp, t: 0, st: 0, fireT: d.fire ? 0.8 + Math.random() * d.fire : 0,
      lockN: 0, flash: 0, rot: Math.random() * 6, alive: true };
    if (type === 'fighter' || type === 'fighter2' || type === 'ufoS') e.fireT = 1.5 + Math.random() * 3;
    this.enemies.push(e);
    return e;
  }

  spawnBoss() {
    const def = BOSSES[this.stage.boss];
    const hpMul = 1 + this.continues * 0; // コンティニューしても体力は同じ
    def.parts.forEach((pt, i) => {
      const e = { type: 'boss', d: { spr: pt.spr, size: pt.size, r: pt.r, flip: pt.flip, score: Math.round(30000 * (this.stageIdx + 1) / def.parts.length) },
        x: pt.dx || 0, y: -0.7, z: ZFAR, hp: pt.hp * hpMul, maxHp: pt.hp * hpMul, t: 0, lockN: 0, flash: 0,
        rot: 0, spin: pt.spin || 0, alive: true, boss: def, idx: i, dx: pt.dx || 0, bt: 0, atk: i, atkT: 2 + i * 0.8 };
      this.enemies.push(e); this.bosses.push(e);
    });
    this.bossActive = true;
  }

  // ================= 更新 =================
  update(dt) {
    const p = this.player;
    this.t += dt;
    const evs = this.stage.events;
    while (this.ev < evs.length && evs[this.ev][0] <= this.t) evs[this.ev++][1](this);
    if (this.timers.length) {
      const due = this.timers.filter(tm => tm[0] <= this.t);
      this.timers = this.timers.filter(tm => tm[0] > this.t);
      due.forEach(tm => tm[1]());
    }

    if (p.alive) this.rank = Math.min(this.rankCap, this.rank + dt * 0.015);
    this.shake = Math.max(0, this.shake - dt * 3);
    this.flash = Math.max(0, this.flash - dt * 2.5);
    if (this.msg && (this.msg.t -= dt) <= 0) this.msg = null;

    // --- 自機 ---
    if (p.alive) {
      let dx, dy;
      if (this.opts.bot) [dx, dy] = this.botMove(dt);
      else { const u = (1 - CAMF) * F / ZP / (SENS * this.ship.speed); dx = input.dx / u; dy = input.dy / u; }
      const nx = Math.max(-XR, Math.min(XR, p.x + dx)), ny = Math.max(YMIN, Math.min(YMAX, p.y + dy));
      p.vx = (nx - p.x) / dt; p.x = nx; p.y = ny;
      p.bank += (Math.max(-1, Math.min(1, p.vx * 0.12)) - p.bank) * Math.min(1, dt * 10);
      p.inv = Math.max(0, p.inv - dt);
      if (this.clearT <= 0) { this.autoFire(dt); this.updateLock(dt); }
    } else {
      this.deadT += dt;
      if (this.deadT > 2.2) this.over = true;
    }
    this.cam.x = p.x * CAMF; this.cam.y = -2 + p.y * CAMF;
    this.bg.update(dt, this.clearT > 0 ? 11 + (5 - this.clearT) * 12 : 11);

    this.updateShots(dt);
    this.updateEnemies(dt);
    this.updateEnemyBullets(dt);
    this.updateLasers(dt);
    this.updateItems(dt);
    this.updateParts(dt);

    // ボス全滅 → 次のステージ
    if (this.bossActive && p.alive && this.bosses.every(b => !b.alive)) this.stageClear();
    if (this.clearT > 0) {
      this.clearT -= dt;
      if (this.clearT <= 0) {
        if (this.stageIdx >= STAGES.length - 1) { this.allClear = true; this.over = true; }
        else {
          this.stageIdx++;
          p.shield = Math.min(this.ship.shield, p.shield + this.ship.shield * 0.5);
          this.startStage(0);
        }
      }
    }
  }

  // テスト用の自動操縦：一番近い敵に寄せ、定期的に長押し→離す
  botMove(dt) {
    const p = this.player;
    let best = null, bd = 1e9;
    for (const e of this.enemies) if (e.z > ZP + 2 && e.z < 30 && e.z < bd) { bd = e.z; best = e; }
    let tx = 0, ty = 0;
    if (best) { tx = best.x; ty = best.y; }
    for (const b of this.eBullets) if (b.z < ZP + 4 && Math.hypot(b.x - p.x, b.y - p.y) < 0.5) { tx = p.x + (b.x > p.x ? -1 : 1); }
    this.botT = (this.botT || 0) + dt;
    const cyc = this.botT % 2.2;
    input.down = cyc < 1.8;
    if (cyc >= 1.8 && cyc - dt < 1.8) input.released = true;
    input.holdTime = input.down ? cyc : 0;
    return [(tx - p.x) * Math.min(1, dt * 4), (ty - p.y) * Math.min(1, dt * 4)];
  }

  // ---- 自機ショット ----
  autoFire(dt) {
    const p = this.player, s = this.ship;
    this.shotT -= dt;
    if (this.shotT > 0) return;
    this.shotT = s.interval;
    const y = p.y + 0.05, z = ZP + 0.3;
    if (s.shot === 'twin' || s.shot === 'rapid') {
      this.shotSide = -this.shotSide;
      this.addShot(p.x + this.shotSide * 0.22, y, z, true);
    } else if (s.shot === 'spread') {
      this.addShot(p.x, y, z, true);
      this.addShot(p.x - 0.2, y, z, false, -1.3);
      this.addShot(p.x + 0.2, y, z, false, 1.3);
    } else if (s.shot === 'pierce') {
      this.addShot(p.x, y, z, true, 0, true);
    } else {
      this.addShot(p.x, y, z, true);
    }
    this.shotSide2 = !this.shotSide2;
    if (this.shotSide2) sfx.play('shot', 0.16, s.shot === 'pierce' ? 0.8 : 1.1);
  }
  addShot(x, y, z, assist, vx = 0, pierce = false) {
    let vy = 0;
    if (assist) { // 弱いエイムアシスト：近くの敵に向けて弾道を少し曲げる
      let best = null, bd = 0.55;
      for (const e of this.enemies) {
        if (e.z < ZP + 1.5 || e.z > 32) continue;
        const d = Math.hypot(e.x - x, e.y - y) - e.d.r * 0.5;
        if (d < bd) { bd = d; best = e; }
      }
      if (best) { const tt = (best.z - z) / SHOT_SPEED; vx = (best.x - x) / tt; vy = (best.y - y) / tt; }
    }
    this.shots.push({ x, y, z, vx, vy, pierce, hit: pierce ? new Set() : null });
  }

  // ---- ロックオン ----
  updateLock(dt) {
    const p = this.player, s = this.ship;
    this.locks = this.locks.filter(l => l.alive);
    if (input.down && input.holdTime > 0.15) {
      this.lockT -= dt;
      if (this.lockT <= 0 && this.locks.length < s.lockMax) {
        let best = null, bz = 1e9;
        for (const e of this.enemies) {
          if (!e.alive || e.z < ZP + 1.5 || e.z > 34) continue;
          const maxN = Math.min(s.lockMax, Math.ceil(e.hp / s.laserDmg));
          if (e.lockN >= maxN) continue;
          if (Math.hypot(e.x - p.x, e.y - p.y) > s.lockR + e.d.r * 0.5) continue;
          if (e.z < bz) { bz = e.z; best = e; }
        }
        if (best) {
          best.lockN++; this.locks.push(best); this.lockT = s.lockInt;
          sfx.play('lock', 0.45, 1 + this.locks.length * 0.06);
        }
      }
    }
    if (input.released && this.locks.length) this.fireVolley();
  }

  fireVolley() {
    const p = this.player, n = this.locks.length;
    const volley = { n, kills: 0 };
    this.locks.forEach((e, i) => {
      const side = i % 2 ? 1 : -1;
      this.lasers.push({ e, volley, t: 0, dur: 0.26 + i * 0.03,
        sx: p.x, sy: p.y, sz: ZP + 0.2,
        cx: p.x + side * (0.8 + Math.random()), cy: p.y - 0.8 - Math.random(), cz: ZP + 2 + Math.random() * 2,
        tx: e.x, ty: e.y, tz: e.z, trail: [] });
    });
    this.maxVolley = Math.max(this.maxVolley, n);
    this.locks = [];
    sfx.play('laser', 0.6, 1.25 - Math.min(8, n) * 0.03);
  }

  updateShots(dt) {
    const dmg = this.ship.dmg;
    for (const s of this.shots) {
      const pz = s.z;
      s.x += s.vx * dt; s.y += s.vy * dt; s.z += SHOT_SPEED * dt;
      for (const e of this.enemies) {
        if (!e.alive || (s.hit && s.hit.has(e))) continue;
        const r = e.d.r;
        if (e.z + r * 0.8 < pz || e.z - r * 0.8 > s.z) continue;
        if (Math.hypot(e.x - s.x, e.y - s.y) < r + 0.06) {
          this.damage(e, dmg, null);
          this.spark(s.x, s.y, e.z - 0.2, glow.blue, 3);
          if (s.pierce && e.type !== 'boss') s.hit.add(e);
          else { s.dead = true; break; }
        }
      }
    }
    this.shots = this.shots.filter(s => !s.dead && s.z < ZFAR);
  }

  updateEnemies(dt) {
    const p = this.player;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      e.t += dt; e.flash = Math.max(0, e.flash - dt);
      if (e.d.spin) e.rot += dt * e.d.spin;
      if (e.boss) this.updateBoss(e, dt);
      else {
        e.mv(e, dt, this);
        const d = e.d;
        const canFire = d.fire || (this.rank >= 3 && (e.type === 'fighter' || e.type === 'fighter2' || e.type === 'ufoS'));
        if (canFire && e.z > 7 && e.z < 32 && p.alive && this.clearT <= 0) {
          e.fireT -= dt * this.fireMul;
          if (e.fireT <= 0) {
            e.fireT = d.fire || 3.2;
            this.fireAt(e, d.fan || 1, 0.75, d.fast || 1);
          }
        }
      }
      // 自機との接触
      if (p.alive && Math.abs(e.z - ZP) < 0.45 && Math.hypot(e.x - p.x, e.y - p.y) < e.d.r * 0.8 + this.ship.hitR) {
        this.hurt(30);
        if (!e.boss) this.damage(e, 5, null);
      }
      if (e.z < 1 || e.z > 95 || e.y < -7) e.alive = false; // 画面外
    }
    this.enemies = this.enemies.filter(e => e.alive);
  }

  // ---- ボス ----
  updateBoss(e, dt) {
    const def = e.boss;
    e.bt += dt;
    e.rot += dt * e.spin;
    if (!e.arrived) { e.z -= 9 * dt; if (e.z <= def.z) e.arrived = true; else return; }
    const t = e.bt, ph = this.bossPhase();
    const sgn = e.idx ? -1 : 1;
    if (def.move === 'sway') { e.x = e.dx * 0.8 + Math.sin(t * 0.5 * sgn) * (def.parts.length > 1 ? 0.7 : 1.3); e.y = -0.8 + Math.sin(t * 0.83 + e.idx) * 0.45; }
    else if (def.move === 'slow') { e.x = Math.sin(t * 0.3) * 0.8; e.y = -0.7 + Math.sin(t * 0.5) * 0.3; }
    else if (def.move === 'orbit') { e.x = Math.cos(t * 0.7) * 1.4; e.y = -0.6 + Math.sin(t * 0.7) * 0.6; }
    else if (def.move === 'charge') {
      e.x = Math.sin(t * 0.55) * 1.2; e.y = -0.8 + Math.sin(t * 0.9) * 0.4;
      e.z = def.z + Math.sin(t * 0.35) * 2.5 - (ph >= 2 ? 1.5 : 0);
    }
    if (!this.player.alive || this.clearT > 0) return;
    e.atkT -= dt * (0.8 + this.fireMul * 0.25) * (1 + ph * 0.3);
    if (e.atkT > 0) return;
    const pats = def.phases[ph];
    e.atkT = this.bossAttack(e, pats[e.atk++ % pats.length], ph);
  }
  bossPhase() {
    let hp = 0, max = 0;
    for (const b of this.bosses) { hp += Math.max(0, b.hp); max += b.maxHp; }
    const n = this.bosses[0].boss.phases.length;
    return Math.min(n - 1, Math.floor((1 - hp / max) * n));
  }
  // 攻撃を実行し、次の攻撃までの秒数を返す
  bossAttack(e, pat, ph) {
    const p = this.player, sp = this.bulletSpeed;
    switch (pat) {
      case 'fan': this.fireAt(e, 5 + ph * 2, 0.72); return 1.3;
      case 'ring': this.ring(e, 10 + ph * 3); return 1.6;
      case 'burst':
        for (let i = 0; i < 3 + ph; i++) this.later(i * 0.18, () => e.alive && this.fireAt(e, ph ? 3 : 1, 0.7));
        return 1.6;
      case 'spiral': {
        const n = 18 + ph * 6, a0 = Math.random() * 6;
        for (let i = 0; i < n; i++) this.later(i * 0.05, () => {
          if (!e.alive) return;
          const a = a0 + i * 0.55, r = 1.1;
          this.addBullet(e, p.x + Math.cos(a) * r * 0.9, p.y + Math.sin(a) * r * 0.7, sp * 0.8);
        });
        return 2.2;
      }
      case 'rain': // 前方一帯に弾をばらまく
        for (let i = 0; i < 9 + ph * 4; i++) {
          const bx = (Math.random() * 2 - 1) * 2.4, by = -1.6 + Math.random() * 2.6;
          this.eBullets.push({ x: bx, y: by, z: e.z, vx: 0, vy: 0, vz: -sp * (0.7 + Math.random() * 0.3) });
        }
        sfx.play('zap', 0.5, 0.8);
        return 1.8;
      case 'wall': { // 抜け穴が1つだけある弾の壁
        const gx = Math.max(-1.8, Math.min(1.8, p.x + (Math.random() < 0.5 ? -1 : 1) * (0.8 + Math.random()))), gy = Math.max(-1.2, Math.min(0.8, p.y + (Math.random() - 0.5)));
        for (let x = -2.2; x <= 2.21; x += 0.55) for (let y = -1.6; y <= 1.11; y += 0.55) {
          if (Math.hypot(x - gx, y - gy) < 0.62) continue;
          this.eBullets.push({ x, y, z: e.z, vx: 0, vy: 0, vz: -sp * 0.75 });
        }
        sfx.play('charge', 0.5, 1.4);
        return 2.6;
      }
      case 'missiles':
        for (let i = 0; i < 3 + ph; i++) {
          const m = this.spawn('missile', e.x + (i - 1) * 0.8, e.y + 0.3, e.z - 0.5, (m, dt, g) => {
            m.z -= 9 * dt;
            if (m.z > 5) { m.x += (g.player.x - m.x) * Math.min(1, dt * 1.1); m.y += (g.player.y - m.y) * Math.min(1, dt * 1.1); }
          });
          m.fireT = 99;
        }
        sfx.play('zap', 0.6, 1.2);
        return 2.0;
      case 'minions': default: {
        const type = e.d.spr.startsWith('ufo') ? 'ufoS' : e.d.spr.startsWith('spaceStation_021') ? 'meteorS' : 'fighter';
        for (let i = 0; i < 6; i++) {
          const m = this.spawn(type, e.x, e.y, e.z - 0.5, (m, dt2) => {
            m.z -= 7 * dt2; const a = m.ph + m.t * 1.4, k = Math.min(1, m.t / 2);
            m.x = m.ox * (1 - k) + Math.cos(a) * 1.3 * Math.min(1, m.t);
            m.y = m.oy * (1 - k) + Math.sin(a) * 0.9 * Math.min(1, m.t);
          });
          m.ph = i * Math.PI / 3; m.ox = e.x; m.oy = e.y; m.fireT = 99;
        }
        sfx.play('zap', 0.6);
        return 2.2;
      }
    }
  }

  // 自機を狙って撃つ（n>1 なら横に広がる扇状）
  fireAt(e, n, spacing, spMul = 1) {
    const p = this.player, sp = this.bulletSpeed * spMul;
    for (let i = 0; i < n; i++) {
      const off = (i - (n - 1) / 2) * spacing;
      this.addBullet(e, p.x + off, p.y + off * 0.15, sp);
    }
  }
  ring(e, n) {
    const p = this.player, sp = this.bulletSpeed * 0.85, r = 1.25, gap = Math.random() * Math.PI * 2;
    for (let i = 1; i < n; i++) { // i = 0 は抜け道として空ける
      const a = gap + i / n * Math.PI * 2;
      this.addBullet(e, p.x + Math.cos(a) * r, p.y + Math.sin(a) * r, sp);
    }
  }
  addBullet(e, tx, ty, sp) {
    const dx = tx - e.x, dy = ty - e.y, dz = ZP - e.z, l = Math.hypot(dx, dy, dz);
    this.eBullets.push({ x: e.x, y: e.y, z: e.z - 0.3, vx: dx / l * sp, vy: dy / l * sp, vz: dz / l * sp });
  }

  updateEnemyBullets(dt) {
    const p = this.player, hr = this.ship.hitR + 0.06;
    for (const b of this.eBullets) {
      const pz = b.z;
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
      if (p.alive && pz >= ZP && b.z < ZP && Math.hypot(b.x - p.x, b.y - p.y) < hr) {
        b.dead = true; this.hurt(20);
      }
    }
    this.eBullets = this.eBullets.filter(b => !b.dead && b.z > 1);
  }

  updateLasers(dt) {
    for (const L of this.lasers) {
      L.t += dt / L.dur;
      if (L.e.alive) { L.tx = L.e.x; L.ty = L.e.y; L.tz = L.e.z; }
      const t = Math.min(1, L.t), u = 1 - t;
      const x = u * u * L.sx + 2 * u * t * L.cx + t * t * L.tx;
      const y = u * u * L.sy + 2 * u * t * L.cy + t * t * L.ty;
      const z = u * u * L.sz + 2 * u * t * L.cz + t * t * L.tz;
      L.trail.push([x, y, z]);
      if (L.trail.length > 9) L.trail.shift();
      if (L.t >= 1 && !L.done) {
        L.done = true; L.e.lockN = Math.max(0, L.e.lockN - 1);
        if (L.e.alive) { this.damage(L.e, this.ship.laserDmg, L.volley); this.spark(x, y, z, glow.green, 6); }
      }
      if (L.done) L.fade = (L.fade || 0) + dt * 6;
    }
    this.lasers = this.lasers.filter(L => !L.done || L.fade < 1);
  }

  updateItems(dt) {
    const p = this.player;
    for (const it of this.items) {
      it.z -= 9 * dt; it.t += dt;
      // 近づいたら自機に吸い寄せる
      if (it.z < ZP + 5) { it.x += (p.x - it.x) * Math.min(1, dt * 3); it.y += (p.y - it.y) * Math.min(1, dt * 3); }
      if (p.alive && Math.abs(it.z - ZP) < 0.6 && Math.hypot(it.x - p.x, it.y - p.y) < 0.7) {
        it.dead = true;
        if (it.kind === 'shield') {
          p.shield = Math.min(this.ship.shield, p.shield + this.ship.shield * 0.35);
          sfx.play('shield', 0.8); this.popupWorld(it.x, it.y, it.z, 'SHIELD +', '#7fdcff');
        } else {
          const pts = Math.round(5000 * (this.stageIdx + 1) * this.rankMul / 10) * 10;
          this.score += pts; this.rank = Math.min(this.rankCap, this.rank + 0.3);
          sfx.play('item', 0.8); this.popupWorld(it.x, it.y, it.z, `BONUS ${pts}`, '#ffd23f');
        }
      }
    }
    this.items = this.items.filter(it => !it.dead && it.z > 1);
  }

  updateParts(dt) {
    for (const q of this.parts) {
      q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt - 6 * dt; q.t += dt;
    }
    this.parts = this.parts.filter(q => q.t < q.life && q.z > 0.8);
    for (const pp of this.popups) { pp.t += dt; pp.y -= 22 * dt; }
    this.popups = this.popups.filter(pp => pp.t < 1.1);
  }

  // ---- ダメージ・撃破 ----
  damage(e, dmg, volley) {
    if (!e.alive) return;
    e.hp -= dmg; e.flash = 0.07;
    if (e.hp > 0) { sfx.play('hit', 0.25, 1.3); return; }
    e.alive = false; this.kills++;
    const mul = (volley && !e.boss ? volley.n : 1) * this.rankMul; // ボスは一斉発射の倍率対象外
    const pts = Math.round(e.d.score * mul / 10) * 10;
    this.score += pts;
    if (volley) volley.kills++;
    this.popupWorld(e.x, e.y, e.z, volley && volley.n > 1 ? `${pts} x${volley.n}` : `${pts}`,
      volley && volley.n >= 6 ? '#ffd23f' : volley ? '#9dffb0' : '#ffffff');
    if (volley && volley.n >= 4) this.rank = Math.min(this.rankCap, this.rank + 0.005 * volley.n);
    if (e.d.drop) this.items.push({ x: e.x, y: e.y, z: e.z, t: 0, kind: e.d.drop });
    const big = e.boss ? 2.2 : e.d.size;
    this.explode(e.x, e.y, e.z, big);
    sfx.play(big > 1 ? 'bigexplode' : 'explode', e.boss ? 0.9 : 0.55, 0.9 + Math.random() * 0.3);
    if (e.boss) { this.shake = 1; this.flash = 0.6; }
  }

  stageClear() {
    this.bossActive = false;
    const last = this.bosses[this.bosses.length - 1] || { x: 0, y: -0.7, z: 11 };
    for (let i = 0; i < 8; i++) this.later(i * 0.18, () => {
      this.explode(last.x + (Math.random() - 0.5) * 2.5, last.y + (Math.random() - 0.5) * 1.5, last.z, 1.6);
      sfx.play('bigexplode', 0.8, 0.7 + Math.random() * 0.3);
      this.shake = 0.8; this.flash = Math.max(this.flash, 0.3);
    });
    this.later(1.5, () => { sfx.play('boom', 1); this.flash = 1; });
    const p = this.player, n = this.stageIdx + 1;
    const shieldBonus = Math.round(p.shield / this.ship.shield * 100) * 100 * n;
    const perfect = this.stageHits === 0 ? 20000 * n : 0;
    this.score += shieldBonus + perfect;
    this.eBullets = [];
    for (const m of this.enemies) { m.alive = false; this.explode(m.x, m.y, m.z, 0.6); }
    this.cancelLocks();
    const final = this.stageIdx >= STAGES.length - 1;
    this.message(final ? 'ALL CLEAR' : 'STAGE CLEAR',
      `SHIELD BONUS ${shieldBonus}` + (perfect ? `  /  NO DAMAGE ${perfect}` : ''), 4.5);
    this.clearT = final ? 5.5 : 5;
  }

  hurt(dmg) {
    const p = this.player;
    if (p.inv > 0 || !p.alive || this.opts.god || this.clearT > 0) return;
    p.shield -= dmg; p.inv = 1.2; this.hits++; this.stageHits++;
    this.shake = 1; this.flash = 0.5;
    this.rank = Math.max(this.stageIdx * 0.7, this.rank - 1.5); // 被弾で難易度が下がる
    this.cancelLocks();
    sfx.play('damage', 0.9);
    if (p.shield <= 0) {
      p.shield = 0; p.alive = false;
      this.explode(p.x, p.y, ZP + 0.5, 1.4);
      sfx.play('lose', 0.9); sfx.play('bigexplode', 0.9, 0.8);
    }
  }

  // ---- エフェクト ----
  explode(x, y, z, size) {
    this.parts.push({ x, y, z, vx: 0, vy: 0, vz: 0, t: 0, life: 0.45, ring: true, s: size * 1.6 });
    const n = Math.min(40, 10 + size * 8);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, b = Math.random() * 2 - 1, sp = (1.5 + Math.random() * 3) * size;
      this.parts.push({ x, y, z, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.8, vz: b * sp,
        t: 0, life: 0.4 + Math.random() * 0.5, g: Math.random() < 0.5 ? glow.orange : glow.red, s: 0.12 + Math.random() * 0.12 * size });
    }
  }
  spark(x, y, z, g, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 1 + Math.random() * 2;
      this.parts.push({ x, y, z, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: 0, t: 0, life: 0.25, g, s: 0.08 });
    }
  }
  popupWorld(x, y, z, text, color) {
    const [sx, sy] = this.proj(x, y, Math.max(z, 1));
    this.popups.push({ x: sx, y: sy, text, color, t: 0 });
  }

  // ================= 描画 =================
  draw(ctx) {
    const p = this.player;
    ctx.save();
    if (this.shake > 0) ctx.translate((Math.random() - 0.5) * 10 * this.shake, (Math.random() - 0.5) * 10 * this.shake);
    this.bg.draw(ctx, this.cam.x, this.cam.y);

    // 奥から順に描く
    const list = [];
    for (const e of this.enemies) list.push([e.z, 0, e]);
    for (const b of this.eBullets) list.push([b.z, 1, b]);
    for (const s of this.shots) list.push([s.z, 2, s]);
    for (const q of this.parts) list.push([q.z, 3, q]);
    for (const it of this.items) list.push([it.z, 4, it]);
    if (p.alive) list.push([ZP, 5, p]);
    list.sort((a, b) => b[0] - a[0]);
    const shotSpr = this.ship.shot === 'pierce' ? 'laserRed01' : this.ship.shot === 'spread' ? 'laserGreen11' : 'laserBlue01';
    for (const [z, kind, o] of list) {
      if (z < 0.8) continue;
      const [x, y, k] = this.proj(o.x, o.y, z);
      const fog = Math.max(0, Math.min(1, (ZFAR + 4 - z) / 10));
      if (kind === 0) this.drawEnemy(ctx, o, x, y, k, fog);
      else if (kind === 1) { ctx.globalCompositeOperation = 'lighter'; drawGlow(ctx, glow.red, x, y, Math.max(3, 0.2 * k)); ctx.globalCompositeOperation = 'source-over'; }
      else if (kind === 2) { ctx.globalAlpha = fog; drawSpr(ctx, shotSpr, x, y, Math.max(1.5, (o.pierce ? 0.1 : 0.07) * k)); ctx.globalAlpha = 1; }
      else if (kind === 3) this.drawPart(ctx, o, x, y, k);
      else if (kind === 4) drawSpr(ctx, o.kind === 'shield' ? 'powerupBlue_shield' : 'powerupYellow_star', x, y, Math.max(8, 0.45 * k), Math.sin(o.t * 4) * 0.3);
      else this.drawPlayer(ctx, x, y, k);
    }
    this.drawLasers(ctx);
    this.drawReticle(ctx);
    ctx.restore();

    if (this.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${this.flash * 0.5})`; ctx.fillRect(0, 0, W, H); }
    this.drawHUD(ctx);
  }

  drawEnemy(ctx, e, x, y, k, fog) {
    const w = e.d.size * k;
    if (w < 1) return;
    ctx.globalAlpha = fog;
    drawSpr(ctx, e.d.spr, x, y, w, e.rot && (e.d.spin || e.spin) ? e.rot : 0, e.d.flip);
    if (e.flash > 0) {
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.6;
      drawSpr(ctx, e.d.spr, x, y, w, e.rot && (e.d.spin || e.spin) ? e.rot : 0, e.d.flip);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = 1;
    if (e.lockN > 0) { // ロックオンマーカー
      const r = Math.max(22, Math.min(80, e.d.r * k * 1.6));
      drawSpr(ctx, 'laserRed08', x, y, r, this.t * 3);
      if (e.lockN > 1) this.text(ctx, 'x' + e.lockN, x + r * 0.55, y - r * 0.5, 12, '#ff6a6a', 'left');
    }
  }

  drawPart(ctx, q, x, y, k) {
    const a = 1 - q.t / q.life;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = a;
    if (q.ring) {
      drawGlow(ctx, glow.orange, x, y, Math.min(400, q.s * k * (0.4 + q.t / q.life)));
      ctx.strokeStyle = `rgba(255,220,160,${a})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, Math.min(400, q.s * k * (0.3 + q.t / q.life * 1.2)), 0, 7); ctx.stroke();
    } else {
      drawGlow(ctx, q.g, x, y, Math.max(1.5, Math.min(60, q.s * k)));
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }

  drawPlayer(ctx, x, y, k) {
    const p = this.player;
    if (p.inv > 0 && Math.floor(p.inv * 20) % 2) return;
    const w = 0.75 * k;
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, glow.blue, x, y + w * 0.32, w * (0.18 + Math.random() * 0.05));
    ctx.globalCompositeOperation = 'source-over';
    ctx.save(); ctx.translate(x, y); ctx.rotate(p.bank * 0.45); ctx.scale(1 - Math.abs(p.bank) * 0.25, 1);
    drawSpr(ctx, this.ship.spr, 0, 0, w);
    ctx.restore();
    if (this.ship.hitR < 0.15) { // 当たり判定の小さい機体は判定点を表示
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(x, y, 2.5, 0, 7); ctx.fill();
    }
  }

  drawLasers(ctx) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const L of this.lasers) {
      const pts = L.trail.map(([x, y, z]) => this.proj(x, y, Math.max(z, 1)));
      const a = 1 - (L.fade || 0);
      for (let i = 1; i < pts.length; i++) {
        const f = i / pts.length;
        ctx.strokeStyle = `rgba(90,255,150,${a * f})`;
        ctx.lineWidth = 1 + 4 * f;
        ctx.beginPath(); ctx.moveTo(pts[i - 1][0], pts[i - 1][1]); ctx.lineTo(pts[i][0], pts[i][1]); ctx.stroke();
      }
      const h = pts[pts.length - 1];
      if (h && !L.done) drawGlow(ctx, glow.green, h[0], h[1], 7);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  drawReticle(ctx) {
    const p = this.player;
    if (!p.alive || this.clearT > 0) return;
    const locking = input.down && input.holdTime > 0.15;
    ctx.strokeStyle = locking ? 'rgba(255,90,90,0.85)' : 'rgba(120,255,160,0.55)';
    ctx.lineWidth = 1.5;
    for (const [dz, s] of [[6, 26], [14, 16]]) {
      const [x, y] = this.proj(p.x, p.y, ZP + dz);
      ctx.strokeRect(x - s / 2, y - s / 2, s, s);
    }
    if (locking) { // ロック範囲の目安
      const [x, y, k] = this.proj(p.x, p.y, ZP + 10);
      ctx.beginPath(); ctx.arc(x, y, this.ship.lockR * k, 0, 7); ctx.stroke();
    }
  }

  text(ctx, s, x, y, size, color, align = 'center', font) {
    // Kenvector は K が H に見えるため、小さい文字はシステムフォントの太字にする
    font = font || (size > 13 && !/K/.test(s) ? 'Kenvector, sans-serif' : 'SYS');
    ctx.font = font === 'SYS' ? `700 ${size}px system-ui, sans-serif` : `${size}px ${font}`;
    ctx.textAlign = align; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillText(s, x + 1.5, y + 1.5);
    ctx.fillStyle = color; ctx.fillText(s, x, y);
  }

  drawHUD(ctx) {
    const p = this.player, s = this.ship;
    this.text(ctx, String(this.score).padStart(8, '0'), 12, 22, 16, '#ffffff', 'left');
    this.text(ctx, `STAGE ${this.stageIdx + 1}`, 12, 42, 11, '#9fd7ff', 'left');
    this.text(ctx, `RANK ${Math.floor(this.rank)}`, 72, 42, 11, '#ffcf5a', 'left');
    if (this.continues) this.text(ctx, `CONTINUE ${this.continues}`, 126, 42, 11, '#ff9aa8', 'left');
    // 一時停止ボタン
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillRect(W - 30, 12, 5, 18); ctx.fillRect(W - 20, 12, 5, 18);

    // シールド
    const bx = 12, by = H - 26, bw = 150;
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(bx - 2, by - 2, bw + 4, 12);
    const sh = Math.max(0, p.shield / s.shield);
    ctx.fillStyle = sh > 0.5 ? '#4fd3ff' : sh > 0.25 ? '#ffcf5a' : '#ff4f6a';
    ctx.fillRect(bx, by, bw * sh, 8);
    this.text(ctx, 'SHIELD', bx, by - 10, 9, '#cfe8ff', 'left');
    // ロック数
    const pw = s.lockMax > 8 ? 8 : 10, gap = s.lockMax > 8 ? 2 : 3;
    for (let i = 0; i < s.lockMax; i++) {
      ctx.fillStyle = i < this.locks.length ? '#ff5a5a' : 'rgba(255,255,255,0.18)';
      ctx.fillRect(W - 14 - (s.lockMax - i) * (pw + gap), by, pw, 8);
    }
    this.text(ctx, 'LOCK', W - 14 - s.lockMax * (pw + gap), by - 10, 9, '#ffb0b0', 'left');

    // ボスHP
    if (this.bossActive && this.bosses.some(b => b.alive && b.z <= b.boss.z + 0.5)) {
      let hp = 0, max = 0;
      for (const b of this.bosses) { hp += Math.max(0, b.hp); max += b.maxHp; }
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(60, 60, 240, 7);
      ctx.fillStyle = '#ff5a7a'; ctx.fillRect(60, 60, 240 * hp / max, 7);
      this.text(ctx, this.bosses[0].boss.name, W / 2, 76, 9, '#ffb0c0');
    }

    for (const pp of this.popups) {
      ctx.globalAlpha = Math.max(0, Math.min(1, 2 - pp.t * 1.8));
      this.text(ctx, pp.text, pp.x, pp.y, 11, pp.color);
    }
    ctx.globalAlpha = 1;

    if (this.msg) {
      const m = this.msg, a = Math.min(1, m.t * 2), warn = m.title === 'WARNING';
      ctx.globalAlpha = a;
      if (m.title) this.text(ctx, m.title, W / 2, 170, warn ? 30 : 26,
        warn ? (Math.floor(this.t * 4) % 2 ? '#ff4f6a' : '#ffffff') : '#ffffff');
      if (m.sub) this.text(ctx, m.sub, W / 2, 205, 13, '#cfe8ff', 'center', 'SYS');
      ctx.globalAlpha = 1;
    }
  }
}

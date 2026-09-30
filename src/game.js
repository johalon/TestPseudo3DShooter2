// ゲーム本体：擬似3D投影、自機、敵、弾、ロックオン、スコア、ボス
import { W, H } from './view.js';
import { drawSpr, drawGlow, glow } from './assets.js';
import { sfx } from './audio.js';
import { input } from './input.js';
import { TIMELINE } from './stage.js';

// ---- 投影パラメータ ----
export const F = 300, VPX = 180, VPY = 250, ZP = 3, ZFAR = 40;
const XR = 2.2, YMIN = -1.6, YMAX = 1.1;   // 自機の移動範囲
const CAMF = 0.3;                           // カメラが自機を追う割合
const SENS = 1.35;                          // ドラッグ感度
const SHOT_SPEED = 46, SHOT_INTERVAL = 0.11;
const LOCK_R = 0.95, LOCK_MAX = 8, LOCK_INTERVAL = 0.065, LASER_DMG = 8;
const PLAYER_R = 0.2;

const ETYPES = {
  fighter:  { spr: 'enemyRed1',       size: 0.8, hp: 1,  score: 100,   r: 0.42 },
  fighter2: { spr: 'enemyGreen2',     size: 0.8, hp: 2,  score: 150,   r: 0.42 },
  shooter:  { spr: 'enemyBlack1',     size: 0.9, hp: 4,  score: 300,   r: 0.48, fire: 1.5 },
  ufo:      { spr: 'ufoYellow',       size: 0.75, hp: 5,  score: 800,   r: 0.42, drop: true },
  meteor:   { spr: 'meteorBrown_big1', size: 1.3, hp: 6,  score: 60,    r: 0.62,  spin: 1 },
  meteorS:  { spr: 'meteorBrown_med1', size: 0.55, hp: 2, score: 30,    r: 0.3,  spin: 1 },
  mid:      { spr: 'spaceShips_004',  size: 1.9,  hp: 48, score: 3000,  r: 0.9, flip: true, fire: 1.2, fan: 3 },
  boss:     { spr: 'spaceShips_007',  size: 4.6,  hp: 1100, score: 30000, r: 1.6, flip: true },
};

// 背景：流れる星と床グリッド（タイトル画面でも使う）
export class Backdrop {
  constructor() {
    this.stars = [];
    for (let i = 0; i < 140; i++) this.stars.push(this.newStar(Math.random() * 60 + 1));
    this.gridOff = 0;
  }
  newStar(z) { return { x: (Math.random() * 2 - 1) * 14, y: (Math.random() * 2 - 1) * 10 - 2, z }; }
  update(dt, speed) {
    for (const s of this.stars) { s.z -= speed * dt; if (s.z < 0.8) Object.assign(s, this.newStar(60)); }
    this.gridOff = (this.gridOff + speed * dt) % 4;
  }
  draw(ctx, cx, cy) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#03040c'); g.addColorStop(0.36, '#0b0c2a'); g.addColorStop(0.42, '#2a1446');
    g.addColorStop(0.5, '#0a0b22'); g.addColorStop(1, '#04050e');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // 星
    ctx.fillStyle = '#dfe9ff';
    for (const s of this.stars) {
      const k = F / s.z, x = VPX + (s.x - cx * 0.2) * k, y = VPY + (s.y - cy * 0.2) * k;
      if (x < -4 || x > W + 4 || y < -4 || y > H + 4) continue;
      const r = Math.min(2.6, 0.35 + 18 / s.z * 0.12);
      ctx.globalAlpha = Math.min(1, (60 - s.z) / 20);
      ctx.fillRect(x - r / 2, y - r / 2, r, r * (1 + 6 / s.z));
    }
    ctx.globalAlpha = 1;
    // 床グリッド（y = 2.6 の平面）
    const gy = 2.6 - cy;
    ctx.strokeStyle = 'rgba(90,200,255,0.22)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = -14; x <= 14; x += 2) {
      const X = x - cx;
      ctx.moveTo(VPX + X * F / 1.5, VPY + gy * F / 1.5);
      ctx.lineTo(VPX + X * F / 60, VPY + gy * F / 60);
    }
    ctx.stroke();
    for (let z = 4 - this.gridOff; z < 60; z += 4) {
      if (z < 1.5) continue;
      const k = F / z, y = VPY + gy * k;
      ctx.strokeStyle = `rgba(90,200,255,${Math.min(0.35, 6 / z * 0.35)})`;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
  }
}

export class Game {
  constructor(opts = {}) {
    this.opts = opts;
    this.bg = new Backdrop();
    this.lap = 1; this.lapRank = 0;
    this.score = 0; this.kills = 0; this.maxVolley = 0; this.hits = 0;
    this.player = { x: 0, y: 0, vx: 0, vy: 0, shield: 100, inv: 0, bank: 0, alive: true };
    this.cam = { x: 0, y: -2 };
    this.over = false; this.deadT = 0;
    this.shake = 0; this.flash = 0;
    this.startLap(opts.t || 0);
  }

  startLap(t0 = 0) {
    this.t = t0; this.ev = 0;
    while (this.ev < TIMELINE.length && TIMELINE[this.ev][0] < t0) this.ev++;
    this.enemies = []; this.eBullets = []; this.shots = []; this.lasers = []; this.parts = [];
    this.items = []; this.popups = []; this.locks = []; this.timers = [];
    this.boss = null; this.msg = null; this.clearT = 0;
    this.shotT = 0; this.lockT = 0; this.shotSide = 1;
    this.rank = Math.max(this.rank || 0, this.lapRank);
  }

  // ---- 投影 ----
  proj(x, y, z) {
    const k = F / z;
    return [VPX + (x - this.cam.x) * k, VPY + (y - this.cam.y) * k, k];
  }

  get rankMul() { return 1 + Math.floor(this.rank) * 0.1; }
  get fireMul() { return 1 + this.rank * 0.12; }
  get bulletSpeed() { return 10.5 * (1 + this.rank * 0.05); }

  cancelLocks() { this.locks.forEach(e => e.lockN = Math.max(0, e.lockN - 1)); this.locks = []; }

  later(d, fn) { this.timers.push([this.t + d, fn]); }

  message(title, sub, dur = 2.5) { this.msg = { title, sub, t: dur }; }
  warning() { this.message('WARNING', '巨大戦艦 接近', 3.5); sfx.play('charge', 0.8, 0.7); }

  spawn(type, x, y, z, mv) {
    const d = ETYPES[type];
    const e = { type, d, x, y, z, mv, hp: d.hp, t: 0, st: 0, fireT: d.fire ? 0.8 + Math.random() * d.fire : 0,
      lockN: 0, flash: 0, rot: Math.random() * 6, alive: true };
    if (type === 'fighter' || type === 'fighter2') e.fireT = 1.5 + Math.random() * 3;
    this.enemies.push(e);
    return e;
  }

  spawnBoss() {
    const e = this.spawn('boss', 0, -0.7, ZFAR, null);
    e.hp = e.maxHp = ETYPES.boss.hp + (this.lap - 1) * 250;
    e.bt = 0; e.atk = 0; e.atkT = 2.0;
    this.boss = e;
  }

  // ================= 更新 =================
  update(dt) {
    const p = this.player;
    this.t += dt;
    while (this.ev < TIMELINE.length && TIMELINE[this.ev][0] <= this.t) TIMELINE[this.ev++][1](this);
    if (this.timers.length) {
      const due = this.timers.filter(tm => tm[0] <= this.t);
      this.timers = this.timers.filter(tm => tm[0] > this.t);
      due.forEach(tm => tm[1]());
    }

    if (!this.over) this.rank = Math.min(9.99, this.rank + dt * 0.018);
    this.shake = Math.max(0, this.shake - dt * 3);
    this.flash = Math.max(0, this.flash - dt * 2.5);
    if (this.msg && (this.msg.t -= dt) <= 0) this.msg = null;

    // --- 自機 ---
    if (p.alive) {
      let dx, dy;
      if (this.opts.bot) [dx, dy] = this.botMove(dt);
      else { const u = (1 - CAMF) * F / ZP; dx = input.dx * SENS / u; dy = input.dy * SENS / u; }
      const nx = Math.max(-XR, Math.min(XR, p.x + dx)), ny = Math.max(YMIN, Math.min(YMAX, p.y + dy));
      p.vx = (nx - p.x) / dt; p.x = nx; p.y = ny;
      p.bank += (Math.max(-1, Math.min(1, p.vx * 0.12)) - p.bank) * Math.min(1, dt * 10);
      p.inv = Math.max(0, p.inv - dt);
      this.autoFire(dt);
      this.updateLock(dt);
    } else {
      this.deadT += dt;
      if (this.deadT > 2.2) this.over = true;
    }
    this.cam.x = p.x * CAMF; this.cam.y = -2 + p.y * CAMF;
    this.bg.update(dt, 11);

    this.updateShots(dt);
    this.updateEnemies(dt);
    this.updateEnemyBullets(dt);
    this.updateLasers(dt);
    this.updateItems(dt);
    this.updateParts(dt);

    // ボス撃破後 → 次の周回
    if (this.clearT > 0) {
      this.clearT -= dt;
      if (this.clearT <= 0) {
        this.lap++; this.lapRank = Math.min(8, this.lapRank + 2);
        p.shield = Math.min(100, p.shield + 50);
        this.startLap(0);
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

  autoFire(dt) {
    const p = this.player;
    this.shotT -= dt;
    if (this.shotT > 0) return;
    this.shotT = SHOT_INTERVAL;
    this.shotSide = -this.shotSide;
    const x = p.x + this.shotSide * 0.22, y = p.y + 0.05, z = ZP + 0.3;
    // 弱いエイムアシスト：近くの敵に向けて弾道を少し曲げる
    let vx = 0, vy = 0, best = null, bd = 0.55;
    for (const e of this.enemies) {
      if (e.z < ZP + 1.5 || e.z > 32) continue;
      const d = Math.hypot(e.x - x, e.y - y) - e.d.r * 0.5;
      if (d < bd) { bd = d; best = e; }
    }
    if (best) { const tt = (best.z - z) / SHOT_SPEED; vx = (best.x - x) / tt; vy = (best.y - y) / tt; }
    this.shots.push({ x, y, z, vx, vy });
    if (this.shotSide > 0) sfx.play('shot', 0.18, 1.1);
  }

  updateLock(dt) {
    const p = this.player;
    this.locks = this.locks.filter(l => l.alive);
    if (input.down && input.holdTime > 0.15) {
      this.lockT -= dt;
      if (this.lockT <= 0 && this.locks.length < LOCK_MAX) {
        let best = null, bz = 1e9;
        for (const e of this.enemies) {
          if (!e.alive || e.z < ZP + 1.5 || e.z > 34) continue;
          const maxN = Math.min(LOCK_MAX, Math.ceil(e.hp / LASER_DMG));
          if (e.lockN >= maxN) continue;
          if (Math.hypot(e.x - p.x, e.y - p.y) > LOCK_R + e.d.r * 0.5) continue;
          if (e.z < bz) { bz = e.z; best = e; }
        }
        if (best) {
          best.lockN++; this.locks.push(best); this.lockT = LOCK_INTERVAL;
          sfx.play('lock', 0.45, 1 + this.locks.length * 0.08);
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
      this.lasers.push({ e, volley, t: 0, dur: 0.26 + i * 0.035,
        sx: p.x, sy: p.y, sz: ZP + 0.2,
        cx: p.x + side * (0.8 + Math.random()), cy: p.y - 0.8 - Math.random(), cz: ZP + 2 + Math.random() * 2,
        tx: e.x, ty: e.y, tz: e.z, trail: [] });
    });
    this.maxVolley = Math.max(this.maxVolley, n);
    this.locks = [];
    sfx.play('laser', 0.6, 1.25 - n * 0.03);
  }

  updateShots(dt) {
    for (const s of this.shots) {
      const pz = s.z;
      s.x += s.vx * dt; s.y += s.vy * dt; s.z += SHOT_SPEED * dt;
      for (const e of this.enemies) {
        if (!e.alive) continue;
        const r = e.d.r;
        if (e.z + r * 0.8 < pz || e.z - r * 0.8 > s.z) continue;
        if (Math.hypot(e.x - s.x, e.y - s.y) < r + 0.06) {
          this.damage(e, 1, null); s.dead = true;
          this.spark(s.x, s.y, e.z - 0.2, glow.blue, 3);
          break;
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
      if (e.d.spin) e.rot += dt * 0.8;
      if (e === this.boss) this.updateBoss(e, dt);
      else {
        e.mv(e, dt);
        // 射撃
        const canFire = e.d.fire || (this.rank >= 3 && (e.type === 'fighter' || e.type === 'fighter2'));
        if (canFire && e.z > 7 && e.z < 32 && p.alive) {
          e.fireT -= dt * this.fireMul;
          if (e.fireT <= 0) {
            e.fireT = e.d.fire || 3.2;
            this.fireAt(e, e.d.fan || 1, 0.75);
          }
        }
      }
      // 自機との接触
      if (p.alive && Math.abs(e.z - ZP) < 0.45 && Math.hypot(e.x - p.x, e.y - p.y) < e.d.r * 0.8 + PLAYER_R) {
        this.hurt(30);
        if (e !== this.boss) this.damage(e, 5, null);
      }
      if (e.z < 1 || e.z > 60 || e.y < -7) e.alive = false; // 画面外
    }
    this.enemies = this.enemies.filter(e => e.alive);
  }

  updateBoss(e, dt) {
    e.bt += dt;
    if (e.z > 10.5) { e.z -= 9 * dt; return; }
    e.z = 10.5;
    const ph2 = e.hp < e.maxHp * 0.5;
    e.x = Math.sin(e.bt * 0.5) * 1.3;
    e.y = -0.8 + Math.sin(e.bt * 0.83) * 0.45;
    e.atkT -= dt * (0.8 + this.fireMul * 0.25) * (ph2 ? 1.35 : 1);
    if (e.atkT > 0 || !this.player.alive) return;
    const pat = e.atk++ % (ph2 ? 4 : 3);
    if (pat === 0) { this.fireAt(e, 5, 0.75); e.atkT = 1.3; }
    else if (pat === 1) { this.ring(e, ph2 ? 14 : 10); e.atkT = 1.6; }
    else if (pat === 2) { // 3連射
      for (let i = 0; i < 3; i++) this.later(i * 0.18, () => e.alive && this.fireAt(e, ph2 ? 3 : 1, 0.7));
      e.atkT = 1.5;
    } else { // 子機を放出（ロックオンの稼ぎどころ）
      for (let i = 0; i < 6; i++) {
        const m = this.spawn('fighter', e.x, e.y, e.z - 0.5, (m, dt2) => {
          m.z -= 7 * dt2; const a = m.ph + m.t * 1.4;
          m.x = e.x * (1 - Math.min(1, m.t / 2)) + Math.cos(a) * 1.3 * Math.min(1, m.t);
          m.y = e.y * (1 - Math.min(1, m.t / 2)) + Math.sin(a) * 0.9 * Math.min(1, m.t);
        });
        m.ph = i * Math.PI / 3; m.fireT = 99;
      }
      sfx.play('zap', 0.6);
      e.atkT = 2.2;
    }
  }

  // 自機を狙って撃つ（n>1 なら横に広がる扇状）
  fireAt(e, n, spacing) {
    const p = this.player, sp = this.bulletSpeed;
    for (let i = 0; i < n; i++) {
      const off = (i - (n - 1) / 2) * spacing;
      this.addBullet(e, p.x + off, p.y + off * 0.15, sp);
    }
  }
  ring(e, n) {
    const p = this.player, sp = this.bulletSpeed * 0.85, r = 1.25, gap = Math.random() * Math.PI * 2;
    for (let i = 0; i < n; i++) {
      const a = gap + i / n * Math.PI * 2;
      if (i === 0) continue; // 抜け道を1つ空ける
      this.addBullet(e, p.x + Math.cos(a) * r, p.y + Math.sin(a) * r, sp);
    }
  }
  addBullet(e, tx, ty, sp) {
    const dx = tx - e.x, dy = ty - e.y, dz = ZP - e.z, l = Math.hypot(dx, dy, dz);
    this.eBullets.push({ x: e.x, y: e.y, z: e.z - 0.3, vx: dx / l * sp, vy: dy / l * sp, vz: dz / l * sp });
  }

  updateEnemyBullets(dt) {
    const p = this.player;
    for (const b of this.eBullets) {
      const pz = b.z;
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
      if (p.alive && pz >= ZP && b.z < ZP && Math.hypot(b.x - p.x, b.y - p.y) < PLAYER_R + 0.06) {
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
        if (L.e.alive) { this.damage(L.e, LASER_DMG, L.volley); this.spark(x, y, z, glow.green, 6); }
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
        it.dead = true; p.shield = Math.min(100, p.shield + 35);
        sfx.play('shield', 0.8); this.popupWorld(it.x, it.y, it.z, 'SHIELD +', '#7fdcff');
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
    const mul = (volley ? volley.n : 1) * this.rankMul;
    const pts = Math.round(e.d.score * mul / 10) * 10;
    this.score += pts;
    if (volley) volley.kills++;
    this.popupWorld(e.x, e.y, e.z, volley && volley.n > 1 ? `${pts} x${volley.n}` : `${pts}`,
      volley && volley.n >= 6 ? '#ffd23f' : volley ? '#9dffb0' : '#ffffff');
    if (volley && volley.n >= 4) this.rank = Math.min(9.99, this.rank + 0.02 * volley.n);
    if (e.d.drop) this.items.push({ x: e.x, y: e.y, z: e.z, t: 0 });
    if (e === this.boss) return this.bossDown(e);
    this.explode(e.x, e.y, e.z, e.d.size);
    sfx.play(e.d.size > 1 ? 'bigexplode' : 'explode', 0.55, 0.9 + Math.random() * 0.3);
  }

  bossDown(e) {
    for (let i = 0; i < 8; i++) this.later(i * 0.18, () => {
      this.explode(e.x + (Math.random() - 0.5) * 2.5, e.y + (Math.random() - 0.5) * 1.5, e.z, 1.6);
      sfx.play('bigexplode', 0.8, 0.7 + Math.random() * 0.3);
      this.shake = 0.8; this.flash = Math.max(this.flash, 0.3);
    });
    this.later(1.5, () => { sfx.play('boom', 1); this.flash = 1; });
    const p = this.player;
    const bonus = Math.round(p.shield) * 100 * this.lap;
    this.score += bonus;
    this.eBullets = [];
    for (const m of this.enemies) if (m !== e) { m.alive = false; this.explode(m.x, m.y, m.z, 0.6); }
    this.boss = null;
    this.message('STAGE CLEAR', `SHIELD BONUS ${bonus}`, 4.5);
    this.clearT = 5;
  }

  hurt(dmg) {
    const p = this.player;
    if (p.inv > 0 || !p.alive || this.opts.god) return;
    p.shield -= dmg; p.inv = 1.2; this.hits++;
    this.shake = 1; this.flash = 0.5;
    this.rank = Math.max(this.lapRank, this.rank - 1.5); // 被弾で難易度が下がる
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
    const n = 10 + size * 8;
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
    for (const [z, kind, o] of list) {
      if (z < 0.8) continue;
      const [x, y, k] = this.proj(o.x, o.y, z);
      const fog = Math.max(0, Math.min(1, (ZFAR + 4 - z) / 10));
      if (kind === 0) this.drawEnemy(ctx, o, x, y, k, fog);
      else if (kind === 1) { ctx.globalCompositeOperation = 'lighter'; drawGlow(ctx, glow.red, x, y, Math.max(3, 0.2 * k)); ctx.globalCompositeOperation = 'source-over'; }
      else if (kind === 2) { ctx.globalAlpha = fog; drawSpr(ctx, 'laserBlue01', x, y, Math.max(1.5, 0.07 * k)); ctx.globalAlpha = 1; }
      else if (kind === 3) this.drawPart(ctx, o, x, y, k);
      else if (kind === 4) drawSpr(ctx, 'powerupBlue_shield', x, y, Math.max(8, 0.45 * k), Math.sin(o.t * 4) * 0.3);
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
    drawSpr(ctx, e.d.spr, x, y, w, e.d.spin ? e.rot : 0, e.d.flip);
    if (e.flash > 0) {
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.7;
      drawSpr(ctx, e.d.spr, x, y, w, e.d.spin ? e.rot : 0, e.d.flip);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = 1;
    if (e.lockN > 0) { // ロックオンマーカー
      const r = Math.max(22, e.d.r * k * 1.6);
      drawSpr(ctx, 'laserRed08', x, y, r, this.t * 3);
      if (e.lockN > 1) this.text(ctx, 'x' + e.lockN, x + r * 0.55, y - r * 0.5, 12, '#ff6a6a', 'left');
    }
  }

  drawPart(ctx, q, x, y, k) {
    const a = 1 - q.t / q.life;
    ctx.globalCompositeOperation = 'lighter';
    if (q.ring) {
      ctx.globalAlpha = a;
      drawGlow(ctx, glow.orange, x, y, q.s * k * (0.4 + q.t / q.life));
      ctx.strokeStyle = `rgba(255,220,160,${a})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, q.s * k * (0.3 + q.t / q.life * 1.2), 0, 7); ctx.stroke();
    } else {
      ctx.globalAlpha = a;
      drawGlow(ctx, q.g, x, y, Math.max(1.5, q.s * k));
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }

  drawPlayer(ctx, x, y, k) {
    const p = this.player;
    if (p.inv > 0 && Math.floor(p.inv * 20) % 2) return;
    const w = 0.75 * k;
    // エンジン炎
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, glow.blue, x, y + w * 0.32, w * (0.18 + Math.random() * 0.05));
    ctx.globalCompositeOperation = 'source-over';
    ctx.save(); ctx.translate(x, y); ctx.rotate(p.bank * 0.45); ctx.scale(1 - Math.abs(p.bank) * 0.25, 1);
    drawSpr(ctx, 'playerShip1_blue', 0, 0, w);
    ctx.restore();
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
    if (!p.alive) return;
    const locking = input.down && input.holdTime > 0.15;
    ctx.strokeStyle = locking ? 'rgba(255,90,90,0.85)' : 'rgba(120,255,160,0.55)';
    ctx.lineWidth = 1.5;
    for (const [dz, s] of [[6, 26], [14, 16]]) {
      const [x, y] = this.proj(p.x, p.y, ZP + dz);
      ctx.strokeRect(x - s / 2, y - s / 2, s, s);
    }
    if (locking) { // ロック範囲の目安
      const [x, y, k] = this.proj(p.x, p.y, ZP + 10);
      ctx.beginPath(); ctx.arc(x, y, LOCK_R * k, 0, 7); ctx.stroke();
    }
  }

  text(ctx, s, x, y, size, color, align = 'center', font) {
    // Kenvector は K が H に見えるため、小さい文字はシステムフォントの太字にする
    font = font || (size > 13 ? 'Kenvector, sans-serif' : 'SYS');
    ctx.font = font === 'SYS' ? `700 ${size}px system-ui, sans-serif` : `${size}px ${font}`; ctx.textAlign = align; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillText(s, x + 1.5, y + 1.5);
    ctx.fillStyle = color; ctx.fillText(s, x, y);
  }

  drawHUD(ctx) {
    const p = this.player;
    this.text(ctx, String(this.score).padStart(8, '0'), 12, 22, 16, '#ffffff', 'left');
    this.text(ctx, `RANK ${Math.floor(this.rank)}`, 12, 42, 11, '#ffcf5a', 'left');
    this.text(ctx, `LAP ${this.lap}`, 76, 42, 11, '#9fd7ff', 'left');
    // 一時停止ボタン
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillRect(W - 30, 12, 5, 18); ctx.fillRect(W - 20, 12, 5, 18);

    // シールド
    const bx = 12, by = H - 26, bw = 150;
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(bx - 2, by - 2, bw + 4, 12);
    const sh = p.shield / 100;
    ctx.fillStyle = sh > 0.5 ? '#4fd3ff' : sh > 0.25 ? '#ffcf5a' : '#ff4f6a';
    ctx.fillRect(bx, by, bw * sh, 8);
    this.text(ctx, 'SHIELD', bx, by - 10, 9, '#cfe8ff', 'left');
    // ロック数
    for (let i = 0; i < LOCK_MAX; i++) {
      ctx.fillStyle = i < this.locks.length ? '#ff5a5a' : 'rgba(255,255,255,0.18)';
      ctx.fillRect(W - 14 - (LOCK_MAX - i) * 13, by, 10, 8);
    }
    this.text(ctx, 'LOCK', W - 14 - LOCK_MAX * 13, by - 10, 9, '#ffb0b0', 'left');

    // ボスHP
    if (this.boss && this.boss.z <= 11) {
      const b = this.boss;
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(60, 60, 240, 7);
      ctx.fillStyle = '#ff5a7a'; ctx.fillRect(60, 60, 240 * Math.max(0, b.hp / b.maxHp), 7);
    }

    for (const pp of this.popups) {
      ctx.globalAlpha = Math.min(1, 2 - pp.t * 1.8);
      this.text(ctx, pp.text, pp.x, pp.y, 11, pp.color);
    }
    ctx.globalAlpha = 1;

    if (this.msg) {
      const m = this.msg, a = Math.min(1, m.t * 2);
      ctx.globalAlpha = a;
      if (m.title) this.text(ctx, m.title, W / 2, 170, m.title === 'WARNING' ? 30 : 26,
        m.title === 'WARNING' ? (Math.floor(this.t * 4) % 2 ? '#ff4f6a' : '#ffffff') : '#ffffff');
      if (m.sub) this.text(ctx, m.sub, W / 2, 205, 14, '#cfe8ff', 'center', 'sans-serif');
      ctx.globalAlpha = 1;
    }
  }
}

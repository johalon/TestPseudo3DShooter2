// ゲーム本体（v2 縦切り版）
// 大原則：自機の位置取りが攻撃と回避を兼ねる
//  - ショットは自機の位置から真っすぐ奥へ（エイムアシストなし）
//  - ロックオンは照準の中に敵をとどめ続けると1つずつ取れる（外れると進捗が減る）
//  - 一斉発射はエネルギー制（ロック1つ＝1消費、時間で回復）
//  - 敵の攻撃は必ず予兆を出してから、自機の位置を狙ってくる
import { W, H } from './view.js';
import { drawSpr, drawGlow, glow } from './assets.js';
import { sfx } from './audio.js';
import { bgm } from './bgm.js';
import { input } from './input.js';
import { LEVEL1, mv } from './level1.js';

export const F = 300, VPX = 180, VPY = 250, ZP = 3, ZFAR = 40;
const XR = 2.2, YMIN = -1.6, YMAX = 1.1;
const CAMF = 0.3, SENS = 1.35;
const SHOT_SPEED = 40, SHOT_INT = 0.14;
const LOCK_R = 0.6, LASER_DMG = 3, ENERGY_MAX = 6, ENERGY_REGEN = 1.4; // 秒/1
const PLAYER_R = 0.2, BULLET_SPEED = 9;

// 敵の種類：lockT はロックに必要な時間（秒）
const T = {
  scout:   { spr: 'enemyRed1',   size: 0.8,  r: 0.42, hp: 3,  score: 100,  lockT: 0.2 },
  gunner:  { spr: 'enemyBlack1', size: 1.0,  r: 0.5,  hp: 14,  score: 400,  lockT: 0.45 },
  sniper:  { spr: 'enemyBlack3', size: 0.9,  r: 0.46, hp: 5,  score: 400,  lockT: 0.35 },
  bomber:  { spr: 'enemyRed3',   size: 0.85, r: 0.45, hp: 3,  score: 200,  lockT: 0.25 },
  carrier: { spr: 'enemyGreen4', size: 1.05, r: 0.52, hp: 16, score: 600,  lockT: 0.5 },
  charger: { spr: 'enemyBlue4',  size: 0.9,  r: 0.46, hp: 8,  score: 400,  lockT: 0.35 },
  mine:    { spr: 'ufoYellow',   size: 0.55, r: 0.35, hp: 2,  score: 80,   lockT: 0.2, spin: 2 },
  turret:  { spr: 'ufoBlue',     size: 0.7,  r: 0.4,  hp: 20, score: 800,  lockT: 0.4, spin: 1 },
  flank:   { spr: 'spaceStation_024', size: 6, r: 0, hp: 1, score: 0, deco: true },
  cruiser: { spr: 'spaceShips_007', size: 4.4, r: 1.3, hp: 110, score: 20000, lockT: 0.4 },
};

// ================= 背景 =================
export class Backdrop {
  constructor() {
    this.stars = [];
    for (let i = 0; i < 140; i++) this.stars.push(this.newStar(Math.random() * 60 + 1));
    this.gridOff = 0;
    this.sky = ['#03040c', '#0b0c2a', '#2a1446', '#0a0b22', '#04050e'];
    this.grid = '90,200,255';
  }
  newStar(z) { return { x: (Math.random() * 2 - 1) * 14, y: (Math.random() * 2 - 1) * 10 - 2, z }; }
  update(dt, speed) {
    for (const s of this.stars) { s.z -= speed * dt; if (s.z < 0.8) Object.assign(s, this.newStar(60)); }
    this.gridOff = (this.gridOff + speed * dt) % 4;
  }
  draw(ctx, cx, cy) {
    if (!this.skyCache) {
      const g = ctx.createLinearGradient(0, 0, 0, H), st = [0, 0.36, 0.42, 0.5, 1];
      this.sky.forEach((c, i) => g.addColorStop(st[i], c));
      this.skyCache = g;
    }
    ctx.fillStyle = this.skyCache; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#dfe9ff';
    for (const s of this.stars) {
      const k = F / s.z, x = VPX + (s.x - cx * 0.2) * k, y = VPY + (s.y - cy * 0.2) * k;
      if (x < -4 || x > W + 4 || y < -4 || y > H + 4) continue;
      const r = Math.min(2.6, 0.35 + 18 / s.z * 0.12);
      ctx.globalAlpha = Math.min(1, (60 - s.z) / 20);
      ctx.fillRect(x - r / 2, y - r / 2, r, r * (1 + 6 / s.z));
    }
    ctx.globalAlpha = 1;
    const gy = 2.6 - cy;
    ctx.strokeStyle = `rgba(${this.grid},0.22)`; ctx.lineWidth = 1;
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
      ctx.strokeStyle = `rgba(${this.grid},${Math.min(0.35, 6 / z * 0.35)})`;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
  }
}

// ================= ゲーム =================
export class Game {
  constructor(opts = {}) {
    this.opts = opts;
    this.level = LEVEL1;
    this.bg = new Backdrop();
    this.score = 0; this.kills = 0; this.maxVolley = 0; this.hits = 0;
    this.player = { x: 0, y: 0, vx: 0, shield: 100, inv: 0, bank: 0, alive: true };
    this.cam = { x: 0, y: -2 };
    this.over = false; this.clear = false; this.deadT = 0;
    this.shake = 0; this.flash = 0;
    this.energy = ENERGY_MAX; this.energyT = 0;
    this.roll = 0; this.rollCd = 0;
    this.enemies = []; this.eBullets = []; this.shots = []; this.lasers = []; this.fx = [];
    this.items = []; this.rings = []; this.popups = []; this.notes = []; this.locks = []; this.timers = [];
    this.boss = null; this.beam = null; this.msg = null; this.clearT = 0;
    this.shotT = 0; this.shotSide = 1; this.age = 0;
    this.tension = 0; this.sectionName = '';
    this.log = []; this.logT = 0; // 緩急の計測用
    this.t = opts.t || 0; this.ev = 0;
    const evs = this.level.events;
    while (this.ev < evs.length && evs[this.ev][0] <= this.t) this.ev++;
    if (this.t >= 82) { this.section('boss', 2); this.spawnBoss(); }
    bgm.play('s1');
  }

  proj(x, y, z) {
    const k = F / z;
    return [VPX + (x - this.cam.x) * k, VPY + (y - this.cam.y) * k, k];
  }

  // ---- タイムラインから呼ばれる ----
  section(name, tension) {
    this.sectionName = name; this.tension = tension;
    bgm.intense = tension >= 2;
  }
  message(title, sub, dur = 2.5) { this.msg = { title, sub, t: dur }; }
  note(text, color = '#ffd23f') { this.notes.push({ text, color, t: 0 }); }
  later(d, fn) { this.timers.push([this.t + d, fn]); }
  warning(name) { this.message('WARNING', name + ' 接近', 3); sfx.play('charge', 0.8, 0.7); bgm.stop(); }
  ring(x, y, z) { this.rings.push({ x, y, z, t: 0 }); }
  item(x, y, z) { this.items.push({ x, y, z, t: 0 }); }

  spawn(type, x, y, z, move) {
    const d = T[type];
    const e = { type, d, x, y, z, bx: x, by: y, mv: move, hp: d.hp, maxHp: d.hp, t: 0, st: 0, ht: 0,
      lockP: 0, lockN: 0, flash: 0, rot: 0, alive: true, ai: 0, aiT: 0.4 + Math.random() * 0.6, shielded: false };
    this.enemies.push(e);
    return e;
  }

  // 危険区間：画面左を巨大戦艦がゆっくり通過し、側面の砲台が撃ってくる
  flank() {
    const ship = this.spawn('flank', -4.4, -0.2, 32, (e, dt) => { e.z -= 1.7 * dt; });
    const offs = [[2.2, -0.9, -3], [2.4, 0.1, -1], [2.2, -0.5, 1], [2.4, 0.6, 3]];
    this.flankKilled = 0;
    this.flankTurrets = offs.map(([dx, dy, dz], i) => {
      const t = this.spawn('turret', ship.x + dx, ship.y + dy, ship.z + dz, (e, dt) => {
        if (!ship.alive) { e.alive = false; return; } // 戦艦が通り過ぎたら砲台も消える
        e.x = ship.x + dx; e.y = ship.y + dy; e.z = ship.z + dz;
      });
      t.aiT = 1.5 + i * 0.9; t.flank = true;
      return t;
    });
  }

  spawnBoss() {
    const b = this.spawn('cruiser', 0, -0.7, ZFAR, null);
    b.armor = true; b.vent = 0; b.cannonT = 6; b.summonT = 8; b.arrived = false;
    b.turrets = [[-1.7, -0.25], [1.7, -0.25], [-1.0, 0.45], [1.0, 0.45]].map(([dx, dy], i) => {
      const t = this.spawn('turret', b.x + dx, b.y + dy, b.z - 0.3, (e) => { e.x = b.x + dx; e.y = b.y + dy; e.z = b.z - 0.3; });
      t.aiT = 2.5 + i * 1.1; t.boss = true;
      return t;
    });
    this.boss = b;
    bgm.play('boss');
  }

  // ================= 更新 =================
  update(dt) {
    const p = this.player;
    if (this.over) { this.bg.update(dt, 6); this.updateFx(dt); return; }
    this.t += dt; this.age += dt;
    const evs = this.level.events;
    while (this.ev < evs.length && evs[this.ev][0] <= this.t) evs[this.ev++][1](this);
    if (this.timers.length) {
      const due = this.timers.filter(tm => tm[0] <= this.t);
      this.timers = this.timers.filter(tm => tm[0] > this.t);
      due.forEach(tm => tm[1]());
    }
    this.shake = Math.max(0, this.shake - dt * 3);
    this.flash = Math.max(0, this.flash - dt * 2.5);
    if (this.msg && (this.msg.t -= dt) <= 0) this.msg = null;

    if (p.alive) {
      let dx, dy;
      if (this.opts.bot) [dx, dy] = this.botMove(dt);
      else { const u = (1 - CAMF) * F / ZP / SENS; dx = input.dx / u; dy = input.dy / u; }
      const nx = Math.max(-XR, Math.min(XR, p.x + dx)), ny = Math.max(YMIN, Math.min(YMAX, p.y + dy));
      p.vx = (nx - p.x) / dt; p.x = nx; p.y = ny;
      p.bank += (Math.max(-1, Math.min(1, p.vx * 0.12)) - p.bank) * Math.min(1, dt * 10);
      p.inv = Math.max(0, p.inv - dt);
      this.roll = Math.max(0, this.roll - dt); this.rollCd = Math.max(0, this.rollCd - dt);
      if (input.doubleTap && this.rollCd <= 0 && this.age > 0.5) { this.roll = 0.45; this.rollCd = 1.2; sfx.play('shield', 0.35, 1.6); }
      // エネルギー回復
      if (this.energy < ENERGY_MAX) { this.energyT += dt; if (this.energyT >= ENERGY_REGEN) { this.energyT = 0; this.energy++; } }
      if (this.clearT <= 0) { this.autoFire(dt); this.updateLock(dt); }
    } else {
      this.deadT += dt;
      if (this.deadT > 2.2) this.over = true;
    }
    this.cam.x = p.x * CAMF; this.cam.y = -2 + p.y * CAMF;
    this.bg.update(dt, this.clearT > 0 ? 11 + (5 - this.clearT) * 12 : 11);

    this.updateShields();
    this.updateShots(dt);
    this.updateEnemies(dt);
    this.updateBeam(dt);
    this.updateEnemyBullets(dt);
    this.updateLasers(dt);
    this.updatePickups(dt);
    this.updateFx(dt);

    if (this.clearT > 0 && (this.clearT -= dt) <= 0) { this.clear = true; this.over = true; }

    // 緩急の計測（0.5秒ごと）
    this.logT += dt;
    if (this.logT >= 0.5) {
      this.logT = 0;
      this.log.push([+this.t.toFixed(1), this.tension, this.eBullets.length, this.enemies.filter(e => !e.d.deco).length, this.hits, this.score]);
    }
  }

  // テスト用の自動操縦：敵の正面に入りに行き、弾と主砲の範囲は避ける
  botMove(dt) {
    const p = this.player;
    let tx = p.x, ty = p.y, best = null, bd = 1e9;
    for (const e of this.enemies) {
      if (e.d.deco || e.z < ZP + 2 || e.z > 28 || e.shielded) continue;
      const pri = e.type === 'carrier' || e.type === 'bomber' ? -10 : 0;
      if (e.z + pri < bd) { bd = e.z + pri; best = e; }
    }
    if (best) { tx = best.x; ty = best.y; }
    // 弾の着弾予測点から最も遠い候補地点へ逃げる
    const threats = [];
    for (const b of this.eBullets) {
      if (b.z > ZP + 6 || b.vz >= 0) continue;
      const t = (b.z - ZP) / -b.vz;
      threats.push([b.x + b.vx * t, b.y + b.vy * t]);
    }
    const risk = (x, y) => threats.reduce((m, [fx, fy]) => Math.min(m, Math.hypot(fx - x, fy - y)), 9);
    let danger = false;
    if (risk(p.x, p.y) < 0.55 || risk(tx, ty) < 0.55) {
      danger = risk(p.x, p.y) < 0.4;
      let bx = p.x, by = p.y, bs = -1;
      for (let ox = -1.2; ox <= 1.21; ox += 0.3) for (let oy = -0.6; oy <= 0.61; oy += 0.3) {
        const x = Math.max(-XR, Math.min(XR, p.x + ox)), y = Math.max(YMIN, Math.min(YMAX, p.y + oy));
        const s = Math.min(1.2, risk(x, y)) - Math.hypot(ox, oy) * 0.15;
        if (s > bs) { bs = s; bx = x; by = y; }
      }
      tx = bx; ty = by;
    }
    if (this.beam && (this.beam.inside(p.x, p.y) || this.beam.inside(tx, ty))) { tx = this.beam.safeX; ty = this.beam.safeY; }
    this.botT = (this.botT || 0) + dt;
    const cyc = this.botT % 2.4;
    input.down = cyc < 2.0;
    if (cyc >= 2.0 && cyc - dt < 2.0) input.released = true;
    input.holdTime = input.down ? cyc : 0;
    if (danger && this.opts.botRoll && this.rollCd <= 0) { this.roll = 0.45; this.rollCd = 1.2; }
    const k = Math.min(1, dt * 5);
    return [(tx - p.x) * k, (ty - p.y) * k];
  }

  // ---- 自機の攻撃 ----
  autoFire(dt) {
    const p = this.player;
    this.shotT -= dt;
    if (this.shotT > 0) return;
    this.shotT = SHOT_INT;
    this.shotSide = -this.shotSide;
    this.shots.push({ x: p.x + this.shotSide * 0.16, y: p.y + 0.05, z: ZP + 0.3 });
    if (this.shotSide > 0) sfx.play('shot', 0.14, 1.1);
  }

  lockable(e) { return e.alive && !e.d.deco && !e.shielded && e.z > ZP + 2 && e.z < 32 && (e.type !== 'cruiser' || !e.armor || e.vent > 0); }
  inReticle(e) { const p = this.player; return Math.hypot(e.x - p.x, e.y - p.y) < LOCK_R + e.d.r * 0.5; }

  updateLock(dt) {
    this.locks = this.locks.filter(e => e.alive);
    const holding = input.down && input.holdTime > 0.12;
    for (const e of this.enemies) {
      if (e.d.deco) continue;
      const can = holding && this.lockable(e) && this.inReticle(e) && this.locks.length < this.energy
        && e.lockN < Math.ceil(e.hp / LASER_DMG);
      if (can) {
        e.lockP += dt / e.d.lockT;
        if (e.lockP >= 1) {
          e.lockP = 0; e.lockN++; this.locks.push(e);
          sfx.play('lock', 0.45, 1 + this.locks.length * 0.07);
        }
      } else e.lockP = Math.max(0, e.lockP - dt * 2.5);
    }
    if (input.released && this.locks.length) this.fireVolley();
  }

  fireVolley() {
    const p = this.player, n = this.locks.length, volley = { n };
    this.energy -= n; this.energyT = 0;
    this.locks.forEach((e, i) => {
      const side = i % 2 ? 1 : -1;
      this.lasers.push({ e, volley, t: 0, dur: 0.24 + i * 0.03, sx: p.x, sy: p.y, sz: ZP + 0.2,
        cx: p.x + side * (0.7 + Math.random() * 0.6), cy: p.y - 0.8 - Math.random() * 0.6, cz: ZP + 2 + Math.random() * 2,
        tx: e.x, ty: e.y, tz: e.z, trail: [] });
    });
    this.maxVolley = Math.max(this.maxVolley, n);
    this.locks = [];
    sfx.play('laser', 0.6, 1.2 - n * 0.03);
  }

  updateShots(dt) {
    // 巡洋艦の前にある砲台に先に当たるよう、巡洋艦は最後に判定する
    this.shotOrder = this.enemies.filter(e => e.type !== 'cruiser').concat(this.enemies.filter(e => e.type === 'cruiser'));
    for (const s of this.shots) {
      const pz = s.z;
      s.z += SHOT_SPEED * dt;
      for (const e of this.shotOrder) {
        if (!e.alive || e.d.deco) continue;
        const r = e.d.r;
        if (e.z + r < pz || e.z - r > s.z) continue;
        if (Math.hypot(e.x - s.x, e.y - s.y) < r) {
          s.dead = true;
          if (this.immune(e)) { this.spark(s.x, s.y, e.z - 0.3, glow.white, 2); sfx.play('hit', 0.15, 2); }
          else { this.damage(e, 1, null); this.spark(s.x, s.y, e.z - 0.2, glow.blue, 3); }
          break;
        }
      }
    }
    this.shots = this.shots.filter(s => !s.dead && s.z < ZFAR);
  }
  // 攻撃が通らない状態か（盾に守られている／巡洋艦の装甲）
  immune(e) { return e.shielded || (e.type === 'cruiser' && e.armor && e.vent <= 0); }

  // 盾持ちの近くの味方は守られる
  updateShields() {
    const carriers = this.enemies.filter(c => c.alive && c.type === 'carrier' && c.z < 34);
    for (const e of this.enemies) {
      e.shielded = e.type !== 'carrier' && carriers.some(c => Math.hypot(c.x - e.x, c.y - e.y) < 1.4 && Math.abs(c.z - e.z) < 3);
    }
  }

  // ---- 敵 ----
  updateEnemies(dt) {
    const p = this.player;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      e.t += dt; e.flash = Math.max(0, e.flash - dt);
      if (e.d.spin) e.rot += dt * e.d.spin;
      if (e.mv) e.mv(e, dt, this);
      if (e.type === 'cruiser') this.updateCruiser(e, dt);
      else if (p.alive && this.clearT <= 0) this.enemyAI(e, dt);
      // 体当たり
      if (!e.d.deco && p.alive && Math.abs(e.z - ZP) < 0.45 && Math.hypot(e.x - p.x, e.y - p.y) < e.d.r * 0.8 + PLAYER_R) {
        this.hurt(e.type === 'charger' ? 25 : 20, 'body:' + e.type);
        if (e.type !== 'cruiser' && e.type !== 'turret') this.damage(e, 99, null);
      }
      if (e.z < 1 || e.z > 95 || e.y < -7) e.alive = false;
    }
    this.enemies = this.enemies.filter(e => e.alive);
  }

  // 予兆付きの攻撃
  enemyAI(e, dt) {
    const p = this.player, inRange = e.z > 6 && e.z < 30;
    switch (e.type) {
      case 'gunner': case 'turret': {
        // 待機 → 光る（0.7秒）→ 3連射（撃つたびに自機の位置を狙う）
        if (!inRange) return;
        if (e.ai === 0) { e.aiT -= dt; if (e.aiT <= 0) { e.ai = 1; e.aiT = 0.7; sfx.play('charge', 0.25, 2); } }
        else if (e.ai === 1) { e.aiT -= dt; if (e.aiT <= 0) { e.ai = 2; e.aiT = 0; e.burst = 0; } }
        else {
          e.aiT -= dt;
          if (e.aiT <= 0) {
            this.aimBullet(e, p.x, p.y, BULLET_SPEED); e.burst++; e.aiT = 0.14;
            if (e.burst >= 3) { e.ai = 0; e.aiT = e.type === 'turret' ? 1.7 : 1.5; }
          }
        }
        break;
      }
      case 'sniper': {
        // 待機 → 照準線が自機を追う（1秒）→ 線が止まる（0.35秒）→ 高速弾
        if (!inRange) return;
        if (e.ai === 0) { e.aiT -= dt; if (e.aiT <= 0) { e.ai = 1; e.aiT = 1.0; } }
        else if (e.ai === 1) { e.tx = p.x; e.ty = p.y; e.aiT -= dt; if (e.aiT <= 0) { e.ai = 2; e.aiT = 0.35; sfx.play('lock', 0.3, 0.6); } }
        else { e.aiT -= dt; if (e.aiT <= 0) { this.aimBullet(e, e.tx, e.ty, BULLET_SPEED * 2.4, true); e.ai = 0; e.aiT = 2.2; } }
        break;
      }
      case 'charger': {
        // 接近 → 停止して光る（0.8秒、狙う地点を固定）→ その地点へ突進
        if (e.st === 0) { e.z -= 13 * dt; if (e.z <= 15) { e.st = 1; e.aiT = 0.8; e.tx = p.x; e.ty = p.y; sfx.play('charge', 0.4, 1.4); } }
        else if (e.st === 1) {
          e.aiT -= dt; e.tx = p.x; e.ty = p.y;
          if (e.aiT <= 0.25) { /* 最後の0.25秒は狙いを固定 */ e.st = 1.5; }
        } else if (e.st === 1.5) {
          e.aiT -= dt;
          if (e.aiT <= 0) {
            const dx = e.tx - e.x, dy = e.ty - e.y, dz = ZP - 1 - e.z, l = Math.hypot(dx, dy, dz);
            e.vx = dx / l * 17; e.vy = dy / l * 17; e.vz = dz / l * 17; e.st = 2;
          }
        } else { e.x += e.vx * dt; e.y += e.vy * dt; e.z += e.vz * dt; }
        break;
      }
      case 'mine': {
        // 近づくと点滅し、自機の近くで全方位に破裂
        if (e.z < 7 && (Math.hypot(e.x - p.x, e.y - p.y) < 1.5 || e.z < 5)) {
          for (let i = 0; i < 8; i++) {
            const a = i / 8 * Math.PI * 2;
            this.eBullets.push({ x: e.x, y: e.y, z: e.z, vx: Math.cos(a) * 2.2, vy: Math.sin(a) * 2.2, vz: -7 });
          }
          sfx.play('zap', 0.5, 1.2);
          this.explode(e.x, e.y, e.z, 0.6);
          e.alive = false;
        }
        break;
      }
    }
  }

  // ---- 装甲巡洋艦 ----
  // 本体は装甲で無敵。砲台4基を全部壊すと装甲が開く。主砲（予兆で安全地帯が見える）を撃った直後の数秒もコアがむき出し
  updateCruiser(b, dt) {
    if (!b.arrived) { b.z -= 9 * dt; if (b.z <= 11) { b.z = 11; b.arrived = true; } return; }
    b.bt = (b.bt || 0) + dt;
    b.x = Math.sin(b.bt * 0.35) * 0.8; b.y = -0.75 + Math.sin(b.bt * 0.6) * 0.25;
    b.vent = Math.max(0, b.vent - dt);
    if (b.armor && b.turrets.every(t => !t.alive)) {
      b.armor = false; this.message('', '装甲が開いた！ コアを撃て', 2.5); sfx.play('item', 0.8, 0.8);
    }
    if (!this.player.alive) return;
    const ph2 = b.hp < b.maxHp * 0.5;
    if (!b.armor) { // 装甲が開いたあとは本体も扇状弾で応戦（予兆：コアが強く光る）
      b.fanT = (b.fanT ?? 2.5) - dt;
      if (b.fanT <= 0.7 && !b.fanWarn) { b.fanWarn = true; sfx.play('charge', 0.4, 1.8); } // 0.7秒前からコアが光る
      if (b.fanT <= 0) {
        b.fanT = ph2 ? 2.4 : 3.0; b.fanWarn = false;
        const p = this.player;
        for (let i = -2; i <= 2; i++) this.aimBullet(b, p.x + i * 1.0, p.y, BULLET_SPEED * 0.9);
        sfx.play('zap', 0.5);
      }
    }
    b.cannonT -= dt;
    if (b.cannonT <= 0 && !this.beam) { this.startBeam(b, ph2); b.cannonT = ph2 ? 7 : 9; }
    if (ph2) {
      b.summonT -= dt;
      if (b.summonT <= 0) {
        b.summonT = 9;
        for (let i = 0; i < 4; i++) {
          const s = this.spawn('scout', b.x + (i - 1.5) * 0.6, b.y + 0.3, b.z + 8, mv.line(7, 0.5, i));
          s.bx = b.x + (i - 1.5) * 0.9;
        }
      }
    }
  }

  // 主砲：画面の一部を覆う「危険範囲」を1.6秒予告 → 0.9秒照射
  startBeam(b, ph2, force = null, warn = 1.6) {
    const p = this.player;
    const kinds = ['left', 'right', 'top', 'bottom', 'center'];
    // 基本は自機のいる側を狙う（必ず安全地帯が残る）
    let kind = force || (p.x < 0 ? 'left' : 'right');
    if (!force && Math.random() < 0.35) kind = kinds[Math.floor(Math.random() * kinds.length)];
    const R = { left: [-3, -0.1, -3, 3], right: [0.1, 3, -3, 3], top: [-3, 3, -3, -0.35], bottom: [-3, 3, -0.15, 3], center: [-0.9, 0.9, -3, 3] }[kind];
    const safe = { left: [1.3, -0.3], right: [-1.3, -0.3], top: [0, 0.6], bottom: [0, -1.1], center: [1.7, -0.3] }[kind];
    const second = ph2 && !force ? (kind === 'left' ? 'right' : kind === 'right' ? 'left' : null) : null;
    this.beam = { b, x0: R[0], x1: R[1], y0: R[2], y1: R[3], warn, fire: 0, hit: false, safeX: safe[0], safeY: safe[1], second,
      inside(x, y) { return x > this.x0 && x < this.x1 && y > this.y0 && y < this.y1; } };
    sfx.play('charge', 0.9, 0.5);
  }
  updateBeam(dt) {
    const bm = this.beam;
    if (!bm) return;
    if (!bm.b.alive) { this.beam = null; return; }
    if (bm.warn > 0) {
      bm.warn -= dt;
      if (bm.warn <= 0) { bm.fire = 0.9; sfx.play('boom', 0.7, 1.3); this.shake = 0.6; }
      return;
    }
    bm.fire -= dt;
    const p = this.player;
    if (!bm.hit && bm.inside(p.x, p.y)) { bm.hit = true; this.hurt(35, 'beam'); }
    if (bm.fire <= 0) {
      this.beam = null;
      bm.b.vent = 3.2; // 撃った直後はコアがむき出し
      this.note('主砲の排熱中：コアが無防備', '#ffb070');
      if (bm.second) { // 第2段階：反対側へもう一発（予告は短め）
        const b = bm.b, side = bm.second;
        this.later(0.3, () => { if (b.alive && !this.beam) this.startBeam(b, false, side, 1.1); });
      }
    }
  }

  aimBullet(e, tx, ty, sp, fast = false) {
    const dx = tx - e.x, dy = ty - e.y, dz = ZP - e.z, l = Math.hypot(dx, dy, dz);
    this.eBullets.push({ x: e.x, y: e.y, z: e.z - 0.3, vx: dx / l * sp, vy: dy / l * sp, vz: dz / l * sp, fast, src: e.type });
  }

  updateEnemyBullets(dt) {
    const p = this.player;
    for (const b of this.eBullets) {
      const pz = b.z;
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
      if (p.alive && pz >= ZP && b.z < ZP && Math.hypot(b.x - p.x, b.y - p.y) < PLAYER_R + 0.08 && this.roll <= 0) { b.dead = true; this.hurt(20, b.fast ? 'snipe' : 'bullet:' + (b.src || '')); }
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
        if (L.e.alive && !this.immune(L.e)) { this.damage(L.e, LASER_DMG, L.volley); this.spark(x, y, z, glow.green, 6); }
      }
      if (L.done) L.fade = (L.fade || 0) + dt * 6;
    }
    this.lasers = this.lasers.filter(L => !L.done || L.fade < 1);
  }

  updatePickups(dt) {
    const p = this.player;
    for (const r of this.rings) {
      const pz = r.z; r.z -= 10 * dt; r.t += dt;
      if (p.alive && pz >= ZP && r.z < ZP) {
        if (Math.hypot(r.x - p.x, r.y - p.y) < 0.55) {
          r.got = true; this.energy = Math.min(ENERGY_MAX, this.energy + 2); this.score += 200;
          sfx.play('item', 0.5, 1.4); this.popupWorld(r.x, r.y, ZP + 0.5, 'RING +200', '#7fffd4');
        }
        r.dead = true;
      }
    }
    this.rings = this.rings.filter(r => !r.dead);
    for (const it of this.items) {
      it.z -= 9 * dt; it.t += dt;
      if (it.z < ZP + 5) { const k = Math.min(1, dt * 3); it.x += (p.x - it.x) * k; it.y += (p.y - it.y) * k; }
      if (p.alive && Math.abs(it.z - ZP) < 0.6 && Math.hypot(it.x - p.x, it.y - p.y) < 0.7) {
        it.dead = true; p.shield = Math.min(100, p.shield + 30);
        sfx.play('shield', 0.8); this.popupWorld(it.x, it.y, it.z, 'SHIELD +', '#7fdcff');
      }
    }
    this.items = this.items.filter(it => !it.dead && it.z > 1);
  }

  updateFx(dt) {
    for (const q of this.fx) { q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt - 6 * dt; q.t += dt; }
    this.fx = this.fx.filter(q => q.t < q.life && q.z > 0.8);
    for (const pp of this.popups) { pp.t += dt; pp.y -= 22 * dt; }
    this.popups = this.popups.filter(pp => pp.t < 1.1);
    for (const n of this.notes) n.t += dt;
    this.notes = this.notes.filter(n => n.t < 2.5);
  }

  // ---- ダメージ ----
  damage(e, dmg, volley) {
    if (!e.alive) return;
    e.hp -= dmg; e.flash = 0.07;
    if (e.hp > 0) { sfx.play('hit', 0.22, 1.3); return; }
    e.alive = false; this.kills++;
    const mul = volley && e.type !== 'cruiser' ? volley.n : 1;
    const pts = e.d.score * mul;
    this.score += pts;
    this.popupWorld(e.x, e.y, e.z, mul > 1 ? `${pts} x${mul}` : `${pts}`, mul >= 4 ? '#ffd23f' : volley ? '#9dffb0' : '#ffffff');
    this.explode(e.x, e.y, e.z, e.type === 'cruiser' ? 2.4 : e.d.size);
    sfx.play(e.d.size > 1 ? 'bigexplode' : 'explode', 0.55, 0.9 + Math.random() * 0.3);
    if (e.type === 'bomber') this.detonate(e);
    if (e.flank && ++this.flankKilled === this.flankTurrets.length) { this.score += 5000; this.note('戦艦の砲台 全滅 +5000'); }
    if (e.type === 'cruiser') this.bossDown(e);
  }

  // 爆雷艇の誘爆：周囲の敵（盾も無視）と、近ければ自機も巻き込む
  detonate(e) {
    const R = 1.6;
    this.fx.push({ x: e.x, y: e.y, z: e.z, vx: 0, vy: 0, vz: 0, t: 0, life: 0.5, ring: true, s: R * 1.4, color: 'rgba(255,170,80,' });
    sfx.play('boom', 0.6, 1.1);
    this.later(0.12, () => {
      let n = 0;
      for (const o of this.enemies) {
        if (!o.alive || o === e || o.d.deco || o.type === 'cruiser') continue;
        if (Math.hypot(o.x - e.x, o.y - e.y) < R && Math.abs(o.z - e.z) < 3) { const was = o.alive; this.damage(o, 8, null); if (was && !o.alive) n++; }
      }
      if (n >= 2) { const b = 300 * n * n; this.score += b; this.note(`誘爆 ${n}体  +${b}`); }
      const p = this.player;
      if (Math.abs(e.z - ZP) < 3 && Math.hypot(e.x - p.x, e.y - p.y) < R * 0.8) this.hurt(20, 'bomb');
    });
  }

  bossDown(b) {
    this.beam = null; bgm.stop();
    for (let i = 0; i < 8; i++) this.later(i * 0.18, () => {
      this.explode(b.x + (Math.random() - 0.5) * 3, b.y + (Math.random() - 0.5) * 1.5, b.z, 1.6);
      sfx.play('bigexplode', 0.8, 0.7 + Math.random() * 0.3);
      this.shake = 0.8; this.flash = Math.max(this.flash, 0.3);
    });
    this.later(1.5, () => { sfx.play('boom', 1); this.flash = 1; });
    for (const m of this.enemies) if (m !== b && !m.d.deco) { m.alive = false; this.explode(m.x, m.y, m.z, 0.6); }
    this.eBullets = []; this.locks = [];
    const bonus = Math.round(this.player.shield) * 100 + (this.hits === 0 ? 30000 : 0);
    this.score += bonus;
    this.message('STAGE CLEAR', `SHIELD BONUS ${bonus}` + (this.hits === 0 ? '（ノーダメージ込み）' : ''), 4.5);
    this.clearT = 5;
  }

  hurt(dmg, src = '?') {
    const p = this.player;
    if (p.inv <= 0 && this.roll <= 0 && p.alive && !this.opts.god && this.clearT <= 0) (this.hurtLog = this.hurtLog || []).push([+this.t.toFixed(1), src]);
    if (p.inv > 0 || this.roll > 0 || !p.alive || this.opts.god || this.clearT > 0) return;
    p.shield -= dmg; p.inv = 1.0; this.hits++;
    this.shake = 1; this.flash = 0.5;
    this.locks.forEach(e => e.lockN = Math.max(0, e.lockN - 1)); this.locks = [];
    sfx.play('damage', 0.9);
    if (p.shield <= 0) {
      p.shield = 0; p.alive = false; bgm.stop();
      this.explode(p.x, p.y, ZP + 0.5, 1.4);
      sfx.play('lose', 0.9); sfx.play('bigexplode', 0.9, 0.8);
    }
  }
  cancelLocks() { this.locks.forEach(e => e.lockN = Math.max(0, e.lockN - 1)); this.locks = []; }

  explode(x, y, z, size) {
    this.fx.push({ x, y, z, vx: 0, vy: 0, vz: 0, t: 0, life: 0.45, ring: true, s: size * 1.6 });
    const n = Math.min(36, 10 + size * 8);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, b = Math.random() * 2 - 1, sp = (1.5 + Math.random() * 3) * size;
      this.fx.push({ x, y, z, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.8, vz: b * sp, t: 0, life: 0.4 + Math.random() * 0.5,
        g: Math.random() < 0.5 ? glow.orange : glow.red, s: 0.12 + Math.random() * 0.12 * size });
    }
  }
  spark(x, y, z, g, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 1 + Math.random() * 2;
      this.fx.push({ x, y, z, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: 0, t: 0, life: 0.25, g, s: 0.08 });
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

    const list = [];
    for (const e of this.enemies) list.push([e.z, 0, e]);
    for (const b of this.eBullets) list.push([b.z, 1, b]);
    for (const s of this.shots) list.push([s.z, 2, s]);
    for (const q of this.fx) list.push([q.z, 3, q]);
    for (const it of this.items) list.push([it.z, 4, it]);
    for (const r of this.rings) list.push([r.z, 6, r]);
    if (p.alive) list.push([ZP, 5, p]);
    list.sort((a, b) => b[0] - a[0]);
    for (const [z, kind, o] of list) {
      if (z < 0.8) continue;
      const [x, y, k] = this.proj(o.x, o.y, z);
      const fog = Math.max(0, Math.min(1, (ZFAR + 4 - z) / 10));
      if (kind === 0) this.drawEnemy(ctx, o, x, y, k, fog);
      else if (kind === 1) {
        ctx.globalCompositeOperation = 'lighter';
        drawGlow(ctx, o.fast ? glow.white : glow.red, x, y, Math.max(4, (o.fast ? 0.16 : 0.24) * k));
        ctx.globalCompositeOperation = 'source-over';
      }
      else if (kind === 2) { ctx.globalAlpha = fog; drawSpr(ctx, 'laserBlue01', x, y, Math.max(1.5, 0.07 * k)); ctx.globalAlpha = 1; }
      else if (kind === 3) this.drawFx(ctx, o, x, y, k);
      else if (kind === 4) drawSpr(ctx, 'powerupBlue_shield', x, y, Math.max(8, 0.45 * k), Math.sin(o.t * 4) * 0.3);
      else if (kind === 6) {
        ctx.strokeStyle = `rgba(127,255,212,${fog * 0.9})`; ctx.lineWidth = Math.max(1.5, 0.06 * k);
        ctx.beginPath(); ctx.ellipse(x, y, 0.55 * k, 0.55 * k, 0, 0, 7); ctx.stroke();
      }
      else this.drawPlayer(ctx, x, y, k);
    }
    this.drawTelegraphs(ctx);
    this.drawBeam(ctx);
    this.drawLasers(ctx);
    this.drawReticle(ctx);
    ctx.restore();

    // 危険区間は画面の縁を赤く
    if (this.tension >= 2 && this.clearT <= 0) {
      if (!this.vignette) {
        const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.75);
        g.addColorStop(0, 'rgba(255,0,40,0)'); g.addColorStop(1, 'rgba(255,0,40,1)');
        this.vignette = g;
      }
      ctx.globalAlpha = 0.18 + Math.sin(this.t * 4) * 0.06;
      ctx.fillStyle = this.vignette; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
    }
    if (this.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${this.flash * 0.5})`; ctx.fillRect(0, 0, W, H); }
    this.drawHUD(ctx);
  }

  drawEnemy(ctx, e, x, y, k, fog) {
    const w = e.d.size * k;
    if (w < 1) return;
    ctx.globalAlpha = fog * (e.d.deco ? 0.85 : 1);
    const flip = e.type === 'cruiser';
    drawSpr(ctx, e.d.spr, x, y, w, e.d.spin ? e.rot : 0, flip);
    // 予兆の発光
    const warn = (e.type === 'gunner' || e.type === 'turret') && e.ai === 1 ? 1 - e.aiT / 0.7
      : e.type === 'charger' && (e.st === 1 || e.st === 1.5) ? 1
      : e.type === 'mine' && e.z < 10 ? (Math.floor(this.t * 8) % 2)
      : e.type === 'bomber' ? (Math.floor(this.t * 5) % 2) * 0.5
      : e.type === 'cruiser' && e.fanWarn ? 1 - Math.max(0, e.fanT) / 0.7 : 0;
    if (e.flash > 0 || warn > 0) {
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = e.flash > 0 ? 0.6 : 0.25 + warn * 0.5;
      drawSpr(ctx, e.d.spr, x, y, w, e.d.spin ? e.rot : 0, flip);
      if (warn > 0) drawGlow(ctx, e.type === 'bomber' ? glow.orange : glow.red, x, y, w * (0.3 + warn * 0.4));
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = 1;
    // 盾
    if (e.shielded || (e.type === 'cruiser' && e.armor && e.vent <= 0)) {
      ctx.strokeStyle = 'rgba(120,220,255,0.5)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, e.d.r * k * 1.1, 0, 7); ctx.stroke();
    }
    if (e.type === 'carrier') { // 守っている味方への線
      ctx.strokeStyle = 'rgba(120,220,255,0.35)'; ctx.lineWidth = 1;
      for (const o of this.enemies) if (o.shielded && Math.hypot(o.x - e.x, o.y - e.y) < 1.4 && Math.abs(o.z - e.z) < 3) {
        const [ox, oy] = this.proj(o.x, o.y, o.z); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ox, oy); ctx.stroke();
      }
    }
    if (e.type === 'cruiser' && (!e.armor || e.vent > 0)) { // むき出しのコア
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(ctx, glow.orange, x, y + w * 0.05, w * (0.12 + Math.sin(this.t * 10) * 0.02));
      ctx.globalCompositeOperation = 'source-over';
    }
    // ロックの進捗とロック済み
    if (e.lockP > 0) {
      ctx.strokeStyle = '#ff8080'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, Math.max(12, e.d.r * k * 1.3), -Math.PI / 2, -Math.PI / 2 + e.lockP * Math.PI * 2); ctx.stroke();
    }
    if (e.lockN > 0) {
      const r = Math.max(22, Math.min(80, e.d.r * k * 1.6));
      drawSpr(ctx, 'laserRed08', x, y, r, this.t * 3);
      if (e.lockN > 1) this.text(ctx, 'x' + e.lockN, x + r * 0.55, y - r * 0.5, 12, '#ff6a6a', 'left');
    }
  }

  // スナイパーの照準線・突撃機の狙い
  drawTelegraphs(ctx) {
    const p = this.player;
    for (const e of this.enemies) {
      if (e.type === 'sniper' && e.ai >= 1) {
        const [x0, y0] = this.proj(e.x, e.y, e.z), [x1, y1] = this.proj(e.tx, e.ty, ZP);
        const locked = e.ai === 2;
        ctx.strokeStyle = locked ? (Math.floor(this.t * 20) % 2 ? '#ffffff' : '#ff3050') : 'rgba(255,60,80,0.55)';
        ctx.lineWidth = locked ? 2.5 : 1.2;
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      }
      if (e.type === 'charger' && (e.st === 1 || e.st === 1.5)) {
        const [x1, y1, k] = this.proj(e.tx, e.ty, ZP);
        ctx.strokeStyle = e.st === 1.5 ? '#ff3050' : 'rgba(255,60,80,0.5)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x1, y1, 0.5 * k, 0, 7); ctx.stroke();
      }
    }
  }

  // 主砲の危険範囲（予告）と照射
  drawBeam(ctx) {
    const bm = this.beam;
    if (!bm) return;
    const [ax, ay] = this.proj(Math.max(-2.6, bm.x0), Math.max(-2, bm.y0), ZP + 0.2);
    const [bx, by] = this.proj(Math.min(2.6, bm.x1), Math.min(1.6, bm.y1), ZP + 0.2);
    if (bm.warn > 0) {
      const a = 0.12 + (Math.floor(this.t * 10) % 2) * 0.1;
      ctx.fillStyle = `rgba(255,40,60,${a})`; ctx.fillRect(ax, ay, bx - ax, by - ay);
      ctx.strokeStyle = 'rgba(255,80,100,0.9)'; ctx.lineWidth = 2; ctx.strokeRect(ax, ay, bx - ax, by - ay);
      this.text(ctx, '主砲 予告', (ax + bx) / 2, Math.max(90, Math.min(560, (ay + by) / 2)), 13, '#ffb0b0', 'center', 'SYS');
    } else {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(255,200,180,${0.35 + Math.random() * 0.15})`; ctx.fillRect(ax, ay, bx - ax, by - ay);
      const [sx, sy] = this.proj(bm.b.x, bm.b.y, bm.b.z);
      ctx.fillStyle = 'rgba(255,120,100,0.3)';
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ax, ay); ctx.lineTo(bx, ay); ctx.lineTo(bx, by); ctx.lineTo(ax, by); ctx.closePath(); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  drawFx(ctx, q, x, y, k) {
    const a = 1 - q.t / q.life;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = a;
    if (q.ring) {
      if (q.color) { ctx.strokeStyle = q.color + a + ')'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, Math.min(400, q.s * k * (q.t / q.life)), 0, 7); ctx.stroke(); }
      else {
        drawGlow(ctx, glow.orange, x, y, Math.min(400, q.s * k * (0.4 + q.t / q.life)));
        ctx.strokeStyle = `rgba(255,220,160,${a})`; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, Math.min(400, q.s * k * (0.3 + q.t / q.life * 1.2)), 0, 7); ctx.stroke();
      }
    } else drawGlow(ctx, q.g, x, y, Math.max(1.5, Math.min(60, q.s * k)));
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }

  drawPlayer(ctx, x, y, k) {
    const p = this.player;
    if (p.inv > 0 && this.roll <= 0 && Math.floor(p.inv * 20) % 2) return;
    const w = 0.75 * k;
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, glow.blue, x, y + w * 0.32, w * (0.18 + Math.random() * 0.05));
    if (this.roll > 0) drawGlow(ctx, glow.white, x, y, w * 0.7);
    ctx.globalCompositeOperation = 'source-over';
    ctx.save(); ctx.translate(x, y); ctx.rotate(p.bank * 0.45);
    const sx = this.roll > 0 ? Math.cos((1 - this.roll / 0.45) * Math.PI * 2) : 1 - Math.abs(p.bank) * 0.25;
    ctx.scale(Math.abs(sx) < 0.08 ? 0.08 : sx, 1);
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
        ctx.strokeStyle = `rgba(90,255,150,${a * f})`; ctx.lineWidth = 1 + 4 * f;
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
    const locking = input.down && input.holdTime > 0.12;
    ctx.strokeStyle = locking ? 'rgba(255,90,90,0.85)' : 'rgba(120,255,160,0.55)';
    ctx.lineWidth = 1.5;
    for (const [dz, s] of [[6, 26], [14, 16]]) {
      const [x, y] = this.proj(p.x, p.y, ZP + dz);
      ctx.strokeRect(x - s / 2, y - s / 2, s, s);
    }
    if (locking) {
      const [x, y, k] = this.proj(p.x, p.y, ZP + 10);
      ctx.beginPath(); ctx.arc(x, y, LOCK_R * k, 0, 7); ctx.stroke();
    }
  }

  text(ctx, s, x, y, size, color, align = 'center', font) {
    font = font || (size > 13 && !/K/.test(s) ? 'Kenvector, sans-serif' : 'SYS');
    ctx.font = font === 'SYS' ? `700 ${size}px system-ui, sans-serif` : `${size}px ${font}`;
    ctx.textAlign = align; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillText(s, x + 1.5, y + 1.5);
    ctx.fillStyle = color; ctx.fillText(s, x, y);
  }

  drawHUD(ctx) {
    const p = this.player;
    this.text(ctx, String(this.score).padStart(8, '0'), 12, 22, 16, '#ffffff', 'left');
    this.text(ctx, 'STAGE 1', 12, 42, 11, '#9fd7ff', 'left');
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillRect(W - 30, 12, 5, 18); ctx.fillRect(W - 20, 12, 5, 18);

    const bx = 12, by = H - 26, bw = 150;
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(bx - 2, by - 2, bw + 4, 12);
    const sh = Math.max(0, p.shield / 100);
    ctx.fillStyle = sh > 0.5 ? '#4fd3ff' : sh > 0.25 ? '#ffcf5a' : '#ff4f6a';
    ctx.fillRect(bx, by, bw * sh, 8);
    this.text(ctx, 'SHIELD', bx, by - 10, 9, '#cfe8ff', 'left');
    ctx.fillStyle = this.rollCd > 0 ? 'rgba(255,255,255,0.25)' : '#ffffff';
    ctx.fillRect(bx + 50, by - 13, 30 * (1 - this.rollCd / 1.2), 3);
    // エネルギー（＝撃てるロック数）
    for (let i = 0; i < ENERGY_MAX; i++) {
      const x = W - 14 - (ENERGY_MAX - i) * 14;
      ctx.fillStyle = i < this.locks.length ? '#ff5a5a' : i < this.energy ? '#7fffd4' : 'rgba(255,255,255,0.15)';
      ctx.fillRect(x, by, 11, 8);
    }
    if (this.energy < ENERGY_MAX) { ctx.fillStyle = 'rgba(127,255,212,0.5)'; ctx.fillRect(W - 14 - (ENERGY_MAX - this.energy) * 14, by + 10, 11 * this.energyT / ENERGY_REGEN, 2); }
    this.text(ctx, 'ENERGY', W - 14 - ENERGY_MAX * 14, by - 10, 9, '#7fffd4', 'left');

    const b = this.boss;
    if (b && b.alive && b.arrived) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(60, 60, 240, 7);
      ctx.fillStyle = b.armor && b.vent <= 0 ? '#7a8aa0' : '#ff5a7a'; ctx.fillRect(60, 60, 240 * b.hp / b.maxHp, 7);
      this.text(ctx, b.armor ? (b.vent > 0 ? 'ARMORED CRUISER ─ 排熱中！' : 'ARMORED CRUISER ─ 装甲（砲台を壊せ）') : 'ARMORED CRUISER ─ コア露出', W / 2, 76, 9, '#ffb0c0', 'center', 'SYS');
    }

    for (const pp of this.popups) {
      ctx.globalAlpha = Math.max(0, Math.min(1, 2 - pp.t * 1.8));
      this.text(ctx, pp.text, pp.x, pp.y, 11, pp.color);
    }
    this.notes.forEach((n, i) => {
      ctx.globalAlpha = Math.max(0, Math.min(1, (2.5 - n.t) * 2));
      this.text(ctx, n.text, W / 2, 250 + i * 20, 13, n.color, 'center', 'SYS');
    });
    ctx.globalAlpha = 1;
    if (this.msg) {
      const m = this.msg, a = Math.min(1, m.t * 2), warn = m.title === 'WARNING' || m.title === 'DANGER';
      ctx.globalAlpha = a;
      if (m.title) this.text(ctx, m.title, W / 2, 160, warn ? 30 : 26, warn ? (Math.floor(this.t * 4) % 2 ? '#ff4f6a' : '#ffffff') : '#ffffff');
      if (m.sub) this.text(ctx, m.sub, W / 2, 195, 12, '#cfe8ff', 'center', 'SYS');
      ctx.globalAlpha = 1;
    }
  }
}

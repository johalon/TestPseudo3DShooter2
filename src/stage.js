// 全6ステージの定義：見た目（テーマ）、敵の出現タイムライン（秒）、ボス
// 座標系：x 左右（-2.2〜2.2）、y 上下（上が負）、z 奥行き（大きいほど遠い）

// ---- 移動パターン（e: 敵, dt, g: ゲーム） ----
export const straight = (spd, vx = 0, vy = 0) => (e, dt) => {
  e.z -= spd * dt; e.x += vx * dt; e.y += vy * dt;
};
// 手前 zh まで来て dur 秒とどまり、上へ離脱する
export const hover = (zh, dur, spd = 14, sway = 0.8) => (e, dt) => {
  if (e.st === 0) { e.z -= spd * dt; if (e.z <= zh) { e.z = zh; e.st = 1; e.bx = e.x; e.ht = 0; } }
  else if (e.st === 1) { e.ht += dt; e.x = e.bx + Math.sin(e.ht * 1.3) * sway; if (e.ht > dur) e.st = 2; }
  else { e.y -= 3.5 * dt; e.z += 4 * dt; }
};
// 螺旋を描きながら接近
export const swirl = (cx, cy, r, w, spd, ph) => (e, dt) => {
  e.z -= spd * dt;
  const a = ph + e.t * w, rr = r * Math.min(1, e.t * 0.7 + 0.3);
  e.x = cx + Math.cos(a) * rr; e.y = cy + Math.sin(a) * rr;
};
// 横から滑り込んで反対側へ抜ける
export const cross = (fromX, y, spd, zsp) => (e, dt) => {
  e.z -= zsp * dt; e.x += (fromX < 0 ? 1 : -1) * spd * dt; e.y = y + Math.sin(e.t * 2) * 0.3;
};
// 自機を追尾するミサイル
export const homing = (spd, turn) => (e, dt, g) => {
  e.z -= spd * dt;
  if (e.z > 5) { const p = g.player; e.x += (p.x - e.x) * Math.min(1, turn * dt); e.y += (p.y - e.y) * Math.min(1, turn * dt); }
};
// 手前で一瞬止まり、自機めがけて突進
export const dash = (zh, wait, spd) => (e, dt, g) => {
  if (e.st === 0) { e.z -= 14 * dt; if (e.z <= zh) { e.z = zh; e.st = 1; e.ht = 0; } }
  else if (e.st === 1) {
    e.ht += dt; e.x += Math.sin(e.ht * 40) * 0.01;
    if (e.ht > wait) {
      const p = g.player, dx = p.x - e.x, dy = p.y - e.y, dz = 3 - e.z, l = Math.hypot(dx, dy, dz);
      e.vx = dx / l * spd; e.vy = dy / l * spd; e.vz = dz / l * spd; e.st = 2;
    }
  } else { e.x += e.vx * dt; e.y += e.vy * dt; e.z += e.vz * dt; }
};

const Z0 = 38;
const rnd = (a, b) => a + Math.random() * (b - a);

// ---- 編隊 ----
function line(g, type, n, y, spd = 12) {
  for (let i = 0; i < n; i++) g.spawn(type, -1.6 + 3.2 * i / (n - 1), y, Z0 + i * 0.01, straight(spd));
}
function vee(g, type, cx, cy, spd = 12) {
  for (let i = -2; i <= 2; i++) g.spawn(type, cx + i * 0.6, cy + Math.abs(i) * -0.35, Z0 + Math.abs(i) * 2, straight(spd));
}
function spiral(g, type, n, cx, cy, spd = 11) {
  for (let i = 0; i < n; i++) g.spawn(type, cx, cy, Z0 + i * 2.2, swirl(cx, cy, 1.1, 1.6, spd, i * Math.PI * 2 / n));
}
function snake(g, type, n, fromX, y) {
  for (let i = 0; i < n; i++) g.spawn(type, fromX * 3, y, 22 + i * 2.5, cross(fromX, y, 1.7, 3));
}
function meteors(g, n, spread = 2.2, gap = 3.2) {
  for (let i = 0; i < n; i++) {
    const big = Math.random() < 0.45;
    g.spawn(big ? 'meteor' : 'meteorS', rnd(-spread, spread), rnd(-1.6, 1.2), Z0 + i * gap, straight(10));
  }
}
function shooters(g, n, y = -0.6, type = 'shooter') {
  for (let i = 0; i < n; i++) g.spawn(type, (i - (n - 1) / 2) * 1.2, y, Z0 + i * 1.5, hover(15 + i, 4.5, 14, 0.6));
}
function missiles(g, n) {
  for (let i = 0; i < n; i++) g.spawn('missile', rnd(-2, 2), rnd(-1.4, 0.8), Z0 + i * 2.5, homing(11, 0.9));
}
function dashers(g, n) {
  for (let i = 0; i < n; i++) g.spawn('dasher', (i - (n - 1) / 2) * 1.3, rnd(-1, 0.6), Z0 + i * 3, dash(16, 0.9, 16));
}
function swarm(g, n, cx, cy) {
  for (let i = 0; i < n; i++) g.spawn('ufoS', cx, cy, Z0 + i * 0.9, swirl(cx, cy, 0.7 + (i % 3) * 0.35, 2.4, 12, i * 0.9));
}
const mid = (x, y, zh = 16, dur = 9) => g => g.spawn('mid', x, y, Z0, hover(zh, dur, 12, 1.0));
const ufo = (type, cx = 0) => g => g.spawn(type, cx, -0.3, Z0, swirl(cx * 0.5, -0.2, 1.3, 1.2, 8, 0));
const msg = (sub, dur = 3.2) => g => g.message('', sub, dur);

// ---- ボス ----
// pat の中身は game.js の bossAttack を参照（fan / ring / burst / minions / spiral / rain / wall / missiles）
// move: sway（左右） / orbit（円） / slow（ゆっくり） / charge（前後）
export const BOSSES = {
  cruiser: { name: 'BATTLE CRUISER', parts: [{ spr: 'spaceShips_007', size: 4.6, r: 1.6, flip: true, hp: 900 }],
    z: 10.5, move: 'sway', phases: [['fan', 'ring', 'burst'], ['fan', 'ring', 'burst', 'minions']] },
  rig: { name: 'MINING RIG', parts: [{ spr: 'spaceStation_021', size: 4.2, r: 1.5, hp: 1100, spin: 0.25 }],
    z: 11, move: 'slow', phases: [['rain', 'fan', 'ring'], ['rain', 'wall', 'minions', 'ring']] },
  mother: { name: 'MOTHER SAUCER', parts: [{ spr: 'ufoRed', size: 3.8, r: 1.5, hp: 1200, spin: 1.2 }],
    z: 11, move: 'orbit', phases: [['spiral', 'minions', 'fan'], ['spiral', 'ring', 'minions', 'burst']] },
  twins: { name: 'TWIN LANCERS', parts: [
      { spr: 'spaceShips_004', size: 2.8, r: 1.0, flip: true, hp: 700, dx: -1.3 },
      { spr: 'spaceShips_009', size: 2.6, r: 1.0, hp: 700, dx: 1.3 }],
    z: 11, move: 'sway', phases: [['burst', 'fan', 'wall'], ['burst', 'spiral', 'wall', 'fan']] },
  fortress: { name: 'ORBITAL FORTRESS', parts: [{ spr: 'spaceStation_024', size: 5.0, r: 1.8, hp: 1600, spin: 0.35 }],
    z: 12, move: 'slow', phases: [['wall', 'missiles', 'ring'], ['spiral', 'wall', 'missiles', 'rain']] },
  core: { name: 'THE CORE', parts: [{ spr: 'spaceShips_006', size: 4.2, r: 1.5, flip: true, hp: 2200 }],
    z: 10.5, move: 'charge', phases: [['fan', 'ring', 'burst'], ['spiral', 'wall', 'missiles', 'fan'], ['spiral', 'rain', 'ring', 'minions', 'burst', 'wall']] },
};

// ---- テーマ（背景） ----
const T = (sky, grid, star = '#dfe9ff', clouds = null) => ({ sky, grid, star, clouds });

export const STAGES = [
  { name: 'OUTER ORBIT', jp: '外縁軌道', boss: 'cruiser',
    theme: T(['#03040c', '#0b0c2a', '#2a1446', '#0a0b22', '#04050e'], '90,200,255'),
    events: [
      [1.0, g => g.stageIntro()],
      [3.0, g => line(g, 'fighter', 5, -0.2)],
      [6.5, g => vee(g, 'fighter', 0, 0.3)],
      [10.0, g => spiral(g, 'fighter2', 6, -0.8, -0.3)],
      [12.0, msg('長押しでロックオン → 離して一斉発射', 3.5)],
      [14.5, g => spiral(g, 'fighter2', 6, 0.9, 0.2)],
      [19.0, g => shooters(g, 3)],
      [25.0, g => meteors(g, 10)],
      [29.0, g => vee(g, 'fighter', -1, -0.6)],
      [31.0, g => vee(g, 'fighter', 1, 0.4)],
      [35.0, g => snake(g, 'fighter2', 6, -1, -0.4)],
      [37.5, g => snake(g, 'fighter2', 6, 1, 0.5)],
      [41.0, ufo('ufo')],
      [44.0, mid(0, -0.8)],
      [47.0, g => line(g, 'fighter', 5, 0.6)],
      [50.0, g => line(g, 'fighter', 5, -0.9)],
      [55.0, g => { meteors(g, 8); spiral(g, 'fighter', 6, 0, 0); }],
      [62.0, g => shooters(g, 4, 0.2)],
      [67.0, g => { spiral(g, 'fighter2', 6, -1.1, -0.6); spiral(g, 'fighter2', 6, 1.1, 0.4); }],
      [73.0, g => { mid(-1.2, -0.9, 17, 8)(g); mid(1.2, -0.4, 19, 8)(g); }],
      [80.0, g => shooters(g, 5, -0.3)],
      [88.0, g => g.warning()],
      [92.0, g => g.spawnBoss()],
    ] },
  { name: 'ASTEROID BELT', jp: '小惑星帯', boss: 'rig',
    theme: T(['#0c0603', '#2a1406', '#6a3410', '#1c0c05', '#070302'], '255,170,90', '#ffe6c8'),
    events: [
      [1.0, g => g.stageIntro()],
      [3.0, g => meteors(g, 12, 2.4, 2.4)],
      [9.0, g => vee(g, 'fighter2', 0, -0.2)],
      [12.0, g => { meteors(g, 8); line(g, 'fighter', 5, 0.5); }],
      [17.0, g => shooters(g, 3, -0.8, 'heavy')],
      [23.0, g => meteors(g, 16, 2.4, 1.8)],
      [27.0, ufo('ufo', 1)],
      [30.0, g => { spiral(g, 'fighter2', 6, -1, 0); spiral(g, 'fighter2', 6, 1, -0.6); }],
      [36.0, g => { mid(0, -0.6)(g); meteors(g, 8, 2.4, 3); }],
      [45.0, g => dashers(g, 3)],
      [50.0, g => { snake(g, 'fighter', 7, -1, 0.2); meteors(g, 8); }],
      [56.0, ufo('ufoStar', -1)],
      [58.0, g => shooters(g, 4, 0, 'heavy')],
      [65.0, g => meteors(g, 20, 2.4, 1.5)],
      [72.0, g => { vee(g, 'fighter2', -1, -0.5, 14); vee(g, 'fighter2', 1, 0.3, 14); }],
      [78.0, g => g.warning()],
      [82.0, g => g.spawnBoss()],
    ] },
  { name: 'CRIMSON NEBULA', jp: '深紅星雲', boss: 'mother',
    theme: T(['#07020c', '#240a33', '#5a1450', '#1a0826', '#05010a'], '255,90,200', '#ffd6f4', 'rgba(255,80,180,'),
    events: [
      [1.0, g => g.stageIntro()],
      [3.0, g => swarm(g, 8, 0, -0.2)],
      [8.0, g => swarm(g, 8, -1, 0.3)],
      [10.0, g => swarm(g, 8, 1, -0.6)],
      [15.0, ufo('ufo')],
      [17.0, g => { spiral(g, 'fighter2', 8, 0, 0, 13); }],
      [22.0, g => shooters(g, 3, -0.2, 'sniper')],
      [28.0, g => { swarm(g, 10, -0.8, -0.5); swarm(g, 10, 0.8, 0.4); }],
      [34.0, mid(0, -0.5)],
      [40.0, g => dashers(g, 4)],
      [46.0, g => { snake(g, 'fighter2', 7, 1, -0.6); snake(g, 'fighter2', 7, -1, 0.4); }],
      [52.0, ufo('ufoStar', 1)],
      [55.0, g => { swarm(g, 12, 0, 0); shooters(g, 2, -1, 'sniper'); }],
      [62.0, g => { mid(-1, -0.6, 17, 8)(g); swarm(g, 8, 1, 0.3); }],
      [70.0, g => { spiral(g, 'fighter', 8, -1, -0.3, 13); spiral(g, 'fighter', 8, 1, 0.3, 13); }],
      [78.0, g => g.warning()],
      [82.0, g => g.spawnBoss()],
    ] },
  { name: 'FLEET LINE', jp: '艦隊防衛線', boss: 'twins',
    theme: T(['#0c0203', '#2a0608', '#5a1014', '#1a0406', '#070102'], '255,80,80', '#ffe0e0'),
    events: [
      [1.0, g => g.stageIntro()],
      [3.0, g => shooters(g, 3, -0.5)],
      [7.0, g => { line(g, 'fighter2', 6, 0.5, 14); }],
      [11.0, mid(-1, -0.7, 17, 7)],
      [13.0, mid(1, -0.2, 19, 7)],
      [18.0, g => missiles(g, 6)],
      [24.0, g => shooters(g, 4, 0.1, 'heavy')],
      [30.0, g => { vee(g, 'fighter2', 0, -0.8, 14); dashers(g, 2); }],
      [34.0, ufo('ufo', -1)],
      [37.0, g => shooters(g, 5, -0.4, 'sniper')],
      [44.0, g => { mid(0, -0.9, 16, 9)(g); missiles(g, 5); }],
      [52.0, g => { snake(g, 'fighter2', 8, -1, 0); snake(g, 'fighter2', 8, 1, -0.7); }],
      [58.0, g => dashers(g, 5)],
      [64.0, g => { shooters(g, 3, -0.8, 'heavy'); shooters(g, 3, 0.4, 'shooter'); }],
      [72.0, g => missiles(g, 10)],
      [80.0, g => g.warning()],
      [84.0, g => g.spawnBoss()],
    ] },
  { name: 'ORBITAL STATION', jp: '軌道要塞', boss: 'fortress',
    theme: T(['#02060a', '#0a1a26', '#1c3a4a', '#081620', '#020508'], '200,230,255', '#e8f6ff'),
    events: [
      [1.0, g => g.stageIntro()],
      [3.0, g => missiles(g, 6)],
      [8.0, g => { g.spawn('rocket', -1.4, -0.4, Z0, straight(7)); g.spawn('rocket', 1.4, -0.2, Z0 + 4, straight(7)); }],
      [12.0, g => dashers(g, 4)],
      [17.0, g => { shooters(g, 4, -0.6, 'sniper'); }],
      [23.0, g => { missiles(g, 8); vee(g, 'fighter2', 0, 0.3, 14); }],
      [29.0, g => { g.spawn('rocket', 0, -0.6, Z0, straight(7)); mid(-1.3, -0.2, 18, 8)(g); }],
      [34.0, ufo('ufo', 1)],
      [37.0, g => { swarm(g, 10, 0, -0.3); dashers(g, 3); }],
      [44.0, g => shooters(g, 5, 0, 'heavy')],
      [51.0, ufo('ufoStar', -1)],
      [53.0, g => { missiles(g, 10); meteors(g, 8); }],
      [60.0, g => { mid(-1.1, -0.8, 17, 9)(g); mid(1.1, -0.3, 19, 9)(g); }],
      [68.0, g => { dashers(g, 6); }],
      [74.0, g => { for (let i = 0; i < 3; i++) g.spawn('rocket', -1.5 + i * 1.5, -0.4, Z0 + i * 3, straight(8)); missiles(g, 6); }],
      [82.0, g => g.warning()],
      [86.0, g => g.spawnBoss()],
    ] },
  { name: 'THE CORE', jp: '中枢', boss: 'core',
    theme: T(['#000000', '#08080c', '#26262e', '#0a0a0e', '#000000'], '255,255,255', '#ffffff', 'rgba(255,60,90,'),
    events: [
      [1.0, g => g.stageIntro()],
      [3.0, g => { spiral(g, 'fighter2', 8, 0, -0.2, 13); swarm(g, 8, 0, 0.3); }],
      [9.0, g => { shooters(g, 3, -0.7, 'sniper'); dashers(g, 2); }],
      [15.0, g => { missiles(g, 8); meteors(g, 8); }],
      [21.0, ufo('ufo', 0)],
      [23.0, g => { mid(-1.2, -0.7, 17, 8)(g); mid(1.2, -0.1, 19, 8)(g); }],
      [31.0, g => { snake(g, 'fighter2', 8, -1, -0.3); snake(g, 'fighter2', 8, 1, 0.4); dashers(g, 3); }],
      [38.0, g => shooters(g, 5, -0.2, 'heavy')],
      [45.0, g => { swarm(g, 12, -0.9, -0.4); swarm(g, 12, 0.9, 0.4); }],
      [51.0, ufo('ufoStar', 1)],
      [53.0, g => { missiles(g, 12); shooters(g, 3, 0.3, 'sniper'); }],
      [61.0, g => { mid(0, -0.9, 16, 10)(g); dashers(g, 5); }],
      [70.0, g => { for (let i = 0; i < 3; i++) g.spawn('rocket', -1.5 + i * 1.5, -0.5, Z0 + i * 3, straight(8)); spiral(g, 'fighter', 10, 0, 0, 13); }],
      [78.0, g => g.warning()],
      [82.0, g => g.spawnBoss()],
    ] },
];

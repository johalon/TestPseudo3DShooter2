// ステージ1のタイムライン（秒）。周回（LAP）ごとにランクが上がって再生される。
// 座標系：x 左右（-2.2〜2.2）、y 上下（上が負）、z 奥行き（大きいほど遠い）

// ---- 移動パターン ----
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

const Z0 = 38;

function line(g, type, n, y, spd = 12) {
  for (let i = 0; i < n; i++) g.spawn(type, -1.6 + 3.2 * i / (n - 1), y, Z0 + i * 0.01, straight(spd));
}
function vee(g, type, cx, cy, spd = 12) {
  for (let i = -2; i <= 2; i++) g.spawn(type, cx + i * 0.6, cy + Math.abs(i) * -0.35, Z0 + Math.abs(i) * 2, straight(spd));
}
function spiral(g, type, n, cx, cy) {
  for (let i = 0; i < n; i++) g.spawn(type, cx, cy, Z0 + i * 2.2, swirl(cx, cy, 1.1, 1.6, 11, i * Math.PI * 2 / n));
}
function snake(g, type, n, fromX, y) {
  for (let i = 0; i < n; i++) g.spawn(type, fromX * 3, y, 22 + i * 2.5, cross(fromX, y, 1.7, 3));
}
function meteors(g, n, spread = 2.2) {
  for (let i = 0; i < n; i++) {
    const big = Math.random() < 0.45;
    g.spawn(big ? 'meteor' : 'meteorS', (Math.random() * 2 - 1) * spread, -1.6 + Math.random() * 2.8,
      Z0 + i * 3.2, straight(10, 0, 0));
  }
}
function shooters(g, n, y = -0.6) {
  for (let i = 0; i < n; i++) g.spawn('shooter', (i - (n - 1) / 2) * 1.2, y, Z0 + i * 1.5, hover(15 + i, 4.5, 14, 0.6));
}

export const TIMELINE = [
  [1.0, g => g.message('STAGE ' + g.lap, 'ドラッグで移動 / ショットは自動', 3)],
  [3.0, g => line(g, 'fighter', 5, -0.2)],
  [7.0, g => vee(g, 'fighter', 0, 0.3)],
  [11.0, g => spiral(g, 'fighter2', 6, -0.8, -0.3)],
  [13.0, g => g.message('', '長押しでロックオン → 離して一斉発射', 3.5)],
  [15.5, g => spiral(g, 'fighter2', 6, 0.9, 0.2)],
  [20.0, g => shooters(g, 3)],
  [26.0, g => meteors(g, 10)],
  [30.0, g => vee(g, 'fighter', -1, -0.6)],
  [32.0, g => vee(g, 'fighter', 1, 0.4)],
  [36.0, g => snake(g, 'fighter2', 6, -1, -0.4)],
  [38.5, g => snake(g, 'fighter2', 6, 1, 0.5)],
  [42.0, g => g.spawn('ufo', 0, -0.5, Z0, swirl(0, -0.2, 1.4, 1.2, 8, 0))],
  [45.0, g => g.spawn('mid', 0, -0.8, Z0, hover(16, 9, 12, 1.2))],
  [48.0, g => line(g, 'fighter', 5, 0.6)],
  [51.0, g => line(g, 'fighter', 5, -0.9)],
  [57.0, g => { meteors(g, 8); spiral(g, 'fighter', 6, 0, 0); }],
  [64.0, g => shooters(g, 4, 0.2)],
  [68.0, g => { spiral(g, 'fighter2', 6, -1.1, -0.6); spiral(g, 'fighter2', 6, 1.1, 0.4); }],
  [74.0, g => { g.spawn('mid', -1.2, -0.9, Z0, hover(17, 8, 12, 0.6)); g.spawn('mid', 1.2, -0.4, Z0 + 3, hover(19, 8, 12, 0.6)); }],
  [78.0, g => snake(g, 'fighter', 8, -1, 0.3)],
  [82.0, g => { vee(g, 'fighter2', 0, -0.4, 14); g.spawn('ufo', 1, 0, Z0, swirl(0.5, 0, 1.2, -1.2, 8, 1)); }],
  [86.0, g => meteors(g, 12, 2.4)],
  [92.0, g => shooters(g, 5, -0.3)],
  [100.0, g => g.warning()],
  [104.0, g => g.spawnBoss()],
];

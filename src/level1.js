// ステージ1（縦切り版）：区間ごとに緊張度を決めて並べる
// 区間：intro(低) → skirmish(中) → rings(低) → mixed(中) → DANGER 戦艦通過(高) → rest(低) → boss(高)
// 座標系：x 左右（-2.2〜2.2）、y 上下（上が負）、z 奥行き（大きいほど遠い）

const Z0 = 36;

// ---- 移動パターン ----
export const mv = {
  // 直進（sway で横揺れ）
  line: (spd, sway = 0, ph = 0) => (e, dt) => {
    e.z -= spd * dt;
    if (sway) e.x = e.bx + Math.sin(e.t * 1.6 + ph) * sway;
  },
  // 手前 zh まで来て dur 秒とどまり、上へ抜ける
  hover: (zh, dur, sway = 0.6) => (e, dt) => {
    if (e.st === 0) { e.z -= 13 * dt; if (e.z <= zh) { e.z = zh; e.st = 1; e.ht = 0; } }
    else if (e.st === 1) { e.ht += dt; e.x = e.bx + Math.sin(e.ht * 0.9) * sway; if (e.ht > dur) e.st = 2; }
    else { e.y -= 3 * dt; e.z += 3 * dt; }
  },
  // 世界に固定（スクロールで近づいてくる）
  fixed: () => (e, dt) => { e.z -= 10 * dt; },
  // 弧を描いて横切る
  arc: (dir, spd) => (e, dt) => {
    e.z -= spd * dt;
    e.x = e.bx + dir * Math.sin(Math.min(1, e.t / 3) * Math.PI) * 1.6;
  },
};

// ---- 編隊・配置の部品 ----
const scoutLine = (g, n, y, spd = 9) => {
  for (let i = 0; i < n; i++) g.spawn('scout', -1.5 + 3 * i / (n - 1), y, Z0 + i * 0.5, mv.line(spd));
};
const scoutVee = (g, cx, cy, withBomber = false) => {
  for (let i = -2; i <= 2; i++) {
    const t = withBomber && i === 0 ? 'bomber' : 'scout';
    g.spawn(t, cx + i * 0.55, cy - Math.abs(i) * 0.3, Z0 + Math.abs(i) * 1.5, mv.line(9));
  }
};
const scoutSnake = (g, n, x, y, dir) => {
  for (let i = 0; i < n; i++) g.spawn('scout', x, y, Z0 + i * 2, mv.arc(dir, 9));
};
const rings = (g, n, x0, y0, dx, dy) => {
  for (let i = 0; i < n; i++) g.ring(x0 + Math.sin(i * 0.7) * dx, y0 + Math.cos(i * 0.6) * dy, Z0 + i * 4.5);
};
const mines = (g, pts) => pts.forEach(([x, y, dz]) => g.spawn('mine', x, y, Z0 + dz, mv.fixed()));

export const LEVEL1 = {
  name: 'OUTER ORBIT', jp: '外縁軌道',
  events: [
    // ---- 導入（低） ----
    [0.5, g => { g.section('intro', 0); g.message('STAGE 1', 'OUTER ORBIT ─ 外縁軌道', 3); }],
    [2.0, g => rings(g, 4, 0, 0, 0.8, 0.4)],
    [4.0, g => g.message('', '敵の正面に入ると弾が当たる。敵弾も正面に来る', 3.5)],
    [5.0, g => scoutLine(g, 4, -0.2)],
    [9.0, g => scoutSnake(g, 4, -1.2, 0.3, 1)],

    // ---- 交戦（中） ----
    [12.0, g => { g.section('skirmish', 1); g.spawn('gunner', 0, -0.6, Z0, mv.hover(15, 7)); }],
    [12.5, g => g.message('', '光ったら撃ってくる。光る前に正面から撃て', 3.5)],
    [15.0, g => scoutVee(g, -1, 0.4)],
    [18.0, g => g.message('', '長押しで照準に敵をとどめるとロック → 離して発射', 3.5)],
    [19.0, g => { scoutLine(g, 5, 0.2); scoutLine(g, 5, -0.9); }],
    [23.0, g => { g.spawn('gunner', -1.2, -0.3, Z0, mv.hover(16, 6)); g.spawn('gunner', 1.2, -0.8, Z0 + 2, mv.hover(17, 6)); }],

    // ---- 休憩（低）：リング ----
    [29.0, g => { g.section('rings', 0); rings(g, 6, 0, -0.3, 1.4, 0.6); }],
    [31.0, g => g.message('', 'リングをくぐるとエネルギー回復', 2.5)],
    [33.0, g => g.item(0.5, -0.2, Z0)],

    // ---- 混成（中）：倒す順番 ----
    [36.0, g => { g.section('mixed', 1); scoutVee(g, 0, -0.2, true); }],
    [36.5, g => g.message('', '点滅する爆雷艇を撃つと周りを巻き込む', 3)],
    [41.0, g => {
      const c = g.spawn('carrier', 0, -0.5, Z0, mv.hover(16, 8, 0.4));
      for (const [t, dx, dy] of [['gunner', -0.9, 0.2], ['gunner', 0.9, 0.2], ['scout', 0, 0.8]]) { const e = g.spawn(t, dx, -0.5 + dy, Z0 + 0.5, mv.hover(16.5, 8, 0.4)); e.bx = dx; }
      c.bx = 0;
    }],
    [41.5, g => g.message('', '盾持ちが仲間を守る。先に盾持ちを', 3)],
    [46.0, g => { g.spawn('sniper', 1.4, -1.0, Z0, mv.hover(18, 6, 0.3)); g.spawn('sniper', -1.5, 0.3, Z0 + 3, mv.hover(19, 5, 0.3)); mines(g, [[-1, 0, 0], [0.6, 0.5, 6], [-0.4, -0.8, 12]]); }],
    [46.5, g => g.message('', '赤い線が止まったら撃ってくる。すぐ動け', 3)],

    // ---- 危険区間（高）：戦艦の横を通過 ----
    [53.0, g => { g.section('danger', 2); g.message('DANGER', '戦艦の砲撃圏を通過', 2.5); g.flank(); }],
    [58.0, g => g.spawn('charger', 0, -0.3, Z0, null)],
    [62.0, g => { g.spawn('sniper', 1.6, 0.4, Z0, mv.hover(17, 5, 0.2)); scoutVee(g, 1, -0.6, true); }],
    [66.0, g => g.spawn('charger', 1, 0.2, Z0, null)],

    // ---- 休憩（低） ----
    [72.0, g => { g.section('rest', 0); rings(g, 5, 0, 0, 1.0, 0.8); g.item(-0.6, 0.2, Z0 + 10); }],

    // ---- ボス ----
    [79.0, g => { g.section('boss', 2); g.warning('ARMORED CRUISER'); }],
    [82.0, g => g.spawnBoss()],
  ],
};

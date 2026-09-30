// 自機5種。stats は選択画面の表示用（SPEED / POWER / LOCK / ARMOR、5段階）
export const SHIPS = [
  {
    id: 'arrow', name: 'ARROW', spr: 'playerShip1_blue', color: '#4fd3ff',
    desc: 'バランス型。迷ったらこれ',
    speed: 1.0, shield: 100, shot: 'twin', interval: 0.11, dmg: 1,
    lockMax: 8, lockR: 0.95, lockInt: 0.065, laserDmg: 8, hitR: 0.2, scoreMul: 1,
    stats: [3, 3, 3, 3],
  },
  {
    id: 'lancer', name: 'LANCER', spr: 'playerShip2_orange', color: '#ff8a3d',
    desc: '高速機。敵を貫く槍の弾で押し切る',
    speed: 1.25, shield: 80, shot: 'pierce', interval: 0.12, dmg: 2,
    lockMax: 6, lockR: 0.85, lockInt: 0.05, laserDmg: 11, hitR: 0.2, scoreMul: 1,
    stats: [4, 5, 2, 2],
  },
  {
    id: 'bulwark', name: 'BULWARK', spr: 'playerShip3_green', color: '#7ee06a',
    desc: '重装甲の3WAY。はじめての人に',
    speed: 0.85, shield: 150, shot: 'spread', interval: 0.15, dmg: 1,
    lockMax: 6, lockR: 1.05, lockInt: 0.09, laserDmg: 8, hitR: 0.24, scoreMul: 1,
    stats: [2, 3, 2, 5],
  },
  {
    id: 'seeker', name: 'SEEKER', spr: 'playerShip3_orange', color: '#ffcf5a',
    desc: '最大12ロック。一斉発射で稼ぐ',
    speed: 1.0, shield: 90, shot: 'single', interval: 0.13, dmg: 1,
    lockMax: 12, lockR: 1.35, lockInt: 0.045, laserDmg: 7, hitR: 0.2, scoreMul: 1,
    stats: [3, 2, 5, 3],
  },
  {
    id: 'phantom', name: 'PHANTOM', spr: 'playerShip2_red', color: '#ff5a7a',
    desc: '紙装甲・極小当たり判定・スコア1.5倍',
    speed: 1.35, shield: 60, shot: 'rapid', interval: 0.075, dmg: 1,
    lockMax: 8, lockR: 0.9, lockInt: 0.06, laserDmg: 8, hitR: 0.12, scoreMul: 1.5,
    stats: [5, 4, 3, 1],
  },
];

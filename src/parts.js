// カスタムパーツ・隠しコンボ・勲章・日替わりルールの定義

// cat: atk（攻撃）/ def（防御）/ tech（技巧）/ sup（サポート：勲章とハイスコアの対象外）
// unlock: { medals: n } 勲章の数で解放 / { plays: n } 出撃回数で解放
export const PARTS = [
  { id: 'charge',  name: 'CHARGE LOCK',  cat: 'atk',  unlock: { plays: 0 },  desc: 'ロック後も押し続けると溜まり、レーザー威力が最大2倍' },
  { id: 'option',  name: 'OPTION',       cat: 'atk',  unlock: { plays: 0 },  desc: '随伴機が一緒にショットを撃つ' },
  { id: 'split',   name: 'SPLIT LASER',  cat: 'atk',  unlock: { medals: 2 }, desc: 'レーザー命中時に近くの敵へ2本に分裂' },
  { id: 'heavy',   name: 'HEAVY SHOT',   cat: 'atk',  unlock: { medals: 8 }, desc: 'ショット威力+1、連射は少し遅くなる' },
  { id: 'regen',   name: 'REGEN',        cat: 'def',  unlock: { plays: 0 },  desc: '3秒被弾しないとシールドが少しずつ回復' },
  { id: 'longroll', name: 'LONG ROLL',   cat: 'def',  unlock: { medals: 4 }, desc: '宙返りの無敵が長く、連続で出しやすい' },
  { id: 'barrier', name: 'BURST BARRIER', cat: 'def', unlock: { medals: 10 }, desc: '被弾した瞬間、周りの敵弾を消し飛ばす' },
  { id: 'graze',   name: 'GRAZE',        cat: 'tech', unlock: { medals: 6 }, desc: '敵弾をかすめるとゲージ。満タンで次の一斉発射が威力・得点2倍' },
  { id: 'chain',   name: 'CHAIN',        cat: 'tech', unlock: { medals: 12 }, desc: '1.2秒以内の連続撃破でチェイン。つなぐほど追加得点' },
  { id: 'magnet',  name: 'MAGNET',       cat: 'tech', unlock: { plays: 3 },  desc: 'アイテムを遠くから吸い寄せ、回復量も1.5倍' },
  { id: 'guard',   name: 'AUTO GUARD',   cat: 'sup',  unlock: { plays: 0 },  desc: '受けるダメージが半分になる' },
  { id: 'slow',    name: 'SLOW FIELD',   cat: 'sup',  unlock: { plays: 1 },  desc: '敵弾の速度が25%遅くなる' },
  { id: 'autolock', name: 'AUTO LOCK',   cat: 'sup',  unlock: { plays: 2 },  desc: '押さなくても自動でロックし、自動で一斉発射' },
];
export const PART = Object.fromEntries(PARTS.map(p => [p.id, p]));
export const CAT_COLOR = { atk: '#ff8a5a', def: '#5ad0ff', tech: '#c89bff', sup: '#8fe38a' };
export const CAT_NAME = { atk: '攻撃', def: '防御', tech: '技巧', sup: 'サポート' };
export const THIRD_SLOT_MEDALS = 12;

// 隠しコンボ：2つをそろえると発動
export const SYNERGIES = [
  { id: 'prism',   parts: ['charge', 'split'],   name: 'PRISM',        desc: '溜めたレーザーが4本に分裂' },
  { id: 'dancer',  parts: ['graze', 'longroll'], name: 'PHASE DANCER', desc: 'ゲージ満タンで宙返り → 前方の敵を一瞬で全ロック' },
  { id: 'counter', parts: ['barrier', 'chain'],  name: 'COUNTER',      desc: 'バリアで消した弾の数だけチェインが伸びる' },
  { id: 'cannon',  parts: ['option', 'heavy'],   name: 'TWIN CANNON',  desc: '随伴機の弾も重くなり、連射も速い' },
  { id: 'salvage', parts: ['regen', 'magnet'],   name: 'SALVAGER',     desc: '中型機もアイテムを落とすようになる' },
];

// 勲章：ステージごとに3つ＋全体
const SP = [
  { name: 'フルロック×3', desc: 'ロック上限いっぱいの一斉発射を3回', test: s => s.fullVolleys >= 3 },
  { name: '砕石屋', desc: '隕石を20個破壊', test: s => s.meteors >= 20 },
  { name: '群れ狩り', desc: '小型UFOを30機撃破', test: s => s.ufoS >= 30 },
  { name: '同時撃破', desc: '双子のボスを10秒以内の差で撃破', test: s => s.twinGap !== null && s.twinGap <= 10 },
  { name: '迎撃手', desc: 'ミサイルを15発撃ち落とす', test: s => s.missiles >= 15 },
  { name: '速攻', desc: 'ボスを90秒以内に撃破', test: s => s.bossTime !== null && s.bossTime <= 90 },
];
export const MEDALS = [];
for (let i = 0; i < 6; i++) {
  MEDALS.push({ id: `s${i + 1}a`, stage: i, name: 'ノーダメージ', desc: '被弾せずにステージクリア', test: s => s.hits === 0 });
  MEDALS.push({ id: `s${i + 1}b`, stage: i, name: SP[i].name, desc: SP[i].desc, test: SP[i].test });
  MEDALS.push({ id: `s${i + 1}c`, stage: i, name: '殲滅', desc: '撃墜率90%以上でクリア', test: s => s.spawned > 0 && s.killed / s.spawned >= 0.9 });
}
export const GLOBAL_MEDALS = [
  { id: 'g_clear',  name: 'ALL CLEAR',   desc: '全6ステージをクリア' },
  { id: 'g_1cc',    name: 'ノーコンティニュー', desc: 'コンティニューなしで全クリア' },
  { id: 'g_hard',   name: 'HARD CLEAR',  desc: 'HARDで全クリア' },
  { id: 'g_ships',  name: '全機体制覇',  desc: '5機体すべてで全クリア' },
  { id: 'g_combos', name: '研究者',      desc: '隠しコンボを3種発見' },
  { id: 'g_daily',  name: '日課',        desc: '日替わり挑戦を3日クリア' },
];

// 日替わりの変化ルール
export const MUTATORS = [
  { id: 'lock4',  name: 'ロック最大4',       apply: g => { g.ship.lockMax = Math.min(4, g.ship.lockMax); } },
  { id: 'glass',  name: 'シールド半分・得点1.5倍', apply: g => { g.ship.shield = Math.round(g.ship.shield / 2); g.player.shield = g.ship.shield; g.ship.scoreMul *= 1.5; } },
  { id: 'rapid',  name: '敵弾が速い',        apply: g => { g.bulletMul *= 1.3; } },
  { id: 'wide',   name: '広域ロック・上限+4', apply: g => { g.ship.lockR *= 1.5; g.ship.lockMax += 4; } },
  { id: 'hard',   name: 'HARDの敵',          apply: g => { g.hard = true; } },
  { id: 'heavy',  name: '重い弾（威力+1・連射減）', apply: g => { g.ship.dmg += 1; g.ship.interval *= 1.35; } },
];

// 日付から決まる乱数
export function dailySeed(date = new Date()) {
  const s = date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
  let x = s;
  const rnd = () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; };
  const ship = Math.floor(rnd() * 5), stage = Math.floor(rnd() * 6);
  const pool = MUTATORS.map((m, i) => i);
  const a = pool.splice(Math.floor(rnd() * pool.length), 1)[0], b = pool[Math.floor(rnd() * pool.length)];
  return { key: String(s), ship, stage, mut: [MUTATORS[a].id, MUTATORS[b].id] };
}

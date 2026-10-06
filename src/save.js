// セーブデータ（localStorage）。読み書きに失敗してもゲームは動く
const KEY = 'stardepth.save.v2';

const DEFAULT = {
  plays: 0,           // 出撃回数
  losses: 0,          // 連敗数（おすすめ表示用）
  reached: 1,         // 到達した最大ステージ（ステージセレクト用）
  hi: {},             // 機体別ハイスコア（NORMAL）  { arrow: 123 }
  hiHard: {},         // 機体別ハイスコア（HARD）
  clears: {},         // 機体別クリア記録 { arrow: { clear, sup, oneCC, hard } }
  medals: {},         // 勲章 { s1a: { ship: 'arrow', pure: true } }
  combos: {},         // 発見した隠しコンボ { prism: true }
  daily: {},          // 日替わり { '20261001': { best, clear } }
  loadout: {},        // 機体ごとのパーツ構成 { arrow: ['charge', null, null] }
  ship: 0, hard: false,
  bgm: true, se: true,
};

function load() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) || '{}');
    // 旧バージョンのハイスコアを引き継ぐ
    const old = JSON.parse(localStorage.getItem('stardepth.hi') || '0');
    const base = structuredCloneSafe(DEFAULT);
    const out = Object.assign(base, d);
    if (old && !d.migrated) { out.hi.arrow = Math.max(out.hi.arrow || 0, old); out.migrated = true; }
    return out;
  } catch (_) { return structuredCloneSafe(DEFAULT); }
}
function structuredCloneSafe(o) { return JSON.parse(JSON.stringify(o)); }

export const save = load();

export function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (_) {}
}

export const medalCount = () => Object.keys(save.medals).length;
export const bestHi = () => Math.max(0, ...Object.values(save.hi), ...Object.values(save.hiHard));

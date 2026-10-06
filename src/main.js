// 起動・メインループ・画面遷移
// タイトル / 機体選択（パーツ・モード・開始ステージ） / パーツ選択 / 記録 / 日替わり / プレイ / リザルト
import { W, H, view, layout, gameTransform } from './view.js';
import { input, initInput, endFrame, tapIn } from './input.js';
import { sfx } from './audio.js';
import { bgm } from './bgm.js';
import { loadAssets, drawSpr } from './assets.js';
import { Game, Backdrop } from './game.js';
import { SHIPS } from './ships.js';
import { STAGES } from './stage.js';
import { PARTS, PART, SYNERGIES, MEDALS, GLOBAL_MEDALS, MUTATORS, CAT_COLOR, CAT_NAME, THIRD_SLOT_MEDALS, dailySeed } from './parts.js';
import { save, persist, medalCount, bestHi } from './save.js';

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const params = new URLSearchParams(location.search);
const DEBUG = { t: +params.get('t') || 0, god: params.has('god'), bot: params.has('bot'), botRoll: params.has('roll'), auto: params.has('auto'),
  speed: +params.get('speed') || 1, ship: params.has('ship') ? +params.get('ship') : null,
  stage: Math.max(0, (+params.get('stage') || 1) - 1), hard: params.has('hard'),
  parts: params.get('parts') ? params.get('parts').split(/[,.]/) : null };
// デバッグ用パラメータ付きのプレイは記録しない
DEBUG.noRecord = ['god', 'bot', 'parts', 'hard', 'stage', 't', 'speed', 'ship', 'auto', 'roll'].some(k => params.has(k));

let scene = 'loading', game = null, paused = false, titleT = 0, result = null, selT = 0;
let slotSel = 0, recSel = null, run = null;
const backdrop = new Backdrop();

let shipSel = DEBUG.ship ?? save.ship ?? 0;
let stageSel = 0;
const hardUnlocked = () => save.reached >= 6 || Object.values(save.clears).some(c => c.clear);
const slotCount = () => medalCount() >= THIRD_SLOT_MEDALS ? 3 : 2;
const loadout = () => {
  const id = SHIPS[shipSel].id;
  if (!save.loadout[id]) save.loadout[id] = [null, null, null];
  return save.loadout[id];
};
const partUnlocked = p => (p.unlock.medals !== undefined ? medalCount() >= p.unlock.medals : save.plays >= p.unlock.plays);
const activeParts = () => loadout().slice(0, slotCount()).filter(Boolean);

bgm.setOn(save.bgm); sfx.muted = !save.se;

function resize() {
  layout(canvas);
  if (scene === 'play' && innerWidth > innerHeight && matchMedia('(pointer: coarse)').matches) paused = true;
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 200));
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { if (scene === 'play') { paused = true; game.cancelLocks(); } sfx.suspend(); } else sfx.resume();
});

// ---- 出撃 ----
function onMedal(m, g) {
  if (DEBUG.noRecord) return true;
  const pure = g.parts.length === 0, rec = save.medals[m.id];
  if (!rec) { save.medals[m.id] = { ship: g.ship.id, pure }; persist(); return true; }
  if (pure && !rec.pure) { save.medals[m.id] = { ship: g.ship.id, pure }; persist(); return true; }
  return false;
}
function onCombo(id) { if (!DEBUG.noRecord && !save.combos[id]) { save.combos[id] = true; persist(); } }

function startGame(stage, continues = 0, daily = null) {
  if (!continues) {
    if (!DEBUG.noRecord) { save.plays++; persist(); }
    run = { startStage: stage, daily, hard: daily ? false : (save.hard && hardUnlocked()) || DEBUG.hard,
      parts: daily ? [] : (DEBUG.parts || activeParts()), ship: daily ? daily.ship : shipSel };
  }
  game = new Game({ t: stage === DEBUG.stage ? DEBUG.t : 0, god: DEBUG.god, bot: DEBUG.bot, botRoll: DEBUG.botRoll,
    ship: run.ship, stage, continues, parts: run.parts, hard: run.hard,
    mut: daily ? daily.mut : [], daily: !!daily, single: !!daily, onMedal, onCombo });
  scene = 'play'; paused = false;
}

function gainGlobal(id) { if (!save.medals[id]) { save.medals[id] = { global: true }; return true; } return false; }

function finishRun() {
  const g = game, id = g.ship.id, newG = [];
  let newHi = false;
  if (DEBUG.noRecord) { /* 記録しない */ }
  else if (run.daily) {
    const d = save.daily[run.daily.key] || { best: 0, clear: false };
    newHi = g.score > d.best;
    save.daily[run.daily.key] = { best: Math.max(d.best, g.score), clear: d.clear || g.allClear };
    if (Object.values(save.daily).filter(x => x.clear).length >= 3 && gainGlobal('g_daily')) newG.push('g_daily');
  } else {
    save.reached = Math.max(save.reached, g.stageIdx + 1);
    const fromStart = run.startStage === 0;
    if (!g.support && fromStart) {
      const tbl = run.hard ? save.hiHard : save.hi;
      newHi = g.score > (tbl[id] || 0);
      if (newHi) tbl[id] = g.score;
    }
    if (g.allClear && fromStart) {
      const c = save.clears[id] || {};
      if (g.support) c.sup = true;
      else {
        c.clear = true;
        if (g.continues === 0) c.oneCC = true;
        if (run.hard) c.hard = true;
      }
      save.clears[id] = c;
      if (!g.support) {
        if (gainGlobal('g_clear')) newG.push('g_clear');
        if (g.continues === 0 && gainGlobal('g_1cc')) newG.push('g_1cc');
        if (run.hard && gainGlobal('g_hard')) newG.push('g_hard');
        if (SHIPS.every(s => save.clears[s.id] && save.clears[s.id].clear) && gainGlobal('g_ships')) newG.push('g_ships');
      }
    }
    save.losses = g.allClear ? 0 : save.losses + 1;
  }
  if (!DEBUG.noRecord && !g.support && Object.keys(save.combos).length >= 3 && gainGlobal('g_combos')) newG.push('g_combos');
  if (!DEBUG.noRecord) persist();
  const medalNames = [...new Set(g.earned)].map(mid => MEDALS.find(m => m.id === mid))
    .map(m => `S${m.stage + 1} ${m.name}`).concat(newG.map(x => GLOBAL_MEDALS.find(m => m.id === x).name));
  result = { score: g.score, stage: g.stageIdx + 1, kills: g.kills, maxVolley: g.maxVolley, rank: Math.floor(g.rank), newHi, t: 0,
    clear: g.allClear, cont: g.continues, ship: g.ship.name, support: g.support, daily: run.daily, fromStart: run.startStage === 0,
    hard: run.hard, medals: medalNames };
  scene = 'result';
  bgm.play('title');
}

// ---- 描画ヘルパー ----
function text(s, x, y, size, color, align = 'center', font) {
  font = font || (size > 13 && !/K/.test(s) ? 'Kenvector, sans-serif' : 'SYS');
  ctx.font = font === 'SYS' ? `700 ${size}px system-ui, sans-serif` : `${size}px ${font}`;
  ctx.textAlign = align; ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillText(s, x + 1.5, y + 1.5);
  ctx.fillStyle = color; ctx.fillText(s, x, y);
}
function box(x, y, w, h, fill, stroke) {
  ctx.fillStyle = fill; ctx.fillRect(x, y, w, h);
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, w - 2, h - 2); }
}
function button(label, x, y, w, h, color = '#7fdcff', size) {
  box(x, y, w, h, 'rgba(20,40,80,0.75)', color);
  text(label, x + w / 2, y + h / 2 + 1, size || (label.length > 12 ? 13 : 15), '#ffffff');
  return tapIn(x, y, w, h);
}
const click = () => sfx.play('lock', 0.4, 1.3);

// ================= タイトル =================
function title(dt) {
  titleT += dt;
  backdrop.update(dt, 8);
  backdrop.draw(ctx, Math.sin(titleT * 0.3) * 0.5, -2);
  text('STAR', W / 2, 105, 44, '#ffffff');
  text('DEPTH', W / 2, 155, 44, '#7fdcff');
  text(`HI ${String(bestHi()).padStart(8, '0')}`, W / 2, 200, 13, '#ffcf5a');
  text(`MEDAL ${medalCount()} / ${MEDALS.length + GLOBAL_MEDALS.length}`, W / 2, 220, 11, '#d8c27a');
  drawSpr(ctx, SHIPS[shipSel].spr, W / 2, 285 + Math.sin(titleT * 2) * 6, 70, Math.sin(titleT * 0.9) * 0.15);
  text('ドラッグで移動 ・ ショットは自動', W / 2, 350, 12, '#cfe8ff', 'center', 'SYS');
  text('長押しでロックオン → 離して一斉発射', W / 2, 370, 12, '#cfe8ff', 'center', 'SYS');
  text('ダブルタップで宙返り（一瞬無敵）', W / 2, 390, 12, '#cfe8ff', 'center', 'SYS');
  if (DEBUG.auto) { DEBUG.auto = false; startGame(DEBUG.stage); return; }
  if (button('START', 90, 420, 180, 46)) { sfx.play('item', 0.7); scene = 'select'; selT = 0; stageSel = 0; }
  else if (button('DAILY', 90, 476, 180, 40, '#ffcf5a')) { click(); scene = 'daily'; }
  else if (button('RECORDS', 90, 526, 180, 40, '#c89bff')) { click(); scene = 'records'; recSel = null; }
  else if (button('BGM ' + (save.bgm ? 'ON' : 'OFF'), 60, 580, 110, 30, '#5a7090', 12)) { save.bgm = !save.bgm; bgm.setOn(save.bgm); persist(); }
  else if (button('SE ' + (save.se ? 'ON' : 'OFF'), 190, 580, 110, 30, '#5a7090', 12)) { save.se = !save.se; sfx.muted = !save.se; persist(); click(); }
  text('Assets: Kenney.nl (CC0)', W / 2, H - 12, 9, 'rgba(255,255,255,0.45)');
}

// ================= 機体選択 =================
const STAT_NAMES = ['SPEED', 'POWER', 'LOCK', 'ARMOR'];
function select(dt) {
  selT += dt;
  backdrop.update(dt, 6);
  backdrop.draw(ctx, 0, -2);
  text('< BACK', 12, 20, 11, '#9fd7ff', 'left');
  if (tapIn(0, 0, 80, 40)) { scene = 'title'; return; }
  text('SELECT SHIP', W / 2 + 20, 20, 16, '#ffffff');
  const n = SHIPS.length, cw = 66, x0 = W / 2 - (n - 1) * cw / 2;
  SHIPS.forEach((s, i) => {
    const x = x0 + i * cw, y = 78, on = i === shipSel, c = save.clears[s.id] || {};
    box(x - 30, y - 32, 60, 64, on ? 'rgba(127,220,255,0.18)' : 'rgba(255,255,255,0.05)', on ? s.color : null);
    drawSpr(ctx, s.spr, x, y - 5, 40);
    text(s.name, x, y + 21, 8, on ? s.color : '#9aa8c0');
    if (c.clear || c.sup) text(c.oneCC ? '★' : '☆', x + 22, y - 24, 10, c.clear ? '#ffd23f' : '#8fe38a');
    if (tapIn(x - 32, y - 34, 64, 68) && !on) { shipSel = i; click(); save.ship = i; persist(); }
  });
  const s = SHIPS[shipSel];
  drawSpr(ctx, s.spr, W / 2, 160 + Math.sin(selT * 2) * 4, 70, Math.sin(selT * 1.3) * 0.12);
  text(s.name, W / 2, 210, 20, s.color);
  text(s.desc, W / 2, 232, 12, '#dfe9ff', 'center', 'SYS');
  s.stats.forEach((v, i) => {
    const cx = i % 2 ? 190 : 22, y = 256 + Math.floor(i / 2) * 18;
    text(STAT_NAMES[i], cx, y, 10, '#9fd7ff', 'left');
    for (let j = 0; j < 5; j++) { ctx.fillStyle = j < v ? s.color : 'rgba(255,255,255,0.12)'; ctx.fillRect(cx + 62 + j * 16, y - 4, 13, 8); }
  });

  // パーツスロット
  text('PARTS', 16, 300, 11, '#c89bff', 'left');
  text(`勲章 ${medalCount()}`, W - 16, 300, 10, '#d8c27a', 'right', 'SYS');
  const lo = loadout(), sc = slotCount(), sw = 104;
  for (let i = 0; i < 3; i++) {
    const x = 16 + i * 112, y = 310, p = lo[i] && PART[lo[i]];
    if (i >= sc) {
      box(x, y, sw, 46, 'rgba(255,255,255,0.04)');
      text(`勲章${THIRD_SLOT_MEDALS}個で解放`, x + sw / 2, y + 23, 10, '#6a7690', 'center', 'SYS');
      continue;
    }
    box(x, y, sw, 46, 'rgba(20,30,60,0.8)', p ? CAT_COLOR[p.cat] : 'rgba(255,255,255,0.25)');
    if (p) {
      text(p.name, x + sw / 2, y + 17, 10, '#ffffff', 'center', 'SYS');
      text(CAT_NAME[p.cat], x + sw / 2, y + 33, 9, CAT_COLOR[p.cat], 'center', 'SYS');
    } else text('+ 空き', x + sw / 2, y + 23, 11, '#9aa8c0', 'center', 'SYS');
    if (tapIn(x, y, sw, 46)) { click(); slotSel = i; scene = 'parts'; return; }
  }
  const ap = activeParts();
  const combos = SYNERGIES.filter(c => c.parts.every(p => ap.includes(p)));
  if (combos.length) text('COMBO: ' + combos.map(c => c.name).join(' / '), W / 2, 370, 11, '#c89bff', 'center', 'SYS');
  else if (ap.some(id => PART[id].cat === 'sup')) text('サポート出撃：勲章とハイスコアは対象外（クリアは記録されます）', W / 2, 370, 9, '#8fe38a', 'center', 'SYS');

  // モードと開始ステージ
  const hu = hardUnlocked(), hard = save.hard && hu;
  if (button('NORMAL', 16, 384, 76, 32, hard ? '#3a4a66' : '#7fdcff', 12)) { save.hard = false; persist(); click(); }
  if (hu) { if (button('HARD', 98, 384, 76, 32, hard ? '#ff6a7a' : '#3a4a66', 12)) { save.hard = true; persist(); click(); } }
  else { box(98, 384, 76, 32, 'rgba(255,255,255,0.04)'); text('6面到達で', 136, 400, 9, '#6a7690', 'center', 'SYS'); }
  box(186, 384, 158, 32, 'rgba(20,30,60,0.8)', '#3a4a66');
  text(`STAGE ${stageSel + 1}`, 265, 400, 12, stageSel ? '#ffcf5a' : '#ffffff');
  text('◀', 200, 400, 13, stageSel > 0 ? '#ffffff' : '#3a4a66', 'center', 'SYS');
  text('▶', 330, 400, 13, stageSel < save.reached - 1 ? '#ffffff' : '#3a4a66', 'center', 'SYS');
  if (tapIn(186, 384, 50, 32) && stageSel > 0) { stageSel--; click(); }
  if (tapIn(294, 384, 50, 32) && stageSel < Math.min(5, save.reached - 1)) { stageSel++; click(); }
  if (stageSel) text('途中ステージから：勲章は取れます／ハイスコアとクリアは対象外', W / 2, 426, 9, '#9aa8c0', 'center', 'SYS');

  // 2連敗したらサポートパーツをおすすめ（ワンタップで装着）
  if (save.losses >= 2 && !ap.some(id => PART[id].cat === 'sup')) {
    const pick = ['guard', 'slow', 'autolock'].map(id => PART[id]).find(partUnlocked);
    if (pick) {
      box(16, 438, 328, 40, 'rgba(40,70,40,0.7)', '#8fe38a');
      text(`おすすめ：${pick.name}（${pick.desc}）`, 24, 452, 9, '#dfffd8', 'left', 'SYS');
      text('タップで装着', 24, 467, 9, '#8fe38a', 'left', 'SYS');
      if (tapIn(16, 438, 328, 40)) {
        const idx = lo.slice(0, sc).indexOf(null);
        lo[idx >= 0 ? idx : sc - 1] = pick.id; persist(); sfx.play('shield', 0.6);
      }
    }
  }
  if (button('START', 90, 490, 180, 48)) { sfx.play('item', 0.7); startGame(stageSel); return; }
  const hi = save.hi[s.id] || 0, hh = save.hiHard[s.id] || 0;
  text(`HI ${String(hi).padStart(8, '0')}` + (hh ? `   HARD ${String(hh).padStart(8, '0')}` : ''), W / 2, 556, 11, '#ffcf5a');
  const c = save.clears[s.id] || {};
  const badges = [c.clear ? 'CLEAR' : null, c.oneCC ? '1CC' : null, c.hard ? 'HARD CLEAR' : null, c.sup && !c.clear ? 'CLEAR（サポート）' : null].filter(Boolean);
  if (badges.length) text(badges.join('  ・  '), W / 2, 576, 10, '#8fe38a', 'center', 'SYS');
}

// ================= パーツ選択 =================
function partsScene(dt) {
  backdrop.update(dt, 4);
  backdrop.draw(ctx, 0, -2);
  ctx.fillStyle = 'rgba(0,0,10,0.55)'; ctx.fillRect(0, 0, W, H);
  text(`PARTS ─ SLOT ${slotSel + 1}`, W / 2, 24, 15, '#ffffff');
  const lo = loadout(), mc = medalCount();
  PARTS.forEach((p, i) => {
    const y = 44 + i * 40, un = partUnlocked(p), cur = lo[slotSel] === p.id;
    const other = !cur && lo.slice(0, slotCount()).includes(p.id);
    box(10, y, 340, 36, cur ? 'rgba(80,60,120,0.6)' : 'rgba(20,30,60,0.7)', cur ? CAT_COLOR[p.cat] : null);
    ctx.fillStyle = un ? CAT_COLOR[p.cat] : '#3a4050'; ctx.fillRect(10, y, 5, 36);
    text(un ? p.name : '？？？', 22, y + 11, 11, un ? '#ffffff' : '#6a7690', 'left', 'SYS');
    text(un ? p.desc : (p.unlock.medals !== undefined ? `勲章 ${p.unlock.medals}個で解放（いま${mc}）` : `出撃 ${p.unlock.plays}回で解放（いま${save.plays}）`),
      22, y + 26, 9, un ? '#b8c4dc' : '#6a7690', 'left', 'SYS');
    text(cur ? '装着中' : other ? '他スロット' : CAT_NAME[p.cat], 344, y + 11, 9, cur ? '#ffd23f' : CAT_COLOR[p.cat], 'right', 'SYS');
    if (un && !other && tapIn(10, y, 340, 36)) { lo[slotSel] = cur ? null : p.id; persist(); click(); scene = 'select'; }
  });
  if (button('はずす', 16, 572, 150, 40, '#9aa8c0', 13)) { lo[slotSel] = null; persist(); click(); scene = 'select'; }
  else if (button('もどる', 194, 572, 150, 40, '#7fdcff', 13)) { click(); scene = 'select'; }
}

// ================= 記録 =================
function records(dt) {
  backdrop.update(dt, 4);
  backdrop.draw(ctx, 0, -2);
  ctx.fillStyle = 'rgba(0,0,10,0.55)'; ctx.fillRect(0, 0, W, H);
  text('RECORDS', W / 2, 24, 18, '#ffffff');
  text(`MEDAL ${medalCount()} / ${MEDALS.length + GLOBAL_MEDALS.length}    ◆金＝パーツなしで獲得`, W / 2, 46, 10, '#d8c27a', 'center', 'SYS');
  const cell = (m, x, y, w) => {
    const r = save.medals[m.id];
    box(x, y, w, 24, r ? (r.pure || r.global ? 'rgba(120,95,20,0.8)' : 'rgba(80,90,110,0.8)') : 'rgba(255,255,255,0.05)', recSel === m ? '#ffffff' : null);
    text((r ? '◆ ' : '') + m.name, x + w / 2, y + 12, 9, r ? '#ffffff' : '#6a7690', 'center', 'SYS');
    if (tapIn(x, y, w, 24)) recSel = m;
  };
  for (let s = 0; s < 6; s++) {
    const y = 60 + s * 28;
    text(`S${s + 1}`, 14, y + 12, 10, '#9fd7ff', 'left');
    MEDALS.filter(m => m.stage === s).forEach((m, i) => cell(m, 40 + i * 104, y, 100));
  }
  GLOBAL_MEDALS.forEach((m, i) => cell(m, 12 + (i % 3) * 114, 236 + Math.floor(i / 3) * 28, 108));
  text('隠しコンボ', 14, 306, 11, '#c89bff', 'left', 'SYS');
  SYNERGIES.forEach((c, i) => {
    const got = save.combos[c.id];
    text(got ? c.name : '？？？', 20 + (i % 3) * 114, 326 + Math.floor(i / 3) * 18, 10, got ? '#e0ccff' : '#6a7690', 'left', 'SYS');
  });
  text('機体', 14, 372, 11, '#9fd7ff', 'left', 'SYS');
  SHIPS.forEach((s, i) => {
    const y = 392 + i * 20, c = save.clears[s.id] || {};
    text(s.name, 20, y, 10, s.color, 'left', 'SYS');
    text([c.clear ? 'CLEAR' : c.sup ? 'CLEAR(S)' : '-', c.oneCC ? '1CC' : '', c.hard ? 'HARD' : ''].filter(Boolean).join(' '), 110, y, 9, '#8fe38a', 'left', 'SYS');
    text(String(save.hi[s.id] || 0).padStart(8, '0'), 340, y, 10, '#ffcf5a', 'right');
  });
  box(12, 496, 336, 60, 'rgba(20,30,60,0.8)', '#3a4a66');
  if (recSel) {
    const r = save.medals[recSel.id];
    text(recSel.name, 22, 512, 12, '#ffffff', 'left', 'SYS');
    text(recSel.desc, 22, 530, 10, '#b8c4dc', 'left', 'SYS');
    if (r && r.ship) text(`獲得：${SHIPS.find(s => s.id === r.ship).name}${r.pure ? '（パーツなし）' : ''}`, 22, 546, 9, '#d8c27a', 'left', 'SYS');
  } else text('勲章をタップすると条件を表示', W / 2, 526, 10, '#6a7690', 'center', 'SYS');
  if (button('もどる', 90, 572, 180, 40, '#7fdcff', 13)) { click(); scene = 'title'; }
}

// ================= 日替わり =================
function dailyScene(dt) {
  backdrop.update(dt, 6);
  backdrop.draw(ctx, 0, -2);
  const d = dailySeed(), rec = save.daily[d.key];
  const s = SHIPS[d.ship], st = STAGES[d.stage];
  text('DAILY', W / 2, 60, 26, '#ffcf5a');
  text(`${d.key.slice(0, 4)}/${d.key.slice(4, 6)}/${d.key.slice(6)} の挑戦`, W / 2, 92, 12, '#dfe9ff', 'center', 'SYS');
  drawSpr(ctx, s.spr, W / 2, 160, 70);
  text(s.name, W / 2, 210, 18, s.color);
  text(`STAGE ${d.stage + 1}  ${st.name}`, W / 2, 245, 13, '#9fd7ff', 'center', 'SYS');
  text('今日のルール', W / 2, 285, 11, '#ffcf5a', 'center', 'SYS');
  d.mut.forEach((id, i) => text('・' + MUTATORS.find(m => m.id === id).name, W / 2, 308 + i * 22, 13, '#ffffff', 'center', 'SYS'));
  text('パーツなし・1ステージ勝負', W / 2, 362, 10, '#9aa8c0', 'center', 'SYS');
  text(`今日のベスト ${String(rec ? rec.best : 0).padStart(8, '0')}${rec && rec.clear ? '  CLEAR' : ''}`, W / 2, 392, 12, '#ffcf5a', 'center', 'SYS');
  if (button('START', 90, 430, 180, 48, '#ffcf5a')) { sfx.play('item', 0.7); startGame(d.stage, 0, d); }
  else if (button('もどる', 90, 494, 180, 40, '#7fdcff', 13)) { click(); scene = 'title'; }
}

// ================= プレイ =================
function play(dt) {
  if (!paused) {
    if (tapIn(W - 44, 0, 44, 44)) { paused = true; game.cancelLocks(); }
    else for (let i = 0; i < DEBUG.speed && !game.over; i++) game.update(dt);
  }
  game.draw(ctx);
  if (paused) {
    ctx.fillStyle = 'rgba(0,0,10,0.6)'; ctx.fillRect(0, 0, W, H);
    text('PAUSE', W / 2, 220, 30, '#ffffff');
    if (button('RESUME', 90, 290, 180, 48)) paused = false;
    else if (button('TITLE', 90, 356, 180, 48)) { scene = 'title'; game = null; bgm.play('title'); return; }
  }
  if (game.over) finishRun();
}

function resultScene(dt) {
  result.t += dt;
  game.update(dt * 0.3);
  game.draw(ctx);
  ctx.fillStyle = 'rgba(0,0,10,0.72)'; ctx.fillRect(0, 0, W, H);
  if (result.daily) text(result.clear ? 'DAILY CLEAR' : 'DAILY OVER', W / 2, 90, 26, result.clear ? '#ffd23f' : '#ff6a7a');
  else if (result.clear) {
    text('ALL CLEAR', W / 2, 80, 32, '#ffd23f');
    const msg = !result.fromStart ? '途中ステージからのクリア' : result.support ? 'おめでとう！ サポートなしにも挑戦してみよう'
      : result.cont ? 'おめでとう！ 次はノーコンティニューを目指そう' : 'ノーコンティニュー クリア！ おみごと！';
    text(msg, W / 2, 114, 12, '#ffffff', 'center', 'SYS');
  } else text('GAME OVER', W / 2, 90, 30, '#ff6a7a');
  text(String(result.score).padStart(8, '0'), W / 2, 150, 26, '#ffffff');
  if (result.newHi && Math.floor(result.t * 3) % 2 === 0) text('NEW RECORD!', W / 2, 178, 13, '#ffcf5a');
  const rows = [['SHIP', result.ship + (result.hard ? '  HARD' : '')], ['STAGE', result.clear ? 'ALL' : result.stage], ['KILLS', result.kills],
    ['MAX LOCK', 'x' + result.maxVolley], ['RANK', result.rank], ['CONTINUE', result.cont]];
  rows.forEach(([k, v], i) => { text(k, 70, 200 + i * 22, 11, '#9fd7ff', 'left'); text(String(v), 290, 200 + i * 22, 11, '#ffffff', 'right'); });
  if (result.medals.length) {
    text('NEW MEDAL', W / 2, 340, 11, '#ffd23f');
    result.medals.slice(0, 4).forEach((m, i) => text('◆ ' + m, W / 2, 358 + i * 17, 11, '#ffe9a0', 'center', 'SYS'));
    if (result.medals.length > 4) text(`ほか ${result.medals.length - 4} 個`, W / 2, 358 + 4 * 17, 10, '#d8c27a', 'center', 'SYS');
  } else if (result.support) text('サポート出撃：クリア記録は残ります（勲章・ハイスコアは対象外）', W / 2, 350, 9, '#8fe38a', 'center', 'SYS');
  if (result.t > 1) {
    const canCont = !result.clear && !result.daily;
    if (canCont && button(`CONTINUE (STAGE ${result.stage})`, 60, 450, 240, 46)) startGame(result.stage - 1, result.cont + 1);
    else if (button('RETRY', 60, canCont ? 506 : 460, 110, 42)) {
      if (result.daily) startGame(result.daily.stage, 0, result.daily); else startGame(run.startStage);
    }
    else if (button('TITLE', 190, canCont ? 506 : 460, 110, 42)) { scene = 'title'; game = null; }
    if (canCont) text('コンティニューするとスコアは0から', W / 2, 562, 10, '#9aa8c0', 'center', 'SYS');
  }
}

// 下の帯（操作エリア）
function drawBand() {
  if (view.band < 8) return;
  const k = view.dpr;
  ctx.setTransform(k, 0, 0, k, 0, 0);
  const y0 = view.oy + H * view.scale;
  ctx.fillStyle = '#070915'; ctx.fillRect(0, y0, view.vw, view.band);
  ctx.strokeStyle = 'rgba(127,220,255,0.25)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, y0 + 0.5); ctx.lineTo(view.vw, y0 + 0.5); ctx.stroke();
  if (view.band > 40 && scene === 'play') {
    ctx.font = '12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = input.down ? 'rgba(127,220,255,0.15)' : 'rgba(127,220,255,0.35)';
    ctx.fillText('ここをドラッグして操作できます', view.vw / 2, y0 + view.band / 2);
  }
}

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.max(0.001, Math.min(0.05, (now - last) / 1000)); last = now;
  try { step(dt); } catch (err) { console.error(err); }
}
function step(dt) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  gameTransform(ctx);
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
  if (scene === 'title') title(dt);
  else if (scene === 'select') select(dt);
  else if (scene === 'parts') partsScene(dt);
  else if (scene === 'records') records(dt);
  else if (scene === 'daily') dailyScene(dt);
  else if (scene === 'play') play(dt);
  else if (scene === 'result') resultScene(dt);
  else { ctx.fillStyle = '#05060f'; ctx.fillRect(0, 0, W, H); text('LOADING...', W / 2, H / 2, 14, '#ffffff'); }
  ctx.restore();
  drawBand();
  endFrame(dt);
}

resize();
initInput(canvas);
input.onGesture = () => { if (scene !== 'loading') { sfx.unlock(); if (!game) bgm.play('title'); } };
requestAnimationFrame(frame);
loadAssets().then(() => { scene = 'title'; }).catch(err => { console.error(err); scene = 'title'; });
// オフライン対応（https のときだけ。常にネット優先で取得するので更新はすぐ反映される）
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
window.__game = () => game; // デバッグ用
window.__save = save;

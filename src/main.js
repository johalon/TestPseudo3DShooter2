// 起動・メインループ・画面遷移（タイトル / プレイ / ポーズ / リザルト）
import { W, H, view, layout, gameTransform } from './view.js';
import { input, initInput, endFrame, tapIn } from './input.js';
import { sfx } from './audio.js';
import { loadAssets, drawSpr } from './assets.js';
import { Game, Backdrop } from './game.js';
import { SHIPS } from './ships.js';
import { STAGES } from './stage.js';

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const params = new URLSearchParams(location.search);
const DEBUG = { t: +params.get('t') || 0, god: params.has('god'), bot: params.has('bot'), auto: params.has('auto'), speed: +params.get('speed') || 1,
  ship: params.has('ship') ? +params.get('ship') : null, stage: Math.max(0, (+params.get('stage') || 1) - 1) };

let scene = 'loading', game = null, paused = false, titleT = 0, result = null;
const backdrop = new Backdrop();

const store = {
  get(k, d) { try { const v = localStorage.getItem('stardepth.' + k); return v === null ? d : JSON.parse(v); } catch (_) { return d; } },
  set(k, v) { try { localStorage.setItem('stardepth.' + k, JSON.stringify(v)); } catch (_) {} },
};
let hiScore = store.get('hi', 0);
let shipSel = DEBUG.ship ?? store.get('ship', 0), selT = 0;
const shipHi = id => store.get('hi_' + id, 0);

function resize() {
  layout(canvas);
  if (scene === 'play' && innerWidth > innerHeight && matchMedia('(pointer: coarse)').matches) paused = true;
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 200));
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { if (scene === 'play') { paused = true; game.cancelLocks(); } sfx.suspend(); } else sfx.resume();
});

function startGame(stage = DEBUG.stage, continues = 0) {
  game = new Game({ t: stage === DEBUG.stage ? DEBUG.t : 0, god: DEBUG.god, bot: DEBUG.bot, ship: shipSel, stage, continues });
  scene = 'play'; paused = false;
}

function text(s, x, y, size, color, align = 'center', font) {
  font = font || (size > 13 && !/K/.test(s) ? 'Kenvector, sans-serif' : 'SYS');
  ctx.font = font === 'SYS' ? `700 ${size}px system-ui, sans-serif` : `${size}px ${font}`; ctx.textAlign = align; ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillText(s, x + 1.5, y + 1.5);
  ctx.fillStyle = color; ctx.fillText(s, x, y);
}
function button(label, x, y, w, h) {
  ctx.fillStyle = 'rgba(20,40,80,0.75)'; ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#7fdcff'; ctx.lineWidth = 2; ctx.strokeRect(x, y, w, h);
  text(label, x + w / 2, y + h / 2 + 1, label.length > 12 ? 13 : 15, '#ffffff');
  return tapIn(x, y, w, h);
}

// ---- 各シーン ----
function title(dt) {
  titleT += dt;
  backdrop.update(dt, 8);
  backdrop.draw(ctx, Math.sin(titleT * 0.3) * 0.5, -2);
  drawSpr(ctx, SHIPS[shipSel].spr, W / 2, 400 + Math.sin(titleT * 2) * 6, 80, Math.sin(titleT * 0.9) * 0.15);
  text('STAR', W / 2, 130, 44, '#ffffff');
  text('DEPTH', W / 2, 180, 44, '#7fdcff');
  text(`HI ${String(hiScore).padStart(8, '0')}`, W / 2, 232, 13, '#ffcf5a');
  if (Math.floor(titleT * 2) % 2 === 0) text('TAP TO START', W / 2, 500, 17, '#ffffff');
  text('ドラッグで移動 ・ ショットは自動', W / 2, 548, 13, '#cfe8ff', 'center', 'sans-serif');
  text('長押しでロックオン → 離して一斉発射', W / 2, 570, 13, '#cfe8ff', 'center', 'sans-serif');
  text('Assets: Kenney.nl (CC0)', W / 2, H - 16, 9, 'rgba(255,255,255,0.45)');
  if (DEBUG.auto) startGame();
  else if (input.taps.length) { sfx.play('item', 0.7); scene = 'select'; selT = 0; }
}

// 機体選択
const STAT_NAMES = ['SPEED', 'POWER', 'LOCK', 'ARMOR'];
function select(dt) {
  selT += dt;
  backdrop.update(dt, 6);
  backdrop.draw(ctx, 0, -2);
  text('SELECT SHIP', W / 2, 52, 22, '#ffffff');
  const n = SHIPS.length, cw = 66, x0 = W / 2 - (n - 1) * cw / 2;
  SHIPS.forEach((s, i) => {
    const x = x0 + i * cw, y = 118, on = i === shipSel;
    ctx.fillStyle = on ? 'rgba(127,220,255,0.18)' : 'rgba(255,255,255,0.05)';
    ctx.fillRect(x - 30, y - 34, 60, 68);
    if (on) { ctx.strokeStyle = s.color; ctx.lineWidth = 2; ctx.strokeRect(x - 30, y - 34, 60, 68); }
    drawSpr(ctx, s.spr, x, y - 4, 44);
    text(s.name, x, y + 24, 8, on ? s.color : '#9aa8c0');
    if (tapIn(x - 32, y - 36, 64, 72) && !on) { shipSel = i; sfx.play('lock', 0.5, 1.2); store.set('ship', i); }
  });
  const s = SHIPS[shipSel];
  drawSpr(ctx, s.spr, W / 2, 250 + Math.sin(selT * 2) * 5, 110, Math.sin(selT * 1.3) * 0.12);
  text(s.name, W / 2, 330, 24, s.color);
  text(s.desc, W / 2, 360, 13, '#dfe9ff', 'center', 'SYS');
  s.stats.forEach((v, i) => {
    const y = 396 + i * 24;
    text(STAT_NAMES[i], 80, y, 11, '#9fd7ff', 'left');
    for (let j = 0; j < 5; j++) {
      ctx.fillStyle = j < v ? s.color : 'rgba(255,255,255,0.12)';
      ctx.fillRect(150 + j * 26, y - 5, 22, 10);
    }
  });
  text(`HI ${String(shipHi(s.id)).padStart(8, '0')}`, W / 2, 500, 12, '#ffcf5a');
  if (button('START', 90, 526, 180, 50)) { sfx.play('item', 0.7); startGame(0); }
  else if (tapIn(0, 0, 70, 44)) scene = 'title';
  text('< BACK', 12, 22, 11, '#9fd7ff', 'left');
}

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
    else if (button('TITLE', 90, 356, 180, 48)) { scene = 'title'; game = null; return; }
  }
  if (game.over) {
    const id = game.ship.id, newHi = game.score > shipHi(id);
    if (newHi) store.set('hi_' + id, game.score);
    if (game.score > hiScore) { hiScore = game.score; store.set('hi', hiScore); }
    if (game.allClear && game.continues === 0) store.set('clear_' + id, true);
    result = { score: game.score, stage: game.stageIdx + 1, kills: game.kills, maxVolley: game.maxVolley,
      rank: Math.floor(game.rank), newHi, t: 0, clear: game.allClear, cont: game.continues, ship: game.ship.name };
    scene = 'result';
  }
}

function resultScene(dt) {
  result.t += dt;
  game.update(dt * 0.3);
  game.draw(ctx);
  ctx.fillStyle = 'rgba(0,0,10,0.7)'; ctx.fillRect(0, 0, W, H);
  if (result.clear) {
    text('ALL CLEAR', W / 2, 110, 32, '#ffd23f');
    text(result.cont ? 'おめでとう！ 次はノーコンティニューを目指そう' : 'ノーコンティニュー クリア！ おみごと！', W / 2, 146, 13, '#ffffff', 'center', 'SYS');
  } else text('GAME OVER', W / 2, 120, 30, '#ff6a7a');
  text(String(result.score).padStart(8, '0'), W / 2, 190, 28, '#ffffff');
  if (result.newHi && Math.floor(result.t * 3) % 2 === 0) text('NEW RECORD!', W / 2, 222, 14, '#ffcf5a');
  const rows = [['SHIP', result.ship], ['STAGE', result.clear ? 'ALL' : result.stage], ['KILLS', result.kills],
    ['MAX LOCK', 'x' + result.maxVolley], ['RANK', result.rank], ['CONTINUE', result.cont]];
  rows.forEach(([k, v], i) => { text(k, 80, 256 + i * 26, 12, '#9fd7ff', 'left'); text(String(v), 280, 256 + i * 26, 12, '#ffffff', 'right'); });
  if (result.t > 1) {
    const canCont = !result.clear;
    if (canCont && button(`CONTINUE (STAGE ${result.stage})`, 60, 420, 240, 48)) startGame(result.stage - 1, result.cont + 1);
    else if (button('RETRY', 60, canCont ? 480 : 440, 110, 44)) startGame(0);
    else if (button('TITLE', 190, canCont ? 480 : 440, 110, 44)) { scene = 'title'; game = null; }
    if (canCont) text('コンティニューするとスコアは0から', W / 2, 540, 11, '#9aa8c0', 'center', 'SYS');
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
  else if (scene === 'play') play(dt);
  else if (scene === 'result') resultScene(dt);
  else { ctx.fillStyle = '#05060f'; ctx.fillRect(0, 0, W, H); text('LOADING...', W / 2, H / 2, 14, '#ffffff'); }
  ctx.restore();
  drawBand();
  endFrame(dt);
}

resize();
initInput(canvas);
input.onGesture = () => { if (scene !== 'loading') sfx.unlock(); };
requestAnimationFrame(frame);
loadAssets().then(() => { scene = 'title'; }).catch(err => { console.error(err); scene = 'title'; });
window.__game = () => game; // デバッグ用

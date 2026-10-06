// 起動・メインループ・画面遷移（v2 縦切り版：タイトル / プレイ / リザルト）
// 旧版の機体選択・パーツ・勲章・日替わりは凍結中（ships.js / parts.js などは残してあるが読み込まない）
import { W, H, view, layout, gameTransform } from './view.js';
import { input, initInput, endFrame, tapIn } from './input.js';
import { sfx } from './audio.js';
import { bgm } from './bgm.js';
import { loadAssets, drawSpr } from './assets.js';
import { Game, Backdrop } from './game.js';
import { save, persist } from './save.js';

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const params = new URLSearchParams(location.search);
const DEBUG = { t: +params.get('t') || 0, god: params.has('god'), bot: params.has('bot'), botRoll: params.has('roll'),
  auto: params.has('auto'), speed: +params.get('speed') || 1 };
DEBUG.noRecord = ['god', 'bot', 't', 'speed', 'auto', 'roll'].some(k => params.has(k));

let scene = 'loading', game = null, paused = false, titleT = 0, result = null;
const backdrop = new Backdrop();
const hiKey = 'v2';
bgm.setOn(save.bgm); sfx.muted = !save.se;

function resize() {
  layout(canvas);
  if (scene === 'play' && innerWidth > innerHeight && matchMedia('(pointer: coarse)').matches) { paused = true; game.cancelLocks(); }
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 200));
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { if (scene === 'play') { paused = true; game.cancelLocks(); } sfx.suspend(); } else sfx.resume();
});

function startGame() {
  game = new Game({ t: DEBUG.t, god: DEBUG.god, bot: DEBUG.bot, botRoll: DEBUG.botRoll });
  scene = 'play'; paused = false;
}

function text(s, x, y, size, color, align = 'center', font) {
  font = font || (size > 13 && !/K/.test(s) ? 'Kenvector, sans-serif' : 'SYS');
  ctx.font = font === 'SYS' ? `700 ${size}px system-ui, sans-serif` : `${size}px ${font}`;
  ctx.textAlign = align; ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillText(s, x + 1.5, y + 1.5);
  ctx.fillStyle = color; ctx.fillText(s, x, y);
}
function button(label, x, y, w, h, color = '#7fdcff', size) {
  ctx.fillStyle = 'rgba(20,40,80,0.75)'; ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  text(label, x + w / 2, y + h / 2 + 1, size || 15, '#ffffff');
  return tapIn(x, y, w, h);
}

function title(dt) {
  titleT += dt;
  backdrop.update(dt, 8);
  backdrop.draw(ctx, Math.sin(titleT * 0.3) * 0.5, -2);
  text('STAR', W / 2, 105, 44, '#ffffff');
  text('DEPTH', W / 2, 155, 44, '#7fdcff');
  text('v2 PROTOTYPE ─ STAGE 1', W / 2, 192, 11, '#ffcf5a');
  text(`HI ${String(save.hi[hiKey] || 0).padStart(8, '0')}`, W / 2, 214, 13, '#ffcf5a');
  drawSpr(ctx, 'playerShip1_blue', W / 2, 285 + Math.sin(titleT * 2) * 6, 70, Math.sin(titleT * 0.9) * 0.15);
  text('ドラッグで移動。弾は自機の正面にまっすぐ飛ぶ', W / 2, 345, 12, '#cfe8ff', 'center', 'SYS');
  text('長押し：照準に敵をとどめてロック → 離して発射', W / 2, 365, 12, '#cfe8ff', 'center', 'SYS');
  text('ダブルタップ：宙返り（一瞬無敵）', W / 2, 385, 12, '#cfe8ff', 'center', 'SYS');
  if (DEBUG.auto) { DEBUG.auto = false; startGame(); return; }
  if (button('START', 90, 430, 180, 50)) { sfx.play('item', 0.7); startGame(); }
  else if (button('BGM ' + (save.bgm ? 'ON' : 'OFF'), 60, 560, 110, 30, '#5a7090', 12)) { save.bgm = !save.bgm; bgm.setOn(save.bgm); persist(); }
  else if (button('SE ' + (save.se ? 'ON' : 'OFF'), 190, 560, 110, 30, '#5a7090', 12)) { save.se = !save.se; sfx.muted = !save.se; persist(); }
  text('Assets: Kenney.nl (CC0)', W / 2, H - 12, 9, 'rgba(255,255,255,0.45)');
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
    else if (button('TITLE', 90, 356, 180, 48)) { scene = 'title'; game = null; bgm.play('title'); return; }
  }
  if (game.over) {
    const newHi = !DEBUG.noRecord && game.score > (save.hi[hiKey] || 0);
    if (newHi) { save.hi[hiKey] = game.score; persist(); }
    result = { score: game.score, clear: game.clear, kills: game.kills, hits: game.hits, maxVolley: game.maxVolley, newHi, t: 0 };
    scene = 'result'; bgm.play('title');
  }
}

function resultScene(dt) {
  result.t += dt;
  game.update(dt * 0.3);
  game.draw(ctx);
  ctx.fillStyle = 'rgba(0,0,10,0.72)'; ctx.fillRect(0, 0, W, H);
  text(result.clear ? 'STAGE 1 CLEAR' : 'GAME OVER', W / 2, 110, 26, result.clear ? '#ffd23f' : '#ff6a7a');
  if (result.clear) text('縦切り版はここまで。遊んだ感想を聞かせてください', W / 2, 142, 11, '#ffffff', 'center', 'SYS');
  text(String(result.score).padStart(8, '0'), W / 2, 185, 28, '#ffffff');
  if (result.newHi && Math.floor(result.t * 3) % 2 === 0) text('NEW RECORD!', W / 2, 215, 13, '#ffcf5a');
  [['KILLS', result.kills], ['DAMAGE TAKEN', result.hits], ['MAX LOCK', 'x' + result.maxVolley]].forEach(([k, v], i) => {
    text(k, 80, 260 + i * 26, 12, '#9fd7ff', 'left'); text(String(v), 280, 260 + i * 26, 12, '#ffffff', 'right');
  });
  if (result.t > 1) {
    if (button('RETRY', 90, 400, 180, 48)) startGame();
    else if (button('TITLE', 90, 462, 180, 44)) { scene = 'title'; game = null; }
  }
}

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
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
window.__game = () => game;

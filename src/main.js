// 起動・メインループ・画面遷移（タイトル / プレイ / ポーズ / リザルト）
import { W, H, view, layout, gameTransform } from './view.js';
import { input, initInput, endFrame, tapIn } from './input.js';
import { sfx } from './audio.js';
import { loadAssets, drawSpr } from './assets.js';
import { Game, Backdrop } from './game.js';

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const params = new URLSearchParams(location.search);
const DEBUG = { t: +params.get('t') || 0, god: params.has('god'), bot: params.has('bot'), auto: params.has('auto') };

let scene = 'loading', game = null, paused = false, titleT = 0, result = null;
const backdrop = new Backdrop();

const store = {
  get(k, d) { try { const v = localStorage.getItem('stardepth.' + k); return v === null ? d : JSON.parse(v); } catch (_) { return d; } },
  set(k, v) { try { localStorage.setItem('stardepth.' + k, JSON.stringify(v)); } catch (_) {} },
};
let hiScore = store.get('hi', 0);

function resize() {
  layout(canvas);
  if (scene === 'play' && innerWidth > innerHeight && matchMedia('(pointer: coarse)').matches) paused = true;
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 200));
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { if (scene === 'play') { paused = true; game.cancelLocks(); } sfx.suspend(); } else sfx.resume();
});

function startGame() {
  game = new Game({ t: DEBUG.t, god: DEBUG.god, bot: DEBUG.bot });
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
  text(label, x + w / 2, y + h / 2 + 1, 15, '#ffffff');
  return tapIn(x, y, w, h);
}

// ---- 各シーン ----
function title(dt) {
  titleT += dt;
  backdrop.update(dt, 8);
  backdrop.draw(ctx, Math.sin(titleT * 0.3) * 0.5, -2);
  drawSpr(ctx, 'playerShip1_blue', W / 2, 400 + Math.sin(titleT * 2) * 6, 80, Math.sin(titleT * 0.9) * 0.15);
  text('STAR', W / 2, 130, 44, '#ffffff');
  text('DEPTH', W / 2, 180, 44, '#7fdcff');
  text(`HI ${String(hiScore).padStart(8, '0')}`, W / 2, 232, 13, '#ffcf5a');
  if (Math.floor(titleT * 2) % 2 === 0) text('TAP TO START', W / 2, 500, 17, '#ffffff');
  text('ドラッグで移動 ・ ショットは自動', W / 2, 548, 13, '#cfe8ff', 'center', 'sans-serif');
  text('長押しでロックオン → 離して一斉発射', W / 2, 570, 13, '#cfe8ff', 'center', 'sans-serif');
  text('Assets: Kenney.nl (CC0)', W / 2, H - 16, 9, 'rgba(255,255,255,0.45)');
  if (input.taps.length || DEBUG.auto) { sfx.play('item', 0.7); startGame(); }
}

function play(dt) {
  if (!paused) {
    if (tapIn(W - 44, 0, 44, 44)) { paused = true; game.cancelLocks(); }
    else game.update(dt);
  }
  game.draw(ctx);
  if (paused) {
    ctx.fillStyle = 'rgba(0,0,10,0.6)'; ctx.fillRect(0, 0, W, H);
    text('PAUSE', W / 2, 220, 30, '#ffffff');
    if (button('RESUME', 90, 290, 180, 48)) paused = false;
    else if (button('TITLE', 90, 356, 180, 48)) { scene = 'title'; game = null; return; }
  }
  if (game.over) {
    const newHi = game.score > hiScore;
    if (newHi) { hiScore = game.score; store.set('hi', hiScore); }
    result = { score: game.score, lap: game.lap, kills: game.kills, maxVolley: game.maxVolley, rank: Math.floor(game.rank), newHi, t: 0 };
    scene = 'result';
  }
}

function resultScene(dt) {
  result.t += dt;
  game.update(dt * 0.3);
  game.draw(ctx);
  ctx.fillStyle = 'rgba(0,0,10,0.7)'; ctx.fillRect(0, 0, W, H);
  text('GAME OVER', W / 2, 140, 30, '#ff6a7a');
  text(String(result.score).padStart(8, '0'), W / 2, 200, 28, '#ffffff');
  if (result.newHi && Math.floor(result.t * 3) % 2 === 0) text('NEW RECORD!', W / 2, 235, 14, '#ffcf5a');
  const rows = [['LAP', result.lap], ['KILLS', result.kills], ['MAX LOCK', 'x' + result.maxVolley], ['RANK', result.rank], ['HI SCORE', hiScore]];
  rows.forEach(([k, v], i) => { text(k, 80, 280 + i * 28, 13, '#9fd7ff', 'left'); text(String(v), 280, 280 + i * 28, 13, '#ffffff', 'right'); });
  if (result.t > 1) {
    if (button('RETRY', 90, 440, 180, 48)) startGame();
    else if (button('TITLE', 90, 505, 180, 48)) { scene = 'title'; game = null; }
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

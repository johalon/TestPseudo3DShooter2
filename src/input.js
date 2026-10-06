// タッチ（Pointer Events）入力。1本指のみ追跡し、相対ドラッグ量を積算する。
import { view, toLogical } from './view.js';

export const input = {
  down: false,        // 指が触れているか
  holdTime: 0,        // 触れてからの経過秒
  dx: 0, dy: 0,       // 前フレームからの移動量（論理px）
  pressed: false,     // このフレームで押された
  released: false,    // このフレームで離された
  taps: [],           // このフレームのタップ位置（論理座標）
  x: 0, y: 0,         // 現在位置（論理座標）
  doubleTap: false,   // このフレームでダブルタップされた（宙返り）
  onGesture: null,    // iOS の音声解除はイベントハンドラ内で行う必要がある
};

let pid = null, sx = 0, sy = 0, st = 0, lx = 0, ly = 0, moved = 0, lastTap = -1e9, ldx = 0, ldy = 0;

export function initInput(el) {
  el.addEventListener('pointerdown', e => {
    if (pid !== null) return;
    pid = e.pointerId;
    try { el.setPointerCapture(pid); } catch (_) {}
    sx = lx = e.clientX; sy = ly = e.clientY; st = performance.now(); moved = 0;
    // 直前が「短いタップ」で、300ms以内・近い位置ならダブルタップ
    if (st - lastTap < 300 && Math.hypot(sx - ldx, sy - ldy) < 60 * view.scale) { input.doubleTap = true; lastTap = -1e9; }
    input.down = true; input.pressed = true; input.holdTime = 0;
    [input.x, input.y] = toLogical(e.clientX, e.clientY);
    e.preventDefault();
  });
  el.addEventListener('pointermove', e => {
    if (e.pointerId !== pid) return;
    const s = view.scale;
    input.dx += (e.clientX - lx) / s;
    input.dy += (e.clientY - ly) / s;
    moved += Math.abs(e.clientX - lx) + Math.abs(e.clientY - ly);
    lx = e.clientX; ly = e.clientY;
    [input.x, input.y] = toLogical(e.clientX, e.clientY);
    e.preventDefault();
  });
  const up = e => {
    if (e.pointerId !== pid) return;
    pid = null;
    input.down = false; input.released = true;
    if (input.onGesture) input.onGesture();
    const now = performance.now();
    if (e.type === 'pointerup' && moved < 20 && now - st < 400) input.taps.push(toLogical(sx, sy));
    if (e.type === 'pointerup' && moved < 20 && now - st < 250) { lastTap = now; ldx = sx; ldy = sy; }
  };
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('lostpointercapture', up);
  // アプリ切替などで離した通知が来なかった場合の保険
  const reset = () => { if (pid !== null) { pid = null; input.down = false; input.released = true; } };
  window.addEventListener('blur', reset);
  document.addEventListener('visibilitychange', () => { if (document.hidden) reset(); });
  // スクロール・ズーム・長押しメニューの抑止
  document.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
  document.addEventListener('gesturestart', e => e.preventDefault());
  document.addEventListener('contextmenu', e => e.preventDefault());
}

// 1フレーム分の入力を消費した後に呼ぶ
export function endFrame(dt) {
  if (input.down) input.holdTime += dt;
  input.dx = input.dy = 0;
  input.pressed = input.released = input.doubleTap = false;
  input.taps.length = 0;
}

export function tapIn(x, y, w, h) {
  return input.taps.some(([tx, ty]) => tx >= x && tx <= x + w && ty >= y && ty <= y + h);
}

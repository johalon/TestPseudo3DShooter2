// 画面レイアウト：論理解像度 360x640（9:16）を画面に収める。
// 縦長端末では上寄せにして下に帯（操作エリア）、横長では左右に帯。
export const W = 360, H = 640;

export const view = { scale: 1, ox: 0, oy: 0, dpr: 1, vw: 0, vh: 0, band: 0 };

export function layout(canvas) {
  const vw = window.innerWidth, vh = window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const s = Math.min(vw / W, vh / H);
  view.scale = s;
  view.ox = Math.floor((vw - W * s) / 2);
  view.oy = 0;
  view.vw = vw; view.vh = vh; view.dpr = dpr;
  view.band = vh - H * s; // 下の帯の高さ（CSS px）
  canvas.width = Math.round(vw * dpr);
  canvas.height = Math.round(vh * dpr);
  canvas.style.width = vw + 'px';
  canvas.style.height = vh + 'px';
}

// CSS座標 → 論理座標
export function toLogical(cx, cy) {
  return [(cx - view.ox) / view.scale, (cy - view.oy) / view.scale];
}

// ゲーム領域の描画用トランスフォーム
export function gameTransform(ctx) {
  const k = view.dpr * view.scale;
  ctx.setTransform(k, 0, 0, k, view.dpr * view.ox, view.dpr * view.oy);
}

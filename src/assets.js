// スプライトアトラスとフォント、発光エフェクト用の事前描画キャンバス
export let atlasImg = null, atlas = {};
export const glow = {};

export async function loadAssets() {
  glow.red = makeGlow('255,255,255', '255,60,120');
  glow.orange = makeGlow('255,255,230', '255,150,40');
  glow.blue = makeGlow('255,255,255', '60,170,255');
  glow.green = makeGlow('240,255,240', '80,255,140');
  glow.white = makeGlow('255,255,255', '200,220,255');
  const [img, json] = await Promise.all([
    new Promise((ok, ng) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ng; i.src = 'assets/atlas.png'; }),
    fetch('assets/atlas.json').then(r => r.json()),
  ]);
  atlasImg = img; atlas = json;
  try {
    const f = new FontFace('Kenvector', 'url(assets/font.ttf)');
    await f.load(); document.fonts.add(f);
  } catch (_) {}
}

function makeGlow(inner, outer) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, `rgba(${inner},1)`);
  gr.addColorStop(0.25, `rgba(${inner},0.95)`);
  gr.addColorStop(0.45, `rgba(${outer},0.6)`);
  gr.addColorStop(1, `rgba(${outer},0)`);
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return c;
}

// 中心(x,y)に幅wで描く。高さは元画像の比率から決める
export function drawSpr(ctx, name, x, y, w, rot = 0, flip = false) {
  const f = atlas[name];
  if (!f) return;
  const h = w * f[3] / f[2];
  if (rot || flip) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot + (flip ? Math.PI : 0));
    ctx.drawImage(atlasImg, f[0], f[1], f[2], f[3], -w / 2, -h / 2, w, h);
    ctx.restore();
  } else {
    ctx.drawImage(atlasImg, f[0], f[1], f[2], f[3], x - w / 2, y - h / 2, w, h);
  }
}

export function drawGlow(ctx, c, x, y, r) {
  ctx.drawImage(c, x - r, y - r, r * 2, r * 2);
}

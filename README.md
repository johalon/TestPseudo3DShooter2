# STAR DEPTH（仮）

スマホ縦持ち・タッチ操作専用の奥行きシューティング（ブラウザゲーム）。
描画は Canvas 2D の擬似3D（2Dスプライトの拡大縮小）で軽量に。

## 遊び方
- 画面下の操作エリアをドラッグ：自機移動（ショットは自動）
- 長押し：ロックオン → 指を離すとホーミングレーザー一斉発射（まとめて倒すほど高倍率）

## 動作環境
- iOS Safari / Android Chrome（最近のバージョン）
- 画面は 9:16。縦長端末では下に操作用の帯、横長端末では左右に帯

## ローカル実行
ES Modules を使うため、ファイル直開きではなく簡易サーバーで開く：
```
npx serve .    または    python -m http.server
```

## デバッグ用URLパラメータ
- `?t=100` … ステージの途中（秒）から開始
- `?god` … 無敵
- `?bot` … 自動操縦（動作確認用）
- `?auto` … タイトルを飛ばして即開始

## ファイル構成
- `index.html` / `style.css` / `manifest.json`
- `src/main.js` 起動・画面遷移 / `src/game.js` ゲーム本体 / `src/stage.js` 敵の出現タイムライン
- `src/view.js` 画面レイアウト / `src/input.js` タッチ入力 / `src/audio.js` 効果音 / `src/assets.js` 画像
- `assets/` アトラス画像・効果音（mp3）・フォント・アイコン

## クレジット
- Graphics / Sounds: Kenney (www.kenney.nl) — CC0

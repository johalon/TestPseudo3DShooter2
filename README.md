# STAR DEPTH（仮）

スマホ縦持ち・タッチ操作専用の奥行きシューティング（ブラウザゲーム）。
描画は Canvas 2D の擬似3D（2Dスプライトの拡大縮小）で軽量に。

## 遊び方
- 画面下の操作エリアをドラッグ：自機移動（ショットは自動）
- 長押し：ロックオン → 指を離すとホーミングレーザー一斉発射（まとめて倒すほど高倍率）
- 全6ステージ。ゲームオーバー時はそのステージからコンティニュー可（スコアは0から）
- ランク：時間経過と大量ロックで上昇（ステージごとに上限あり）、被弾で低下

## 自機（5種）
| 機体 | 特徴 |
|---|---|
| ARROW | バランス型。2連ショット、8ロック |
| LANCER | 高速。敵を貫通する強力な単発弾、6ロック・高威力レーザー |
| BULWARK | 重装甲（シールド150）。3WAYショット。初心者向け |
| SEEKER | 最大12ロック・広いロック範囲。一斉発射で稼ぐ |
| PHANTOM | シールド60・極小当たり判定・高速連射・スコア1.5倍 |

## ステージ
1. OUTER ORBIT（外縁軌道）─ BATTLE CRUISER
2. ASTEROID BELT（小惑星帯）─ MINING RIG
3. CRIMSON NEBULA（深紅星雲）─ MOTHER SAUCER
4. FLEET LINE（艦隊防衛線）─ TWIN LANCERS（2体同時）
5. ORBITAL STATION（軌道要塞）─ ORBITAL FORTRESS
6. THE CORE（中枢）─ THE CORE（3段階）

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
- `?stage=3` … 指定ステージから開始（`?t=999` と組み合わせるとボス戦から）
- `?ship=0〜4` … 機体を指定
- `?speed=4` … 早送り（自動テスト用）

## ファイル構成
- `index.html` / `style.css` / `manifest.json`
- `src/main.js` 起動・画面遷移 / `src/game.js` ゲーム本体 / `src/stage.js` 全6ステージ（テーマ・敵の出現・ボス） / `src/ships.js` 自機5種
- `src/view.js` 画面レイアウト / `src/input.js` タッチ入力 / `src/audio.js` 効果音 / `src/assets.js` 画像
- `assets/` アトラス画像・効果音（mp3）・フォント・アイコン

## クレジット
- Graphics / Sounds: Kenney (www.kenney.nl) — CC0

# スイーツランド デジタル版

ボードゲーム「スイーツランド」（2〜4人）をブラウザで遊べるようにしたもの。友人とのオンライン対戦が目的である。ソロモード（専用ルール）は対象外だが、ローカルでは通常のルールのまま1人でも遊べる。

## 構成

- `src/game/`：ルールエンジン。純粋関数のみで、UI・DOM・通信に依存しない。乱数はシード付きで、`Math.random()` は使わない。
  - `createGame(config, seed)` → `getOptions(state)` → `applyMove(state, optionId)` の「選択待ち」モデル。効果の途中でプレイヤーの選択が要るたびに `pending` を立てて止まる。
  - `history.ts`：`isCheckpoint` / `replay` / `undoLast`。手の列（選択肢 ID の配列）と初期シードから局面を再現できる。
  - `targets.ts`：合法手 → 盤面要素の対応。`explain.ts`：選べない理由の文（判定には使わない）。
- `src/data/`：市民カード207枚・キャラクター14人・地図6面の JSON。
- `src/ui/`：React 18 の UI。
  - `gestures.ts` が「合法手の種類 → 所作（ドラッグ／クリック／ボタン）」の対応表。画面は合法性を計算しない。
  - レイアウトは `Game.tsx` の `WideLayout`（PC 横長、`wide.css`）と、`MobileLayout.tsx` の `PortraitLayout`（スマートフォン縦持ち）・`LandscapeLayout`（横持ち）（`mobile.css`）。共通のスタイルは `layout.css`・`styles.css`、共通の部品は `GameParts.tsx`。
- `src/net/`：オンライン同期。
  - `room.ts`：`Room` インターフェース（subscribe / write / clear / transact）と、検査用の偽 DB（`?fakedb=1&uid=名前`、localStorage 共有）。
  - `supabaseRoom.ts`：本番。Supabase の `public.games` テーブル（id text, doc jsonb）＋Realtime＋匿名ログイン。
  - `useOnlineGame.ts`：共有ドキュメントの手の列を各画面が再生する。書き込むのは選択待ちのプレイヤーだけ。取り消しは手の列の末尾を削る（チェックポイントまで）。
- `src/ui/Online.tsx`：ロビー（ゲーム作成・席・名前・開始）と対局画面。
- `tests/`：Vitest（104件）。`e2e/`：Playwright の自動対戦・同期検査。
- `deploy/`：Supabase の準備用 SQL（`supabase_setup.sql`）と手順書。

## コマンド

- `npm install`
- `npx tsc --noEmit -p .`：型検査
- `npx vitest run`：テスト（全件通ること）
- `npm run build`：`dist/index.html` に JS・CSS を埋め込んだ1枚の HTML を作る（vite-plugin-singlefile）
- `node e2e/online.mjs 3 5 400`：3画面を偽 DB でつなぎ、400手まで同期・情報漏れ・操作権を検査する（要ビルド）
- `node e2e/autoplay.mjs mouse|portrait|landscape <seed> <players> [maxSteps] [shotDir] [variants]`：盤面の所作だけで1局を打ち切る自動対戦（要ビルド）。`portrait`（390×844）・`landscape`（844×390）はスマートフォンのタッチ操作
- Playwright は `@playwright/test@1.56.1` に固定している。ローカルで初めて使うときは `npx playwright install chromium` が必要。

## 配布（GitHub Pages ＋ Supabase）

- main に push すると `.github/workflows/pages.yml` が型検査・テスト・ビルドを行い、`dist/` を GitHub Pages に公開する。手でファイルを上げる必要はない。テストが落ちると公開されない。
- リポジトリの Settings → Pages の Source は「GitHub Actions」にしておくこと（「Deploy from a branch」だと、ビルド前の `index.html` が公開されて画面が真っ白になる）。
- `index.html` の head にある `window.SWEETLANDS_SUPABASE`（url と publishable key）がオンライン対戦の接続先。公開用の値であり秘密ではない。`service_role` / secret key は絶対に書かない。
- `?g=名前` でゲームを分けられる（省略時は `current`）。

## 守ること

- ルールエンジンは決定的に保つ。オンライン版は全員が同じ手の列を再生するため、選択肢 ID の付け方や乱数の消費順を変えると進行中のゲームが壊れる。変えるときは理由を残す。
- 画面に他人の手札の中身（カード ID）を出さない（DOM にも持たせない）。
- 判定はゲーム処理の合法手が正。UI 側でルールを再実装しない。
- 変更後は型検査・テスト・ビルドを通し、オンライン部分を触ったら `e2e/online.mjs` も流す。
- コード内のコメントと文書は日本語の「である調」で書く。

## 既知の制約

- 山札・手札も共有データに入るため、開発者ツールを使えば他人の手札が見える（友人同士の対戦が前提）。
- 席はブラウザごとの匿名 ID で覚える。別のブラウザ・端末からは同じ席に戻れない。
- Supabase の無料プロジェクトは1週間ほど使わないと一時停止する。

## 詳しい資料

ルール全文（`SweetLands_rules.md`）、設計方針（`decisions.md`）、UI 設計書（`ui_design.md`）は claude.ai のプロジェクト「スイーツランドデジタル化」にある。`docs/` にはその追補（v1.1 ルール、ヴァリアント、横長レイアウト、スマートフォンのレイアウト、不具合の改修、機能の追加、両替の一括、キャラクターの上方修正）だけを置いている。ルールの判断が要るときは、推測で決めずに持ち主に確認すること。

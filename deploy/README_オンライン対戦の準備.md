# スイーツランド オンライン対戦の準備（Supabase ＋ GitHub Pages）

友達はリンクを開くだけで遊べる（アカウント不要）。準備はホストが1回だけ行う。所要時間の目安は30分。
Supabase と GitHub は、どちらも GitHub アカウントでログインできる。

使うファイル（このフォルダ）
- リポジトリ一式：ゲーム本体のソース（push すると自動でビルド・公開される）
- `supabase_setup.sql`：共有データを置くテーブルと、書き込みルールを作る SQL

## 1. Supabase のプロジェクトを作る

1. https://supabase.com を開き、「Start your project」→「Continue with GitHub」でログインする。
2. 「New project」を押す。
   - Name：自由（例：sweetlands）
   - Database Password：自由（「Generate a password」でよい。このゲームでは使わない）
   - Region：Northeast Asia (Tokyo)
   - そのほかの項目は初期値のままでよい
3. 「Create new project」を押し、準備が終わるまで1〜2分待つ。

## 2. 匿名ログインを有効にする

1. 左のメニュー「Authentication」→「Sign In / Providers」（画面によっては「Providers」や「Settings」）を開く。
2. 「Allow anonymous sign-ins」をオンにして保存する。

## 3. テーブルを作る

1. 左のメニュー「SQL Editor」を開き、新しいクエリを作る。
2. `supabase_setup.sql` の中身をすべて貼り付けて「Run」を押す。
3. 「Success. No rows returned」と出れば完了。

## 4. 設定値を取り出す

1. 画面上部の「Connect」ボタン、または左下の「Project Settings」→「API Keys」（または「API」）を開く。
2. 次の2つを控える。
   - Project URL（`https://xxxxxxxx.supabase.co` の形）
   - Publishable key（`sb_publishable_` で始まる）。見当たらなければ「Legacy API keys」の `anon` `public` の key でもよい。
   - どちらもページに書き込む公開用の値で、秘密ではない（読み書きは手順3のルールで守る）。
   - `service_role` や `Secret key` は絶対にページに書かないこと。

## 5. index.html に設定値を書き込む

リポジトリ直下の `index.html` の head にある `window.SWEETLANDS_SUPABASE` に、手順4の値を書く（引用符 ' ' は残す）。現在のリポジトリでは書き込み済みである。

## 6. GitHub Pages で公開する

1. リポジトリの「Settings」→「Pages」で、Source を「GitHub Actions」にする。
2. main ブランチに push すると、`.github/workflows/pages.yml` が自動でテストとビルドを行い、公開する。進み具合はリポジトリの「Actions」タブで見られる。
3. 公開アドレスは `https://<ユーザー名>.github.io/sweetlands/`。

## 7. 遊ぶ

1. 公開アドレスを開き、「オンライン対戦へ」→ 人数・名前・ヴァリアントを決めて「ゲームを作る」。作った人は1番目の席に座る。
2. 友達に同じアドレスを送る。友達は開いて「オンライン対戦へ」→ 空いている席の「この席に座る」。
3. 全員がそろったら、作った人が「ゲームを始める」。
4. ゲームを並行していくつも遊ぶときは、アドレスの末尾に `?g=好きな名前` を付ける（同じ名前のアドレスを開いた人どうしが同じゲームになる）。

## 知っておくこと

- 無料プランのプロジェクトは、1週間ほど使わないと一時停止する。遊ぶ前に Supabase の画面でプロジェクトを開き、停止していたら「Restore」を押して再開する。
- 席はブラウザごとに覚える。同じ人でも別のブラウザや端末で開くと別人になり、自分の席に戻れない（同じブラウザで開き直せば戻れる）。
- 山札や手札も共有データに入るため、ブラウザの開発者ツールを使えば他人の手札が見える。友達どうしの対戦を前提にしている。
- アドレスを知っている人は誰でも開いて、空いている席に座れる。
- うまくつながらないとき：トップの「オンライン対戦」の欄に理由が出る。設定値の写し間違い、匿名ログインが無効、手順3の SQL が未実行、のどれかが多い。

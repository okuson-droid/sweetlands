// 対話プレイ用のコマンドの入口（dist-play/cli.js にビルドする）。本体は commands.ts。
// 出力は書いたそばから標準出力に出す（--then-wait で待つ間も、適用した選択を先に見せるため）。
// 成功は終了コード0、失敗は1とする。失敗の文は標準出力にだけ出す（標準エラーにも出すと、打ち手の道具では2回見える）。
import { runCommand } from './commands';

runCommand(process.argv.slice(2), (text) => process.stdout.write(text)).then((r) => {
  if (r.code !== 0) process.exitCode = r.code;
});

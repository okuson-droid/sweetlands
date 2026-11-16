// 対話プレイ用のコマンドの入口（dist-play/cli.js にビルドする）。本体は commands.ts。
// 出力は書いたそばから標準出力に出す（--then-wait で待つ間も、適用した選択を先に見せるため）。
// 成功は終了コード0、失敗は1とし、失敗の1行目を標準エラーにも出す。
import { runCommand } from './commands';

runCommand(process.argv.slice(2), (text) => process.stdout.write(text)).then((r) => {
  if (r.code !== 0) {
    if (r.error) process.stderr.write(`${r.error}\n`);
    process.exitCode = r.code;
  }
});

// sim/ のスクリプトを Node.js 用の1ファイルにまとめる（sim/PLAN.md §6.2）
import { build } from 'esbuild';
const entries = process.argv.slice(2).length ? process.argv.slice(2) : ['main'];
for (const e of entries)
  await build({ entryPoints: [`src/${e}.ts`], bundle: true, platform: 'node', format: 'cjs', target: 'node20', outfile: `dist/${e}.cjs`, sourcemap: true, logLevel: 'warning' });

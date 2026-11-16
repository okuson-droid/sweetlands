// 対話プレイ用のコマンドのビルド。src/data/ の JSON を import するため、Vite で dist-play/cli.js の1ファイルにまとめる。
// node: の標準モジュールは外部のまま残す。配布用のビルド（npm run build、dist/）には含めない。
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    ssr: 'tools/play/cli.ts',
    outDir: 'dist-play',
    target: 'node20',
    emptyOutDir: true,
    rollupOptions: { output: { entryFileNames: 'cli.js' } },
  },
  ssr: { noExternal: true },
});

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// アーティファクトとして公開するため、JS・CSS をすべて1枚の HTML に埋め込む（decisions §3）
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  build: { outDir: 'dist', assetsInlineLimit: 100000000, cssCodeSplit: false },
  test: { include: ['tests/**/*.test.ts'] },
});

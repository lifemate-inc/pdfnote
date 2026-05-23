import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Smart PDF PoC: Vite 設定
export default defineConfig({
  plugins: [react()],
  worker: {
    format: 'es',
  },
  server: {
    port: 5173,
    open: true,
  },
  optimizeDeps: {
    // pdfjs-dist は事前バンドルしておく
    include: ['pdfjs-dist', 'pdf-lib'],
  },
});

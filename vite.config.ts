import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/pdfnote/',
  worker: { format: 'es' },
  server: {
    port: 5173,
    open: true,
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',  // 新版検出時にユーザーに更新確認
      injectRegister: 'auto',
      manifest: {
        name: 'PDFノート',
        short_name: 'PDFノート',
        description: 'PDFの閲覧・分割・回転・テキスト追記をローカル完結で行う軽量ツール',
        lang: 'ja',
        start_url: '/pdfnote/',
        scope: '/pdfnote/',
        display: 'standalone',
        theme_color: '#2563eb',
        background_color: '#ffffff',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        // OCR エンジン・学習データは巨大なのでデフォルトの 2MB 上限を 30MB に拡大
        maximumFileSizeToCacheInBytes: 30 * 1024 * 1024,
        // 静的アセット全部をプリキャッシュ
        globPatterns: ['**/*.{js,css,html,svg,png,wasm,traineddata,mjs,webmanifest}'],
        // OCR 関連ファイルもキャッシュ対象に
        globIgnores: ['**/node_modules/**'],
        // ナビゲーション fallback（SPA 用）
        navigateFallback: '/pdfnote/index.html',
        navigateFallbackDenylist: [/^\/_/, /\/api\//],
      },
      devOptions: {
        enabled: false,  // 開発時は SW を無効化（ホットリロード優先）
      },
    }),
  ],
  build: {
    target: 'esnext',
    rollupOptions: {
      output: {
        manualChunks: {
          pdfjs: ['pdfjs-dist'],
          'pdf-lib': ['pdf-lib'],
          vendor: ['react', 'react-dom', 'zustand'],
        },
      },
    },
  },
  optimizeDeps: {
    include: ['pdfjs-dist', 'pdf-lib'],
  },
})

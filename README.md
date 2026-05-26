# PDFノート — 軽量PDF編集ツール

事業所での書類業務を効率化する、ブラウザ完結型 PDF 編集ツールです。

100ページ超の大量 PDF を「人ごとに分割」「向き修正」「リネーム」「メモ追記」する作業を、**無料で・安全に・誰でも**行えるようにします。

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## ✨ 機能

- 🔒 **完全ローカル動作** — PDFはご利用パソコン内で処理。インターネットを通りません
- 🪶 **無料・インストール不要** — ブラウザでURLを開くだけ
- 📑 **大量 PDF に強い** — 100ページ超のPDFを快適に分割・整理
- ✂️ **一括分割** — 分割点を設定して複数PDFを一気に生成、フォルダに一括保存
- 🔄 **ページ回転** — サムネイル右上ボタンで1クリック修正
- ✏️ **テキスト追記** — PDF上にメモを書き込み・移動・編集・削除
- 📝 **インラインリネーム** — 鉛筆アイコンでファイル名を即編集
- 🔍 **氏名候補の自動抽出** — PDFテキストから候補を提案（OCR対応）
- ↩️ **アンドゥ/リドゥ** — Ctrl+Z / Ctrl+Y でいつでも取り消し
- 💾 **自動保存（IndexedDB）** — 作業中状態を自動保存、ブラウザを閉じても復元可能
- 📱 **PWA対応** — オフライン動作 + 自動更新通知
- 🖥 **Windows / Mac 両対応** — Chrome / Edge があれば動きます

---

## 🎯 想定ユーザー

| 業界 | 想定ユースケース |
|------|---------------|
| 介護事業所 | 100ページの利用者書類を人ごとに分割・リネーム |
| 医療機関 | 患者ごとの書類仕分け |
| 士業（社労士・税理士等） | 顧客ごとの書類整理 |
| 教育機関 | 受講者ごとの提出書類整理 |
| 自治体 | 申請書類の仕分け・処理 |
| 中小企業 | 請求書・契約書のページ整理 |

ITに不慣れな方でも使えるよう、シンプルなUI設計を心がけています。

---

## 📐 動作環境

| 項目 | 内容 |
|------|------|
| OS | Windows 10 / 11、macOS（最新） |
| ブラウザ | **Google Chrome / Microsoft Edge（最新版）推奨** |
| メモリ | 4GB以上推奨（大容量PDF処理時は8GB以上推奨） |
| インストール | **不要**（URLアクセスのみ） |

> Safari / Firefox は部分対応です。フォルダ一括保存（File System Access API）は Chrome / Edge のみ対応のため、これらのブラウザを推奨します。

---

## 🔒 セキュリティ設計

PDFの内容は**インターネットに送信されません**。CSPで外部通信を物理的に遮断しています。

```
┌─ ご利用パソコン（ローカル完結） ─────────────────────────┐
│   ブラウザ                                                │
│     ├ pdf.js (描画)                                       │
│     ├ pdf-lib (編集・出力)                                │
│     ├ Tesseract.js (OCR・初回のみダウンロード)           │
│     ├ IndexedDB (作業状態を自動保存)                      │
│     └ Service Worker (オフライン動作 + 自動更新)          │
└───────────────────────────────────────────────────────────┘
            ↑ HTTPS（PDFデータは一切通りません）
┌─ GitHub Pages（静的HTML/JS/CSS/WASM配信のみ） ──────────┐
│   index.html / *.js / *.wasm / jpn.traineddata            │
└───────────────────────────────────────────────────────────┘
```

### 保護機構

- **CSP (Content-Security-Policy):** `connect-src 'self'` で外部通信を遮断
- **同一オリジン配信:** OCRエンジン・学習データもGitHub Pagesから配信、外部CDNを使わない
- **オフライン動作:** Service Workerで初回ロード後はネット不要

---

## 🏗 プロジェクト構成

```
pdfnote/
├── docs/                       設計ドキュメント
│   ├── requirements.md         要件定義書
│   ├── design-system.md        UIデザインガイドライン
│   ├── screen-flow.md          画面遷移
│   └── phase1-implementation-plan.md
├── public/                     静的ファイル
│   ├── tesseract/              OCRエンジン+学習データ
│   ├── pwa-192x192.png         PWAアイコン
│   └── pwa-512x512.png
├── src/
│   ├── pages/                  画面コンポーネント
│   ├── components/             共通コンポーネント
│   ├── stores/                 Zustand ストア
│   └── lib/                    PDF操作・OCR・永続化ロジック
├── .github/workflows/          GitHub Actions（自動デプロイ）
└── index.html
```

---

## 🛠 ローカル開発

```bash
git clone https://github.com/lifemate-inc/pdfnote.git
cd pdfnote
npm ci
npm run dev          # 開発サーバー起動 (http://localhost:5173)
npm run build        # 本番ビルド
npm run preview      # 本番ビルドのプレビュー
```

---

## 🚫 スコープ外（やらないこと）

シンプルさを保つため、以下は実装しません:

- PDF内既存テキストの編集（テキスト追記のみ対応）
- 電子署名（→ 姉妹プロジェクト [hpki-signer](https://github.com/lifemate-inc/hpki-signer) をご利用ください）
- 複数PDFの結合
- フォーム入力
- パスワード保護PDFの解除
- クラウド同期
- スマートフォン対応

---

## 📜 ライセンス

[MIT License](LICENSE)

商用・非商用を問わず自由にご利用・改変・再配布可能ですが、**動作・適合性・安全性は保証されません**。

---

## 🤝 フィードバック・貢献

- バグ報告・機能要望: [GitHub Issues](https://github.com/lifemate-inc/pdfnote/issues)
- プルリクエスト歓迎

---

## 🔗 関連プロジェクト

- [hpki-signer](https://github.com/lifemate-inc/hpki-signer) — 医療・介護向けPDF電子署名ツール（姉妹プロジェクト）

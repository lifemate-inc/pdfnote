# PDFノート — Phase 1 実装計画書

**作成日:** 2026-05-23  
**ステータス:** Phase 0 完了・Phase 1 着手前（承認待ち）  
**前提:** Phase 0 PoC で全項目クリア確認済み（144ページ・7.31MB PDF が 7.64秒・23MB メモリ・分割 67ms）

---

## Phase 1 の目標

**ブラウザ完結の PWA として、介護事業所が即日使えるMVPを 3〜4 週間でリリースする。**

Phase 0 で技術的実現性が確認されたため、Phase 1 では「動くもの」を作り、パイロット事業所に届けることに集中する。

---

## 実装する機能（MVP スコープ）

| ID | 機能 | 優先度 | 実装週 |
|----|------|--------|--------|
| F-1 | PDF 読み込み（ドラッグ&ドロップ + ファイル選択） | 最高 | Week 1 |
| F-2 | サムネイル一覧表示（サイズ 6段階） | 最高 | Week 1 |
| F-3 | ページ複数選択（クリック・Shift・Ctrl） | 最高 | Week 1 |
| F-4 | 選択ページの抽出・分割（リネーム付き） | 最高 | Week 2 |
| F-5 | ページ回転（90度・サムネイルに即反映） | 高 | Week 2 |
| F-6 | 文字スタンプ追加（任意位置・フォント/色変更） | 高 | Week 3 |
| F-7 | 出力保存（File System Access API / フォールバックDL） | 最高 | Week 2 |
| F-8 | 作業状態の自動保存・復元（IndexedDB） | 中 | Week 3 |
| F-9 | WebWorker によるサムネイル非同期生成 | 高 | Week 2 |
| F-10 | 重いPDF 警告 + 事前分割モード | 中 | Week 3 |
| F-11 | PWA 化（Service Worker・オフライン動作） | 高 | Week 4 |
| F-12 | GitHub Pages デプロイ・自動 CI/CD | 最高 | Week 4 |

---

## 実装順序と週次計画

### Week 1（基盤構築）: PDF 表示・一覧

**目標:** PDF を開いてサムネイル一覧が表示できる状態にする

#### 1-1. プロジェクト初期化
- PoC の `poc/` ディレクトリを土台に `src/` を構築
- Tailwind CSS を PostCSS プラグインとして導入（CDN からポストビルドへ移行）
- フォルダ構成を整備

```
src/
├── components/
│   ├── DropZone.tsx          # ファイル受け取り
│   ├── ThumbnailGrid.tsx     # サムネイル一覧
│   ├── ThumbnailCard.tsx     # 1枚のサムネイル
│   ├── Toolbar.tsx           # 上部ツールバー
│   ├── StatusBar.tsx         # 下部ステータス
│   └── LocalBadge.tsx        # 「ローカル動作中」バッジ
├── workers/
│   └── thumbnail.worker.ts   # サムネイル生成 WebWorker
├── stores/
│   └── usePdfStore.ts        # Zustand グローバル状態
├── lib/
│   ├── pdfLoader.ts          # pdf.js ラッパー
│   ├── pdfEditor.ts          # pdf-lib ラッパー（分割・回転・スタンプ）
│   ├── storage.ts            # IndexedDB ラッパー
│   └── fsAccess.ts           # File System Access API ラッパー
├── hooks/
│   ├── useThumbnailWorker.ts # WebWorker との通信フック
│   └── useAutoSave.ts        # IndexedDB 自動保存フック
├── pages/
│   ├── HomePage.tsx          # ドロップゾーン画面
│   ├── ListPage.tsx          # サムネイル一覧画面
│   └── PreviewPage.tsx       # プレビュー・スタンプ画面
├── App.tsx
└── main.tsx
```

#### 1-2. グローバル状態設計（Zustand）

```typescript
interface PdfStore {
  // PDF データ
  fileName: string;
  pageCount: number;
  thumbnails: string[];          // Data URL 配列（インデックス = ページ番号 - 1）
  rotations: number[];           // 各ページの回転角（0/90/180/270）
  stamps: StampData[][];         // 各ページのスタンプ配列
  
  // UI 状態
  selectedPages: Set<number>;    // 選択中ページ番号（1-based）
  thumbnailSize: ThumbnailSize;  // 極小/小/中/大/特大/巨大
  loadProgress: number;          // 0〜100
  
  // 生データ（分割・スタンプ処理に使用）
  pdfArrayBuffer: ArrayBuffer | null;
  
  // アクション
  loadPdf: (file: File) => Promise<void>;
  togglePageSelection: (pageNum: number) => void;
  selectRange: (from: number, to: number) => void;
  rotatePage: (pageNum: number) => void;
  addStamp: (pageNum: number, stamp: StampData) => void;
  setThumbnailSize: (size: ThumbnailSize) => void;
  reset: () => void;
}
```

#### 1-3. DropZone コンポーネント
- ドラッグ&ドロップ + ファイル選択ボタン
- `accept="application/pdf"` のバリデーション
- 大容量PDF（100MB 超）の場合は警告モーダル表示

#### 1-4. ThumbnailGrid・ThumbnailCard
- CSS Grid（`auto-fill`・`minmax()`）でサイズ可変
- Container Queries でサムネイル内テキストが比例拡大
- 選択状態: チェックマーク + 青枠
- Shift クリック: 範囲選択
- Ctrl/Cmd クリック: 個別トグル

---

### Week 2（コア機能）: 分割・回転・保存

**目標:** 抽出・回転・保存が実際に動作する状態にする

#### 2-1. WebWorker によるサムネイル生成（F-9）

```typescript
// workers/thumbnail.worker.ts
import * as pdfjsLib from 'pdfjs-dist';

self.onmessage = async (e: MessageEvent<{ pdfData: ArrayBuffer; pageNums: number[] }>) => {
  const { pdfData, pageNums } = e.data;
  const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;
  
  for (const pageNum of pageNums) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 0.3 });
    const canvas = new OffscreenCanvas(viewport.width, viewport.height);
    const ctx = canvas.getContext('2d')!;
    await page.render({ canvasContext: ctx, viewport }).promise;
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.75 });
    self.postMessage({ pageNum, blob }, [blob]);   // Transferable で高速転送
    page.cleanup();
  }
};
```

#### 2-2. 抽出ダイアログ（F-4）

**実装仕様:**
- モーダル: `max-w-6xl`、左右分割レイアウト
- 左カラム（60%）: 選択ページのプレビュー（pdf.js でレンダリング、縦スクロール）
- 右カラム（40%）: ファイル名入力 + 候補ボタン + 保存先指定
- ファイル名候補ボタン: PDF 内のキーワード抽出（1ページ目のテキストレイヤーから自動取得、上位 5語）
- Enterキー or 「保存」ボタンで実行
- Escキーでキャンセル

**ファイル名候補の自動抽出ロジック:**
```typescript
// 1ページ目のテキストを取得し、氏名候補を抽出
const extractNameCandidates = async (pdf: PDFDocumentProxy, pageNum: number): Promise<string[]> => {
  const page = await pdf.getPage(pageNum);
  const textContent = await page.getTextContent();
  const text = textContent.items.map((item: any) => item.str).join('');
  // 漢字2〜4文字の連続（氏名の可能性が高い）を抽出
  const namePattern = /[一-鿿]{2,4}/g;
  const candidates = [...new Set(text.match(namePattern) ?? [])];
  return candidates.slice(0, 5);
};
```

#### 2-3. ページ回転（F-5）

- `rotations` 配列を更新（0 → 90 → 180 → 270 → 0）
- サムネイル画像を CSS `transform: rotate()` で表示（再生成しない）
- 出力時は pdf-lib の `page.setRotation(degrees(n))` を適用

#### 2-4. File System Access API 保存（F-7）

```typescript
// lib/fsAccess.ts
export const saveFile = async (bytes: Uint8Array, suggestedName: string): Promise<void> => {
  if ('showSaveFilePicker' in window) {
    const handle = await (window as any).showSaveFilePicker({
      suggestedName,
      types: [{ description: 'PDF', accept: { 'application/pdf': ['.pdf'] } }],
    });
    const writable = await handle.createWritable();
    await writable.write(bytes);
    await writable.close();
  } else {
    // Safari / Firefox フォールバック
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = suggestedName;
    a.click();
    URL.revokeObjectURL(url);
  }
};
```

---

### Week 3（付加機能）: スタンプ・自動保存・軽量化モード

**目標:** スタンプ追加と作業継続性（自動保存）を実装する

#### 3-1. スタンプ機能（F-6）

**プレビュー画面の実装:**
- `canvas` 要素 + pdf.js レンダリング（scale: 1.5 程度）
- スタンプオーバーレイ: `position: absolute` の div 要素
- クリック位置 → スタンプ追加モーダル（テキスト・フォントサイズ・色・太さ）
- ドラッグで位置調整（`mousedown` → `mousemove` → `mouseup`）
- スタンプデータ構造:

```typescript
interface StampData {
  id: string;
  pageNum: number;
  x: number;      // PDF座標系（左下原点）
  y: number;
  text: string;
  fontSize: number;
  color: string;  // "#000000"
  bold: boolean;
}
```

**pdf-lib での焼き込み:**
```typescript
const applyStamps = async (pdfDoc: PDFDocument, stamps: StampData[][]) => {
  const pages = pdfDoc.getPages();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const { height } = page.getSize();
    for (const stamp of stamps[i] ?? []) {
      page.drawText(stamp.text, {
        x: stamp.x,
        y: height - stamp.y,  // PDF座標系変換（pdf.js は左上原点）
        size: stamp.fontSize,
        font,
        color: hexToRgb(stamp.color),
      });
    }
  }
};
```

> **注意:** 日本語スタンプは StandardFonts では文字化けする。
> カスタムフォント（Noto Sans JP など）の `embedFont()` が必要。
> → 実装時に woff2 → otf 変換を行い、pdf-lib に埋め込む。
> フォントファイルのライセンス確認必須（Noto は OFL → 埋め込み可）。

#### 3-2. IndexedDB 自動保存（F-8）

保存するデータ（PDFバイナリは保存しない・容量大のため）:
```typescript
interface SavedSession {
  id: string;              // UUID
  savedAt: number;         // timestamp
  fileName: string;
  pageCount: number;
  thumbnails: string[];    // Data URL 配列（大きいが必要）
  rotations: number[];
  stamps: StampData[][];
  selectedPages: number[];
  thumbnailSize: ThumbnailSize;
  // pdfArrayBuffer は保存しない（ユーザーに再読み込みを促す）
}
```

> **設計判断:** PDFバイナリの IndexedDB 保存は 100MB 超のケースでブラウザが拒否する場合がある。
> セッション再開時に「同じ PDF ファイルを再度ドロップしてください」のプロンプトを表示し、
> スタンプ・回転・選択状態のみ復元する方式とする。

#### 3-3. 事前分割（軽量化）モード（F-10）

**発動条件:** PDF 読み込み時に 50MB 超 or 200ページ超を検出した場合に警告モーダルを表示

**機能:**
- 「N ページごとに分割して保存フォルダに出力する」（デフォルト 50 ページ）
- 出力: `元ファイル名_001-050.pdf`, `元ファイル名_051-100.pdf` ... と連番
- 保存先: File System Access API で「フォルダ」選択（`showDirectoryPicker()`）
- 処理はメインスレッド（pdf-lib）+ 進捗バー表示

---

### Week 4（完成・デプロイ）: PWA 化と GitHub Pages 公開

**目標:** GitHub Pages に公開し、パイロット事業所の URL を伝えられる状態にする

#### 4-1. PWA 化（F-11）

**`vite-plugin-pwa` の導入:**
```typescript
// vite.config.ts
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',           // 更新時にユーザーに確認
      includeAssets: ['favicon.ico'],
      manifest: {
        name: 'PDFノート',
        short_name: 'PDFノート',
        description: 'ローカル完結の軽量PDFツール',
        theme_color: '#2563eb',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2}'],
        // PDFデータはキャッシュしない
        runtimeCaching: [],
      },
    }),
  ],
});
```

**更新通知 UI:**
- 起動時に Service Worker が新バージョンを検知 → トースト通知
- 「今すぐ更新」ボタンで即時適用
- ITリテラシー低いユーザー向けに「新しい版が使えます」という日本語で表示

#### 4-2. GitHub リポジトリ・CI/CD（F-12）

**リポジトリ:**
- `lifemate-inc/pdfnote`（Phase 3 公開前は private にしておくか、ユーザーの判断）
- `main` ブランチ: 本番（GitHub Pages）
- `develop` ブランチ: ステージング（パイロット事業所の先行確認用）

**GitHub Actions ワークフロー:**
```yaml
# .github/workflows/deploy.yml
name: Deploy to GitHub Pages
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run build
      - uses: peaceiris/actions-gh-pages@v4
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./dist
```

**package.json ビルド設定:**
```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "lint": "eslint src --ext ts,tsx",
    "test": "vitest"
  }
}
```

**vite.config.ts の base 設定（GitHub Pages サブパス対応）:**
```typescript
base: '/pdfnote/',   // リポジトリ名に合わせる
```

#### 4-3. セキュリティ設定

**CSP ヘッダー（GitHub Pages は `_headers` ファイル未対応のため `<meta>` タグで設定）:**
```html
<meta http-equiv="Content-Security-Policy" content="
  default-src 'self';
  script-src 'self' 'wasm-unsafe-eval';
  worker-src 'self' blob:;
  style-src 'self' 'unsafe-inline';
  img-src 'self' blob: data:;
  connect-src 'none';
  frame-src 'none';
  object-src 'none';
">
```

> `'wasm-unsafe-eval'`: pdf.js が WebAssembly を使うため必要  
> `connect-src 'none'`: PDFデータがサーバーに送れないことを技術的に保証

#### 4-4. デザイン・アクセシビリティ仕上げ

- [ ] フォントサイズ最小 16px 確認
- [ ] WCAG 2.1 AA コントラスト比確認（Chrome DevTools の Lighthouse で計測）
- [ ] キーボード操作（Tab・Enter・Esc・矢印キー）の動作確認
- [ ] ローカル動作中バッジが常に表示されることを確認
- [ ] 全ボタンにアイコン + テキストラベルが併記されていることを確認

---

## コンポーネント設計詳細

### 画面遷移

```
HomePage（ドロップゾーン）
    ↓ PDF 読み込み
ListPage（サムネイル一覧）
    ├─ ツールバー: 抽出ボタン・回転ボタン・全選択・クリア
    ├─ ThumbnailGrid（サイズ可変）
    └─ 「プレビュー」クリック
         ↓
    PreviewPage（1ページ表示 + スタンプ追加）
         ↓ ListPage に戻る

モーダル（ListPage 上に重ねる）:
    ├─ ExtractModal（分割・抽出確認）
    ├─ HeavyPdfModal（大容量警告）
    ├─ BulkSplitModal（事前分割設定）
    └─ GuideModal（初回ガイド）
```

### 状態管理（Zustand）

- `usePdfStore`: PDF 全体の状態（上記設計参照）
- `useUiStore`: モーダル表示・現在画面など UI のみの状態（PDF データと分離）
- `useSessionStore`: IndexedDB の保存・復元（`useAutoSave` フックから使用）

---

## テスト計画

### 単体テスト（Vitest）

| テスト対象 | 内容 |
|-----------|------|
| `pdfEditor.ts` | 分割・回転・スタンプ付き出力が仕様通り動くか |
| `fsAccess.ts` | API 非対応環境でフォールバックが走るか |
| `storage.ts` | IndexedDB への保存・取得・削除が正常動作するか |
| `usePdfStore` | 選択・回転・スタンプ追加のアクションが状態を正しく更新するか |

### E2E テスト（Playwright、Week 4 で追加）

- [ ] PDF ドロップ → サムネイル一覧表示の一連フロー
- [ ] ページ選択 → 抽出 → ダウンロード確認
- [ ] スタンプ追加 → 出力 PDF に反映されているか

### クロスブラウザ動作確認（手動）

| 環境 | 確認事項 |
|------|---------|
| Windows 10/11 + Chrome | 全機能（File System Access API 含む）|
| Windows 10/11 + Edge | 全機能（File System Access API 含む）|
| macOS + Chrome | 全機能（File System Access API 含む）|
| macOS + Safari | ダウンロード方式フォールバック動作確認 |
| Windows + Firefox | ダウンロード方式フォールバック動作確認 |

### パフォーマンス確認

PoC と同じ PDF（一括印刷20260523.pdf・144ページ・7.31MB）を使って:
- WebWorker 導入後のサムネイル生成時間（目標: PoC 7.3秒から 50%以上改善）
- メインスレッドのブロッキング時間（Lighthouse > Performance で計測）

---

## 依存ライブラリ（Phase 1 完全版）

```json
{
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "pdfjs-dist": "^4.7.76",
    "pdf-lib": "^1.17.1",
    "zustand": "^5.0.0",
    "@fontsource/noto-sans-jp": "^5.0.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.3",
    "vite-plugin-pwa": "^0.20.0",
    "typescript": "^5.6.3",
    "vite": "^5.4.10",
    "tailwindcss": "^3.4.0",
    "postcss": "^8.4.0",
    "autoprefixer": "^10.4.0",
    "eslint": "^9.0.0",
    "vitest": "^2.0.0",
    "@playwright/test": "^1.48.0"
  }
}
```

---

## スケジュール（暫定）

| 期間 | マイルストーン | 成果物 |
|------|--------------|--------|
| Week 1（3日） | PDF 読み込み・一覧表示 | サムネイル一覧が動く |
| Week 2（5日） | 抽出・回転・保存 | 実際に PDF を分割して保存できる |
| Week 3（5日） | スタンプ・自動保存 | スタンプを追記した PDF を出力できる |
| Week 4（4日） | PWA・デプロイ・テスト | GitHub Pages で公開 URL 取得 |
| バッファ（3日） | バグ修正・フィードバック反映 | パイロット事業所に届ける |

**合計目標: 3.5〜4週間**

---

## Phase 1 完了の定義（DoD）

以下がすべて完了した時点で Phase 1 完了とする。

- [ ] 144ページPDF（7.31MB）を読み込んでサムネイル一覧が 10秒以内に表示される
- [ ] 任意のページ範囲を選択して PDF として保存できる
- [ ] 保存時にファイル名を指定でき、PDF の内容を見ながら入力できる
- [ ] ページを 1クリックで回転させて、回転済みで保存できる
- [ ] 任意の位置に日本語テキストを追記して、PDF に焼き込める
- [ ] ブラウザを閉じて再度開いても、前回の作業状態（スタンプ・回転）が復元できる
- [ ] Chrome / Edge で File System Access API が動作する
- [ ] Safari / Firefox でダウンロード方式のフォールバックが動作する
- [ ] GitHub Pages の URL でアクセスでき、Service Worker によりオフラインでも動作する
- [ ] パイロット事業所の担当者が初見でおおむね操作できるレベルの UI になっている
- [ ] Lighthouse Performance スコアが 80 以上

---

## Phase 2 に向けての申し送り事項

Phase 1 完了後に収集するパイロットフィードバックで特に注目すること:

1. **リネーム操作の分かりやすさ** — ファイル名候補の自動抽出が役に立っているか
2. **サムネイルのデフォルトサイズ** — 「大」が適切か、より大きいほうが良いか
3. **スタンプの使い勝手** — どんなテキストを入力しているか（「確認済」「要対応」等）
4. **大容量PDF 警告の発動頻度** — 50MB/200ページの閾値が適切か
5. **保存先の指定方法** — フォルダ指定 or ファイルごと指定、どちらが多いか

---

**最終更新:** 2026-05-23

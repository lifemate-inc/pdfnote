import { useState, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument } from 'pdf-lib';

// pdf.js worker の設定（Vite が自動的にバンドル）
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();

interface Metrics {
  fileName?: string;
  fileSize?: number;
  pageCount?: number;
  loadTime?: number;
  thumbnailTime?: number;
  splitTime?: number;
  memoryUsed?: number;
  memoryPeak?: number;
  userAgent?: string;
}

export default function App() {
  const [metrics, setMetrics] = useState<Metrics>({});
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [status, setStatus] = useState<string>('PDF を選んでください');
  const [progress, setProgress] = useState(0);
  const fileRef = useRef<File | null>(null);
  const pdfDataRef = useRef<ArrayBuffer | null>(null);

  /**
   * メモリ使用量を取得（Chrome のみ。他ブラウザでは undefined）
   */
  const getMemory = (): number | undefined => {
    // @ts-expect-error: Chrome 独自の Performance.memory
    return performance.memory?.usedJSHeapSize;
  };

  /**
   * メイン処理: PDF読み込み → サムネイル生成
   */
  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    fileRef.current = file;

    setStatus('読み込み中...');
    setThumbnails([]);
    setProgress(0);

    const m: Metrics = {
      fileName: file.name,
      fileSize: file.size,
      userAgent: navigator.userAgent,
    };

    try {
      // === 1. PDF 読み込み時間計測 ===
      const loadStart = performance.now();
      const arrayBuffer = await file.arrayBuffer();
      pdfDataRef.current = arrayBuffer.slice(0); // 後で分割で使うので複製保持
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      m.loadTime = performance.now() - loadStart;
      m.pageCount = pdf.numPages;
      setMetrics({ ...m });
      setStatus(`PDF読み込み完了: ${m.pageCount} ページ`);

      // === 2. サムネイル生成（メインスレッド版） ===
      setStatus('サムネイル生成中...');
      const thumbStart = performance.now();
      const newThumbs: string[] = [];
      let peakMem = getMemory() ?? 0;

      for (let i = 1; i <= m.pageCount; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 0.25 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) continue;
        // pdf.js v4 の render API
        await page.render({
          canvasContext: ctx,
          viewport,
          // @ts-expect-error pdf.js v4の型定義不完全
          canvas,
        }).promise;
        newThumbs.push(canvas.toDataURL('image/jpeg', 0.7));
        page.cleanup();

        // 10ページごとに途中結果と進捗を表示
        if (i % 10 === 0 || i === m.pageCount) {
          setThumbnails([...newThumbs]);
          setProgress(Math.round((i / m.pageCount!) * 100));
          const mem = getMemory();
          if (mem && mem > peakMem) peakMem = mem;
          await new Promise((r) => setTimeout(r, 0)); // UI 更新を許可
        }
      }
      m.thumbnailTime = performance.now() - thumbStart;
      m.memoryPeak = peakMem;
      m.memoryUsed = getMemory();
      setMetrics({ ...m });
      setStatus(`完了！ 全 ${m.pageCount} ページのサムネイル生成完了`);
    } catch (err) {
      console.error(err);
      setStatus(`エラー: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  /**
   * 分割テスト: 先頭 5 ページを抽出する処理時間を計測
   */
  const handleSplitTest = async () => {
    if (!pdfDataRef.current) {
      alert('まず PDF を読み込んでください');
      return;
    }
    setStatus('分割テスト実行中（先頭5ページを抽出）...');
    const splitStart = performance.now();
    try {
      const srcDoc = await PDFDocument.load(pdfDataRef.current);
      const newDoc = await PDFDocument.create();
      const pageCount = Math.min(5, srcDoc.getPageCount());
      const pageIndices = Array.from({ length: pageCount }, (_, i) => i);
      const copied = await newDoc.copyPages(srcDoc, pageIndices);
      copied.forEach((p) => newDoc.addPage(p));
      const pdfBytes = await newDoc.save();
      const splitTime = performance.now() - splitStart;
      setMetrics((prev) => ({ ...prev, splitTime }));
      setStatus(
        `分割テスト完了: ${pageCount}ページを抽出 (${splitTime.toFixed(0)} ms, ${(
          pdfBytes.byteLength /
          1024 /
          1024
        ).toFixed(2)} MB)`
      );

      // 自動ダウンロード（File System Access API はオプション、まずは blob download）
      const blob = new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${fileRef.current?.name.replace(/\.pdf$/i, '')}_first5.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      setStatus(`分割エラー: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  /**
   * File System Access API テスト
   */
  const handleFsApiTest = async () => {
    const supported = 'showSaveFilePicker' in window;
    if (!supported) {
      alert('このブラウザは File System Access API 非対応です（Safari / Firefox など）。ダウンロード方式で動作します。');
      return;
    }
    try {
      // @ts-expect-error: TypeScript の lib にはまだ含まれていない場合がある
      const handle = await window.showSaveFilePicker({
        suggestedName: 'test.pdf',
        types: [{ description: 'PDF', accept: { 'application/pdf': ['.pdf'] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(new Blob(['Hello'], { type: 'application/pdf' }));
      await writable.close();
      alert('File System Access API は使えます ✅');
    } catch (err) {
      console.error(err);
      alert(`File System Access API エラー: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // === レンダリング ===
  return (
    <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }}>
      <h1 style={{ borderBottom: '2px solid #2563eb', paddingBottom: '8px' }}>
        Smart PDF — Phase 0 技術検証 PoC
      </h1>
      <p style={{ color: '#6b7280' }}>
        120ページPDFがブラウザで実用速度で扱えるかを実証します。判定基準: 30秒以内に一覧表示・メモリ 2GB 以下。
      </p>

      {/* ファイル選択 */}
      <div
        style={{
          padding: '24px',
          border: '2px dashed #93c5fd',
          borderRadius: '12px',
          background: '#eff6ff',
          marginBottom: '20px',
        }}
      >
        <label style={{ fontWeight: 'bold', marginRight: '12px' }}>📥 PDF を選ぶ:</label>
        <input type="file" accept="application/pdf" onChange={handleFile} />
        <p style={{ marginTop: '12px', color: '#1e40af', fontSize: '14px' }}>状態: {status}</p>
        {progress > 0 && progress < 100 && (
          <div style={{ marginTop: '8px', background: '#dbeafe', borderRadius: '6px', height: '8px', overflow: 'hidden' }}>
            <div style={{ background: '#2563eb', height: '100%', width: `${progress}%`, transition: 'width 0.2s' }} />
          </div>
        )}
      </div>

      {/* 追加テスト操作 */}
      <div style={{ marginBottom: '20px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        <button
          onClick={handleSplitTest}
          style={{ padding: '10px 20px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
        >
          ✂️ 分割テスト（先頭5ページ抽出）
        </button>
        <button
          onClick={handleFsApiTest}
          style={{ padding: '10px 20px', background: '#0891b2', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
        >
          💾 File System Access API テスト
        </button>
      </div>

      {/* 計測結果 */}
      {metrics.pageCount && (
        <div
          style={{
            padding: '20px',
            background: 'white',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            marginBottom: '20px',
          }}
        >
          <h2 style={{ marginTop: 0 }}>📊 計測結果</h2>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <tbody>
              <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                <td style={{ padding: '8px', fontWeight: 'bold' }}>ファイル名</td>
                <td style={{ padding: '8px' }}>{metrics.fileName}</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                <td style={{ padding: '8px', fontWeight: 'bold' }}>ファイルサイズ</td>
                <td style={{ padding: '8px' }}>{(metrics.fileSize! / 1024 / 1024).toFixed(2)} MB</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                <td style={{ padding: '8px', fontWeight: 'bold' }}>ページ数</td>
                <td style={{ padding: '8px' }}>{metrics.pageCount}</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                <td style={{ padding: '8px', fontWeight: 'bold' }}>PDF読み込み時間</td>
                <td style={{ padding: '8px' }}>
                  {metrics.loadTime?.toFixed(0)} ms（{(metrics.loadTime! / 1000).toFixed(2)} 秒）
                </td>
              </tr>
              {metrics.thumbnailTime !== undefined && (
                <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <td style={{ padding: '8px', fontWeight: 'bold' }}>全サムネイル生成時間</td>
                  <td style={{ padding: '8px' }}>
                    {metrics.thumbnailTime.toFixed(0)} ms（{(metrics.thumbnailTime / 1000).toFixed(2)} 秒）
                  </td>
                </tr>
              )}
              {metrics.splitTime !== undefined && (
                <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <td style={{ padding: '8px', fontWeight: 'bold' }}>分割処理時間（5ページ）</td>
                  <td style={{ padding: '8px' }}>
                    {metrics.splitTime.toFixed(0)} ms（{(metrics.splitTime / 1000).toFixed(2)} 秒）
                  </td>
                </tr>
              )}
              {metrics.memoryPeak !== undefined && (
                <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <td style={{ padding: '8px', fontWeight: 'bold' }}>メモリ使用量（ピーク）</td>
                  <td style={{ padding: '8px' }}>{(metrics.memoryPeak / 1024 / 1024).toFixed(0)} MB</td>
                </tr>
              )}
              <tr>
                <td style={{ padding: '8px', fontWeight: 'bold' }}>ブラウザ</td>
                <td style={{ padding: '8px', fontSize: '12px' }}>{metrics.userAgent}</td>
              </tr>
            </tbody>
          </table>

          {/* 判定 */}
          <h3>判定（要件達成チェック）</h3>
          <ul>
            <li>
              {(metrics.loadTime ?? 0) + (metrics.thumbnailTime ?? 0) < 30000 ? '✅' : '❌'}{' '}
              読み込み + サムネイル生成: 30 秒以内（実測:{' '}
              {(((metrics.loadTime ?? 0) + (metrics.thumbnailTime ?? 0)) / 1000).toFixed(2)} 秒）
            </li>
            <li>
              {metrics.memoryPeak && metrics.memoryPeak < 2 * 1024 * 1024 * 1024 ? '✅' : '❓'} メモリ使用量: 2 GB 以内
              {!metrics.memoryPeak && '（Chrome 以外は計測不可）'}
            </li>
            <li>
              {(metrics.splitTime ?? 0) < 5000 || metrics.splitTime === undefined ? '✅' : '❌'} 分割: 5ページ あたり 5 秒以内
              {metrics.splitTime === undefined && '（未計測）'}
            </li>
          </ul>
        </div>
      )}

      {/* サムネイル一覧 */}
      {thumbnails.length > 0 && (
        <div>
          <h2>サムネイル一覧（{thumbnails.length} / {metrics.pageCount} ページ）</h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
              gap: '10px',
            }}
          >
            {thumbnails.map((src, idx) => (
              <div key={idx} style={{ background: 'white', padding: '6px', borderRadius: '6px', border: '1px solid #e5e7eb' }}>
                <img src={src} alt={`Page ${idx + 1}`} style={{ width: '100%', height: 'auto', display: 'block' }} />
                <div style={{ textAlign: 'center', fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                  {idx + 1} ページ目
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

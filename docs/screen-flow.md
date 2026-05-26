# PDFノート 画面遷移図

**バージョン:** 0.1（Phase 0 ドラフト）
**最終更新:** 2026-05-23

---

## 1. 全体画面フロー

```mermaid
flowchart TD
    Start([起動]) --> CheckBrowser{ブラウザ<br/>互換性確認}
    CheckBrowser -- 非対応 --> WarnBrowser[ブラウザ警告画面]
    WarnBrowser --> Home
    CheckBrowser -- 対応 --> CheckResume{前回作業<br/>復元?}
    CheckResume -- あり --> ResumeDialog[復元ダイアログ]
    CheckResume -- なし --> Home
    ResumeDialog --> Home

    Home[🏠 ホーム画面<br/>PDF読み込み / 軽量化モード] --> DropPDF{PDF読み込み}
    DropPDF -- 通常 --> CheckSize{ファイル<br/>サイズ判定}
    CheckSize -- 軽い --> List[📋 一覧画面]
    CheckSize -- 重い --> WarnHeavy[⚠ 重いPDF警告]
    WarnHeavy -- そのまま開く --> List
    WarnHeavy -- 事前分割する --> SplitMode

    Home -- 「事前分割」選択 --> SplitMode[✂️ 軽量化モード]
    SplitMode --> SplitConfig[分割設定<br/>N ページごと]
    SplitConfig --> SplitProgress[分割実行中]
    SplitProgress --> SplitDone[完了画面]
    SplitDone --> Home

    List --> Preview[🖼 プレビュー画面]
    List -- 選択して抽出 --> ExtractModal[✂️ 抽出ダイアログ]
    ExtractModal --> ExtractConfig[ファイル名入力]
    ExtractConfig --> ExtractDone[抽出完了]
    ExtractDone --> List

    Preview -- 鉛筆クリック --> Rename[インラインリネーム]
    Rename --> Preview
    Preview -- スタンプ追加 --> Stamp[文字スタンプ配置]
    Stamp --> Preview
    Preview -- 回転 --> Rotate[ページ回転]
    Rotate --> Preview
    Preview -- 戻る --> List

    List -- 保存 --> Save[💾 保存ダイアログ]
    Save --> SaveDone[保存完了]
    SaveDone --> List

    List -- ヘルプ --> Help[❓ ヘルプ画面]
    List -- 不具合報告 --> BugReport[🐛 不具合報告フォーム]
    BugReport --> ReportSent[送信完了]
    ReportSent --> List

    style Start fill:#dbeafe
    style Home fill:#fef3c7
    style List fill:#dcfce7
    style Preview fill:#dcfce7
    style SplitMode fill:#fed7aa
    style WarnHeavy fill:#fed7aa
```

---

## 2. 主要操作フロー: 「100人分PDF を人ごとに分割」

```mermaid
sequenceDiagram
    actor User as 介護スタッフ
    participant App as PDFノート
    participant Browser as ブラウザ
    participant Disk as ローカルディスク

    User->>App: PDF をドラッグ&ドロップ
    App->>Browser: PDF 読み込み（pdf.js）
    App->>App: サイズ判定（120ページ・80MB）
    App-->>User: ⚠ 「重いPDF。事前分割推奨」
    User->>App: 「そのまま開く」選択
    App->>App: 全ページサムネイル生成（WebWorker）
    App-->>User: 一覧画面表示

    Note over User,App: ユーザーが○○さんの書類範囲を選択<br/>（例: 3-5ページを Shift+クリック）

    User->>App: 「抽出」ボタンクリック
    App-->>User: ファイル名入力ダイアログ
    User->>App: 「○○さん_2026年5月」入力
    App->>App: pdf-lib で抽出処理
    App->>Disk: File System Access API で保存
    Disk-->>User: ファイル保存完了

    Note over User,App: 同じ操作を 100 人分繰り返す<br/>（残ったページは一覧に保持）

    User->>App: 全員分完了後「閉じる」
    App->>App: IndexedDB の作業状態をクリア
```

---

## 3. 軽量化モードフロー

```mermaid
sequenceDiagram
    actor User as 介護スタッフ
    participant App as PDFノート

    User->>App: 「事前分割（軽量化）」ボタンクリック
    App-->>User: 設定画面表示<br/>（N=50 デフォルト・変更可）
    User->>App: N=50 のまま「実行」
    App->>App: 元PDF読み込み（ストリーミング）

    loop 50ページずつ処理
        App->>App: 50ページ分を抽出
        App-->>User: 進捗バー更新
    end

    App-->>User: 完了画面<br/>「3ファイルに分割しました」<br/>・元ファイル_part1.pdf<br/>・元ファイル_part2.pdf<br/>・元ファイル_part3.pdf
    User->>App: 「保存先を選ぶ」
    App->>App: 各ファイルを順次保存

    Note over User,App: 分割後のファイルを個別に開いて<br/>通常の業務を続行
```

---

## 4. リネーム操作フロー（鉛筆アイコン）

```mermaid
stateDiagram-v2
    [*] --> 表示モード
    表示モード --> 編集モード: 鉛筆アイコンクリック
    編集モード --> 表示モード: Enter / 外側クリック<br/>（保存）
    編集モード --> 表示モード: Esc キー<br/>（キャンセル）

    note right of 編集モード
        テキストフィールド表示
        既存名がプリセットされる
        フォーカス自動移動
    end note
```

---

## 5. スタンプ操作フロー

```mermaid
flowchart LR
    A[プレビュー画面] -->|スタンプ追加ボタン| B[配置モード]
    B -->|PDF上をクリック| C[テキスト入力欄表示]
    C -->|文字入力| D[スタンプ確定]
    D -->|ドラッグ| E[位置調整]
    D -->|クリック| F[スタンプ削除]
    E --> A
    F --> A

    style B fill:#fef3c7
```

---

## 6. エラー処理フロー

```mermaid
flowchart TD
    Action[何らかの操作] --> Result{結果}
    Result -- 成功 --> ToastSuccess[✅ 成功トースト<br/>3秒で消える]
    Result -- 軽微エラー --> ToastError[⚠ エラートースト<br/>5秒表示]
    Result -- 重大エラー --> ErrorModal[エラーモーダル]
    ErrorModal --> Retry[再試行]
    ErrorModal --> BugReport[不具合報告へ]

    BugReport --> Filter[個人情報フィルタ]
    Filter --> Send[GitHub Issue 起票]

    style ToastError fill:#fed7aa
    style ErrorModal fill:#fecaca
```

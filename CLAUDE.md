# Dealer System - 開発ガイド

## 必須要件

- **Node.js v20以上** (開発環境: v23.7.0)
  - `better-sqlite3@^11.7.0` はNode.js v20+が必要（v18以下ではC++20コンパイルエラー）
  - Node.js v18以下を使う場合は `better-sqlite3@^9.0.0` に変更が必要だが非推奨
- **npm v9以上** (開発環境: v11.4.2)
- **OS**: macOS / Linux / Windows いずれも可
  - `better-sqlite3` はネイティブモジュールのため、OS/アーキテクチャごとに `npm install` でリビルドが必要

## セットアップ

```bash
git clone https://github.com/arnold17091984/dealersys.git
cd dealersys
npm install
npm start
```

ブラウザで http://localhost:3000 を開く。

## 開発モードで起動

```bash
npm run dev   # nodemonによるホットリロード
```

## 注意事項

### better-sqlite3 のビルドエラー

`npm install` 時に `better-sqlite3` のコンパイルエラーが出る場合：

1. Node.js のバージョンを確認 → v20以上であること
2. C++ビルドツールが必要:
   - **macOS**: `xcode-select --install`
   - **Linux**: `sudo apt install build-essential python3`
   - **Windows**: `npm install -g windows-build-tools` または Visual Studio Build Tools

### node-fetch のバージョン

`node-fetch@^2.7.0` を使用（CommonJS互換）。v3以上はESM専用のため使用不可。

### SQLiteデータベース

- 初回起動時に `data/dealer.sqlite` が自動作成される
- `.gitignore` で除外済み（各環境で個別に生成される）
- スキーマは `server/db/schema.sql` に定義

### ポート

- デフォルト: **3000**
- 変更する場合: `server/config.js` の `port` を編集

### ゲームサーバー接続

- デフォルトは `127.0.0.1:4000`（ローカルモック）
- 本番サーバー: `139.180.154.92:4000`
- 切り替え: 環境変数 `GAME_HOST=139.180.154.92 npm start` または `server/config.js` を編集

## プロジェクト構成

```
dealer-system/
├── server/                  # Node.js バックエンド
│   ├── index.js             # Express起動・ルート登録
│   ├── config.js            # 設定（ポート、サーバーURL、認証情報）
│   ├── db/schema.sql        # SQLiteスキーマ
│   ├── routes/
│   │   ├── proxy.js         # ゲームサーバーProxy (/api/dealer/*)
│   │   └── data.js          # データ保存・照会 (/api/data/*)
│   └── services/
│       ├── gameServer.js    # ゲームサーバーHTTPクライアント
│       ├── websocketBridge.js # WebSocket中継
│       ├── dataStore.js     # SQLite CRUD
│       └── forwarder.js     # 外部転送
├── public/                  # フロントエンド（静的ファイル）
│   ├── index.html           # ディーラーUI
│   └── js/
│       ├── app.js           # メインコントローラ
│       └── modules/         # 各機能モジュール
├── mock/                    # テスト用モックサーバー
├── docs/                    # 設計ドキュメント
└── data/                    # SQLite DB（git除外）
```

## フロントエンドについて

- **バンドラー不要** — `<script>` タグで直接読み込み
- 各モジュールは `window.ModuleName` としてグローバル公開
- CSSは Tailwind CSS（ビルド済み `public/css/tailwind.css` を使用）
- Tailwind CSSの再ビルド: `npm run build:css`

## 動作モード（server/config.js）

- `active` — 全機能有効（ゲームサーバー連携 + DB保存）
- `passive` — モニターモード（WebSocket受信 + DB保存のみ、操作ボタン無効）

## 既知の問題

- RFID CODE_MAP に5枚分のコード欠損あり（`public/js/modules/cardEngine.js` のコメント参照）
- ゲームサーバー未接続時、START等の操作でエラーが出る（standaloneモード未実装）

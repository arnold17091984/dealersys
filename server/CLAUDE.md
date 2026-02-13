# Server

Express + SQLite バックエンド。詳細はルートの [CLAUDE.md](../CLAUDE.md) を参照。

## 設定変更

`config.js` で以下を管理:
- ポート番号、ゲームサーバーURL、ディーラー認証情報、DB パス、動作モード、外部転送設定

## API エンドポイント

- `/api/dealer/*` — ゲームサーバーへのProxy（全て POST, form-urlencoded）
- `/api/data/*` — ローカルDB操作（JSON）
- `/ws` — WebSocket中継

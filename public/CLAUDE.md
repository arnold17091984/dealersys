# Public (Frontend)

Vanilla JavaScript フロントエンド。バンドラー不要。

## モジュール構成

各モジュールは `window.ModuleName` でグローバル公開:
- `CardEngine` — RFIDコード変換、バカラルール計算
- `GameFlow` — ゲーム状態管理（IDLE → BETTING → DEALING → RESULT）
- `WsClient` — WebSocket接続
- `RfidInput` — RFIDキーボード入力キャプチャ
- `ServerComm` — HTTP APIクライアント
- `CardRenderer` — カード描画
- `TimerDisplay` — ベッティングタイマー
- `DataLogger` — ラウンドデータ収集・DB保存

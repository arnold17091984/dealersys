# dealer_v5 — 完全解説

## これは何か

**NEXUS9社が開発したバカラディーラー専用アプリ**です。Windows PCにインストールして使います。

---

## アプリの構造

```
dealer_v5-win32-x64/
│
├── dealer_v5.exe         ← 起動ファイル（123MB）
│   └── 中身は Electron（ブラウザをアプリ化する技術）
│
├── *.dll                 ← Windows用ランタイム（Chromium、OpenGL等）
│
└── resources/app/        ← アプリの本体
    │
    ├── main.js           ← ウィンドウ作成（1280x800、メニューバー非表示）
    ├── config.json       ← 接続設定
    ├── preload.js        ← 設定をブラウザに渡す橋渡し
    ├── server.js         ← 内蔵HTTPサーバー（port 9990、現在未使用）
    ├── package.json      ← アプリ定義（作者: "poly"、名前: "auto_deal"）
    │
    └── web-mobile/       ← ゲームUI本体
        ├── index.html          ← Canvas（Cocos2d描画エリア）
        ├── cocos2d-js-min.js   ← Cocos2dゲームエンジン（1.9MB）
        ├── main.js             ← ブートローダー
        └── assets/main/index.js ← 全ゲームロジック（圧縮済み、117kトークン）
```

---

## config.json（接続設定）

```json
{
    "moxaHost": "139.180.154.92:4000",   // ゲームサーバーのIP
    "dealerID": "operator_001",           // ディーラーID
    "dealerKey": "6001",                  // 認証キー
    "m_Delay": 1000                       // 遅延設定（ms）
}
```

---

## preload.js（設定の受け渡し）

```
config.json → localStorage に保存 → ゲーム画面から参照
```

Electronの「preload」という仕組みを使い、Node.js側の設定ファイルをブラウザ側に渡しています。こうすることでゲーム画面（Cocos2d）が `localStorage.getItem('moxaHost')` でサーバーアドレスを取得できます。

---

## ゲームエンジン: Cocos Creator

UIは**Cocos Creator**（ゲーム開発エンジン）で作られています。Canvasに描画するため：
- 通常のHTML要素ではなく、ゲームのようにピクセル単位で描画
- ボタンやカードは全てCanvas上のスプライト
- 画面は横向き固定（landscape）
- 開始シーンは `Loading` → メインゲーム画面へ遷移

---

## ゲームの状態遷移（6つの状態）

```
    S（開始待ち）
      │ START押下
      ▼
    B（ベッティング） ← タイマーカウントダウン中
      │ STOP押下 or タイマー終了
      ▼
    D（ディーリング） ← RFIDカードスキャン受付中
      │ RESULT押下
      ▼
    E2（結果表示）
      │ 自動 or 次ラウンド
      ▼
    S に戻る

    P（一時停止） ← どの状態からも移行可能
    T（テーブル確認）
```

---

## 通信の仕組み

### HTTP API（操作コマンド）

| エンドポイント | 用途 | 状態遷移 |
|---|---|---|
| `POST /dealer/auth` | ログイン（ID + Key → Token取得） | — |
| `POST /dealer/table` | テーブル情報取得 | — |
| `POST /dealer/start` | ゲーム開始 | S → B |
| `POST /dealer/stop` | ベッティング終了 | B → D |
| `POST /dealer/card` | カードデータ送信（RFID読取ごと） | — |
| `POST /dealer/finish` | 結果確定 | D → E2 |
| `POST /dealer/suffle` | シャッフル | → S |
| `POST /dealer/pause` | 一時停止 | → P |
| `POST /dealer/restart` | 再開 | P → 前の状態 |
| `POST /dealer/setlast` | ラストゲーム設定 | — |

### WebSocket（リアルタイム同期）

```
接続先: ws://139.180.154.92:4000/conn/{table}/{idx}/{token}
```

| メッセージ種別 | 内容 |
|---|---|
| `p:0` | ハートビート応答 |
| `p:1` | テーブル情報（接続直後に1回） |
| `p:2` | ゲーム状態変更（B, D, E2, S 等） |
| `p:3` | カードデータ（カード配布ごとに） |

---

## RFIDカード入力の仕組み

```
物理カード → RFIDリーダー → 5桁の数字コードをキーストロークとして送信 → onKeyDown()で受信
```

| 項目 | 値 |
|---|---|
| 入力形式 | 5桁の数字（例: `24580`） |
| 受信方法 | キーボードイベント（`onKeyDown`） |
| カード位置 | `intPosi` 0〜5（P1, B1, P2, B2, P3, B3） |
| カード値 | `cardIdx` 0〜51（スート×13 + ランク） |

1枚スキャンするたびに `POST /dealer/card` でサーバーに送信します。

---

## 多言語対応

アプリは4言語に対応しています：
- 英語 (en)
- 日本語 (ja)
- 韓国語 (ko)
- 中国語 (zh)

---

## 新ディーラーシステムとの比較

| 項目 | dealer_v5 | 新ディーラーシステム |
|---|---|---|
| **フレームワーク** | Electron + Cocos Creator | Node.js + Vanilla JS |
| **UI描画** | Canvas（ゲームエンジン） | HTML/CSS（通常のWeb） |
| **動作環境** | Windows専用（.exe） | ブラウザ（OS不問） |
| **サイズ** | 123MB（ランタイム込み） | 数MB |
| **データ保存** | なし（サーバー送信のみ） | SQLiteに自社保存 |
| **データ転送** | なし | 自社サーバーへ自動転送 |
| **カスタマイズ** | コード圧縮済みで困難 | ソースコード全て制御可能 |
| **API** | 同じゲームサーバーを使用 | 同じゲームサーバーを使用 |

---

## まとめ

dealer_v5は**Cocos Creatorというゲームエンジンで作られたカジノディーラー操作ツール**で、RFIDでカードをスキャンし、ゲームサーバーにデータを送る役割です。新ディーラーシステムはこれと同じことを、よりシンプルなWeb技術で実現しつつ、データ保存・転送機能を追加したものです。

# バカラ ディーラーシステム — システム設計書

## 1. 概要

既存のバカラゲームサーバーに接続するWebベースのディーラー操作画面を新規開発する。
既存の Electron アプリ（dealer_v5 = BACCARAT SIMULATOR）を置き換え、**ブラウザのみで動作**するディーラーUIを提供する。
加えて、ディーリング中のカードデータをローカルDBに保存し、自社開発中の別バカラシステムへ転送する機能を持つ。

### デュアルモード対応

本システムは以下の2つのモードで動作する。`server/config.js` の `mode` 設定で切り替え可能:

| モード | 説明 | 用途 |
|---|---|---|
| **Active** | dealer_v5の完全置き換え。ゲーム操作（START/STOP/RESULT等）＋RFID入力＋データ保存・転送 | 本システムのみでディーリング |
| **Passive** | dealer_v5と併用。WSデータ受信＋データ保存・転送のみ。操作ボタン・RFID入力は無効 | dealer_v5と並行運用（監視モード） |

**なぜデュアルモードか:**
- dealer_v5との同時接続がゲームサーバーで許可されるか不明（NEXUS9社に要確認）
- Activeモードの機能はPassiveモードの上位互換（コマンド送信の有無だけの差）

---

## 2. 既存システムの構成

**NEXUS9社: NEXUS9**

NEXUS9社から提供を受けた時点で、以下のコンポーネントが存在している。

### 提供ドキュメント（PDF）の記載内容

NEXUS9社から提供された `sytem (1).pdf`（システム運用マニュアル）に、既存システムの全体像が記載されている。

**プログラム一覧（PDFセクション2より）:**

| # | プログラム | 説明 |
|---|---|---|
| 1 | ゲームのライブ映像配信 | OBSによるカメラ映像のストリーミング |
| 2 | ディーラープログラムのライブ映像配信 | OBSによるディーラー画面のストリーミング |
| 3 | **ディーラープログラム（dealer_v5.exe = BACCARAT SIMULATOR）** | ディーラー操作アプリ（★本システムで置き換え） |
| 4 | ユーザー用ゲーム画面 | プレイヤー向けWebUI（詳細不明） |
| 5 | ディーラーライブ映像ビューア | ディーラー映像の視聴画面（詳細不明） |

**ストリーミング配信の設定（PDFセクション6-7より）:**
- OBSを使用してゲーム映像とディーラー画面を配信
- ストリーミングサーバー: `sg2.pdwiki.net:/cagayan88`
- ストリームキー命名規則:
  - `t001` = テーブル1のゲームカメラ映像
  - `t004` = テーブル1のディーラー画面キャプチャ
- ゲーム映像: カメラデバイス → OBS → ストリーミングサーバー（1280x720）
- ディーラー画面: Window capture（dealer_v5.exe = BACCARAT SIMULATOR） → OBS → ストリーミングサーバー

**Setting-B.pdf の内容:**
- 画面キャプチャ＋OBS連携ツールの設定マニュアル
- `C:\Users\Pictures` にファイルを配置
- ショートカットキーで画面保存・表示・非表示を切り替え
- SbWatcher.exe のマニュアルである可能性あり（後述）

### 全体のファイル構成

```
/Users/arnold/Documents/betting-system/
├── dealer_v5-win32-x64/    ← Electronデスクトップアプリ（Windows用）
├── dealer_tools/            ← NEXUS9社提供のディーラーツールHTMLバージョン
├── dealer-system/           ← ★ 我々が新規開発しているシステム
├── SbWatcher.exe            ← 画面キャプチャ/監視ツール（.NET）
├── SbWatcher.exe.config     ← 設定ファイル
├── SbWatcher.pdb            ← デバッグシンボル
├── SbWatcher.png            ← アイコン/スクリーンショット
├── Setting-B.pdf            ← 画面キャプチャツール設定マニュアル
└── sytem (1).pdf            ← システム全体の運用マニュアル
```

### 2.1 ゲームサーバー（139.180.154.92:4000）

リモートサーバー上で動作するバカラゲームの中央管理サーバー。
全てのゲーム進行、プレイヤー接続、結果判定を管理する。

```
┌──────────────────────────────────────────┐
│ ゲームサーバー (139.180.154.92:4000)       │
│                                          │
│  HTTP API (/dealer/*)                    │
│  ├── 認証 (auth)                         │
│  ├── ゲーム操作 (start/stop/card/finish) │
│  └── テーブル管理 (pause/restart/suffle) │
│                                          │
│  WebSocket (/conn/{table}/{idx}/{token}) │
│  ├── p:0 ハートビート                     │
│  ├── p:1 テーブル情報                     │
│  ├── p:2 ステータス更新 (S/B/D/E2/T/P)  │
│  └── p:3 カードデータ                     │
│                                          │
│  ゲームロジック                            │
│  ├── ラウンド管理 (シュー単位)            │
│  ├── ベットタイム制御                     │
│  ├── 結果判定 (winPos)                   │
│  └── 接続プレイヤーへのリアルタイム配信    │
└──────────────────────────────────────────┘
```

**我々が把握していないこと:**
- サーバーの実装言語・フレームワーク
- サーバー側のデータ保存有無
- 複数テーブルの管理方式
- プレイヤー側の接続仕様

### 2.2 dealer_v5（Electronデスクトップアプリ）

現在使用されているディーラー操作アプリ。**本システムで置き換え予定。**

```
dealer_v5-win32-x64/
├── dealer_v5.exe                   ← 起動ファイル（Windows x64）
└── resources/app/
    ├── main.js                     ← Electron メインプロセス
    ├── preload.js                  ← config.json → localStorage へ注入
    ├── config.json                 ← 接続設定
    ├── server.js                   ← 内蔵HTTPサーバー (port 9990、現在未使用)
    ├── package.json                ← Electron 10.1.2
    └── web-mobile/                 ← Cocos Creator 出力
        ├── index.html              ← Canvas描画ベースのUI
        ├── cocos2d-js-min.js       ← Cocos2Dエンジン (~1.9MB)
        ├── main.js                 ← ゲームロジック (ミニファイ済み)
        └── src/
            └── assets/script/
                └── Lib/state-machine.min.js  ← 状態管理ライブラリ
```

**動作フロー:**
1. `dealer_v5.exe` を起動 → Electron が `main.js` を実行
2. `preload.js` が `config.json` から認証情報を `localStorage` に注入
3. `BrowserWindow` (1280x800) で `web-mobile/index.html` を表示
4. Cocos Creator が Canvas 上にバカラUIを描画
5. JavaScript から直接ゲームサーバーに HTTP/WebSocket で接続

**config.json の内容:**
```json
{
  "moxaHost": "139.180.154.92:4000",
  "dealerID": "operator_001",
  "dealerKey": "6001",
  "m_Delay": 1000
}
```

**特徴:**
- Electron アプリのため、ブラウザの CORS 制限なしに外部サーバーへ直接通信可能
- Canvas ベースの描画（DOM ではない）
- Windows 専用（macOS/Linux では動作しない）

### 2.3 dealer_tools（ディーラーツール HTMLバージョン）

NEXUS9社から提供されたディーラーツールのHTMLバージョンのソースファイル。
ゲームサーバーへの接続機能は持たず、RFIDカードのスキャン・表示・バカラルール判定をスタンドアロンで行うツール。
HTMLは `lang="ko"`（韓国語）で、コメントも韓国語で記述されており、NEXUS9社が開発したものであることが確認できる。

```
dealer_tools/
├── index.html              ← メインUI (lang="ko"、韓国語コメント含む)
├── css/style.css           ← スタイル
└── js/roule.js             ← カードロジック (562行)
    ├── CODE_MAP             ← RFID 5桁コード → カード変換テーブル (52枚)
    ├── SUITS                ← スート定義 (♦♠♣♥)
    ├── getSimulatedResult() ← バカラ結果計算
    ├── doesBankerDraw()     ← 3枚目ルール判定
    └── findWinScenario()    ← 結果変更サジェスト
```

**提供元:** NEXUS9社（先方）
**位置づけ:** ディーラーツールのHTMLバージョンとして提供されたソースファイル
**特徴:**
- ゲームサーバーとの通信機能は無い（ローカルのみ）
- RFIDカードスキャン・カード表示・バカラルール判定が可能
- dealer_v5（Electronアプリ）のサーバー通信を除いたUI/ロジック部分に相当

**我々のシステムでの利用:**
- `roule.js` のCODE_MAP、ルール計算ロジックを `cardEngine.js` に移植して使用

### 2.4 SbWatcher.exe（画面キャプチャ/監視ツール）

```
SbWatcher.exe       ← .NET実行ファイル (227KB)
SbWatcher.exe.config ← 設定ファイル
SbWatcher.pdb       ← デバッグシンボル
SbWatcher.png       ← アイコン/スクリーンショット
```

**Setting-B.pdf との関連:**
Setting-B.pdf には「画面キャプチャ＋OBS連携ツール」の設定手順が記載されており、以下の機能を持つ:
- ショートカットキーで現在の画面を保存（同時に履歴記録）
- 保存した画面の表示/非表示をOBS上で切り替え
- `C:\Users\Pictures` にファイルを配置して使用

このツールが SbWatcher.exe である可能性が高い（PDFにプログラム名の明記はない）。
**→ NEXUS9社に要確認。**

### 2.5 既存システムの全体構成（PDFベース）

```
                         ┌─────────────────┐
                         │ ストリーミング    │
                         │ サーバー          │
                         │ sg2.pdwiki.net   │
                         └──┬──────────┬───┘
                            │          │
                     ゲーム映像   ディーラー画面
                            │          │
                            ▼          ▼
                         ┌─────────────────┐
                         │ ゲームプレイヤー   │
                         │ (Webブラウザ)     │
                         └─────────────────┘

  [RFIDリーダー]                            ┌─────────────────┐
       │                                    │ ゲームサーバー    │
   keyboard入力                              │ 139.180.154.92   │
       │                                    │ :4000            │
       ▼                                    └──┬──────────────┘
  ┌──────────────────┐                         │
  │ dealer_v5.exe     │── 直接通信(CORSなし)──►│
  │ (Electron)        │◄── WebSocket ─────────│
  └──────────────────┘                         │
       │                                        │
  Window capture                                │
       │                                        │
       ▼                                        │
  ┌──────────────────┐     RTMP配信              │
  │ OBS Studio        │─────────────────────► ストリーミングサーバー
  │ ・ゲームカメラ映像  │     (sg2.pdwiki.net)
  │ ・ディーラー画面   │
  └──────────────────┘

  ┌──────────────────┐
  │ SbWatcher.exe     │  ← 画面キャプチャ/OBS連携ツール（Setting-B.pdf参照）
  └──────────────────┘
```

**ポイント:**
- dealer_v5 は Electron のため、ブラウザ制限（CORS）を受けずにゲームサーバーへ直接通信できた
- OBSでゲームカメラ映像とディーラー画面をストリーミングサーバーへ配信
- プレイヤーはストリーミング映像を見ながらWebブラウザでゲームに参加

### 2.6 新システムの通信の流れ（本システム）

```
  [RFIDリーダー]
       │
   keyboard入力
       │
       ▼
  ┌──────────────────┐     ┌──────────────────┐     ┌─────────────────┐
  │ ブラウザ          │────►│ Node.js          │────►│ ゲームサーバー    │
  │ (フロントエンド)   │     │ (バックエンド)    │     │ 139.180.154.92   │
  │                   │◄───│ localhost:3000    │◄───│ :4000            │
  │ DOM描画           │     │                  │     └─────────────────┘
  └──────────────────┘     │ + SQLite保存      │
                           │ + データ転送      │────► 自社システム
                           └──────────────────┘
```

**ポイント:** ブラウザから外部サーバーへ直接通信するとCORSでブロックされるため、Node.jsバックエンドをプロキシとして中継している。これにより同時にデータ保存・転送機能も実現。

---

## 3. 開発スコープ定義

### 我々が開発するもの（開発スコープ）

| コンポーネント | 説明 |
|---|---|
| **ディーラーUI（フロントエンド）** | ブラウザで動作するカード表示・ゲーム操作画面 |
| **Node.js バックエンド** | ゲームサーバーへのプロキシ、WebSocket中継、データ保存 |
| **データ保存モジュール** | SQLite によるラウンドデータのローカル保存 |
| **データ転送モジュール** | 自社システムへのバッチ転送（30秒間隔、リトライ付き） |

### 既存のまま使用するもの（開発スコープ外）

| コンポーネント | 管理者 | 説明 |
|---|---|---|
| **ゲームサーバー（139.180.154.92:4000）** | NEXUS9社 | バカラゲームの進行管理、プレイヤー接続管理、結果判定 |
| **WebSocket プロトコル** | NEXUS9社 | `{"p": TYPE, "c": DATA}` 形式のリアルタイム通信 |
| **HTTP API（/dealer/*）** | NEXUS9社 | ディーラー認証、ゲーム操作エンドポイント |
| **RFIDリーダーハードウェア** | 現場設置済み | USB接続、キーボード入力として5桁コードを送信 |
| **dealer_tools（参考コード）** | NEXUS9社 | カードマッピング・バカラルールのロジック（roule.js） |
| **dealer_v5（Electronアプリ）** | NEXUS9社 | 既存のCocos Creator製ディーラーUI（本システムで置き換え予定） |
| **OBS Studio（映像配信）** | 現場運用 | ゲームカメラ映像＋ディーラー画面をストリーミングサーバーへ配信 |
| **ストリーミングサーバー** | NEXUS9社 | `sg2.pdwiki.net` — プレイヤーへのライブ映像配信 |
| **SbWatcher.exe** | NEXUS9社 | 画面キャプチャ/OBS連携ツール（Setting-B.pdf参照） |

### 将来的に接続するもの（別チーム開発中）

| コンポーネント | 説明 |
|---|---|
| **自社バカラシステム** | カードデータの受信API。本システムから転送先として接続 |

---

## 4. 新システム構成図

```
                    ┌─────────────────────────────────────────┐
                    │         開発スコープ外（既存）             │
                    │                                         │
  [RFIDリーダー] ──keyboard──►  ┌─────────────────────┐      │
                    │           │ ゲームサーバー        │      │
                    │           │ 139.180.154.92:4000  │      │
                    │           │                      │      │
                    │           │ ・ディーラー認証      │      │
                    │           │ ・ゲーム進行管理      │      │
                    │           │ ・プレイヤー配信      │      │
                    │           │ ・結果判定            │      │
                    │           └──────┬───────────────┘      │
                    └─────────────────┼───────────────────────┘
                                      │
                       HTTP API + WebSocket
                                      │
  ┌───────────────────────────────────┼───────────────────────┐
  │          開発スコープ（本システム）  │                       │
  │                                   │                       │
  │   ┌──────────────────────────────┼──────────────────┐    │
  │   │   Node.js バックエンド (localhost:3000)          │    │
  │   │                              │                   │    │
  │   │   ┌──────────────┐  ┌──────┴─────────┐        │    │
  │   │   │ HTTP プロキシ  │  │ WebSocket中継   │        │    │
  │   │   │ /api/dealer/* │  │ /ws            │        │    │
  │   │   └──────────────┘  └────────────────┘        │    │
  │   │                                                │    │
  │   │   ┌──────────────┐  ┌────────────────┐        │    │
  │   │   │ データ保存     │  │ データ転送      │        │    │
  │   │   │ SQLite        │  │ 30秒バッチ     │ ──────────►  自社システム
  │   │   └──────┬───────┘  └────────────────┘        │    │  （別チーム開発中）
  │   │          │                                     │    │
  │   │    [dealer.sqlite]                             │    │
  │   └────────────────────────────────────────────────┘    │
  │                              │                           │
  │   ┌──────────────────────────┴─────────────────────┐    │
  │   │   ブラウザ フロントエンド                         │    │
  │   │                                                │    │
  │   │   ・カード表示（RFID → 5桁コード → カード認識）   │    │
  │   │   ・ゲーム操作ボタン（Start/Stop/Result/Next）   │    │
  │   │   ・ベットタイマー表示                           │    │
  │   │   ・バカラ3枚目ルール自動判定                    │    │
  │   │   ・サーバー自動フロー追従                       │    │
  │   └────────────────────────────────────────────────┘    │
  └─────────────────────────────────────────────────────────┘
```

---

## 5. 既存ゲームサーバーとの通信仕様

### 5.1 認証

```
POST http://139.180.154.92:4000/dealer/auth
Content-Type: application/x-www-form-urlencoded

id=operator_001&key=6001
```

**レスポンス:**
```json
{
  "ecode": 0,
  "data": {
    "idx": "ゲームインデックス",
    "token": "JWTトークン",
    "table": "テーブル番号",
    "ttype": "テーブルタイプ"
  }
}
```

### 5.2 HTTP API（全てPOST、x-www-form-urlencoded）

| エンドポイント | パラメータ | 用途 |
|---|---|---|
| `/dealer/auth` | `id`, `key` | 認証 → トークン取得 |
| `/dealer/table` | `table` | テーブル状態取得 |
| `/dealer/start` | `table` | ゲーム開始（ベットタイム開始） |
| `/dealer/stop` | `table` | ベットタイム終了 |
| `/dealer/card` | `table`, `intPosi`, `cardIdx`, `card` | カード送信 |
| `/dealer/finish` | `table` | 結果確定 |
| `/dealer/suffle` | `table` | シャッフル |
| `/dealer/setlast` | `table` | ラストゲーム設定 |
| `/dealer/pause` | `table` | 一時停止 |
| `/dealer/restart` | `table` | 再開 |

### 5.3 WebSocket 接続

```
接続先: ws://139.180.154.92:4000/conn/{table}/{idx}/{token}
プロトコル: "echo-protocol"
```

**メッセージ形式:** `{"p": TYPE, "c": DATA}`

| p (タイプ) | 方向 | 内容 |
|---|---|---|
| **0** | 双方向 | ハートビート（クライアント→サーバー: 1秒間隔で送信、サーバー→クライアント: 応答） |
| **1** | サーバー→クライアント | テーブル情報（接続時に受信） |
| **2** | サーバー→クライアント | ステータス更新（ゲーム進行に伴い受信） |
| **3** | サーバー→クライアント | カードデータ（ディーリング中に受信） |

### 5.4 ゲームステータス値（p:2 の gameStatus フィールド）

| 値 | 状態 | 説明 |
|---|---|---|
| `"S"` | Shuffle | シャッフル中 — ボードリセット |
| `"B"` | Betting | ベットタイム — タイマーカウントダウン開始 |
| `"D"` | Dealing | ディーリング — カードスキャン受付 |
| `"E2"` | End/Result | ラウンド結果 — 勝敗表示 |
| `"T"` | Maintenance | メンテナンス |
| `"P"` | Pause | 一時停止 |

### 5.5 ゲームフロー

```
S（シャッフル）→ B（ベット）→ D（ディーリング）→ E2（結果）→ S or B（次ラウンド）
```

ゲームサーバーが状態遷移を管理し、WebSocket p:2 で各クライアントに通知する。
ディーラーUIはこの通知に追従して画面を自動更新する。

**PDFマニュアル（ページ7）に基づく正しいフロー:**

```
1. START押下 → ベットタイマー開始（BETTING状態）
2. ベットタイム中にカードをRFIDスキャン（配りながらタイマーが進む）
3. タイマー 0 → DEALING状態に遷移
4. RESULT押下 → 結果データをサーバーに送信（FINISH状態、BANKER/PLAYER WINS! 表示）
5. 次ラウンドへ自動遷移 → 1に戻る
```

**重要:** BETTING状態中にRFIDスキャンが可能。カードの配布はベットタイムと並行して行われる。

### 5.6 カード送信時のintPosi（カード位置）マッピング

```
intPosi=1 → Player 1枚目（左）
intPosi=2 → Player 2枚目（右）
intPosi=3 → Player 3枚目
intPosi=4 → Banker 1枚目（左）
intPosi=5 → Banker 2枚目（右）
intPosi=6 → Banker 3枚目
```

**RFIDスキャン順序 → intPosi変換:**
```
スキャン0番目（P右） → intPosi=2
スキャン1番目（B右） → intPosi=5
スキャン2番目（P左） → intPosi=1
スキャン3番目（B左） → intPosi=4
スキャン4番目（5枚目）→ intPosi=3 or 6（ルールにより決定）
スキャン5番目（6枚目）→ intPosi=6
```

### 5.7 サーバーカードデータ形式（p:3 playerCard/bankerCard）

3文字ずつのカードコード。先頭1文字がスート、続く2文字がランク:

| スート | 値 |
|---|---|
| 0 | 空（カードなし） |
| 1 | Clubs ♣ |
| 2 | Diamonds ♦ |
| 3 | Hearts ♥ |
| 4 | Spades ♠ |

| ランク | 値 |
|---|---|
| 01 | A |
| 02〜09 | 2〜9 |
| 10 | 10 |
| 11 | J |
| 12 | Q |
| 13 | K |

例: `"305"` = ♥5、`"413"` = ♠K、`"101"` = ♣A

---

## 6. 新システムのファイル構成

```
dealer-system/
├── package.json
├── server/
│   ├── index.js                # Express サーバー起動
│   ├── config.js               # 接続設定（サーバーIP、認証情報、転送先）
│   ├── routes/
│   │   ├── proxy.js            # /api/dealer/* → ゲームサーバーへ中継
│   │   └── data.js             # データ保存・転送状況API
│   ├── services/
│   │   ├── gameServer.js       # ゲームサーバーHTTPクライアント（認証トークン管理）
│   │   ├── websocketBridge.js  # ブラウザ ↔ ゲームサーバーのWS中継
│   │   ├── dataStore.js        # SQLite CRUD
│   │   └── forwarder.js        # 自社システムへのバッチ転送
│   └── db/
│       └── schema.sql          # DBスキーマ定義
├── public/
│   ├── index.html              # ディーラーUI
│   ├── css/
│   │   ├── style.css           # UIスタイル
│   │   ├── tailwind.css        # Tailwind CSS（ローカルビルド）
│   │   └── tailwind-input.css  # Tailwind ソース
│   └── js/
│       ├── app.js              # メインコントローラー
│       └── modules/
│           ├── cardEngine.js   # RFIDコード→カード変換、バカラルール計算
│           ├── cardRenderer.js # カードDOM描画
│           ├── rfidInput.js    # RFIDキーボード入力受信
│           ├── serverComm.js   # HTTP API呼び出し
│           ├── wsClient.js     # WebSocketクライアント（ハートビート付き）
│           ├── gameFlow.js     # ゲーム状態管理（IDLE→BETTING→DEALING→RESULT）
│           ├── timerDisplay.js # ベットタイマー表示
│           └── dataLogger.js   # ラウンドデータ収集・保存リクエスト
└── data/
    └── dealer.sqlite           # 自動生成
```

---

## 7. データ保存スキーマ

```sql
-- ラウンドごとのゲーム結果
games: id, game_id, table_no, round_no, status,
       player_cards(JSON), banker_cards(JSON),
       player_score, banker_score, winner, is_natural,
       forwarded, started_at, ended_at, created_at

-- カードスキャン履歴
card_scans: id, game_id, position, rfid_code,
            suit, rank, value, scanned_at

-- 自社システムへの転送キュー
forward_queue: id, game_id, payload(JSON), status,
               attempts, error_message, created_at, sent_at
```

---

## 8. 自社システムへの転送API（案）

自社チームがこの形式で受信エンドポイントを実装すれば連携可能:

```
POST /api/v1/games/result
Content-Type: application/json
```

```json
{
  "gameId": "1770105596269",
  "tableNo": 1,
  "roundNo": 45,
  "timestamp": "2026-02-11T14:30:00.000Z",
  "cards": {
    "player": [
      { "suit": "h", "rank": "A", "value": 1, "rfidCode": "45316" },
      { "suit": "h", "rank": "7", "value": 7, "rfidCode": "08964" },
      null
    ],
    "banker": [
      { "suit": "d", "rank": "2", "value": 2, "rfidCode": "11012" },
      { "suit": "c", "rank": "7", "value": 7, "rfidCode": "10244" },
      { "suit": "s", "rank": "9", "value": 9, "rfidCode": "57604" }
    ]
  },
  "result": {
    "playerScore": 8,
    "bankerScore": 8,
    "winner": "TIE",
    "isNatural": true,
    "totalCards": 4
  }
}
```

---

## 9. 確認事項（NEXUS9社への質問）

以下の点について、既存システムとの整合性を確認したい:

### 通信仕様

1. **認証レスポンス形式** — `{ecode: 0, data: {idx, token, table, ttype}}` で正しいか？
2. **WebSocket接続URL** — `ws://HOST/conn/{table}/{idx}/{token}` で正しいか？プロトコル `"echo-protocol"` は必須か？
3. **ハートビート** — クライアントから1秒間隔で `{"p":0,"c":{}}` を送信し、サーバーが `{"p":0}` で応答する、という理解で正しいか？
4. **betTime の単位** — `betTime * 10` が秒数になる（betTime=2 → 20秒）という理解で正しいか？
5. **winPos の値** — `1=Player, 2=Banker, 3=Tie` で正しいか？
6. **カード送信の card パラメータ** — RFIDの5桁コードをそのまま送るべきか？別形式が必要か？

### 運用

7. **認証情報** — `operator_001` / `6001` は本番環境でもそのまま使用して良いか？テーブルごとに認証情報は異なるか？
8. **複数テーブル対応** — 1つのNode.jsインスタンスで複数テーブルを扱う想定はあるか？
9. **dealer_v5 との併用** — 移行期間中、dealer_v5 と本システムを同時に同じテーブルに接続しても問題ないか？

### 映像配信・ツール

10. **SbWatcher.exe** — Setting-B.pdf に記載の画面キャプチャツールは SbWatcher.exe のことで正しいか？具体的な用途は？
11. **ストリーミングサーバー** — `sg2.pdwiki.net:/cagayan88` は現在も使用中か？テーブルごとにストリームキーが異なるか？
12. **OBS配信** — 本システム（ブラウザベース）に移行した場合、OBSのWindow captureの対象はブラウザウィンドウになるが、それで問題ないか？

### データ

13. **ゲームサーバー側にデータ保存はあるか？** — 本システムのSQLite保存は冗長か、それとも必要か？
14. **RFIDコードマッピング（CODE_MAP）の完全性** — `dealer_tools/js/roule.js` のマッピングに重複コードがある（例: S2とC3が同じ `19204`）が、これは意図的か？

---

## 10. 技術スタック

| レイヤー | 技術 |
|---|---|
| フロントエンド | HTML / CSS / Vanilla JS, Tailwind CSS (ローカルビルド) |
| バックエンド | Node.js, Express |
| データベース | SQLite (better-sqlite3) |
| リアルタイム通信 | WebSocket (ws ライブラリ) |
| HTTPクライアント | node-fetch |

**外部依存なし** — インターネット接続不要で動作（ゲームサーバーへのLAN接続のみ必要）

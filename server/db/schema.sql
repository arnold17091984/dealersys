CREATE TABLE IF NOT EXISTS games (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id TEXT NOT NULL,
    table_no INTEGER NOT NULL,
    round_no INTEGER,
    status TEXT DEFAULT 'active',
    started_at TEXT,
    ended_at TEXT,
    player_cards TEXT,
    banker_cards TEXT,
    player_score INTEGER,
    banker_score INTEGER,
    winner TEXT,
    is_natural INTEGER DEFAULT 0,
    forwarded INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS card_scans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id TEXT NOT NULL,
    position INTEGER NOT NULL,
    rfid_code TEXT,
    suit TEXT,
    rank TEXT,
    value INTEGER,
    scanned_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS forward_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id TEXT NOT NULL,
    payload TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    attempts INTEGER DEFAULT 0,
    error_message TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    sent_at TEXT
);

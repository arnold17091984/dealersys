const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const config = require('../config');

// Default RFID → card mappings (from dealer_v5 roule.js)
const DEFAULT_CARD_CODES = [
  // Spades
  { rfid_code: '24580', suit: 's', rank: 'A', value: 1 },
  { rfid_code: '19204', suit: 's', rank: '2', value: 2 },
  { rfid_code: '06404', suit: 's', rank: '3', value: 3 },
  { rfid_code: '14596', suit: 's', rank: '4', value: 4 },
  { rfid_code: '20228', suit: 's', rank: '5', value: 5 },
  { rfid_code: '19716', suit: 's', rank: '6', value: 6 },
  { rfid_code: '18436', suit: 's', rank: '7', value: 7 },
  { rfid_code: '06916', suit: 's', rank: '8', value: 8 },
  { rfid_code: '57604', suit: 's', rank: '9', value: 9 },
  { rfid_code: '27652', suit: 's', rank: '10', value: 0 },
  { rfid_code: '49924', suit: 's', rank: 'J', value: 0 },
  { rfid_code: '06660', suit: 's', rank: 'Q', value: 0 },
  { rfid_code: '15108', suit: 's', rank: 'K', value: 0 },
  // Diamonds
  { rfid_code: '19972', suit: 'd', rank: 'A', value: 1 },
  { rfid_code: '11012', suit: 'd', rank: '2', value: 2 },
  { rfid_code: '13316', suit: 'd', rank: '3', value: 3 },
  { rfid_code: '09220', suit: 'd', rank: '4', value: 4 },
  { rfid_code: '08452', suit: 'd', rank: '5', value: 5 },
  { rfid_code: '12548', suit: 'd', rank: '6', value: 6 },
  { rfid_code: '28164', suit: 'd', rank: '7', value: 7 },
  { rfid_code: '35076', suit: 'd', rank: '8', value: 8 },
  { rfid_code: '22788', suit: 'd', rank: '10', value: 0 },
  { rfid_code: '36356', suit: 'd', rank: 'J', value: 0 },
  { rfid_code: '37380', suit: 'd', rank: 'Q', value: 0 },
  { rfid_code: '20740', suit: 'd', rank: 'K', value: 0 },
  // Hearts
  { rfid_code: '45316', suit: 'h', rank: 'A', value: 1 },
  { rfid_code: '12804', suit: 'h', rank: '2', value: 2 },
  { rfid_code: '56324', suit: 'h', rank: '3', value: 3 },
  { rfid_code: '07172', suit: 'h', rank: '4', value: 4 },
  { rfid_code: '08196', suit: 'h', rank: '5', value: 5 },
  { rfid_code: '33540', suit: 'h', rank: '6', value: 6 },
  { rfid_code: '08964', suit: 'h', rank: '7', value: 7 },
  { rfid_code: '35844', suit: 'h', rank: '8', value: 8 },
  { rfid_code: '34564', suit: 'h', rank: '9', value: 9 },
  { rfid_code: '02308', suit: 'h', rank: '10', value: 0 },
  { rfid_code: '08708', suit: 'h', rank: 'J', value: 0 },
  { rfid_code: '13828', suit: 'h', rank: 'Q', value: 0 },
  { rfid_code: '46084', suit: 'h', rank: 'K', value: 0 },
  // Clubs
  { rfid_code: '44292', suit: 'c', rank: 'A', value: 1 },
  { rfid_code: '23300', suit: 'c', rank: '2', value: 2 },
  { rfid_code: '49156', suit: 'c', rank: '4', value: 4 },
  { rfid_code: '32772', suit: 'c', rank: '5', value: 5 },
  { rfid_code: '10244', suit: 'c', rank: '7', value: 7 },
  { rfid_code: '48132', suit: 'c', rank: '9', value: 9 },
  { rfid_code: '05636', suit: 'c', rank: 'J', value: 0 },
  { rfid_code: '15876', suit: 'c', rank: 'Q', value: 0 },
  { rfid_code: '23556', suit: 'c', rank: 'K', value: 0 },
];

let db;

function init() {
  const dbDir = path.dirname(config.dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  db = new Database(config.dbPath);
  db.pragma('journal_mode = WAL');

  const schema = fs.readFileSync(
    path.join(__dirname, '..', 'db', 'schema.sql'),
    'utf8'
  );
  db.exec(schema);

  seedCardCodes();

  return db;
}

// Seed card_codes table with defaults if empty
function seedCardCodes() {
  const count = db.prepare('SELECT COUNT(*) as count FROM card_codes').get().count;
  if (count > 0) return;

  const insert = db.prepare(
    'INSERT OR IGNORE INTO card_codes (rfid_code, suit, rank, value) VALUES (?, ?, ?, ?)'
  );
  const tx = db.transaction(() => {
    for (const c of DEFAULT_CARD_CODES) {
      insert.run(c.rfid_code, c.suit, c.rank, c.value);
    }
  });
  tx();
  console.log(`[DataStore] Seeded ${DEFAULT_CARD_CODES.length} card codes`);
}

function getDb() {
  if (!db) init();
  return db;
}

// Games
function createGame(gameId, tableNo) {
  const stmt = getDb().prepare(
    `INSERT INTO games (game_id, table_no, started_at) VALUES (?, ?, datetime('now'))`
  );
  return stmt.run(gameId, tableNo);
}

function updateGameResult(gameId, data) {
  const stmt = getDb().prepare(`
    UPDATE games SET
      round_no = ?,
      player_cards = ?,
      banker_cards = ?,
      player_score = ?,
      banker_score = ?,
      winner = ?,
      is_natural = ?,
      status = 'finished',
      ended_at = datetime('now')
    WHERE game_id = ?
  `);
  return stmt.run(
    data.roundNo,
    JSON.stringify(data.playerCards),
    JSON.stringify(data.bankerCards),
    data.playerScore,
    data.bankerScore,
    data.winner,
    data.isNatural ? 1 : 0,
    gameId
  );
}

function markForwarded(gameId) {
  const stmt = getDb().prepare(
    'UPDATE games SET forwarded = 1 WHERE game_id = ?'
  );
  return stmt.run(gameId);
}

function getRecentGames(limit = 20) {
  return getDb()
    .prepare('SELECT * FROM games ORDER BY created_at DESC LIMIT ?')
    .all(limit);
}

// Card scans
function saveCardScan(gameId, position, rfidCode, suit, rank, value) {
  const stmt = getDb().prepare(
    'INSERT INTO card_scans (game_id, position, rfid_code, suit, rank, value) VALUES (?, ?, ?, ?, ?, ?)'
  );
  return stmt.run(gameId, position, rfidCode, suit, rank, value);
}

function getCardScans(gameId) {
  return getDb()
    .prepare('SELECT * FROM card_scans WHERE game_id = ? ORDER BY position')
    .all(gameId);
}

// Forward queue
function enqueueForward(gameId, payload) {
  const stmt = getDb().prepare(
    'INSERT INTO forward_queue (game_id, payload) VALUES (?, ?)'
  );
  return stmt.run(gameId, JSON.stringify(payload));
}

function getPendingForwards(limit = 50) {
  return getDb()
    .prepare(
      "SELECT * FROM forward_queue WHERE status = 'pending' AND attempts < ? ORDER BY created_at ASC LIMIT ?"
    )
    .all(config.forwarding.maxRetries, limit);
}

function markForwardSent(id) {
  getDb()
    .prepare(
      "UPDATE forward_queue SET status = 'sent', sent_at = datetime('now') WHERE id = ?"
    )
    .run(id);
}

function markForwardFailed(id, error) {
  getDb()
    .prepare(
      "UPDATE forward_queue SET attempts = attempts + 1, error_message = ?, status = CASE WHEN attempts + 1 >= ? THEN 'failed' ELSE 'pending' END WHERE id = ?"
    )
    .run(error, config.forwarding.maxRetries, id);
}

function getForwardStats() {
  const db = getDb();
  return {
    pending: db
      .prepare("SELECT COUNT(*) as count FROM forward_queue WHERE status = 'pending'")
      .get().count,
    sent: db
      .prepare("SELECT COUNT(*) as count FROM forward_queue WHERE status = 'sent'")
      .get().count,
    failed: db
      .prepare("SELECT COUNT(*) as count FROM forward_queue WHERE status = 'failed'")
      .get().count,
    totalGames: db
      .prepare('SELECT COUNT(*) as count FROM games')
      .get().count,
  };
}

// Card codes CRUD
function getAllCardCodes() {
  return getDb().prepare('SELECT * FROM card_codes ORDER BY suit, rank').all();
}

function upsertCardCode(rfidCode, suit, rank, value, notes) {
  const stmt = getDb().prepare(`
    INSERT INTO card_codes (rfid_code, suit, rank, value, notes, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(rfid_code) DO UPDATE SET
      suit = excluded.suit,
      rank = excluded.rank,
      value = excluded.value,
      notes = excluded.notes,
      updated_at = datetime('now')
  `);
  return stmt.run(rfidCode, suit, rank, value, notes || null);
}

function deleteCardCode(rfidCode) {
  return getDb().prepare('DELETE FROM card_codes WHERE rfid_code = ?').run(rfidCode);
}

module.exports = {
  init,
  getDb,
  createGame,
  updateGameResult,
  markForwarded,
  getRecentGames,
  saveCardScan,
  getCardScans,
  enqueueForward,
  getPendingForwards,
  markForwardSent,
  markForwardFailed,
  getForwardStats,
  getAllCardCodes,
  upsertCardCode,
  deleteCardCode,
};

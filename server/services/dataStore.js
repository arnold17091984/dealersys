const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const { seed } = require('../db/seed');

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

  // Seed RFID codes and scan positions if tables are empty
  seed(db);

  return db;
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

// RFID codes
function getAllRfidCodes() {
  return getDb()
    .prepare('SELECT rfid_code, suit, rank, value, notes, updated_at FROM rfid_codes ORDER BY suit, rank')
    .all();
}

function upsertRfidCode(code, suit, rank, value, notes) {
  const stmt = getDb().prepare(`
    INSERT INTO rfid_codes (rfid_code, suit, rank, value, notes, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(rfid_code) DO UPDATE SET
      suit = excluded.suit,
      rank = excluded.rank,
      value = excluded.value,
      notes = excluded.notes,
      updated_at = datetime('now')
  `);
  return stmt.run(code, suit, rank, value, notes || null);
}

function deleteRfidCode(code) {
  return getDb()
    .prepare('DELETE FROM rfid_codes WHERE rfid_code = ?')
    .run(code);
}

// Scan positions
function getAllScanPositions() {
  return getDb()
    .prepare('SELECT scan_index, position_name, server_intposi, updated_at FROM scan_positions ORDER BY scan_index')
    .all();
}

function updateScanPosition(index, name, intposi) {
  const stmt = getDb().prepare(`
    UPDATE scan_positions SET
      position_name = ?,
      server_intposi = ?,
      updated_at = datetime('now')
    WHERE scan_index = ?
  `);
  return stmt.run(name, intposi, index);
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
  getAllRfidCodes,
  upsertRfidCode,
  deleteRfidCode,
  getAllScanPositions,
  updateScanPosition,
};

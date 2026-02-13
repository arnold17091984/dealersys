const express = require('express');
const router = express.Router();
const config = require('../config');
const gameServer = require('../services/gameServer');

// Passive mode: block game operation endpoints (only auth + table allowed)
const BLOCKED_IN_PASSIVE = ['/start', '/stop', '/card', '/finish', '/suffle', '/pause', '/restart', '/setlast'];

router.use((req, res, next) => {
  if (config.mode === 'passive' && BLOCKED_IN_PASSIVE.includes(req.path)) {
    return res.status(403).json({ error: 'Blocked in passive mode — game operations are disabled' });
  }
  next();
});

// POST /api/dealer/auth
router.post('/auth', async (req, res) => {
  try {
    const { id, key } = req.body;
    const result = await gameServer.auth(id, key);
    // Normalize response: always include token/idx at top level for frontend
    const token = gameServer.getToken();
    const idx = gameServer.getIdx();
    res.json({ ...result, token, idx });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/dealer/table
router.post('/table', async (req, res) => {
  try {
    const { table } = req.body;
    const result = await gameServer.getTable(table);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/dealer/start
router.post('/start', async (req, res) => {
  try {
    const { table } = req.body;
    const result = await gameServer.startGame(table);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/dealer/stop
router.post('/stop', async (req, res) => {
  try {
    const { table } = req.body;
    const result = await gameServer.stopBetting(table);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/dealer/card
router.post('/card', async (req, res) => {
  try {
    const { table, intPosi, cardIdx, card } = req.body;
    const result = await gameServer.sendCard(table, intPosi, cardIdx, card);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/dealer/finish
router.post('/finish', async (req, res) => {
  try {
    const { table } = req.body;
    const result = await gameServer.finishGame(table);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/dealer/suffle
router.post('/suffle', async (req, res) => {
  try {
    const { table } = req.body;
    const result = await gameServer.shuffle(table);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/dealer/setlast
router.post('/setlast', async (req, res) => {
  try {
    const { table } = req.body;
    const result = await gameServer.setLast(table);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/dealer/pause
router.post('/pause', async (req, res) => {
  try {
    const { table } = req.body;
    const result = await gameServer.pause(table);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/dealer/restart
router.post('/restart', async (req, res) => {
  try {
    const { table } = req.body;
    const result = await gameServer.restart(table);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const dataStore = require('../services/dataStore');

// GET /api/admin/rfid-codes — list all RFID code mappings
router.get('/rfid-codes', (req, res) => {
  try {
    const codes = dataStore.getAllRfidCodes();
    res.json(codes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/rfid-codes — add or update an RFID code mapping
router.post('/rfid-codes', (req, res) => {
  try {
    const { rfid_code, suit, rank, value } = req.body;
    if (!rfid_code || !suit || !rank || value === undefined) {
      return res.status(400).json({ error: 'Missing required fields: rfid_code, suit, rank, value' });
    }
    dataStore.upsertRfidCode(rfid_code, suit, rank, parseInt(value));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/admin/rfid-codes/:code — delete an RFID code mapping
router.delete('/rfid-codes/:code', (req, res) => {
  try {
    const result = dataStore.deleteRfidCode(req.params.code);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Code not found' });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/scan-positions — list all scan position mappings
router.get('/scan-positions', (req, res) => {
  try {
    const positions = dataStore.getAllScanPositions();
    res.json(positions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/admin/scan-positions/:index — update a scan position
router.put('/scan-positions/:index', (req, res) => {
  try {
    const index = parseInt(req.params.index);
    const { position_name, server_intposi } = req.body;
    if (!position_name || server_intposi === undefined) {
      return res.status(400).json({ error: 'Missing required fields: position_name, server_intposi' });
    }
    const result = dataStore.updateScanPosition(index, position_name, parseInt(server_intposi));
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Scan position not found' });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

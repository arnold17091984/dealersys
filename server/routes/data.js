const express = require('express');
const router = express.Router();
const dataStore = require('../services/dataStore');

// GET /api/data/games - Recent games
router.get('/games', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const games = dataStore.getRecentGames(limit);
    res.json(games);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/data/games/:gameId/cards - Card scans for a game
router.get('/games/:gameId/cards', (req, res) => {
  try {
    const cards = dataStore.getCardScans(req.params.gameId);
    res.json(cards);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/data/save-round - Save completed round data
router.post('/save-round', (req, res) => {
  try {
    const { gameId, tableNo, roundNo, timestamp, cards, result } = req.body;

    // Create game record
    dataStore.createGame(gameId, tableNo);

    // Update with result
    dataStore.updateGameResult(gameId, {
      roundNo,
      playerCards: cards.player,
      bankerCards: cards.banker,
      playerScore: result.playerScore,
      bankerScore: result.bankerScore,
      winner: result.winner,
      isNatural: result.isNatural,
    });

    // Save individual card scans
    const allCards = [
      ...cards.player.map((c, i) => ({ ...c, position: i + 1, side: 'player' })),
      ...cards.banker.map((c, i) => ({ ...c, position: i + 4, side: 'banker' })),
    ];
    for (const card of allCards) {
      if (card && card.suit) {
        dataStore.saveCardScan(gameId, card.position, card.rfidCode || '', card.suit, card.rank, card.value);
      }
    }

    // Enqueue for forwarding
    dataStore.enqueueForward(gameId, req.body);

    res.json({ success: true, gameId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/data/forward/status - Forward queue status
router.get('/forward/status', (req, res) => {
  try {
    const stats = dataStore.getForwardStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

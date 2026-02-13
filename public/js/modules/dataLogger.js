// Data Logger - Collects round data and sends to backend for storage/forwarding

const DataLogger = {
  currentGameId: null,
  cardScans: [],

  startRound(gameId) {
    this.currentGameId = gameId;
    this.cardScans = [];
  },

  logCardScan(position, card) {
    if (!this.currentGameId) return;

    this.cardScans.push({
      position,
      rfidCode: card.rfidCode || '',
      suit: card.suit,
      rank: card.rank,
      value: card.value,
    });
  },

  async finishRound(tableNo, roundNo, deck, result) {
    if (!this.currentGameId) {
      console.warn('[DataLogger] finishRound called with no active gameId — skipping');
      return;
    }

    // Build player/banker card arrays
    const playerCards = [
      deck[2] || null, // P-Left
      deck[0] || null, // P-Right
      result.playerDraws && deck[4] ? deck[4] : null, // P 3rd
    ];

    const bankerCards = [
      deck[3] || null, // B-Left
      deck[1] || null, // B-Right
      null, // B 3rd (determined below)
    ];

    // Determine banker 3rd card position
    if (result.bankerDraws) {
      if (result.playerDraws && deck[5]) {
        bankerCards[2] = deck[5]; // 6th card
      } else if (!result.playerDraws && deck[4]) {
        bankerCards[2] = deck[4]; // 5th card (banker-only draw)
      }
    }

    const payload = {
      gameId: this.currentGameId,
      tableNo,
      roundNo,
      timestamp: new Date().toISOString(),
      cards: {
        player: playerCards.map((c) =>
          c
            ? {
                suit: c.suit,
                rank: c.rank,
                value: c.value,
                rfidCode: c.rfidCode || '',
              }
            : null
        ),
        banker: bankerCards.map((c) =>
          c
            ? {
                suit: c.suit,
                rank: c.rank,
                value: c.value,
                rfidCode: c.rfidCode || '',
              }
            : null
        ),
      },
      result: {
        playerScore: result.playerScore,
        bankerScore: result.bankerScore,
        winner: result.winner,
        isNatural: result.isNatural,
        totalCards: result.totalCards,
      },
    };

    // Send to backend for storage and forwarding
    try {
      await fetch('/api/data/save-round', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      console.log('[DataLogger] Round saved:', this.currentGameId);
    } catch (err) {
      console.error('[DataLogger] Save failed:', err);
    }

    this.currentGameId = null;
    this.cardScans = [];
  },
};

window.DataLogger = DataLogger;

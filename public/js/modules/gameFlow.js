// Game Flow - State machine for the dealing process
// States: IDLE → BETTING → DEALING → RESULT → IDLE

const GameFlow = {
  // States
  IDLE: 'IDLE',
  BETTING: 'BETTING',
  DEALING: 'DEALING',
  RESULT: 'RESULT',

  state: 'IDLE',
  table: null,
  gameId: null,
  roundNo: null,
  shoeIdx: null,
  deck: [], // Scanned cards in order
  betTimer: 20, // Default bet time seconds

  // Callbacks
  onStateChange: null,
  onCardAdded: null,
  onRoundFinishing: null, // Fires synchronously at start of finishRound (before async saves)
  onResult: null,
  onError: null,

  init(table) {
    this.table = table;
    this.state = this.IDLE;
    this.deck = [];
  },

  getState() {
    return {
      state: this.state,
      table: this.table,
      gameId: this.gameId,
      roundNo: this.roundNo,
      deck: this.deck,
      cardsNeeded: this.deck.length < 4 ? 4 - this.deck.length : 0,
    };
  },

  // Start a new game round
  async startRound() {
    if (this.state !== this.IDLE) {
      console.warn('[GameFlow] Cannot start: state is', this.state);
      return false;
    }

    try {
      const result = await ServerComm.startGame(this.table);
      if (result && result.success !== false) {
        this.state = this.BETTING;
        this.gameId = result.gameId || Date.now().toString();
        this.roundNo = result.roundNo || null;
        this.deck = [];
        DataLogger.startRound(this.gameId);
        this.emitStateChange();
        return true;
      } else {
        this.emitError('Start game failed: ' + JSON.stringify(result));
        return false;
      }
    } catch (err) {
      this.emitError('Start game error: ' + err.message);
      return false;
    }
  },

  // Stop betting period
  async stopBetting() {
    if (this.state !== this.BETTING) {
      console.warn('[GameFlow] Cannot stop betting: state is', this.state);
      return false;
    }

    try {
      await ServerComm.stopBetting(this.table);
      this.state = this.DEALING;
      this.emitStateChange();
      return true;
    } catch (err) {
      this.emitError('Stop betting error: ' + err.message);
      return false;
    }
  },

  // Process a scanned RFID code
  // Cards can be scanned during BETTING (while timer runs) and DEALING states
  async processCard(code) {
    if (this.state !== this.DEALING && this.state !== this.BETTING) {
      console.warn('[GameFlow] Cannot process card: state is', this.state);
      return null;
    }

    const card = CardEngine.resolveCode(code);
    if (!card) {
      this.emitError('Invalid card code: ' + code);
      return null;
    }

    const position = this.deck.length;
    this.deck.push(card);

    // Log the scan
    DataLogger.logCardScan(position, card);

    // Send card to game server
    const serverPos = this.getServerPosition(position);
    if (serverPos > 0) {
      const cardIdx = this.getCardIndex(card);
      try {
        await ServerComm.sendCard(this.table, serverPos, cardIdx, code);
      } catch (err) {
        console.error('[GameFlow] Send card error:', err);
      }
    }

    if (this.onCardAdded) {
      this.onCardAdded(position, card);
    }

    // Check if we need more cards
    const required = CardEngine.getRequiredCards(this.deck);
    if (!required.needed && this.deck.length >= 4) {
      // Game complete
      await this.finishRound();
    }

    return card;
  },

  // Map scan position to server intPosi
  getServerPosition(scanIndex) {
    // Scan order: 0=P-Right, 1=B-Right, 2=P-Left, 3=B-Left
    // Server: 1=Player1, 2=Player2, 3=Player3, 4=Banker1, 5=Banker2, 6=Banker3
    const map = { 0: 2, 1: 5, 2: 1, 3: 4 };

    if (scanIndex < 4) return map[scanIndex];

    // 5th and 6th cards: determine owner dynamically
    const result = CardEngine.getSimulatedResult(this.deck.slice(0, scanIndex));
    if (scanIndex === 4) {
      // 5th card: player3 if player draws, else banker3
      return result.playerDraws ? 3 : 6;
    }
    if (scanIndex === 5) {
      // 6th card: always banker3
      return 6;
    }
    return 0;
  },

  getCardIndex(card) {
    const suits = ['s', 'h', 'd', 'c'];
    const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    const suitIdx = suits.indexOf(card.suit);
    const rankIdx = ranks.indexOf(card.rank);
    if (suitIdx === -1 || rankIdx === -1) return 0;
    return suitIdx * 13 + rankIdx;
  },

  // Finish the round and calculate result
  async finishRound() {
    const result = CardEngine.getSimulatedResult(this.deck);
    this.state = this.RESULT;

    // Notify synchronously before async operations (for duplicate-save prevention)
    if (this.onRoundFinishing) {
      this.onRoundFinishing(result);
    }

    try {
      await ServerComm.finishGame(this.table);
    } catch (err) {
      console.error('[GameFlow] Finish error:', err);
    }

    // Save data
    await DataLogger.finishRound(this.table, this.roundNo, this.deck, result);

    if (this.onResult) {
      this.onResult(result);
    }

    this.emitStateChange();
    return result;
  },

  // Reset to idle for next round
  nextRound() {
    this.state = this.IDLE;
    this.gameId = null;
    this.deck = [];
    this.emitStateChange();
  },

  // Shuffle
  async shuffle() {
    try {
      await ServerComm.shuffle(this.table);
      return true;
    } catch (err) {
      this.emitError('Shuffle error: ' + err.message);
      return false;
    }
  },

  // Set last game
  async setLast() {
    try {
      await ServerComm.setLast(this.table);
      return true;
    } catch (err) {
      this.emitError('Set last error: ' + err.message);
      return false;
    }
  },

  // Pause
  async pauseGame() {
    try {
      await ServerComm.pause(this.table);
      return true;
    } catch (err) {
      this.emitError('Pause error: ' + err.message);
      return false;
    }
  },

  // Restart
  async restartGame() {
    try {
      await ServerComm.restart(this.table);
      return true;
    } catch (err) {
      this.emitError('Restart error: ' + err.message);
      return false;
    }
  },

  emitStateChange() {
    if (this.onStateChange) this.onStateChange(this.state);
  },

  emitError(msg) {
    console.error('[GameFlow]', msg);
    if (this.onError) this.onError(msg);
  },
};

window.GameFlow = GameFlow;

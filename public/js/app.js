// Main Application Controller
// Orchestrates all modules: GameFlow, RfidInput, WsClient, TimerDisplay, DataLogger

const App = {
  els: {},
  table: 1,
  mode: 'active', // 'active' | 'passive'
  authenticated: false,
  lastResult: null,
  roundSaved: false, // prevent duplicate saves

  async init() {
    this.cacheElements();
    this.setupGameFlow();
    this.setupRfidInput();
    this.setupTimerDisplay();
    this.setupWsHandlers();
    this.bindButtons();

    // Auto-authenticate
    await this.authenticate();
  },

  cacheElements() {
    this.els = {
      // Status
      statusMsg: document.getElementById('status-message'),
      connectionStatus: document.getElementById('connection-status'),
      connectionDot: document.getElementById('connection-dot'),
      gameState: document.getElementById('game-state'),
      rfidIndicator: document.getElementById('rfid-indicator'),

      // Cards
      cards: {
        p1: document.getElementById('p1'),
        p2: document.getElementById('p2'),
        b1: document.getElementById('b1'),
        b2: document.getElementById('b2'),
        extra1: document.getElementById('extra1'),
        extra2: document.getElementById('extra2'),
      },

      // Scores
      pScore: document.getElementById('p-score'),
      bScore: document.getElementById('b-score'),
      pTitle: document.getElementById('player-title'),
      bTitle: document.getElementById('banker-title'),

      // Timer
      timerValue: document.getElementById('timer-value'),
      timerBar: document.getElementById('timer-bar'),
      timerContainer: document.getElementById('timer-container'),

      // Controls
      btnStart: document.getElementById('btn-start'),
      btnStop: document.getElementById('btn-stop'),
      btnResult: document.getElementById('btn-result'),
      btnNext: document.getElementById('btn-next'),
      btnShuffle: document.getElementById('btn-shuffle'),
      btnPause: document.getElementById('btn-pause'),
      btnLast: document.getElementById('btn-last'),

      // Result overlay
      resultOverlay: document.getElementById('result-overlay'),
      resultText: document.getElementById('result-text'),

      // Suggestion
      suggestionBox: document.getElementById('suggestion-box'),
      suggestionContent: document.getElementById('suggestion-content'),
    };
  },

  setupGameFlow() {
    GameFlow.init(this.table);

    GameFlow.onStateChange = (state) => {
      this.updateUI();
      this.updateButtons(state);

      // Timer display is managed by handleAutoFlow, only handle manual startRound here
      if (state === GameFlow.BETTING && !TimerDisplay.isRunning()) {
        TimerDisplay.start(GameFlow.betTimer);
      } else if (state !== GameFlow.BETTING) {
        TimerDisplay.hide();
      }
    };

    GameFlow.onCardAdded = (position, card) => {
      this.renderCards();
      this.updateScores();
      const posName = CardEngine.POSITION_NAMES[position] || `Card ${position + 1}`;
      this.setStatus(`${posName}: ${CardEngine.SUITS[card.suit].symbol}${card.rank}`, 'info');
    };

    // Set roundSaved synchronously when finishRound starts (before async DataLogger call)
    // This prevents E2 arriving mid-finishRound from triggering a duplicate save
    GameFlow.onRoundFinishing = () => {
      this.roundSaved = true;
    };

    GameFlow.onResult = (result) => {
      this.lastResult = result;
      this.renderCards();
      this.updateScores();
      this.showResult(result);
      this.showSuggestion(result);
    };

    GameFlow.onError = (msg) => {
      this.setStatus(msg, 'error');
    };
  },

  setupRfidInput() {
    RfidInput.init((code) => {
      if (this.mode === 'passive') return; // Passive mode: no RFID processing
      if (GameFlow.state === GameFlow.DEALING || GameFlow.state === GameFlow.BETTING) {
        GameFlow.processCard(code);
      } else {
        this.setStatus(`Scan received (${code}) - not in dealing/betting mode`, 'warn');
      }
    });
  },

  setupTimerDisplay() {
    TimerDisplay.init(this.els.timerValue, this.els.timerBar);
    TimerDisplay.onExpired = () => {
      // Auto-stop betting when timer expires (active mode only)
      if (this.mode === 'active' && GameFlow.state === GameFlow.BETTING) {
        GameFlow.stopBetting();
      }
    };
  },

  setupWsHandlers() {
    WsClient.on('bridge_status', (status) => {
      if (this.els.connectionStatus) {
        this.els.connectionStatus.textContent = status === 'connected' ? 'connected' : 'disconnected';
      }
      if (this.els.connectionDot) {
        this.els.connectionDot.className = status === 'connected'
          ? 'status-dot status-dot--ok'
          : 'status-dot status-dot--off';
      }
    });

    WsClient.on('table_info', (data) => {
      console.log('[App] Table info:', data);
      if (!data) return;
      // p:1 payload: tableNo, gameStatus, gameRound, gameIdx, betTime, intposi, cardIdx, limit1-3, ucnt, etc.
      if (data.betTime) {
        GameFlow.betTimer = data.betTime * 10; // betTime is in 10s units, convert to seconds
      }
      if (data.gameRound) {
        GameFlow.roundNo = data.gameRound;
      }
      if (data.gameIdx) {
        GameFlow.shoeIdx = data.gameIdx;
      }
      // If we join mid-game, sync to current status
      if (data.gameStatus) {
        this.handleAutoFlow(data.gameStatus, data);
      }
    });

    WsClient.on('status_update', (data) => {
      console.log('[App] Status update:', data);
      // p:2 payload: gameStatus, gameRound, gameIdx, betTime, winPos, playerCard, bankerCard, etc.
      if (data && data.gameStatus) {
        this.handleAutoFlow(data.gameStatus, data);
      }
    });

    WsClient.on('card_data', (data) => {
      console.log('[App] Card data from WS:', data);
      if (!data) return;
      // p:3 payload: {intposi, cardIdx, playerCard, bankerCard, bEndCheck, gameStatus}
      this.handleServerCardData(data);
    });

    WsClient.on('heartbeat_timeout', () => {
      this.setStatus('Server connection lost — no heartbeat response', 'error');
    });
  },

  bindButtons() {
    this.els.btnStart?.addEventListener('click', () => this.handleStart());
    this.els.btnStop?.addEventListener('click', () => this.handleStop());
    this.els.btnResult?.addEventListener('click', () => this.handleFinish());
    this.els.btnNext?.addEventListener('click', () => this.handleNext());
    this.els.btnShuffle?.addEventListener('click', () => this.handleShuffle());
    this.els.btnPause?.addEventListener('click', () => this.handlePause());
    this.els.btnLast?.addEventListener('click', () => this.handleLast());

    // Keyboard shortcuts
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        if (GameFlow.state === GameFlow.RESULT) {
          this.handleNext();
        }
      }
    });
  },

  // --- Virtual Keypad ---

  triggerKey(key) {
    // Blur any focused button to prevent double-fire
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    if (key === 'Space') {
      // Space = reset/next depending on state
      if (GameFlow.state === GameFlow.RESULT) {
        this.handleNext();
      }
      return;
    }

    // Suit keys: d, s, c, h
    if (['d', 's', 'c', 'h'].includes(key)) {
      this.pendingSuit = key;
      this.manualCodeBuffer = '';
      const sInfo = CardEngine.SUITS[key];
      this.setStatus(`Suit: ${sInfo.symbol} — enter rank`, 'info');
      return;
    }

    // Number keys: build code or resolve suit+rank
    if (key >= '0' && key <= '9') {
      // If a suit is pending, resolve as manual suit+rank
      if (this.pendingSuit) {
        const value = parseInt(key);
        const rank = value === 0 ? '10' : value.toString();
        const scoreVal = value === 0 ? 0 : value;
        const card = { suit: this.pendingSuit, rank, value: scoreVal, rfidCode: '' };
        this.pendingSuit = null;
        this.manualCodeBuffer = '';
        this.processManualCard(card);
        return;
      }

      // Otherwise accumulate 5-digit RFID code
      if (!this.manualCodeBuffer) this.manualCodeBuffer = '';
      if (this.manualCodeBuffer.length >= 5) {
        this.manualCodeBuffer = key;
      } else {
        this.manualCodeBuffer += key;
      }

      const dots = '\u25CF'.repeat(this.manualCodeBuffer.length) + '\u25CB'.repeat(5 - this.manualCodeBuffer.length);
      this.setStatus(`Code: ${dots}`, 'info');

      if (this.manualCodeBuffer.length === 5) {
        const code = this.manualCodeBuffer;
        this.manualCodeBuffer = '';
        const card = CardEngine.resolveCode(code);
        if (card) {
          this.processManualCard(card);
        } else {
          this.setStatus(`Invalid code: ${code}`, 'error');
        }
      }
    }
  },

  processManualCard(card) {
    if (GameFlow.state === GameFlow.DEALING || GameFlow.state === GameFlow.BETTING) {
      // In dealing or betting mode, add to game flow
      GameFlow.deck.push(card);
      DataLogger.logCardScan(GameFlow.deck.length - 1, card);
      this.renderCards();
      this.updateScores();
      const pos = GameFlow.deck.length - 1;
      const posName = CardEngine.POSITION_NAMES[pos] || `Card ${pos + 1}`;
      this.setStatus(`${posName}: ${CardEngine.SUITS[card.suit].symbol}${card.rank}`, 'info');

      // Check if round is complete
      const required = CardEngine.getRequiredCards(GameFlow.deck);
      if (!required.needed && GameFlow.deck.length >= 4) {
        GameFlow.finishRound();
      }
    } else {
      this.setStatus(`Card scanned — not in dealing/betting mode`, 'warn');
    }
  },

  toggleKeypad() {
    const kp = document.getElementById('virtual-keypad');
    if (kp) kp.classList.toggle('hidden');
  },

  pendingSuit: null,
  manualCodeBuffer: '',

  // --- Actions ---

  async authenticate() {
    this.setStatus('Loading config...', 'info');
    try {
      // Fetch dealer credentials and table from server config
      const cfg = await ServerComm.getConfig();
      if (cfg && cfg.dealer) {
        this.table = cfg.table || 1;
        this.mode = cfg.mode || 'active';

        // Load RFID codes and scan positions from DB before initializing game flow
        try {
          await CardEngine.loadCodes();
          await CardEngine.loadPositions();
        } catch (loadErr) {
          this.setStatus('Failed to load card data: ' + loadErr.message, 'error');
          return;
        }

        GameFlow.init(this.table);

        this.setStatus('Authenticating...', 'info');
        const result = await ServerComm.auth(cfg.dealer.id, cfg.dealer.key);
        if (result && (result.token || result.success !== false)) {
          this.authenticated = true;

          // Apply mode-specific UI
          if (this.mode === 'passive') {
            this.applyPassiveMode();
            this.setStatus('Monitor Mode — Watching game data', 'info');
          } else {
            this.setStatus('Authenticated. Ready.', 'success');
          }

          // Connect WebSocket (both modes)
          WsClient.connect(this.table);
          // Get table info
          const tableInfo = await ServerComm.getTable(this.table);
          console.log('[App] Table info:', tableInfo);
          if (this.mode === 'active') {
            this.updateButtons(GameFlow.IDLE);
          }
        } else {
          this.setStatus('Authentication failed: ' + JSON.stringify(result), 'error');
        }
      } else {
        this.setStatus('Failed to load config', 'error');
      }
    } catch (err) {
      this.setStatus('Auth error: ' + err.message, 'error');
    }
  },

  applyPassiveMode() {
    // Hide dealer control buttons
    const controls = document.getElementById('dealer-controls');
    if (controls) controls.classList.add('hidden');

    // Hide virtual keypad and FAB toggle
    const keypad = document.getElementById('virtual-keypad');
    if (keypad) keypad.classList.add('hidden');
    const fab = document.querySelector('.fab-btn');
    if (fab) fab.classList.add('hidden');

    // Disable RFID input
    RfidInput.setEnabled(false);

    console.log('[App] Passive mode enabled — controls hidden, RFID disabled');
  },

  // Auto-flow: react to server-pushed status changes
  // gameStatus values: "S"=Shuffle, "B"=Betting, "D"=Dealing, "E2"=Result, "T"=Maintenance, "P"=Pause
  handleAutoFlow(gameStatus, data) {
    console.log('[App] Auto-flow:', gameStatus, data);

    switch (gameStatus) {
      case 'S':
        // Shuffle — reset board, wait for next round
        this.clearBoard();
        GameFlow.state = GameFlow.IDLE;
        GameFlow.deck = [];
        GameFlow.emitStateChange();
        this.setStatus(this.mode === 'passive' ? 'Monitor Mode — Shuffle' : 'Shuffle', 'info');
        break;

      case 'B': {
        // Betting — server started a round, begin bet timer
        if (GameFlow.state === GameFlow.IDLE || GameFlow.state === GameFlow.RESULT) {
          this.clearBoard();
        }
        GameFlow.state = GameFlow.BETTING;
        GameFlow.gameId = Date.now().toString();
        GameFlow.deck = [];
        GameFlow.cardBuffer = [];
        this.roundSaved = false;
        if (data.gameRound) GameFlow.roundNo = data.gameRound;
        if (data.gameIdx) GameFlow.shoeIdx = data.gameIdx;
        DataLogger.startRound(GameFlow.gameId);
        GameFlow.emitStateChange();

        // Start bet timer (betTime is in 10s units)
        if (data.betTime) {
          const seconds = data.betTime * 10;
          GameFlow.betTimer = seconds;
          TimerDisplay.start(seconds);
        }

        // Active mode: enable RFID during betting (cards can be scanned while timer runs)
        if (this.mode === 'active') {
          RfidInput.setEnabled(true);
          this.setStatus('Betting time — Scan cards', 'betting');
        } else {
          this.setStatus('Monitor Mode — Betting', 'betting');
        }
        break;
      }

      case 'D':
        // Dealing — betting ended
        TimerDisplay.hide();
        if (GameFlow.state === GameFlow.BETTING || GameFlow.state === GameFlow.IDLE) {
          GameFlow.state = GameFlow.DEALING;
          GameFlow.emitStateChange();
          // Flush any cards buffered during betting (fire-and-forget)
          GameFlow.flushCardBuffer();
          if (this.mode === 'active') {
            // RFID already enabled from BETTING, just update status
            this.setStatus('No more bets — Scan cards', 'dealing');
          } else {
            this.setStatus('Monitor Mode — Dealing', 'dealing');
          }
        }
        break;

      case 'E2': {
        // Result — game ended, show result from server data
        TimerDisplay.hide();
        RfidInput.setEnabled(false);

        // If already in RESULT state (e.g. auto card-complete already triggered), skip
        if (GameFlow.state === GameFlow.RESULT && this.roundSaved) {
          console.log('[App] E2 received but round already completed — skipping');
          break;
        }

        // Parse server card data for display (both modes)
        const serverCards = this.parseE2Cards(data);

        // If we have local cards (active mode RFID scan), use local result
        if (this.mode === 'active' && GameFlow.deck.length >= 4) {
          // Use local calculation but still auto-save
          const localResult = CardEngine.getSimulatedResult(GameFlow.deck);
          GameFlow.state = GameFlow.RESULT;
          GameFlow.emitStateChange();
          this.lastResult = localResult;
          this.renderCards();
          this.updateScores();
          this.showResult(localResult);
          this.showSuggestion(localResult);

          // Auto-save (prevent duplicates)
          if (!this.roundSaved) {
            this.roundSaved = true;
            DataLogger.finishRound(this.table, GameFlow.roundNo, GameFlow.deck, localResult);
          }
        } else {
          // Use server-provided result data (passive mode, or active with no local cards)
          const winMap = { 1: 'PLAYER', 2: 'BANKER', 3: 'TIE' };
          const winner = winMap[data.winPos] || 'UNKNOWN';
          GameFlow.state = GameFlow.RESULT;
          GameFlow.emitStateChange();

          // If server cards available, populate board
          if (serverCards && serverCards.length > 0) {
            GameFlow.deck = serverCards;
            this.renderCards();
            this.updateScores();
          }

          const resultText = winner === 'TIE'
            ? `TIE — Round ${data.gameRound || ''}`
            : `${winner} WIN — Round ${data.gameRound || ''}`;
          const statusSuffix = this.mode === 'passive' ? '' : ' — Press SPACE for next round';
          this.setStatus(resultText + statusSuffix, 'success');

          if (this.els.resultOverlay) {
            this.els.resultText.textContent = resultText;
            this.els.resultText.className = '';
            if (winner === 'BANKER') this.els.resultText.classList.add('result--banker');
            else if (winner === 'PLAYER') this.els.resultText.classList.add('result--player');
            else this.els.resultText.classList.add('result--tie');
            this.els.resultOverlay.classList.remove('hidden');
            setTimeout(() => this.els.resultOverlay.classList.add('hidden'), 3000);
          }

          // Auto-save with server data (both modes)
          if (!this.roundSaved && serverCards && serverCards.length >= 4) {
            this.roundSaved = true;
            const serverResult = CardEngine.getSimulatedResult(serverCards);
            DataLogger.finishRound(this.table, data.gameRound || GameFlow.roundNo, serverCards, serverResult);
          }
        }
        break;
      }

      case 'T':
        // Maintenance
        this.setStatus(this.mode === 'passive' ? 'Monitor Mode — Maintenance' : 'Table under maintenance', 'warn');
        break;

      case 'P':
        // Pause
        this.setStatus(this.mode === 'passive' ? 'Monitor Mode — Paused' : 'Game paused', 'warn');
        break;
    }
  },

  // Parse card data from E2 (result) status message
  parseE2Cards(data) {
    if (!data.playerCard && !data.bankerCard) return null;

    const playerCards = CardEngine.parseServerCards(data.playerCard || '');
    const bankerCards = CardEngine.parseServerCards(data.bankerCard || '');

    if (playerCards.length < 2 || bankerCards.length < 2) return null;

    // Reconstruct deck in scan order: [P-Right, B-Right, P-Left, B-Left, 5th, 6th]
    const deck = [];
    deck[0] = playerCards[1]; // P-Right = Player2
    deck[1] = bankerCards[1]; // B-Right = Banker2
    deck[2] = playerCards[0]; // P-Left = Player1
    deck[3] = bankerCards[0]; // B-Left = Banker1
    if (playerCards.length >= 3) deck[4] = playerCards[2]; // 5th = Player3
    if (bankerCards.length >= 3) {
      if (playerCards.length >= 3) {
        deck[5] = bankerCards[2]; // 6th = Banker3
      } else {
        deck[4] = bankerCards[2]; // 5th = Banker3 (no player 3rd)
      }
    }

    // Remove undefined entries
    return deck.filter(c => c != null);
  },

  // Handle p:3 card data from game server
  // Uses intposi for incremental card placement (1 card at a time)
  handleServerCardData(data) {
    // In active mode: only use if we have no local RFID-scanned cards (mid-game join)
    if (this.mode === 'active' && GameFlow.deck.length > 0) {
      if (data.intposi != null) {
        console.log(`[App] Server card position: intposi=${data.intposi}, cardIdx=${data.cardIdx}`);
      }
      return;
    }

    // Parse the latest card from the cumulative strings using intposi
    const intposi = parseInt(data.intposi);
    if (!intposi || intposi < 1 || intposi > 6) {
      // No valid intposi — try full deck reconstruction (mid-game join)
      this.reconstructFullDeck(data);
      return;
    }

    // Map server intPosi to scan-order deck index
    // intPosi: 1=P-Left, 2=P-Right, 3=P3, 4=B-Left, 5=B-Right, 6=B3
    // Scan order: [0]=P-Right, [1]=B-Right, [2]=P-Left, [3]=B-Left, [4]=5th, [5]=6th
    const posiToScanIdx = { 2: 0, 5: 1, 1: 2, 4: 3, 3: 4, 6: 5 };
    const scanIdx = posiToScanIdx[intposi];
    if (scanIdx === undefined) return;

    // Extract the card at this position from cumulative strings
    const playerCards = CardEngine.parseServerCards(data.playerCard || '');
    const bankerCards = CardEngine.parseServerCards(data.bankerCard || '');

    let card = null;
    if (intposi <= 3 && playerCards.length > 0) {
      // Player card: intposi 1=index0, 2=index1, 3=index2
      card = playerCards[intposi - 1];
    } else if (intposi >= 4 && bankerCards.length > 0) {
      // Banker card: intposi 4=index0, 5=index1, 6=index2
      card = bankerCards[intposi - 4];
    }

    if (!card) return;

    // Ensure deck array is large enough and place card at correct scan position
    while (GameFlow.deck.length <= scanIdx) {
      GameFlow.deck.push(null);
    }
    GameFlow.deck[scanIdx] = card;

    // Log scan
    DataLogger.logCardScan(scanIdx, card);

    this.renderCards();
    this.updateScores();

    const posName = CardEngine.POSITION_NAMES[scanIdx] || `Card ${scanIdx + 1}`;
    const modePrefix = this.mode === 'passive' ? 'Monitor Mode — ' : '';
    this.setStatus(`${modePrefix}${posName}: ${CardEngine.SUITS[card.suit].symbol}${card.rank}`, 'dealing');
  },

  // Full deck reconstruction from cumulative card strings (for mid-game join)
  reconstructFullDeck(data) {
    const playerCards = CardEngine.parseServerCards(data.playerCard || '');
    const bankerCards = CardEngine.parseServerCards(data.bankerCard || '');

    const deck = [];
    if (playerCards.length >= 2) deck[0] = playerCards[1]; // P-Right
    if (bankerCards.length >= 2) deck[1] = bankerCards[1]; // B-Right
    if (playerCards.length >= 1) deck[2] = playerCards[0]; // P-Left
    if (bankerCards.length >= 1) deck[3] = bankerCards[0]; // B-Left
    if (playerCards.length >= 3) deck[4] = playerCards[2]; // Player 3rd
    if (bankerCards.length >= 3) {
      if (playerCards.length >= 3) {
        deck[5] = bankerCards[2]; // Banker 3rd (6th card)
      } else {
        deck[4] = bankerCards[2]; // Banker 3rd (5th card)
      }
    }

    const filledDeck = deck.filter(c => c != null);
    if (filledDeck.length > 0) {
      GameFlow.deck = filledDeck;
      this.renderCards();
      this.updateScores();
      const modePrefix = this.mode === 'passive' ? 'Monitor Mode — ' : '';
      this.setStatus(`${modePrefix}${filledDeck.length} cards received`, 'info');
    }
  },

  async handleStart() {
    if (!this.authenticated) {
      this.setStatus('Not authenticated', 'error');
      return;
    }
    this.clearBoard();
    this.roundSaved = false;
    const ok = await GameFlow.startRound();
    if (ok) {
      this.setStatus('BETTING TIME — Scan cards!', 'betting');
      RfidInput.setEnabled(true);
    }
  },

  async handleStop() {
    const ok = await GameFlow.stopBetting();
    if (ok) {
      this.setStatus('NO MORE BETS — Scan cards', 'dealing');
      // RFID already enabled from BETTING state
    }
  },

  async handleFinish() {
    if (GameFlow.state === GameFlow.DEALING && GameFlow.deck.length >= 4) {
      await GameFlow.finishRound();
    }
  },

  handleNext() {
    this.hideResult();
    this.clearBoard();
    this.roundSaved = false;
    GameFlow.nextRound();
    this.setStatus('Ready for next round', 'info');
  },

  async handleShuffle() {
    await GameFlow.shuffle();
    this.setStatus('Shuffle signal sent', 'info');
  },

  async handlePause() {
    if (this.els.btnPause.dataset.paused === 'true') {
      await GameFlow.restartGame();
      this.els.btnPause.textContent = 'Pause';
      this.els.btnPause.dataset.paused = 'false';
      this.setStatus('Game resumed', 'info');
    } else {
      await GameFlow.pauseGame();
      this.els.btnPause.textContent = 'Resume';
      this.els.btnPause.dataset.paused = 'true';
      this.setStatus('Game paused', 'warn');
    }
  },

  async handleLast() {
    await GameFlow.setLast();
    this.setStatus('Last game set', 'warn');
  },

  // --- UI Updates ---

  setStatus(text, type = 'info') {
    if (!this.els.statusMsg) return;
    const colors = {
      info: 'text-yellow-200',
      success: 'text-green-400',
      error: 'text-red-400',
      warn: 'text-orange-400',
      betting: 'text-yellow-400',
      dealing: 'text-cyan-400',
    };
    this.els.statusMsg.className = `text-center mb-5 md:mb-7 ${colors[type] || colors.info}`;
    this.els.statusMsg.textContent = text;
  },

  updateUI() {
    if (this.els.gameState) {
      this.els.gameState.textContent = GameFlow.state.toLowerCase();
    }
  },

  updateButtons(state) {
    // In passive mode, all controls are hidden
    if (this.mode === 'passive') return;

    const show = (el) => el && el.classList.remove('hidden');
    const hide = (el) => el && el.classList.add('hidden');
    const enable = (el) => el && (el.disabled = false);
    const disable = (el) => el && (el.disabled = true);

    // Hide all first
    [this.els.btnStart, this.els.btnStop, this.els.btnResult, this.els.btnNext].forEach(hide);

    switch (state) {
      case GameFlow.IDLE:
        show(this.els.btnStart);
        enable(this.els.btnStart);
        break;
      case GameFlow.BETTING:
        show(this.els.btnStop);
        enable(this.els.btnStop);
        break;
      case GameFlow.DEALING:
        show(this.els.btnResult);
        enable(this.els.btnResult);
        break;
      case GameFlow.RESULT:
        show(this.els.btnNext);
        enable(this.els.btnNext);
        break;
    }
  },

  renderCards() {
    const state = {
      editingIndex: null,
      suggestionIndex: null,
      usedCount: GameFlow.deck.filter(c => c != null).length,
      gameOver: GameFlow.state === GameFlow.RESULT,
      onEdit: null,
    };

    // Compute used count from result
    if (this.lastResult && GameFlow.state === GameFlow.RESULT) {
      state.usedCount = this.lastResult.totalCards;
    }

    CardRenderer.renderBoard(this.els.cards, GameFlow.deck, state);
  },

  updateScores() {
    const deck = GameFlow.deck;
    // Count non-null cards (deck may be sparse with null entries)
    const cardCount = deck.filter(c => c != null).length;

    if (cardCount < 2) {
      this.els.pScore.textContent = '-';
      this.els.bScore.textContent = '-';
      return;
    }

    if (cardCount >= 4 && deck[0] && deck[1] && deck[2] && deck[3]) {
      const result = CardEngine.getSimulatedResult(deck);
      this.els.pScore.textContent = result.playerScore;
      this.els.bScore.textContent = result.bankerScore;
    } else {
      // Partial scores from whatever cards are available
      const p = deck[0] ? deck[0].value : 0;
      const b = deck[1] ? deck[1].value : 0;
      this.els.pScore.textContent = deck[0] ? p : '-';
      this.els.bScore.textContent = deck[1] ? b : '-';
    }
  },

  showResult(result) {
    // Highlight winner title
    this.resetTitles();
    if (result.winner === 'PLAYER') {
      this.els.pTitle.classList.add('side-title--winner');
    } else if (result.winner === 'BANKER') {
      this.els.bTitle.classList.add('side-title--winner');
    }

    // Show result overlay
    const winText = result.winner === 'TIE'
      ? `TIE (P:${result.playerScore} vs B:${result.bankerScore})`
      : `${result.winner} WIN${result.isNatural ? ' (Natural)' : ''} (P:${result.playerScore} vs B:${result.bankerScore})`;

    this.setStatus(winText + ' — Press SPACE for next round', 'success');

    if (this.els.resultOverlay) {
      this.els.resultText.textContent = winText;
      this.els.resultText.className = '';
      if (result.winner === 'BANKER') this.els.resultText.classList.add('result--banker');
      else if (result.winner === 'PLAYER') this.els.resultText.classList.add('result--player');
      else this.els.resultText.classList.add('result--tie');
      this.els.resultOverlay.classList.remove('hidden');
      setTimeout(() => this.els.resultOverlay.classList.add('hidden'), 3000);
    }
  },

  showSuggestion(result) {
    if (!this.els.suggestionBox) return;

    let suggestion = null;
    if (result.winner === 'PLAYER') {
      suggestion = CardEngine.findWinScenario(GameFlow.deck, 'BANKER');
    } else if (result.winner === 'BANKER') {
      suggestion = CardEngine.findWinScenario(GameFlow.deck, 'PLAYER');
    } else {
      suggestion = CardEngine.findWinScenario(GameFlow.deck, 'BANKER');
    }

    if (suggestion) {
      this.els.suggestionContent.innerHTML = `
        <div class="score-box" style="line-height:1">${suggestion.newRank}</div>
      `;
      this.els.suggestionBox.classList.remove('hidden');
    } else {
      this.els.suggestionBox.classList.add('hidden');
    }
  },

  hideResult() {
    if (this.els.resultOverlay) {
      this.els.resultOverlay.classList.add('hidden');
    }
    if (this.els.suggestionBox) {
      this.els.suggestionBox.classList.add('hidden');
    }
    this.lastResult = null;
  },

  clearBoard() {
    Object.values(this.els.cards).forEach((el) => {
      if (el) {
        el.innerHTML = '';
        el.className = 'card opacity-0';
        el.onclick = null;
      }
    });
    this.els.pScore.textContent = '-';
    this.els.bScore.textContent = '-';
    this.resetTitles();
    this.hideResult();
  },

  resetTitles() {
    if (this.els.pTitle) {
      this.els.pTitle.className = 'side-title side-title--player';
      this.els.pTitle.textContent = 'Player';
    }
    if (this.els.bTitle) {
      this.els.bTitle.className = 'side-title side-title--banker';
      this.els.bTitle.textContent = 'Banker';
    }
  },
};

// Boot
window.addEventListener('load', () => App.init());

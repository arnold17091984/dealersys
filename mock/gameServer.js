// Mock Game Server — simulates the NEXUS9 game server for testing
// Provides: HTTP API (/dealer/*) + WebSocket (/conn/{table}/{idx}/{token})
//
// Usage:
//   node mock/gameServer.js                  # Interactive (wait for dealer commands)
//   node mock/gameServer.js --auto           # Auto-play mode (runs games automatically)
//   node mock/gameServer.js --auto --fast    # Fast auto-play (3s bet time)

const http = require('http');
const { URL } = require('url');
const { WebSocketServer, WebSocket } = require('ws');
const querystring = require('querystring');

const PORT = 4000;
const AUTO_MODE = process.argv.includes('--auto');
const FAST_MODE = process.argv.includes('--fast');

// --- State ---
const state = {
  gameStatus: 'S',   // S, B, D, E2, T, P
  gameRound: 0,
  gameIdx: 1,
  betTime: FAST_MODE ? 1 : 2,  // in 10s units (1=10s, 2=20s)
  winPos: 0,
  playerCards: [],    // [{suit, rank}]  suit: 1=C,2=D,3=H,4=S  rank: 01-13
  bankerCards: [],
  intposi: 0,
  cardIdx: 0,
};

// All connected WS clients
const clients = new Set();

// --- Sample cards for auto-play ---
// Card format: '{suit}{rank:02d}' — suit: 1=♣, 2=♦, 3=♥, 4=♠ — rank: 01=A, 02-09, 10, 11=J, 12=Q, 13=K
// player[0]=P1(Left), player[1]=P2(Right), banker[0]=B1(Left), banker[1]=B2(Right)
const SAMPLE_HANDS = [
  // 1. Player natural 9 (P:9 vs B:5) — no 3rd cards
  { player: ['405', '404'], banker: ['302', '303'], winPos: 1 },
  // 2. Banker natural 8 (P:3 vs B:8) — no 3rd cards
  { player: ['301', '202'], banker: ['406', '302'], winPos: 2 },
  // 3. Tie (P:6 vs B:6) — both stand, no 3rd cards
  { player: ['303', '303'], banker: ['204', '202'], winPos: 3 },
  // 4. Player wins with P3rd (P:8 vs B:6) — Player draws, Banker stands
  //    P: ♦2(2)+♥A(1)=3→draws ♠5(5)→8, B: ♠7(7)+♥9(9)=6→doesBankerDraw(6,5)=false→stands
  { player: ['202', '301'], banker: ['407', '309'], player3: '405', winPos: 1 },
  // 5. Banker wins with both 3rd (P:8 vs B:9) — Player draws, Banker draws
  //    P: ♥4(4)+♦A(1)=5→draws ♠3(3)→8, B: ♦2(2)+♥A(1)=3→doesBankerDraw(3,3)=true→draws ♠6(6)→9
  { player: ['304', '201'], banker: ['202', '301'], player3: '403', banker3: '406', winPos: 2 },
  // 6. Banker wins with B3rd only (P:6 vs B:7) — Player stands, Banker draws
  //    P: ♦3(3)+♠3(3)=6→stands, B: ♥2(2)+♥A(1)=3→draws(≤5) ♦4(4)→7
  { player: ['203', '403'], banker: ['302', '301'], banker3: '204', winPos: 2 },
];
let handIndex = 0;

// --- HTTP Server ---
const server = http.createServer((req, res) => {
  if (req.method !== 'POST') {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    const params = querystring.parse(body);
    // Also try JSON
    let jsonParams = {};
    try { jsonParams = JSON.parse(body); } catch (e) {}
    const merged = { ...params, ...jsonParams };

    const url = new URL(req.url, `http://localhost:${PORT}`);
    const path = url.pathname;

    res.setHeader('Content-Type', 'application/json');

    switch (path) {
      case '/dealer/auth':
        handleAuth(merged, res);
        break;
      case '/dealer/table':
        handleTable(merged, res);
        break;
      case '/dealer/start':
        handleStart(merged, res);
        break;
      case '/dealer/stop':
        handleStop(merged, res);
        break;
      case '/dealer/card':
        handleCard(merged, res);
        break;
      case '/dealer/finish':
        handleFinish(merged, res);
        break;
      case '/dealer/suffle':
        handleShuffle(merged, res);
        break;
      case '/dealer/setlast':
      case '/dealer/pause':
      case '/dealer/restart':
        res.end(JSON.stringify({ ecode: 0 }));
        break;
      default:
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Unknown endpoint' }));
    }
  });
});

// --- WebSocket Server ---
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  // Accept /conn/{table}/{idx}/{token}
  if (req.url.startsWith('/conn/')) {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  } else {
    socket.destroy();
  }
});

wss.on('connection', (ws, req) => {
  const parts = req.url.split('/');
  const table = parts[2] || '1';
  console.log(`[Mock WS] Client connected (table ${table})`);
  clients.add(ws);

  // Send table info (p:1)
  sendToClient(ws, 1, {
    tableNo: parseInt(table),
    gameStatus: state.gameStatus,
    gameRound: state.gameRound,
    gameIdx: state.gameIdx,
    betTime: state.betTime,
    intposi: 0,
    cardIdx: 0,
    limit1: 100,
    limit2: 5000,
    limit3: 50000,
    ucnt: 0,
  });

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.p === 0) {
        // Heartbeat — respond
        ws.send(JSON.stringify({ p: 0 }));
      }
    } catch (e) {
      // ignore
    }
  });

  ws.on('close', () => {
    console.log(`[Mock WS] Client disconnected`);
    clients.delete(ws);
  });
});

function sendToClient(ws, type, data) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ p: type, c: data }));
  }
}

function broadcast(type, data) {
  const msg = JSON.stringify({ p: type, c: data });
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
    }
  }
}

// --- API Handlers ---

function handleAuth(params, res) {
  console.log(`[Mock API] Auth: id=${params.id}, key=${params.key}`);
  const token = 'mock-token-' + Date.now();
  res.end(JSON.stringify({
    ecode: 0,
    data: {
      userKey: -1,
      id: params.id,
      token,
      table: 1,
      ttype: 'BET',
      idx: 0,
      ip: '127.0.0.1',
    },
  }));
}

function handleTable(params, res) {
  console.log(`[Mock API] Table: ${params.table}`);
  res.end(JSON.stringify({
    ecode: 0,
    data: {
      tableNo: parseInt(params.table) || 1,
      gameStatus: state.gameStatus,
      gameRound: state.gameRound,
      gameIdx: state.gameIdx,
      betTime: state.betTime,
    },
  }));
}

function handleStart(params, res) {
  if (state.gameStatus !== 'S' && state.gameStatus !== 'E2') {
    res.end(JSON.stringify({ ecode: 200, error: 'game status err!' }));
    return;
  }

  state.gameRound++;
  state.gameStatus = 'B';
  state.playerCards = [];
  state.bankerCards = [];
  state.winPos = 0;
  state.intposi = 0;
  state.cardIdx = 0;

  console.log(`[Mock] ▶ Round ${state.gameRound} — BETTING (${state.betTime * 10}s)`);

  // Broadcast B status
  broadcast(2, {
    gameStatus: 'B',
    gameRound: state.gameRound,
    gameIdx: state.gameIdx,
    betTime: state.betTime,
  });

  res.end(JSON.stringify({ ecode: 0, gameId: 'mock-' + state.gameRound }));
}

function handleStop(params, res) {
  if (state.gameStatus !== 'B') {
    res.end(JSON.stringify({ ecode: 200, error: 'game status err!' }));
    return;
  }

  state.gameStatus = 'D';
  console.log(`[Mock] ⏹ DEALING — waiting for cards`);

  broadcast(2, {
    gameStatus: 'D',
    gameRound: state.gameRound,
    gameIdx: state.gameIdx,
  });

  res.end(JSON.stringify({ ecode: 0 }));
}

function handleCard(params, res) {
  if (state.gameStatus !== 'B' && state.gameStatus !== 'D') {
    res.end(JSON.stringify({ ecode: 200, error: 'game status err!' }));
    return;
  }

  const intPosi = parseInt(params.intPosi) || 0;
  const cardIdx = parseInt(params.cardIdx) || 0;

  // Map intPosi to player/banker card storage
  // intPosi: 1=P1(left), 2=P2(right), 3=P3, 4=B1(left), 5=B2(right), 6=B3
  const mockCard = generateMockServerCard(cardIdx);

  if (intPosi >= 1 && intPosi <= 3) {
    state.playerCards[intPosi - 1] = mockCard;
  } else if (intPosi >= 4 && intPosi <= 6) {
    state.bankerCards[intPosi - 4] = mockCard;
  }

  state.intposi = intPosi;
  state.cardIdx = cardIdx;

  const playerStr = state.playerCards.filter(Boolean).join('');
  const bankerStr = state.bankerCards.filter(Boolean).join('');

  console.log(`[Mock] 🃏 Card: intPosi=${intPosi}, cardIdx=${cardIdx} → P:[${playerStr}] B:[${bankerStr}]`);

  // Broadcast p:3 card data
  broadcast(3, {
    intposi: intPosi,
    cardIdx,
    playerCard: playerStr,
    bankerCard: bankerStr,
    bEndCheck: 0,
    gameStatus: state.gameStatus,
  });

  res.end(JSON.stringify({ ecode: 0 }));
}

function handleFinish(params, res) {
  if (state.gameStatus !== 'D' && state.gameStatus !== 'B') {
    res.end(JSON.stringify({ ecode: 200, error: 'game status err!' }));
    return;
  }

  // Calculate winner from cards or use mock
  const playerStr = state.playerCards.filter(Boolean).join('');
  const bankerStr = state.bankerCards.filter(Boolean).join('');

  // Simple score calc
  const pScore = calcScore(state.playerCards);
  const bScore = calcScore(state.bankerCards);
  state.winPos = pScore > bScore ? 1 : bScore > pScore ? 2 : 3;

  state.gameStatus = 'E2';
  const winNames = { 1: 'PLAYER', 2: 'BANKER', 3: 'TIE' };
  console.log(`[Mock] ✅ RESULT: ${state.winPos === 3 ? 'TIE' : winNames[state.winPos] + ' WIN'} (P:${pScore} vs B:${bScore}) — Round ${state.gameRound}`);

  broadcast(2, {
    gameStatus: 'E2',
    gameRound: state.gameRound,
    gameIdx: state.gameIdx,
    winPos: state.winPos,
    playerCard: playerStr,
    bankerCard: bankerStr,
  });

  res.end(JSON.stringify({ ecode: 0 }));
}

function handleShuffle(params, res) {
  state.gameStatus = 'S';
  state.gameRound = 0;
  state.gameIdx++;
  state.playerCards = [];
  state.bankerCards = [];
  console.log(`[Mock] 🔄 SHUFFLE — new shoe (idx ${state.gameIdx})`);

  broadcast(2, {
    gameStatus: 'S',
    gameRound: 0,
    gameIdx: state.gameIdx,
  });

  res.end(JSON.stringify({ ecode: 0 }));
}

// --- Helpers ---

function generateMockServerCard(cardIdx) {
  // cardIdx: suitIdx * 13 + rankIdx
  // suit: 0=s, 1=h, 2=d, 3=c → server: 4=S, 3=H, 2=D, 1=C
  const suitMap = [4, 3, 2, 1]; // JS suit index → server suit code
  const suitIdx = Math.floor(cardIdx / 13);
  const rankIdx = cardIdx % 13;
  const serverSuit = suitMap[suitIdx] || 1;
  const serverRank = String(rankIdx + 1).padStart(2, '0');
  return `${serverSuit}${serverRank}`;
}

function calcScore(cards) {
  let total = 0;
  for (const c of cards) {
    if (!c) continue;
    const rank = parseInt(c.substring(1));
    total += rank >= 10 ? 0 : rank;
  }
  return total % 10;
}

// --- Auto-play mode ---

function autoPlay() {
  const hand = SAMPLE_HANDS[handIndex % SAMPLE_HANDS.length];
  handIndex++;

  const betSeconds = state.betTime * 10;

  // Step 1: Start → B
  state.gameRound++;
  state.gameStatus = 'B';
  state.playerCards = [];
  state.bankerCards = [];
  state.winPos = 0;

  console.log(`\n[Auto] ═══ Round ${state.gameRound} ═══`);
  console.log(`[Auto] ▶ BETTING (${betSeconds}s)`);

  broadcast(2, {
    gameStatus: 'B',
    gameRound: state.gameRound,
    gameIdx: state.gameIdx,
    betTime: state.betTime,
  });

  // Step 2: Send cards during betting (like real flow)
  // Deal order matches intposi order: P1(1), B1(4), P2(2), B2(5), [P3(3), B3(6)]
  // This ensures cumulative playerCard/bankerCard strings are in slot order
  const cardDelay = Math.min(3000, betSeconds * 500);
  setTimeout(() => {
    if (state.gameStatus !== 'B') return;

    // Deal 4 initial cards in baccarat dealing order
    const cards = [
      { posi: 1, card: hand.player[0] }, // P1 (P-Left)
      { posi: 4, card: hand.banker[0] }, // B1 (B-Left)
      { posi: 2, card: hand.player[1] }, // P2 (P-Right)
      { posi: 5, card: hand.banker[1] }, // B2 (B-Right)
    ];

    cards.forEach((c, i) => {
      setTimeout(() => {
        if (c.posi <= 3) {
          state.playerCards[c.posi - 1] = c.card;
        } else {
          state.bankerCards[c.posi - 4] = c.card;
        }
        const playerStr = state.playerCards.filter(Boolean).join('');
        const bankerStr = state.bankerCards.filter(Boolean).join('');
        console.log(`[Auto] 🃏 Card intPosi=${c.posi}: ${c.card}`);

        broadcast(3, {
          intposi: c.posi,
          cardIdx: 0,
          playerCard: playerStr,
          bankerCard: bankerStr,
          bEndCheck: 0,
          gameStatus: state.gameStatus,
        });
      }, i * 800);
    });

    // Deal 3rd cards if present (5th card = P3 or B3, 6th card = B3)
    let extraDelay = cards.length * 800;
    if (hand.player3) {
      setTimeout(() => {
        state.playerCards[2] = hand.player3;
        const playerStr = state.playerCards.filter(Boolean).join('');
        const bankerStr = state.bankerCards.filter(Boolean).join('');
        console.log(`[Auto] 🃏 Player 3rd (intPosi=3): ${hand.player3}`);
        broadcast(3, {
          intposi: 3, cardIdx: 0, playerCard: playerStr, bankerCard: bankerStr,
          bEndCheck: 0, gameStatus: state.gameStatus,
        });
      }, extraDelay);
      extraDelay += 800;
    }
    if (hand.banker3) {
      setTimeout(() => {
        state.bankerCards[2] = hand.banker3;
        const playerStr = state.playerCards.filter(Boolean).join('');
        const bankerStr = state.bankerCards.filter(Boolean).join('');
        console.log(`[Auto] 🃏 Banker 3rd (intPosi=6): ${hand.banker3}`);
        broadcast(3, {
          intposi: 6, cardIdx: 0, playerCard: playerStr, bankerCard: bankerStr,
          bEndCheck: 0, gameStatus: state.gameStatus,
        });
      }, extraDelay);
    }
  }, cardDelay);

  // Step 3: Bet time expires → D
  setTimeout(() => {
    if (state.gameStatus !== 'B') return;
    state.gameStatus = 'D';
    console.log(`[Auto] ⏹ DEALING`);
    broadcast(2, {
      gameStatus: 'D',
      gameRound: state.gameRound,
      gameIdx: state.gameIdx,
    });

    // Step 4: Result after short delay → E2
    setTimeout(() => {
      if (state.gameStatus !== 'D') return;
      state.winPos = hand.winPos;
      state.gameStatus = 'E2';

      const playerStr = state.playerCards.filter(Boolean).join('');
      const bankerStr = state.bankerCards.filter(Boolean).join('');
      const pScore = calcScore(state.playerCards);
      const bScore = calcScore(state.bankerCards);
      const winNames = { 1: 'PLAYER', 2: 'BANKER', 3: 'TIE' };

      console.log(`[Auto] ✅ ${state.winPos === 3 ? 'TIE' : winNames[state.winPos] + ' WIN'} (P:${pScore} vs B:${bScore})`);

      broadcast(2, {
        gameStatus: 'E2',
        gameRound: state.gameRound,
        gameIdx: state.gameIdx,
        winPos: state.winPos,
        playerCard: playerStr,
        bankerCard: bankerStr,
      });

      // Step 5: Next round after pause
      setTimeout(() => {
        autoPlay();
      }, FAST_MODE ? 3000 : 5000);

    }, FAST_MODE ? 2000 : 3000);

  }, betSeconds * 1000);
}

// --- Start ---
server.listen(PORT, () => {
  console.log(`\n╔══════════════════════════════════════════════╗`);
  console.log(`║  Mock Game Server running on port ${PORT}        ║`);
  console.log(`║  Mode: ${AUTO_MODE ? 'AUTO-PLAY' : 'INTERACTIVE (wait for commands)'}${AUTO_MODE ? (FAST_MODE ? ' (FAST)    ' : '           ') : ''}║`);
  console.log(`╚══════════════════════════════════════════════╝\n`);

  if (AUTO_MODE) {
    console.log('[Auto] Starting first round in 3 seconds...\n');
    setTimeout(() => autoPlay(), 3000);
  } else {
    console.log('[Interactive] Waiting for dealer system to connect and send commands.');
    console.log('[Interactive] Flow: auth → table → start → card(s) → finish\n');
  }
});

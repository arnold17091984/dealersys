// Test client — simulates what the browser does:
// 1. GET /api/config
// 2. POST /api/dealer/auth
// 3. POST /api/dealer/table
// 4. Connect WS to /ws and send "connect:TABLE"
// 5. Listen for game events and verify data recording

const http = require('http');
const WebSocket = require('ws');

const BASE = 'http://localhost:3000';
let ws = null;
let roundsReceived = 0;
const TARGET_ROUNDS = 3;

async function httpGet(path) {
  return new Promise((resolve, reject) => {
    http.get(`${BASE}${path}`, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

async function httpPost(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(`${BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': data.length },
    }, (res) => {
      let result = '';
      res.on('data', c => result += c);
      res.on('end', () => resolve(JSON.parse(result)));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function run() {
  console.log('=== Test Client ===\n');

  // Step 1: Get config
  const cfg = await httpGet('/api/config');
  console.log(`[1] Config: mode=${cfg.mode}, table=${cfg.table}`);

  // Step 2: Auth
  const auth = await httpPost('/api/dealer/auth', { id: cfg.dealer.id, key: cfg.dealer.key });
  console.log(`[2] Auth: ecode=${auth.ecode}, token=${auth.token ? auth.token.substring(0, 20) + '...' : 'none'}`);

  // Step 3: Table info
  const table = await httpPost('/api/dealer/table', { table: String(cfg.table) });
  console.log(`[3] Table: ${JSON.stringify(table.data || table)}`);

  // Step 4: Connect WS
  ws = new WebSocket('ws://localhost:3000/ws');

  ws.on('open', () => {
    console.log(`[4] WS connected — sending connect:${cfg.table}`);
    ws.send(`connect:${cfg.table}`);

    // Send heartbeats
    setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ p: 0, c: {} }));
      }
    }, 1000);
  });

  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());

    if (msg.type === 'bridge_status') {
      console.log(`[WS] Bridge: ${msg.status}`);
      return;
    }

    if (msg.p === 0) return; // skip heartbeats

    if (msg.p === 1) {
      console.log(`[WS] p:1 Table info: status=${msg.c.gameStatus}, round=${msg.c.gameRound}`);
    }

    if (msg.p === 2) {
      const c = msg.c;
      switch (c.gameStatus) {
        case 'B':
          console.log(`\n[WS] p:2 ▶ BETTING — Round ${c.gameRound}, betTime=${c.betTime}`);
          break;
        case 'D':
          console.log(`[WS] p:2 ⏹ DEALING`);
          break;
        case 'E2':
          const winMap = { 1: 'PLAYER', 2: 'BANKER', 3: 'TIE' };
          console.log(`[WS] p:2 ✅ RESULT: ${winMap[c.winPos]} — playerCard=${c.playerCard} bankerCard=${c.bankerCard}`);
          roundsReceived++;
          if (roundsReceived >= TARGET_ROUNDS) {
            setTimeout(() => checkData(), 2000);
          }
          break;
        case 'S':
          console.log(`[WS] p:2 🔄 SHUFFLE`);
          break;
      }
    }

    if (msg.p === 3) {
      console.log(`[WS] p:3 🃏 Card: intposi=${msg.c.intposi} P:[${msg.c.playerCard}] B:[${msg.c.bankerCard}]`);
    }
  });

  ws.on('close', () => {
    console.log('[WS] Disconnected');
  });
}

async function checkData() {
  console.log('\n=== Checking recorded data ===\n');

  try {
    const games = await httpGet('/api/data/games?limit=10');
    console.log(`[DB] Games recorded: ${Array.isArray(games) ? games.length : JSON.stringify(games)}`);
    if (Array.isArray(games) && games.length > 0) {
      games.forEach(g => {
        console.log(`  Round ${g.round_no || '?'}: ${g.winner || 'no winner'} (P:${g.player_score} B:${g.banker_score}) — ${g.status}`);
      });
    }
  } catch (e) {
    console.log(`[DB] Could not fetch games: ${e.message}`);
  }

  try {
    const status = await httpGet('/api/data/forward/status');
    console.log(`\n[Forward] ${JSON.stringify(status)}`);
  } catch (e) {
    console.log(`[Forward] ${e.message}`);
  }

  console.log('\n=== Test complete ===');
  if (ws) ws.close();
  process.exit(0);
}

run().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});

// Quick WebSocket connection test to real game server
const WebSocket = require('ws');

const token = process.argv[2];
if (!token) {
  console.log('Usage: node mock/wsTest.js <token>');
  process.exit(1);
}

const url = `ws://139.180.154.92:4000/conn/1/0/${token}`;
console.log(`Connecting to: ${url}\n`);

const ws = new WebSocket(url, ['echo-protocol']);
let msgCount = 0;
let heartbeatInterval = null;

ws.on('open', () => {
  console.log('[OPEN] Connected!');
  // Start heartbeat
  heartbeatInterval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ p: 0, c: {} }));
    }
  }, 1000);
});

ws.on('message', (data) => {
  msgCount++;
  const msg = JSON.parse(data.toString());
  if (msg.p === 0) {
    // Heartbeat response - only log first one
    if (msgCount <= 2) console.log(`[p:0] Heartbeat OK`);
    return;
  }
  console.log(`[p:${msg.p}] ${JSON.stringify(msg.c).substring(0, 200)}`);
});

ws.on('close', (code, reason) => {
  console.log(`[CLOSE] Code: ${code}, Reason: ${reason.toString() || 'none'}`);
  console.log(`Total messages received: ${msgCount}`);
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  process.exit(0);
});

ws.on('error', (err) => {
  console.log(`[ERROR] ${err.message}`);
});

// Auto-close after 15 seconds
setTimeout(() => {
  console.log(`\n[TIMEOUT] 15s elapsed. Messages: ${msgCount}. Closing.`);
  ws.close();
}, 15000);

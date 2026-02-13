const WebSocket = require('ws');
const config = require('../config');
const gameServer = require('./gameServer');

let upstreamWs = null;
let clientConnections = new Set();
let reconnectTimer = null;
let currentTable = null;
let currentIdx = null;

function init(wss) {
  wss.on('connection', (ws, req) => {
    console.log('[WS Bridge] Client connected');
    clientConnections.add(ws);

    ws.on('message', (msg) => {
      const data = msg.toString();

      // Handle connect command from client: "connect:TABLE"
      if (data.startsWith('connect:')) {
        const parts = data.split(':');
        currentTable = parts[1];
        // Use idx from auth response (gameServer stores it)
        currentIdx = gameServer.getIdx() || parts[2] || '0';
        connectUpstream(currentTable, currentIdx);
        return;
      }

      // Forward other messages to upstream
      if (upstreamWs && upstreamWs.readyState === WebSocket.OPEN) {
        upstreamWs.send(data);
      }
    });

    ws.on('close', () => {
      console.log('[WS Bridge] Client disconnected');
      clientConnections.delete(ws);
      if (clientConnections.size === 0 && upstreamWs) {
        upstreamWs.close();
        upstreamWs = null;
      }
    });

    // If already connected upstream, notify client
    if (upstreamWs && upstreamWs.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'bridge_status', status: 'connected' }));
    }
  });
}

function connectUpstream(table, idx) {
  const token = gameServer.getToken();
  if (!token) {
    broadcast(JSON.stringify({ type: 'bridge_error', error: 'No auth token' }));
    return;
  }

  if (upstreamWs) {
    upstreamWs.close();
    upstreamWs = null;
  }

  const wsUrl = `${config.gameServer.wsUrl}/conn/${table}/${idx}/${token}`;
  console.log(`[WS Bridge] Connecting to ${wsUrl}`);

  upstreamWs = new WebSocket(wsUrl);

  upstreamWs.on('open', () => {
    console.log('[WS Bridge] Upstream connected');
    broadcast(JSON.stringify({ type: 'bridge_status', status: 'connected' }));
  });

  upstreamWs.on('message', (data) => {
    const msg = data.toString();
    // Forward to all browser clients
    broadcast(msg);
  });

  upstreamWs.on('close', () => {
    console.log('[WS Bridge] Upstream disconnected');
    broadcast(JSON.stringify({ type: 'bridge_status', status: 'disconnected' }));
    scheduleReconnect();
  });

  upstreamWs.on('error', (err) => {
    console.error('[WS Bridge] Upstream error:', err.message);
    broadcast(JSON.stringify({ type: 'bridge_error', error: err.message }));
  });
}

function broadcast(msg) {
  for (const client of clientConnections) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  }
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  if (clientConnections.size === 0) return;

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (currentTable && clientConnections.size > 0) {
      console.log('[WS Bridge] Attempting reconnect...');
      connectUpstream(currentTable, currentIdx || '0');
    }
  }, 3000);
}

function getStatus() {
  return {
    upstreamConnected: upstreamWs && upstreamWs.readyState === WebSocket.OPEN,
    clientCount: clientConnections.size,
    table: currentTable,
  };
}

module.exports = { init, getStatus };

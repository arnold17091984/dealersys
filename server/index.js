const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');
const cors = require('cors');
const config = require('./config');
const dataStore = require('./services/dataStore');
const websocketBridge = require('./services/websocketBridge');
const forwarder = require('./services/forwarder');
const proxyRoutes = require('./routes/proxy');
const dataRoutes = require('./routes/data');
const adminRoutes = require('./routes/admin');

// Validate mode
if (!['active', 'passive'].includes(config.mode)) {
  console.error(`[Dealer System] Invalid mode: "${config.mode}". Must be "active" or "passive".`);
  process.exit(1);
}

const app = express();
const server = http.createServer(app);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files
app.use(express.static(path.join(__dirname, '..', 'public')));

// API routes
app.use('/api/dealer', proxyRoutes);
app.use('/api/data', dataRoutes);
app.use('/api/admin', adminRoutes);

// Client config (dealer credentials + table + mode)
app.get('/api/config', (req, res) => {
  res.json({
    dealer: config.dealer,
    table: config.table.number,
    mode: config.mode,
    scanOrder: config.scanOrder,
  });
});

// Health check
app.get('/api/health', (req, res) => {
  const wsStatus = websocketBridge.getStatus();
  res.json({
    status: 'ok',
    websocket: wsStatus,
    forwarding: config.forwarding.enabled,
  });
});

// WebSocket server on /ws path
const wss = new WebSocketServer({ server, path: '/ws' });
websocketBridge.init(wss);

// Initialize
dataStore.init();
forwarder.start();

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[Dealer System] Port ${config.port} is already in use. Kill the existing process or change port in config.js`);
  } else {
    console.error('[Dealer System] Server error:', err);
  }
  process.exit(1);
});

server.listen(config.port, () => {
  console.log(`[Dealer System] Server running at http://localhost:${config.port}`);
  console.log(`[Dealer System] Mode: ${config.mode.toUpperCase()}`);
  console.log(`[Dealer System] Game server proxy: ${config.gameServer.baseUrl}`);
  console.log(`[Dealer System] WebSocket bridge: ws://localhost:${config.port}/ws`);
  console.log(`[Dealer System] Forwarding: ${config.forwarding.enabled ? 'ENABLED' : 'DISABLED'}`);
});

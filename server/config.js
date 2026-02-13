module.exports = {
  port: 3000,

  // System mode: 'active' = full dealer control, 'passive' = monitor only (WS receive + data save)
  mode: process.env.DEALER_MODE || 'active',

  // Game server (use localhost:4000 for mock, 139.180.154.92:4000 for production)
  gameServer: {
    host: process.env.GAME_HOST || '127.0.0.1',
    port: 4000,
    baseUrl: `http://${process.env.GAME_HOST || '127.0.0.1'}:4000`,
    wsUrl: `ws://${process.env.GAME_HOST || '127.0.0.1'}:4000`,
  },

  // Dealer credentials (from dealer_v5 config.json)
  dealer: {
    id: 'operator_001',
    key: '6001',
  },

  // Default table
  table: {
    number: 1,
  },

  // Forwarding to own baccarat system
  forwarding: {
    enabled: false, // Enable when endpoint is ready
    url: 'http://localhost:8080/api/v1/games/result',
    intervalMs: 30000, // 30 seconds
    maxRetries: 3,
  },

  // SQLite database path
  dbPath: './data/dealer.sqlite',
};

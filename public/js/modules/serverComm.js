// Server Communication - HTTP API calls to local backend

const ServerComm = {
  async post(path, params = {}) {
    const res = await fetch(`/api/dealer${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    return res.json();
  },

  async get(path) {
    const res = await fetch(`/api${path}`);
    return res.json();
  },

  // Config
  async getConfig() {
    return this.get('/config');
  },

  // Auth
  async auth(id, key) {
    return this.post('/auth', { id, key });
  },

  // Table info
  async getTable(table) {
    return this.post('/table', { table: String(table) });
  },

  // Game control
  async startGame(table) {
    return this.post('/start', { table: String(table) });
  },

  async stopBetting(table) {
    return this.post('/stop', { table: String(table) });
  },

  async sendCard(table, intPosi, cardIdx, card) {
    return this.post('/card', {
      table: String(table),
      intPosi: String(intPosi),
      cardIdx: String(cardIdx),
      card: String(card),
    });
  },

  async finishGame(table) {
    return this.post('/finish', { table: String(table) });
  },

  async shuffle(table) {
    return this.post('/suffle', { table: String(table) });
  },

  async setLast(table) {
    return this.post('/setlast', { table: String(table) });
  },

  async pause(table) {
    return this.post('/pause', { table: String(table) });
  },

  async restart(table) {
    return this.post('/restart', { table: String(table) });
  },

  // Data APIs
  async getRecentGames(limit = 20) {
    return this.get(`/data/games?limit=${limit}`);
  },

  async getForwardStatus() {
    return this.get('/data/forward/status');
  },

  async getHealth() {
    return this.get('/health');
  },
};

window.ServerComm = ServerComm;

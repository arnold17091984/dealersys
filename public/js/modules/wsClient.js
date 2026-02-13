// WebSocket Client - connects to local backend WS bridge
// Game server protocol: JSON messages {"p": TYPE, "c": DATA}
//   p:0 = heartbeat, p:1 = table info, p:2 = status update, p:3 = card data
// Status values (gameStatus): "S"=Shuffle, "B"=Betting, "D"=Dealing, "E2"=Result, "T"=Maintenance, "P"=Pause

const WsClient = {
  ws: null,
  handlers: {},
  reconnectTimer: null,
  pingInterval: null,
  sessionCheck: 0,
  table: null,
  connected: false,

  connect(table) {
    this.table = table;

    if (this.ws) {
      this.ws.close();
    }

    const wsUrl = `ws://${location.host}/ws`;
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log('[WS] Connected to bridge');
      this.connected = true;
      // Tell bridge to connect to upstream
      this.ws.send(`connect:${table}`);
      this.emit('open');
    };

    this.ws.onmessage = (event) => {
      const raw = event.data;

      try {
        const json = JSON.parse(raw);

        // Bridge status messages (from our Node.js bridge, not game server)
        if (json.type === 'bridge_status') {
          this.emit('bridge_status', json.status);
          if (json.status === 'connected') {
            this.startPing();
          } else {
            this.stopPing();
          }
          return;
        }
        if (json.type === 'bridge_error') {
          this.emit('bridge_error', json.error);
          return;
        }

        // Game server protocol: {"p": TYPE, "c": DATA}
        if (typeof json.p !== 'undefined') {
          this.handleGameMessage(json);
          return;
        }

        // Unknown JSON
        console.log('[WS] Unknown JSON:', json);
      } catch {
        // Not JSON - log and ignore
        console.log('[WS] Non-JSON message:', raw);
      }
    };

    this.ws.onclose = () => {
      console.log('[WS] Disconnected');
      this.connected = false;
      this.stopPing();
      this.emit('close');
      this.scheduleReconnect();
    };

    this.ws.onerror = (err) => {
      console.error('[WS] Error:', err);
      this.emit('error', err);
    };
  },

  handleGameMessage(msg) {
    const type = msg.p;
    const data = msg.c || null;

    switch (type) {
      case 0:
        // Heartbeat response from server — reset session check counter
        this.sessionCheck = 0;
        break;
      case 1:
        // Table info: {tableNo, gameStatus, gameRound, gameIdx, betTime, intposi, cardIdx, ...}
        console.log('[WS] Table info:', data);
        this.emit('table_info', data);
        break;
      case 2:
        // Status update: {gameStatus: "S"|"B"|"D"|"E2"|"T"|"P", gameRound, gameIdx, betTime, ...}
        console.log('[WS] Status update:', data);
        this.emit('status_update', data);
        break;
      case 3:
        // Card data: {intposi, cardIdx, playerCard, bankerCard, bEndCheck, ...}
        console.log('[WS] Card data:', data);
        this.emit('card_data', data);
        break;
      default:
        console.log('[WS] Unknown type:', type, data);
        this.emit('unknown', { type, data });
    }
  },

  // Periodic heartbeat ping (every 1000ms, matches original dealer_v5)
  startPing() {
    this.stopPing();
    this.sessionCheck = 0;
    this.pingInterval = setInterval(() => {
      this.sessionCheck++;
      if (this.sessionCheck > 4) {
        // 5 consecutive missed responses — connection likely dead
        console.warn('[WS] No heartbeat response — connection lost');
        this.emit('heartbeat_timeout');
        this.stopPing();
        return;
      }
      this.send(JSON.stringify({ p: 0, c: {} }));
    }, 1000);
  },

  stopPing() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  },

  send(msg) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(msg);
    }
  },

  on(event, handler) {
    if (!this.handlers[event]) this.handlers[event] = [];
    this.handlers[event].push(handler);
  },

  off(event, handler) {
    if (!this.handlers[event]) return;
    this.handlers[event] = this.handlers[event].filter((h) => h !== handler);
  },

  emit(event, data) {
    if (!this.handlers[event]) return;
    for (const handler of this.handlers[event]) {
      handler(data);
    }
  },

  scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.table) {
        console.log('[WS] Reconnecting...');
        this.connect(this.table);
      }
    }, 3000);
  },

  disconnect() {
    this.stopPing();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  },
};

window.WsClient = WsClient;

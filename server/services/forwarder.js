const fetch = require('node-fetch');
const config = require('../config');
const dataStore = require('./dataStore');

let intervalHandle = null;

function start() {
  if (!config.forwarding.enabled) {
    console.log('[Forwarder] Disabled in config');
    return;
  }

  console.log(`[Forwarder] Starting batch job (every ${config.forwarding.intervalMs / 1000}s)`);
  intervalHandle = setInterval(processBatch, config.forwarding.intervalMs);
  // Run once immediately
  processBatch();
}

function stop() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}

async function processBatch() {
  const pending = dataStore.getPendingForwards();
  if (pending.length === 0) return;

  console.log(`[Forwarder] Processing ${pending.length} pending items`);

  for (const item of pending) {
    try {
      const payload = JSON.parse(item.payload);
      const res = await fetch(config.forwarding.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        timeout: 10000,
      });

      if (res.ok) {
        dataStore.markForwardSent(item.id);
        dataStore.markForwarded(item.game_id);
        console.log(`[Forwarder] Sent game ${item.game_id}`);
      } else {
        const errText = await res.text();
        dataStore.markForwardFailed(item.id, `HTTP ${res.status}: ${errText}`);
        console.warn(`[Forwarder] Failed game ${item.game_id}: HTTP ${res.status}`);
      }
    } catch (err) {
      dataStore.markForwardFailed(item.id, err.message);
      console.warn(`[Forwarder] Error game ${item.game_id}: ${err.message}`);
    }
  }
}

module.exports = { start, stop, processBatch };

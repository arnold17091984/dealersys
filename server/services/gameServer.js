const fetch = require('node-fetch');
const config = require('../config');

const BASE = config.gameServer.baseUrl;

// Shared auth state
let authToken = null;
let authIdx = null;

function setToken(token) {
  authToken = token;
}

function getToken() {
  return authToken;
}

function getIdx() {
  return authIdx;
}

function buildForm(params) {
  return new URLSearchParams(params).toString();
}

async function post(path, params = {}) {
  const url = `${BASE}${path}`;
  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: buildForm(params),
  });

  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text, status: res.status };
  }
}

async function auth(id, key) {
  const result = await post('/dealer/auth', { id, key });
  // Response format: {ecode: 0, data: {idx, token, table, ttype}}
  // Also handle flat format: {token: "..."}
  if (result && result.data && result.data.token) {
    authToken = result.data.token;
    authIdx = result.data.idx || '0';
  } else if (result && result.token) {
    authToken = result.token;
  }
  return result;
}

async function getTable(table) {
  return post('/dealer/table', { table });
}

async function startGame(table) {
  return post('/dealer/start', { table });
}

async function stopBetting(table) {
  return post('/dealer/stop', { table });
}

async function sendCard(table, intPosi, cardIdx, card) {
  return post('/dealer/card', { table, intPosi, cardIdx, card });
}

async function finishGame(table) {
  return post('/dealer/finish', { table });
}

async function shuffle(table) {
  return post('/dealer/suffle', { table });
}

async function setLast(table) {
  return post('/dealer/setlast', { table });
}

async function pause(table) {
  return post('/dealer/pause', { table });
}

async function restart(table) {
  return post('/dealer/restart', { table });
}

module.exports = {
  auth,
  getTable,
  startGame,
  stopBetting,
  sendCard,
  finishGame,
  shuffle,
  setLast,
  pause,
  restart,
  setToken,
  getToken,
  getIdx,
  post,
};

// Card Engine - Extracted from dealer_tools/js/roule.js
// RFID code mapping, baccarat rules, result calculation
// CODE_MAP, POSITION_NAMES, SCAN_TO_SERVER_POS are loaded dynamically from DB via loadCodes/loadPositions

let codeMap = {};

const SUITS = {
  d: { symbol: '\u2666', color: 'suit-red', name: 'Diamonds' },
  s: { symbol: '\u2660', color: 'suit-black', name: 'Spades' },
  c: { symbol: '\u2663', color: 'suit-black', name: 'Clubs' },
  h: { symbol: '\u2665', color: 'suit-red', name: 'Hearts' },
};

// Card position mapping (loaded from DB)
let positionNames = [];

// Server card position mapping (loaded from DB)
let scanToServerPos = {};

// Load RFID code mappings from DB via admin API
async function loadCodes() {
  const resp = await fetch('/api/admin/rfid-codes');
  if (!resp.ok) throw new Error('Failed to load RFID codes: ' + resp.status);
  const codes = await resp.json();
  codeMap = {};
  for (const c of codes) {
    codeMap[c.rfid_code] = { suit: c.suit, rank: c.rank, value: c.value };
  }
  console.log(`[CardEngine] Loaded ${codes.length} RFID codes from DB`);
}

// Load scan position mappings from DB via admin API
async function loadPositions() {
  const resp = await fetch('/api/admin/scan-positions');
  if (!resp.ok) throw new Error('Failed to load scan positions: ' + resp.status);
  const positions = await resp.json();
  positionNames = [];
  scanToServerPos = {};
  for (const p of positions) {
    positionNames[p.scan_index] = p.position_name;
    scanToServerPos[p.scan_index] = p.server_intposi;
  }
  console.log(`[CardEngine] Loaded ${positions.length} scan positions from DB`);
}

function resolveCode(code) {
  return codeMap[code] ? { ...codeMap[code], rfidCode: code } : null;
}

function doesBankerDraw(bankerScore, playerThirdCard) {
  if (bankerScore <= 2) return true;
  if (bankerScore === 3) return playerThirdCard !== 8;
  if (bankerScore === 4) return [2, 3, 4, 5, 6, 7].includes(playerThirdCard);
  if (bankerScore === 5) return [4, 5, 6, 7].includes(playerThirdCard);
  if (bankerScore === 6) return [6, 7].includes(playerThirdCard);
  return false;
}

// Calculate baccarat result from scanned deck
// deck[0]=P-Right, deck[1]=B-Right, deck[2]=P-Left, deck[3]=B-Left, deck[4]=5th, deck[5]=6th
function getSimulatedResult(deck) {
  const p1 = deck[2] ? deck[2].value : 0;
  const b1 = deck[3] ? deck[3].value : 0;
  const p2 = deck[0] ? deck[0].value : 0;
  const b2 = deck[1] ? deck[1].value : 0;

  let pVal = (p1 + p2) % 10;
  let bVal = (b1 + b2) % 10;
  const isNatural = pVal >= 8 || bVal >= 8;

  let totalCards = 4;
  let p3Val = null;
  let b3Val = null;
  let playerDraws = false;
  let bankerDraws = false;

  if (!isNatural) {
    if (pVal <= 5) {
      playerDraws = true;
      if (deck[4]) {
        p3Val = deck[4].value;
        pVal = (pVal + p3Val) % 10;
        totalCards++;
        if (doesBankerDraw(bVal, p3Val)) {
          bankerDraws = true;
          if (deck[5]) {
            b3Val = deck[5].value;
            totalCards++;
          }
        }
      }
    } else {
      if (bVal <= 5) {
        bankerDraws = true;
        if (deck[4]) {
          b3Val = deck[4].value;
          totalCards++;
        }
      }
    }
  }

  if (b3Val !== null) {
    bVal = (b1 + b2 + b3Val) % 10;
  }

  let winner = 'TIE';
  if (pVal > bVal) winner = 'PLAYER';
  if (bVal > pVal) winner = 'BANKER';

  return {
    winner,
    playerScore: pVal,
    bankerScore: bVal,
    isNatural,
    totalCards,
    playerDraws,
    bankerDraws,
    p3Val,
    b3Val,
  };
}

// Determine how many cards are needed based on current deck state
function getRequiredCards(deck) {
  if (deck.length < 4) return { needed: true, total: 4, reason: 'initial' };

  const p1 = deck[2] ? deck[2].value : 0;
  const b1 = deck[3] ? deck[3].value : 0;
  const p2 = deck[0] ? deck[0].value : 0;
  const b2 = deck[1] ? deck[1].value : 0;

  const pVal = (p1 + p2) % 10;
  const bVal = (b1 + b2) % 10;

  if (pVal >= 8 || bVal >= 8) {
    return { needed: false, total: 4, reason: 'natural' };
  }

  if (pVal <= 5) {
    // Player draws 3rd
    if (deck.length < 5) return { needed: true, total: 5, reason: 'player_draw' };
    const p3Val = deck[4].value;
    if (doesBankerDraw(bVal, p3Val)) {
      if (deck.length < 6) return { needed: true, total: 6, reason: 'banker_draw' };
    }
    return { needed: false, total: deck.length, reason: 'complete' };
  } else {
    if (bVal <= 5) {
      // Banker draws 3rd (when player stands)
      if (deck.length < 5) return { needed: true, total: 5, reason: 'banker_draw_standalone' };
    }
    return { needed: false, total: deck.length, reason: 'complete' };
  }
}

// Find suggestion for changing result
function findWinScenario(currentDeck, targetWinner) {
  const targetIndices = [2, 1]; // P-Left, B-Right

  for (const i of targetIndices) {
    if (!currentDeck[i]) continue;
    const originalCard = currentDeck[i];

    for (let v = 0; v <= 9; v++) {
      if (v === originalCard.value) continue;
      const tempDeck = JSON.parse(JSON.stringify(currentDeck));
      tempDeck[i].value = v;
      const res = getSimulatedResult(tempDeck);
      if (res.winner === targetWinner) {
        const rankDisplay = v === 0 ? '10/J/Q/K' : v;
        return { index: i, newRank: rankDisplay, targetWinner };
      }
    }
  }
  return null;
}

// Parse server card string (3 chars per card: suit_digit + rank_2digits)
// Suit: 0=empty, 1=Clubs, 2=Diamonds, 3=Hearts, 4=Spades
// Rank: 01=A, 02-09=2-9, 10=10, 11=J, 12=Q, 13=K
function parseServerCards(cardStr) {
  if (!cardStr || cardStr.length < 3) return [];
  const SUIT_MAP = { 1: 'c', 2: 'd', 3: 'h', 4: 's' };
  const RANK_MAP = {
    '01': { rank: 'A', value: 1 },
    '02': { rank: '2', value: 2 },
    '03': { rank: '3', value: 3 },
    '04': { rank: '4', value: 4 },
    '05': { rank: '5', value: 5 },
    '06': { rank: '6', value: 6 },
    '07': { rank: '7', value: 7 },
    '08': { rank: '8', value: 8 },
    '09': { rank: '9', value: 9 },
    '10': { rank: '10', value: 0 },
    '11': { rank: 'J', value: 0 },
    '12': { rank: 'Q', value: 0 },
    '13': { rank: 'K', value: 0 },
  };
  const cards = [];
  for (let i = 0; i + 2 < cardStr.length; i += 3) {
    const suitDigit = parseInt(cardStr[i]);
    const rankCode = cardStr.substring(i + 1, i + 3);
    const suit = SUIT_MAP[suitDigit];
    const rankInfo = RANK_MAP[rankCode];
    if (suit && rankInfo) {
      cards.push({ suit, rank: rankInfo.rank, value: rankInfo.value, rfidCode: '' });
    }
    // suit 0 = empty slot, skip
  }
  return cards;
}

window.CardEngine = {
  get CODE_MAP() { return codeMap; },
  SUITS,
  get POSITION_NAMES() { return positionNames; },
  get SCAN_TO_SERVER_POS() { return scanToServerPos; },
  resolveCode,
  doesBankerDraw,
  getSimulatedResult,
  getRequiredCards,
  findWinScenario,
  parseServerCards,
  loadCodes,
  loadPositions,
};

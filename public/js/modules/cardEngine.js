// Card Engine - Extracted from dealer_tools/js/roule.js
// RFID code mapping, baccarat rules, result calculation

const CODE_MAP = {
  // Spades
  '24580': { suit: 's', rank: 'A', value: 1 },
  '19204': { suit: 's', rank: '2', value: 2 },
  '06404': { suit: 's', rank: '3', value: 3 },
  '14596': { suit: 's', rank: '4', value: 4 },
  '20228': { suit: 's', rank: '5', value: 5 },
  '19716': { suit: 's', rank: '6', value: 6 },
  '18436': { suit: 's', rank: '7', value: 7 },
  '06916': { suit: 's', rank: '8', value: 8 },
  '57604': { suit: 's', rank: '9', value: 9 },
  '27652': { suit: 's', rank: '10', value: 0 },
  '49924': { suit: 's', rank: 'J', value: 0 },
  '06660': { suit: 's', rank: 'Q', value: 0 },
  '15108': { suit: 's', rank: 'K', value: 0 },

  // Diamonds
  '19972': { suit: 'd', rank: 'A', value: 1 },
  '11012': { suit: 'd', rank: '2', value: 2 },
  '13316': { suit: 'd', rank: '3', value: 3 },
  '09220': { suit: 'd', rank: '4', value: 4 },
  '08452': { suit: 'd', rank: '5', value: 5 },
  '12548': { suit: 'd', rank: '6', value: 6 },
  '28164': { suit: 'd', rank: '7', value: 7 },
  '35076': { suit: 'd', rank: '8', value: 8 },
  // Note: '11012' duplicate in original - D9 shares code with D2
  '22788': { suit: 'd', rank: '10', value: 0 },
  '36356': { suit: 'd', rank: 'J', value: 0 },
  '37380': { suit: 'd', rank: 'Q', value: 0 },
  '20740': { suit: 'd', rank: 'K', value: 0 },

  // Hearts
  '45316': { suit: 'h', rank: 'A', value: 1 },
  '12804': { suit: 'h', rank: '2', value: 2 },
  '56324': { suit: 'h', rank: '3', value: 3 },
  '07172': { suit: 'h', rank: '4', value: 4 },
  '08196': { suit: 'h', rank: '5', value: 5 },
  '33540': { suit: 'h', rank: '6', value: 6 },
  '08964': { suit: 'h', rank: '7', value: 7 },
  '35844': { suit: 'h', rank: '8', value: 8 },
  '34564': { suit: 'h', rank: '9', value: 9 },
  '02308': { suit: 'h', rank: '10', value: 0 },
  '08708': { suit: 'h', rank: 'J', value: 0 },
  '13828': { suit: 'h', rank: 'Q', value: 0 },
  '46084': { suit: 'h', rank: 'K', value: 0 },

  // Clubs
  '44292': { suit: 'c', rank: 'A', value: 1 },
  '23300': { suit: 'c', rank: '2', value: 2 },
  // Note: '19204' duplicate in original - C3 shares code with S2
  '49156': { suit: 'c', rank: '4', value: 4 },
  '32772': { suit: 'c', rank: '5', value: 5 },
  // Note: '36356' duplicate - C6 shares code with DJ
  '10244': { suit: 'c', rank: '7', value: 7 },
  // Note: '08452' duplicate - C8 shares code with D5
  '48132': { suit: 'c', rank: '9', value: 9 },
  // Note: '18436' duplicate - C10 shares code with S7
  '05636': { suit: 'c', rank: 'J', value: 0 },
  '15876': { suit: 'c', rank: 'Q', value: 0 },
  '23556': { suit: 'c', rank: 'K', value: 0 },
};

const SUITS = {
  d: { symbol: '\u2666', color: 'suit-red', name: 'Diamonds' },
  s: { symbol: '\u2660', color: 'suit-black', name: 'Spades' },
  c: { symbol: '\u2663', color: 'suit-black', name: 'Clubs' },
  h: { symbol: '\u2665', color: 'suit-red', name: 'Hearts' },
};

// Card position mapping (scan order → logical position)
// Scan order: 0=P-Right, 1=B-Right, 2=P-Left, 3=B-Left, 4=Extra-Right(5th), 5=Extra-Left(6th)
const POSITION_NAMES = ['P-Right', 'B-Right', 'P-Left', 'B-Left', '5th Card', '6th Card'];

// Server card position mapping
// intPosi: 1=Player1, 2=Player2, 3=Player3, 4=Banker1, 5=Banker2, 6=Banker3
const SCAN_TO_SERVER_POS = {
  0: 2, // P-Right → Player2
  1: 5, // B-Right → Banker2
  2: 1, // P-Left → Player1
  3: 4, // B-Left → Banker1
  4: -1, // 5th card (dynamic: Player3 or Banker3)
  5: -1, // 6th card (dynamic: Banker3)
};

function resolveCode(code) {
  return CODE_MAP[code] ? { ...CODE_MAP[code], rfidCode: code } : null;
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
  CODE_MAP,
  SUITS,
  POSITION_NAMES,
  SCAN_TO_SERVER_POS,
  resolveCode,
  doesBankerDraw,
  getSimulatedResult,
  getRequiredCards,
  findWinScenario,
  parseServerCards,
};

// Card Renderer - DOM rendering for cards
// Extracted from dealer_tools/js/roule.js renderCard()

const CardRenderer = {
  renderCard(el, card, styleType, index, editingIndex, suggestionIndex, onEdit) {
    const isEditing = index !== null && index === editingIndex;
    const isSuggested = index !== null && index === suggestionIndex;

    if (card) {
      const sInfo = CardEngine.SUITS[card.suit] || CardEngine.SUITS['s'];

      el.innerHTML = `
        <div class="card-symbol ${sInfo.color}">${sInfo.symbol}</div>
        <div class="card-val ${sInfo.color}">${card.rank}</div>
      `;

      el.className = 'card active';

      if (styleType === 'unused') el.classList.add('unused');
      else if (styleType === 'player') el.classList.add('player-extra');
      else if (styleType === 'banker') el.classList.add('banker-extra');

      if (isEditing) {
        el.classList.add('editing');
      } else if (isSuggested) {
        el.classList.add('suggestion-target');
      }

      if (onEdit) {
        el.onclick = () => onEdit(index);
      }
    } else {
      el.innerHTML = '';
      el.className = 'card opacity-0';
      el.onclick = null;
    }
  },

  // Render the full game board
  renderBoard(els, deck, state) {
    const { editingIndex, suggestionIndex, usedCount, gameOver } = state;
    const onEdit = state.onEdit || null;

    // Map scan order to logical positions
    const p1 = deck[2]; // P-Left (3rd scan)
    const b1 = deck[3]; // B-Left (4th scan)
    const p2 = deck[0]; // P-Right (1st scan)
    const b2 = deck[1]; // B-Right (2nd scan)

    // Determine 3rd card owners
    let p3OwnerIndex = null;
    let b3OwnerIndex = null;

    if (p1 && b1 && p2 && b2) {
      const pVal = (p1.value + p2.value) % 10;
      const bVal = (b1.value + b2.value) % 10;
      const isNatural = pVal >= 8 || bVal >= 8;

      if (!isNatural) {
        let deckIndex = 4;
        if (pVal <= 5) {
          if (deck[deckIndex]) {
            p3OwnerIndex = deckIndex;
            const p3Val = deck[deckIndex].value;
            deckIndex++;
            if (CardEngine.doesBankerDraw(bVal, p3Val)) {
              if (deck[deckIndex]) b3OwnerIndex = deckIndex;
            }
          }
        } else {
          if (bVal <= 5) {
            if (deck[deckIndex]) b3OwnerIndex = deckIndex;
          }
        }
      }
    }

    // Render main cards
    this.renderCard(els.p1, p1, 'normal', 2, editingIndex, suggestionIndex, onEdit);
    this.renderCard(els.p2, p2, 'normal', 0, editingIndex, suggestionIndex, onEdit);
    this.renderCard(els.b1, b1, 'normal', 3, editingIndex, suggestionIndex, onEdit);
    this.renderCard(els.b2, b2, 'normal', 1, editingIndex, suggestionIndex, onEdit);

    // Extra cards
    const renderExtra = (el, cardIndex) => {
      const card = deck[cardIndex];
      const isUnused = cardIndex >= usedCount && gameOver;
      let styleType = 'normal';
      if (cardIndex === p3OwnerIndex) styleType = 'player';
      if (cardIndex === b3OwnerIndex) styleType = 'banker';
      if (isUnused) styleType = 'unused';
      this.renderCard(el, card, styleType, cardIndex, editingIndex, suggestionIndex, onEdit);
    };

    renderExtra(els.extra1, 4);
    renderExtra(els.extra2, 5);
  },
};

window.CardRenderer = CardRenderer;

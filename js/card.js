// js/card.js
const SUITS = ['♠', '♥', '♦', '♣'];
const SUIT_COLORS = { '♠': 'black', '♥': 'red', '♦': 'red', '♣': 'black' };
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export class Card {
  constructor(suit, rank) {
    this.suit = suit;
    this.rank = rank;
    this.color = SUIT_COLORS[suit];
    this.hidden = true;
    this.id = rank + suit;
  }

  flip() {
    this.hidden = !this.hidden;
  }

  getValue() {
    return RANKS.indexOf(this.rank) + 1;
  }

  canGoToFoundation(topCard) {
    if (!topCard) return this.rank === 'A';
    return topCard.suit === this.suit && this.getValue() === topCard.getValue() + 1;
  }

  canGoToTableau(topCard, emptyKingOnly) {
    if (!topCard) {
      return emptyKingOnly ? this.rank === 'K' : true;
    }
    return this.color !== topCard.color && this.getValue() === topCard.getValue() - 1;
  }

  toElement() {
    const el = document.createElement('div');
    el.className = `card ${this.color === 'red' ? 'red' : 'black'}`;
    el.dataset.id = this.id;
    
    if (this.hidden) {
      el.classList.add('hidden-card');
    } else {
      // Верхний левый угол
      const topLeft = document.createElement('div');
      topLeft.className = 'card-corner top-left';
      topLeft.innerHTML = `${this.rank}<br>${this.suit}`;
      el.appendChild(topLeft);

      // Нижний правый угол (перевёрнутый)
      const bottomRight = document.createElement('div');
      bottomRight.className = 'card-corner bottom-right';
      bottomRight.innerHTML = `${this.rank}<br>${this.suit}`;
      el.appendChild(bottomRight);
    }
    return el;
  }
}

export function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push(new Card(suit, rank));
    }
  }
  return deck;
}

export function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}
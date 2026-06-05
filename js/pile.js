// js/pile.js
// Классы стопок карт. Используем наследование: базовый Pile и три наследника.

// ===== Базовый класс стопки =====
export class Pile {
  constructor(elementId) {
    this.element = document.getElementById(elementId);
    this.cards = [];
  }

  addCard(card) {
    this.cards.push(card);
  }

  removeCard(card) {
    const idx = this.cards.indexOf(card);
    if (idx !== -1) {
      this.cards.splice(idx, 1);
      return true;
    }
    return false;
  }

  topCard() {
    return this.cards.length > 0 ? this.cards[this.cards.length - 1] : null;
  }

  size() {
    return this.cards.length;
  }

  isEmpty() {
    return this.cards.length === 0;
  }

  // Отрисовка стопки (переопределяется в наследниках)
  render() {
    this.element.innerHTML = '';
  }
}

// ===== Колода: stock (закрытые) и waste (открытые, взятые из колоды) =====
export class DeckPile extends Pile {
  constructor(stockId, wasteId) {
    super(stockId);
    this.wasteElement = document.getElementById(wasteId);
    this.waste = [];
  }

  // Раздать карты в 7 колонок в начале игры
  dealToTableaus(tableaus) {
    for (let i = 0; i < 7; i++) {
      for (let j = i; j < 7; j++) {
        const card = this.cards.pop();
        if (j === i) card.hidden = false; // верхняя карта открыта
        tableaus[j].addCard(card);
      }
    }
  }

  // Взять N карт из колоды
  draw(count) {
    // 1. Если в колоде (stock) не осталось карт, переворачиваем сброс (waste) обратно
    if (this.cards.length === 0) {
      this.recycle();
    }

    // 2. Если карт всё равно нет (и в сбросе было пусто), просто выходим
    if (this.cards.length === 0) return;

    // 3. Вычисляем, сколько карт реально можно достать 
    // (нельзя достать больше, чем физически есть в колоде)
    const actualCount = Math.min(count, this.cards.length);

    // 4. Достаём карты
    for (let i = 0; i < actualCount; i++) {
      const card = this.cards.pop();
      card.hidden = false;
      this.waste.push(card);
    }
  }

  // Перевернуть все карты из waste обратно в stock
  recycle() {
    while (this.waste.length > 0) {
      const card = this.waste.pop();
      card.hidden = true;
      this.cards.push(card);
    }
  }

  topWaste() {
    return this.waste.length > 0 ? this.waste[this.waste.length - 1] : null;
  }

  removeFromWaste(card) {
    const idx = this.waste.indexOf(card);
    if (idx !== -1) {
      this.waste.splice(idx, 1);
      return true;
    }
    return false;
  }

  render() {
    // Stock
    this.element.innerHTML = '';
    if (this.cards.length > 0) {
      const back = document.createElement('div');
      back.className = 'card hidden-card';
      back.dataset.source = 'deck';
      this.element.appendChild(back);
    } else {
      const empty = document.createElement('div');
      empty.className = 'card';
      empty.style.background = 'transparent';
      empty.style.border = '2px dashed rgba(255,255,255,0.5)';
      empty.dataset.source = 'deck-empty';
      this.element.appendChild(empty);
    }

    // Waste — показываем до 3 верхних карт
    this.wasteElement.innerHTML = '';
    const showCount = Math.min(3, this.waste.length);
    const startIdx = this.waste.length - showCount;
    for (let i = startIdx; i < this.waste.length; i++) {
      const card = this.waste[i];
      const el = card.toElement();
      el.style.left = `${(i - startIdx) * 22}px`;
      el.dataset.source = 'waste';
      el.dataset.cardIndex = i;
      this.wasteElement.appendChild(el);
    }
  }
}

// ===== Колонка игрового поля (tableau) =====
export class TableauPile extends Pile {
  render() {
    this.element.innerHTML = '';
    let offset = 0;
    for (let i = 0; i < this.cards.length; i++) {
      const card = this.cards[i];
      const el = card.toElement();
      el.style.top = `${offset}px`;
      el.dataset.source = 'tableau';
      el.dataset.pileIndex = this.element.id.split('-')[1];
      el.dataset.cardIndex = i;
      this.element.appendChild(el);
      offset += card.hidden ? 15 : 28;
    }
    this.element.style.minHeight = `${offset + 112}px`;
  }
}

// ===== База (foundation) — собираем по мастям от туза до короля =====
export class FoundationPile extends Pile {
  render() {
    this.element.innerHTML = '';
    const top = this.topCard();
    if (top) {
      const el = top.toElement();
      el.dataset.source = 'foundation';
      el.dataset.pileIndex = this.element.id.split('-')[1];
      this.element.appendChild(el);
    }
  }
}
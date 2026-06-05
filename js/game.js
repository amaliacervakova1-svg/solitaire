// js/game.js
import { createDeck, shuffle } from './card.js';
import { DeckPile, TableauPile, FoundationPile } from './pile.js';

export class Game {
  constructor(settings) {
    this.settings = settings;
    this.deck = new DeckPile('deck', 'waste');
    this.tableaus = [];
    for (let i = 0; i < 7; i++) this.tableaus.push(new TableauPile(`tableau-${i}`));
    this.foundations = [];
    for (let i = 0; i < 4; i++) this.foundations.push(new FoundationPile(`foundation-${i}`));

    this.hints = {
      undo: settings.hints?.undo ?? 3,
      hint: settings.hints?.hint ?? 3,
      wand: settings.hints?.wand ?? 1
    };

    this.moves = 0;
    this.score = 0;
    this.elapsed = 0;
    this.startTime = null;
    this.timerId = null;
    this.isPaused = false;
    this.isFinished = false;
    this.lastMove = null;
    this.selected = null;
  }

  start() {
    const cards = shuffle(createDeck());
    this.deck.cards = cards;
    this.deck.waste = [];
    this.tableaus.forEach(t => t.cards = []);
    this.foundations.forEach(f => f.cards = []);

    this.deck.dealToTableaus(this.tableaus);
    this.moves = 0;
    this.score = 0;
    this.elapsed = 0;
    this.lastMove = null;
    this.selected = null;
    this.isFinished = false;
    this.isPaused = false;

    this.startTimer();
    this.dispatch('gameStateChanged', { state: 'playing' });
  }

  startTimer() {
    this.startTime = Date.now();
    this.timerId = setInterval(() => {
      if (!this.isPaused) {
        this.elapsed = Date.now() - this.startTime;
        this.dispatch('timerUpdate', { elapsed: this.elapsed });
      }
    }, 1000);
  }

  stopTimer() {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  pause() {
    if (this.isFinished) return;
    this.isPaused = true;
    this.dispatch('gameStateChanged', { state: 'paused' });
  }

  resume() {
    if (!this.isPaused) return;
    this.isPaused = false;
    this.startTime = Date.now() - this.elapsed;
    this.dispatch('gameStateChanged', { state: 'playing' });
  }

  selectCard(source, pileIndex, cardIndex) {
    if (this.isPaused || this.isFinished) return;

    if (source === 'deck') {
      this.deck.draw(this.settings.drawCount);
      this.dispatch('stateChanged', {});
      return;
    }
    if (source === 'deck-empty') {
      this.deck.recycle();
      this.dispatch('stateChanged', {});
      return;
    }

    let card, pile;
    if (source === 'waste') {
      card = this.deck.waste[cardIndex];
      pile = this.deck;
    } else if (source === 'tableau') {
      pile = this.tableaus[pileIndex];
      card = pile.cards[cardIndex];
      if (card.hidden) {
        if (cardIndex === pile.size() - 1) {
          card.flip();
          this.dispatch('stateChanged', {});
        }
        return;
      }
    } else if (source === 'foundation') {
      pile = this.foundations[pileIndex];
      card = pile.topCard();
    }

    if (!card) return;

    if (this.selected) {
      const moved = this.tryMove(source, pileIndex);
      if (moved) return;
      this.selected = null;
      this.dispatch('selectionChanged', {});
    }

    let group = [card];
    if (source === 'tableau') {
      const p = this.tableaus[pileIndex];
      for (let i = cardIndex + 1; i < p.size(); i++) {
        group.push(p.cards[i]);
      }
    }
    this.selected = { card, source, pileIndex, cardIndex, group };
    this.dispatch('selectionChanged', {});
  }

  tryMove(targetSource, targetPileIndex) {
    if (!this.selected) return false;
    const { card, source, pileIndex, group } = this.selected;

    let targetPile, targetTop;
    if (targetSource === 'foundation') {
      if (group.length !== 1) return false;
      targetPile = this.foundations[targetPileIndex];
      targetTop = targetPile.topCard();
      if (!card.canGoToFoundation(targetTop)) return false;
    } else if (targetSource === 'tableau') {
      targetPile = this.tableaus[targetPileIndex];
      targetTop = targetPile.topCard();
      if (!card.canGoToTableau(targetTop, this.settings.emptyKingOnly)) return false;
    } else {
      return false;
    }

    this.moveCard(group, source, pileIndex, targetPile, targetSource, targetPileIndex);
    return true;
  }

  moveCard(group, source, sourcePileIndex, targetPile, targetSource, targetPileIndex) {
    let revealedCardId = null;

    // Запоминаем карту, которая откроется под перемещаемой группой (для корректной отмены)
    if (source === 'tableau') {
      const p = this.tableaus[sourcePileIndex];
      if (this.selected.cardIndex > 0) {
        revealedCardId = p.cards[this.selected.cardIndex - 1].id;
      }
      for (const c of group) p.removeCard(c);
      const newTop = p.topCard();
      if (newTop && newTop.hidden) newTop.flip();
    } else if (source === 'waste') {
      this.deck.removeFromWaste(group[0]);
    } else if (source === 'foundation') {
      this.foundations[sourcePileIndex].removeCard(group[0]);
    }

    for (const c of group) {
    c.hidden = false; // на всякий случай — карта должна быть открытой после хода
    targetPile.addCard(c);
    }

    this.moves++;
    this.score += 10;
    this.selected = null;

    this.lastMove = {
      group: group.slice(),
      source, sourcePileIndex,
      targetSource, targetPileIndex,
      revealedCardId // Сохраняем ID карты, которую нужно будет снова закрыть при отмене
    };

    this.dispatch('cardMoved', {
      card: group[0].id, from: source, fromIndex: sourcePileIndex,
      to: targetSource, toIndex: targetPileIndex
    });

    this.dispatch('stateChanged', {});

    if (this.settings.autoFoundation) {
      this.autoMoveToFoundation();
    }
    this.checkWin();
    
    // Проверяем, все ли карты открыты — если да, запускаем авто-сбор
    if (this.areAllCardsRevealed()) {
      setTimeout(() => this.autoCollectAll(), 300);
    }
  }

  autoMoveToFoundation() {
    let moved = true;
    while (moved) {
      moved = false;
      const wasteTop = this.deck.topWaste();
      if (wasteTop && this.tryAutoMove(wasteTop, 'waste', 0)) moved = true;
      
      for (let i = 0; i < this.tableaus.length; i++) {
        const top = this.tableaus[i].topCard();
        if (top && !top.hidden && this.tryAutoMove(top, 'tableau', i)) {
          moved = true;
          i--; 
        }
      }
    }
  }

  tryAutoMove(card, source, pileIndex) {
    for (let i = 0; i < this.foundations.length; i++) {
      const f = this.foundations[i];
      if (card.canGoToFoundation(f.topCard())) {
        if (source === 'waste') this.deck.removeFromWaste(card);
        else if (source === 'tableau') {
          this.tableaus[pileIndex].removeCard(card);
          const newTop = this.tableaus[pileIndex].topCard();
          if (newTop && newTop.hidden) newTop.flip();
        }
        f.addCard(card);
        this.score += 15;
        this.dispatch('cardMoved', {
          card: card.id, from: source, fromIndex: pileIndex,
          to: 'foundation', toIndex: i
        });
        return true;
      }
    }
    return false;
  }

  checkWin() {
    const total = this.foundations.reduce((s, f) => s + f.size(), 0);
    if (total === 52) {
      this.isFinished = true;
      this.stopTimer();
      this.dispatch('gameStateChanged', { state: 'won', elapsed: this.elapsed, moves: this.moves });
    }
  }

    // Проверка: все ли карты открыты в колонках
  areAllCardsRevealed() {
    for (const pile of this.tableaus) {
      for (const card of pile.cards) {
        if (card.hidden) return false;
      }
    }
    return true;
  }

  // Автоматический сбор всех карт на базу
  autoCollectAll() {
    // Проверяем, есть ли что собирать
    let hasWork = true;
    
    const collectInterval = setInterval(() => {
      if (!hasWork || this.isFinished) {
        clearInterval(collectInterval);
        return;
      }

      hasWork = false;

      // Проверяем waste
      const wasteTop = this.deck.topWaste();
      if (wasteTop && this.tryAutoMove(wasteTop, 'waste', 0)) {
        hasWork = true;
        this.dispatch('stateChanged', {});
        return;
      }

      // Проверяем все колонки
      for (let i = 0; i < this.tableaus.length; i++) {
        const top = this.tableaus[i].topCard();
        if (top && !top.hidden && this.tryAutoMove(top, 'tableau', i)) {
          hasWork = true;
          this.dispatch('stateChanged', {});
          return;
        }
      }

      // Если ничего не переместили и карт на поле больше нет — победа
      const cardsOnTable = this.tableaus.reduce((sum, p) => sum + p.size(), 0);
      if (cardsOnTable === 0 && !hasWork) {
        this.isFinished = true;
        this.stopTimer();
        this.dispatch('gameStateChanged', {
          state: 'won',
          elapsed: this.elapsed,
          moves: this.moves
        });
      }
    }, 150); // Задержка 150мс между перемещениями
  }

  undo() {
    if (this.isPaused || this.isFinished) return false;
    if (this.hints.undo <= 0 || !this.lastMove) return false;

    const m = this.lastMove;
    let sourcePile, targetPile;

    if (m.source === 'waste') sourcePile = this.deck;
    else if (m.source === 'tableau') sourcePile = this.tableaus[m.sourcePileIndex];
    else if (m.source === 'foundation') sourcePile = this.foundations[m.sourcePileIndex];

    if (m.targetSource === 'tableau') targetPile = this.tableaus[m.targetPileIndex];
    else if (m.targetSource === 'foundation') targetPile = this.foundations[m.targetPileIndex];

    // 1. Убираем карты из целевой стопки
    for (const c of m.group) {
      targetPile.removeCard(c);
    }

    // 2. Возвращаем карты в исходную стопку
    if (m.source === 'waste') {
      for (const c of m.group) {
        c.hidden = false; // Карты в сбросе всегда открыты
        this.deck.waste.push(c);
      }
    } else {
      for (const c of m.group) {
        c.hidden = false; // Перемещённая карта остаётся открытой
        sourcePile.addCard(c);
      }
      
      // 3. ИСПРАВЛЕНИЕ: закрываем карту, которая была под перемещённой группой
      if (m.source === 'tableau' && m.revealedCardId) {
        const cardToHide = sourcePile.cards.find(c => c.id === m.revealedCardId);
        if (cardToHide) {
          cardToHide.hidden = true;
        }
      }
    }

    this.hints.undo--;
    this.lastMove = null;
    this.dispatch('hintUsed', { type: 'undo', remaining: this.hints.undo });
    this.dispatch('stateChanged', {});
    return true;
  }

  showHint() {
    if (this.isPaused || this.isFinished) return null;
    if (this.hints.hint <= 0) return null;
    this.hints.hint--;

    const wasteTop = this.deck.topWaste();
    if (wasteTop) {
      const target = this.findTarget(wasteTop);
      if (target) {
        this.dispatch('hintUsed', { type: 'hint', remaining: this.hints.hint });
        return { card: wasteTop, from: 'waste', target };
      }
    }
    for (let i = 0; i < this.tableaus.length; i++) {
      const top = this.tableaus[i].topCard();
      if (top && !top.hidden) {
        const target = this.findTarget(top);
        if (target) {
          this.dispatch('hintUsed', { type: 'hint', remaining: this.hints.hint });
          return { card: top, from: 'tableau', fromIndex: i, target };
        }
      }
    }
    this.dispatch('hintUsed', { type: 'hint', remaining: this.hints.hint });
    return null;
  }

  findTarget(card) {
    for (let i = 0; i < this.foundations.length; i++) {
      if (card.canGoToFoundation(this.foundations[i].topCard())) {
        return { source: 'foundation', index: i };
      }
    }
    for (let i = 0; i < this.tableaus.length; i++) {
      const top = this.tableaus[i].topCard();
      if (card.canGoToTableau(top, this.settings.emptyKingOnly)) {
        return { source: 'tableau', index: i };
      }
    }
    return null;
  }

  // ИСПРАВЛЕНИЕ: Волшебная палочка теперь ПЕРЕМЕЩАЕТ карты, а не просто переворачивает их
  useWand() {
    if (this.isPaused || this.isFinished) return false;
    if (this.hints.wand <= 0) return false;

    // 1. Находим все верхние закрытые карты в колонках
    const hiddenCardsInfo = [];
    for (let i = 0; i < this.tableaus.length; i++) {
      const pile = this.tableaus[i];
      for (let j = pile.size() - 1; j >= 0; j--) {
        if (pile.cards[j].hidden) {
          hiddenCardsInfo.push({ card: pile.cards[j], pileIndex: i, cardIndex: j });
          break; // Берём только самую верхнюю закрытую карту в колонке
        }
      }
    }

    // 2. Фильтруем: оставляем только те, которые КУДА-ТО можно положить прямо сейчас
    const movableHidden = [];
    for (const info of hiddenCardsInfo) {
      const target = this.findTarget(info.card);
      if (target) {
        movableHidden.push({ ...info, target });
      }
    }

    // 3. Берём максимум 2 такие карты
    const toMove = movableHidden.slice(0, 2);

    if (toMove.length === 0) {
      // Фоллбэк: если нет закрытых карт, которые можно куда-то положить, берём из колоды
      if (this.deck.cards.length > 0) {
        this.deck.draw(1);
      } else if (this.deck.waste.length > 0) {
        this.deck.recycle();
        this.deck.draw(1);
      } else {
        alert("Нет доступных ходов для закрытых карт, и колода пуста.");
        return false;
      }
    } else {
      // 4. Перемещаем найденные карты
      for (const item of toMove) {
        const pile = this.tableaus[item.pileIndex];
        const card = item.card;

        // Удаляем из текущей колонки
        pile.removeCard(card);
        
        // Открываем карту под ней, если она была закрыта
        const newTop = pile.topCard();
        let revealedId = null;
        if (newTop && newTop.hidden) {
          newTop.flip();
          revealedId = newTop.id;
        }

        // Перемещаем в цель
        let targetPile;
        if (item.target.source === 'foundation') {
          targetPile = this.foundations[item.target.index];
        } else {
          targetPile = this.tableaus[item.target.index];
        }
        card.hidden = false; // открываем карту перед перемещением
        targetPile.addCard(card);

        // Записываем в историю для отмены (как обычный ход)
        this.lastMove = {
          group: [card],
          source: 'tableau',
          sourcePileIndex: item.pileIndex,
          targetSource: item.target.source,
          targetPileIndex: item.target.index,
          revealedCardId: revealedId
        };
        this.moves++;
        this.score += 10;
      }
    }

    this.hints.wand--;
    this.dispatch('hintUsed', { type: 'wand', remaining: this.hints.wand });
    this.dispatch('stateChanged', {});
    return true;
  }

  dispatch(name, detail) {
    const event = new CustomEvent(name, { detail: detail });
    document.dispatchEvent(event);
  }
}
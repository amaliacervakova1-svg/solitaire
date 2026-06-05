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
    this.autoMovedCards = [];
    this.autoMoveTimeout = null; // Для хранения таймера
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
    this.autoMovedCards = [];
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
      // Автоперемещение после взятия карт
      if (this.settings.autoFoundation) {
        clearTimeout(this.autoMoveTimeout); // Очищаем предыдущий таймер
        setTimeout(() => this.autoMoveToFoundation(), 100);
      }
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
      if (pile && cardIndex === pile.size() - 1) {
        card.flip();
        this.dispatch('stateChanged', {});
        // Автоперемещение после открытия карты
        if (this.settings.autoFoundation) {
          setTimeout(() => this.autoMoveToFoundation(), 100);
        }
      }
      return;
    }
    } else if (source === 'foundation') {
      pile = this.foundations[pileIndex];
      card = pile.topCard();
    }


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
    // Проверяем, что selected и card существуют
    if (!this.selected || !this.selected.card) {
      console.warn('⚠️ tryMove: нет выбранной карты');
      return false;
    }
    
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

    // Запоминаем карту под перемещаемой группой и удаляем из источника
    if (source === 'tableau') {
      const p = this.tableaus[sourcePileIndex];
      if (this.selected && this.selected.cardIndex > 0) {
        revealedCardId = p.cards[this.selected.cardIndex - 1].id;
      }
      
      // Удаляем карты с проверкой
      for (const c of group) {
        if (!p.removeCard(c)) {
          console.error(`❌ Ошибка: карта ${c.id} не найдена в колонке ${sourcePileIndex}!`);
          return; // Прерываем перемещение
        }
      }
      
      const newTop = p.topCard();
      if (newTop && newTop.hidden) newTop.flip();
    } else if (source === 'waste') {
      if (!this.deck.removeFromWaste(group[0])) {
        console.error(`❌ Ошибка: карта ${group[0].id} не найдена в waste!`);
        return;
      }
    } else if (source === 'foundation') {
      if (!this.foundations[sourcePileIndex].removeCard(group[0])) {
        console.error(`❌ Ошибка: карта ${group[0].id} не найдена в foundation!`);
        return;
      }
    }

    // Добавляем в целевую стопку
    for (const c of group) {
      c.hidden = false;
      targetPile.addCard(c);
    }

    this.moves++;
    this.score += 10;
    this.selected = null;

    this.lastMove = {
      group: group.slice(),
      source, sourcePileIndex,
      targetSource, targetPileIndex,
      revealedCardId
    };

    this.dispatch('cardMoved', {
      card: group[0].id, from: source, fromIndex: sourcePileIndex,
      to: targetSource, toIndex: targetPileIndex
    });

    // Очищаем список автоперемещений перед новым ходом
    this.autoMovedCards = [];
    
    // Запускаем автоперемещение (если включено и ход НЕ с foundation)
    if (this.settings.autoFoundation && source !== 'foundation') {
      clearTimeout(this.autoMoveTimeout);
      this.autoMoveTimeout = setTimeout(() => this.autoMoveToFoundation(), 100);
    }

    this.checkWin();
    this.dispatch('stateChanged', {});
  }

  // Проверка на дубликаты карт
  checkForDuplicates() {
    const allCards = [];
    const duplicates = [];
    
    // Собираем все карты из waste
    for (const card of this.deck.waste) {
      allCards.push({ card, location: 'waste' });
    }
    
    // Собираем все карты из колонок
    for (let i = 0; i < this.tableaus.length; i++) {
      for (const card of this.tableaus[i].cards) {
        allCards.push({ card, location: `tableau-${i}` });
      }
    }
    
    // Собираем все карты из foundation
    for (let i = 0; i < this.foundations.length; i++) {
      for (const card of this.foundations[i].cards) {
        allCards.push({ card, location: `foundation-${i}` });
      }
    }
    
    // Ищем дубликаты
    const cardCount = {};
    for (const item of allCards) {
      const id = item.card.id;
      if (!cardCount[id]) {
        cardCount[id] = [];
      }
      cardCount[id].push(item.location);
      
      if (cardCount[id].length > 1 && !duplicates.includes(id)) {
        duplicates.push(id);
        console.error(`❌ ДУБЛИКАТ КАРТЫ ${id}:`, cardCount[id]);
      }
    }
    
    if (duplicates.length > 0) {
      console.error('Найдены дубликаты:', duplicates);
    }
  }

  autoMoveToFoundation() {
    let moved = true;
    while (moved) {
      moved = false;
      
      // Проверяем ВСЕ карты в waste (не только верхнюю)
      for (let i = this.deck.waste.length - 1; i >= 0; i--) {
        const card = this.deck.waste[i];
        if (this.tryAutoMove(card, 'waste', i)) {
          moved = true;
          break; // Начинаем проверку заново, так как waste изменился
        }
      }
      
      // Проверяем колонки
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
        
        // Пытаемся удалить карту из источника
        let removed = false;
        if (source === 'waste') {
          const idx = this.deck.waste.indexOf(card);
          if (idx !== -1) {
            this.deck.waste.splice(idx, 1);
            removed = true;
          }
        } else if (source === 'tableau') {
          // Используем removeCard, который вернет true, если карта найдена
          removed = this.tableaus[pileIndex].removeCard(card);
          if (removed) {
            const newTop = this.tableaus[pileIndex].topCard();
            if (newTop && newTop.hidden) {
              newTop.flip();
            }
          }
        }

        // Если не удалось удалить карту — прерываем перемещение!
        // Это предотвратит появление дубликатов
        if (!removed) {
          console.warn(`⚠️ Автоперемещение отменено: карта ${card.id} не найдена в источнике ${source}`);
          return false;
        }
        
        f.addCard(card);
        this.score += 15;
        
         // === ДОБАВИТЬ: Анимация для автоперемещения ===
        setTimeout(() => {
          const cardEl = document.querySelector(`.card[data-id="${card.id}"]`);
          const foundationEl = document.getElementById(`foundation-${i}`);
          if (cardEl && foundationEl) {
            cardEl.classList.add('auto-moving');
            setTimeout(() => {
              cardEl.classList.remove('auto-moving');
            }, 300);
          }
        }, 50);
        // ================================================

        // Сохраняем в список автоперемещений
        this.autoMovedCards.push({
          card: card,
          fromSource: source,
          fromPileIndex: pileIndex
        });
        
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

    // Анимированное перемещение карты
  animateCardMove(cardElement, targetPileElement, callback) {
    if (!cardElement || !targetPileElement) {
      if (callback) callback();
      return;
    }

    // Получаем координаты
    const startRect = cardElement.getBoundingClientRect();
    const targetRect = targetPileElement.getBoundingClientRect();

    // Вычисляем смещение
    const deltaX = targetRect.left - startRect.left;
    const deltaY = targetRect.top - startRect.top;

    // Добавляем класс для анимации
    cardElement.classList.add('moving');
    cardElement.style.transform = `translate(${deltaX}px, ${deltaY}px)`;

    // После завершения анимации
    setTimeout(() => {
      cardElement.classList.remove('moving');
      cardElement.style.transform = '';
      if (callback) callback();
    }, 250); // Должно совпадать с transition в CSS (0.25s)
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
        // Анимация
        setTimeout(() => {
          const cardEl = document.querySelector(`.card[data-id="${wasteTop.id}"]`);
          if (cardEl) {
            cardEl.classList.add('auto-moving');
            setTimeout(() => cardEl.classList.remove('auto-moving'), 300);
          }
        }, 50);
        this.dispatch('stateChanged', {});
        return;
      }

      // Проверяем все колонки
      for (let i = 0; i < this.tableaus.length; i++) {
        const top = this.tableaus[i].topCard();
        if (top && !top.hidden && this.tryAutoMove(top, 'tableau', i)) {
          hasWork = true;
          // Анимация
          setTimeout(() => {
            const cardEl = document.querySelector(`.card[data-id="${top.id}"]`);
            if (cardEl) {
              cardEl.classList.add('auto-moving');
              setTimeout(() => cardEl.classList.remove('auto-moving'), 300);
            }
          }, 50);
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
    }, 200); // Задержка 150мс между перемещениями
  }

  undo() {
    if (this.isPaused || this.isFinished) return false;
    if (this.hints.undo <= 0 || !this.lastMove) return false;

    // 1. Сначала возвращаем карты, которые были автоматически перемещены на базу
    for (const autoMove of this.autoMovedCards) {
      // Находим карту на foundation и удаляем её
      for (const f of this.foundations) {
        const idx = f.cards.indexOf(autoMove.card);
        if (idx !== -1) {
          f.cards.splice(idx, 1);
          break;
        }
      }
      
      // Возвращаем карту туда, откуда она была взята
      autoMove.card.hidden = false;
      if (autoMove.fromSource === 'waste') {
        this.deck.waste.push(autoMove.card);
      } else if (autoMove.fromSource === 'tableau') {
        this.tableaus[autoMove.fromPileIndex].addCard(autoMove.card);
      }
    }
    
    // Очищаем список автоперемещений
    this.autoMovedCards = [];

    // 2. Теперь отменяем основной ход
    const m = this.lastMove;
    let sourcePile, targetPile;

    if (m.source === 'waste') sourcePile = this.deck;
    else if (m.source === 'tableau') sourcePile = this.tableaus[m.sourcePileIndex];
    else if (m.source === 'foundation') sourcePile = this.foundations[m.sourcePileIndex];

    if (m.targetSource === 'tableau') targetPile = this.tableaus[m.targetPileIndex];
    else if (m.targetSource === 'foundation') targetPile = this.foundations[m.targetPileIndex];

    // Убираем из целевой стопки
    for (const c of m.group) {
      targetPile.removeCard(c);
    }

    // Возвращаем в исходную
    if (m.source === 'waste') {
      for (const c of m.group) {
        c.hidden = false;
        this.deck.waste.push(c);
      }
    } else {
      for (const c of m.group) {
        c.hidden = false;
        sourcePile.addCard(c);
      }
      
      // Закрываем карту под перемещённой
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
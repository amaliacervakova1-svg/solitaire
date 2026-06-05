// js/ui.js
// Отрисовка интерфейса и обработка пользовательских событий

import { Storage } from './storage.js';
import { drawStatsCanvas } from './stats.js';
import { Game } from './game.js';

export class UI {
  constructor() {
    this.game = null;
    this.currentSettings = {
      drawCount: 1,
      emptyKingOnly: true,
      autoFoundation: true,
      hints: { undo: 3, hint: 3, wand: 1 }
    };
    this.rulesData = null; // загрузится асинхронно
    this.highlightTimeout = null;

    this.loadSettings();
    this.bindStaticEvents();
  }

  // Загрузить сохранённые настройки (если есть)
  loadSettings() {
    const saved = Storage.getSettings();
    if (saved) {
      this.currentSettings = Object.assign(this.currentSettings, saved);
    }
  }

  // Привязать события, которые не зависят от игры
  bindStaticEvents() {
    // Стартовый экран
    document.getElementById('btn-start').addEventListener('click', () => this.startGame());
    document.getElementById('btn-rules').addEventListener('click', () => this.showRules());
    document.getElementById('btn-settings').addEventListener('click', () => this.showSettings());
    document.getElementById('btn-stats').addEventListener('click', () => this.showStats());

    // Модальное окно
    document.getElementById('modal-close').addEventListener('click', () => this.hideModal());
    document.getElementById('modal').addEventListener('click', (e) => {
      if (e.target.id === 'modal') this.hideModal();
    });

    // Кнопки во время игры
    document.getElementById('btn-undo').addEventListener('click', () => {
      if (this.game) this.game.undo();
    });
    document.getElementById('btn-hint').addEventListener('click', () => this.doHint());
    document.getElementById('btn-wand').addEventListener('click', () => {
      if (this.game) this.game.useWand();
    });
    document.getElementById('btn-pause').addEventListener('click', () => {
      if (this.game) this.game.pause();
    });
    document.getElementById('btn-menu').addEventListener('click', () => this.quitToMenu());

    // Пауза
    document.getElementById('btn-resume').addEventListener('click', () => {
      if (this.game) this.game.resume();
    });
    document.getElementById('btn-quit').addEventListener('click', () => {
      if (this.game) this.game.stopTimer();
      this.hideScreen('pause-screen');
      this.quitToMenu();
    });

    // Победа
    document.getElementById('btn-new-game').addEventListener('click', () => {
      this.hideScreen('win-screen');
      this.startGame();
    });
    document.getElementById('btn-to-menu').addEventListener('click', () => {
      this.hideScreen('win-screen');
      this.quitToMenu();
    });

    // Клик по игровому полю (делегирование)
    document.getElementById('game-field').addEventListener('click', (e) => {
      if (!this.game) return;

      const cardEl = e.target.closest('.card');
      const pileEl = e.target.closest('.pile');

      // 1. Если карта УЖЕ выбрана, и мы кликнули по пустой стопке (или мимо карты, но внутри стопки)
      if (this.game.selected && !cardEl && pileEl) {
        const pileId = pileEl.id;
        let moved = false;

        // Пытаемся переместить в колонку игрового поля
        if (pileId.startsWith('tableau-')) {
          const pileIndex = parseInt(pileId.split('-')[1]);
          moved = this.game.tryMove('tableau', pileIndex);
        } 
        // Пытаемся переместить на базу
        else if (pileId.startsWith('foundation-')) {
          const pileIndex = parseInt(pileId.split('-')[1]);
          moved = this.game.tryMove('foundation', pileIndex);
        }

        if (moved) return; // Если ход успешен, выходим

        // Если переместить не удалось (например, король не подходит по правилам), снимаем выделение
        this.game.selected = null;
        this.game.dispatch('selectionChanged', {});
        return;
      }

      // 2. Стандартная логика: клик по самой карте
      if (cardEl) {
        const source = cardEl.dataset.source;
        const pileIndex = parseInt(cardEl.dataset.pileIndex) || 0;
        const cardIndex = parseInt(cardEl.dataset.cardIndex) || 0;
        this.game.selectCard(source, pileIndex, cardIndex);
        return;
      }

      // 3. Клик мимо карт и мимо стопок (просто зелёный фон) — снимаем выделение
      if (this.game.selected) {
        this.game.selected = null;
        this.game.dispatch('selectionChanged', {});
      }
    });

    // Клавиатура (второе событие, помимо click)
    document.addEventListener('keydown', (e) => {
      // Работает только во время игры
      if (document.getElementById('game-screen').classList.contains('hidden')) return;
      if (!this.game) return;

      if (e.ctrlKey && (e.key === 'z' || e.key === 'Z' || e.key === 'я' || e.key === 'Я')) {
        e.preventDefault();
        this.game.undo();
      } else if (e.key === 'h' || e.key === 'H' || e.key === 'р' || e.key === 'Р') {
        this.doHint();
      } else if (e.key === 'Escape') {
        if (this.game.isPaused) this.game.resume();
        else this.game.pause();
      }
    });
  }

  // Привязать обработчики кастомных событий игры
  bindGameEvents() {
    document.addEventListener('stateChanged', () => this.render());
    document.addEventListener('selectionChanged', () => this.render());
    document.addEventListener('timerUpdate', (e) => {
      document.getElementById('timer').textContent = this.formatTime(e.detail.elapsed);
    });
    document.addEventListener('cardMoved', (e) => {
      // Логируем ход (для отладки)
      console.log('Ход:', e.detail);
    });
    document.addEventListener('hintUsed', () => this.updateHintCounts());
    document.addEventListener('gameStateChanged', (e) => {
      const state = e.detail.state;
      if (state === 'paused') {
        this.showScreen('pause-screen');
      } else if (state === 'playing') {
        this.hideScreen('pause-screen');
      } else if (state === 'won') {
        document.getElementById('win-time').textContent = this.formatTime(e.detail.elapsed);
        document.getElementById('win-moves').textContent = e.detail.moves;
        Storage.addGameResult(true, e.detail.elapsed);
        this.showScreen('win-screen');
      }
    });
  }

  // ===== Запуск игры =====
  startGame() {
    this.hideScreen('start-screen');
    this.showScreen('game-screen');

    this.game = new Game(this.currentSettings);
    this.bindGameEvents();
    this.game.start();
    this.render();
    this.updateHintCounts();
  }

  // Выйти в главное меню
  quitToMenu() {
    if (this.game) {
      // Если игра не закончена — считаем как поражение
      if (!this.game.isFinished && this.game.elapsed > 0) {
        Storage.addGameResult(false, this.game.elapsed);
      }
      this.game.stopTimer();
      this.game = null;
    }
    this.hideScreen('game-screen');
    this.hideScreen('pause-screen');
    this.hideScreen('win-screen');
    this.showScreen('start-screen');
  }

  // ===== Отрисовка игрового поля =====
  render() {
    if (!this.game) return;

    // Рендерим все стопки
    this.game.deck.render();
    this.game.tableaus.forEach(p => p.render());
    this.game.foundations.forEach(p => p.render());

    // Обновляем счётчики
    document.getElementById('moves').textContent = this.game.moves;
    document.getElementById('score').textContent = this.game.score;

    // Подсвечиваем выбранную карту
    if (this.game.selected) {
      const selId = this.game.selected.card.id;
      const el = document.querySelector(`.card[data-id="${selId}"]`);
      if (el) el.classList.add('selected');
      // Если выбрана группа в колонке — подсвечиваем все карты сверху
      if (this.game.selected.source === 'tableau') {
        const pile = this.game.tableaus[this.game.selected.pileIndex];
        for (let i = this.game.selected.cardIndex; i < pile.size(); i++) {
          const c = pile.cards[i];
          const cardEl = document.querySelector(`.card[data-id="${c.id}"]`);
          if (cardEl) cardEl.classList.add('selected');
        }
      }
    }

    // Блокируем кнопки, если подсказки закончились
    document.getElementById('btn-undo').disabled =
      this.game.hints.undo <= 0 || !this.game.lastMove;
    document.getElementById('btn-hint').disabled = this.game.hints.hint <= 0;
    document.getElementById('btn-wand').disabled = this.game.hints.wand <= 0;
  }

  updateHintCounts() {
    if (!this.game) return;
    document.getElementById('count-undo').textContent = this.game.hints.undo;
    document.getElementById('count-hint').textContent = this.game.hints.hint;
    document.getElementById('count-wand').textContent = this.game.hints.wand;
    this.render();
  }

  // ===== Подсказка хода =====
  doHint() {
    if (!this.game) return;
    const hint = this.game.showHint();
    if (!hint) {
      alert('Возможных ходов нет!');
      return;
    }
    // Подсвечиваем карту-источник и цель
    this.clearHighlight();
    const sourceEl = document.querySelector(`.card[data-id="${hint.card.id}"]`);
    if (sourceEl) sourceEl.classList.add('highlight');

    // Находим карту-цель
    let targetEl;
    if (hint.target.source === 'foundation') {
      const pile = this.game.foundations[hint.target.index];
      const top = pile.topCard();
      if (top) targetEl = document.querySelector(`.card[data-id="${top.id}"]`);
      else targetEl = document.getElementById(`foundation-${hint.target.index}`);
    } else if (hint.target.source === 'tableau') {
      const pile = this.game.tableaus[hint.target.index];
      const top = pile.topCard();
      if (top) targetEl = document.querySelector(`.card[data-id="${top.id}"]`);
      else targetEl = document.getElementById(`tableau-${hint.target.index}`);
    }
    if (targetEl) targetEl.classList.add('highlight');

    // Убираем подсветку через 2 секунды
    this.highlightTimeout = setTimeout(() => this.clearHighlight(), 2000);
  }

  clearHighlight() {
    if (this.highlightTimeout) {
      clearTimeout(this.highlightTimeout);
      this.highlightTimeout = null;
    }
    document.querySelectorAll('.card.highlight').forEach(el => el.classList.remove('highlight'));
  }

  // ===== Модальные окна =====
  showModal(html) {
    document.getElementById('modal-body').innerHTML = html;
    document.getElementById('modal').classList.remove('hidden');
  }

  hideModal() {
    document.getElementById('modal').classList.add('hidden');
  }

  showScreen(id) {
    document.getElementById(id).classList.remove('hidden');
  }

  hideScreen(id) {
    document.getElementById(id).classList.add('hidden');
  }

  // ===== Правила (асинхронная загрузка JSON) =====
  async showRules() {
    let html = '<h2>Правила игры</h2>';
    try {
      if (!this.rulesData) {
        const response = await fetch('data/rules.json');
        this.rulesData = await response.json();
      }
      html += `<h3>${this.rulesData.title}</h3>`;
      for (const section of this.rulesData.sections) {
        html += `<h3>${section.heading}</h3>`;
        if (section.text) html += `<p>${section.text}</p>`;
        if (section.list) {
          html += '<ul>';
          for (const item of section.list) {
            html += `<li>${item}</li>`;
          }
          html += '</ul>';
        }
      }
    } catch (e) {
      html += '<p>Не удалось загрузить правила.</p>';
    }
    this.showModal(html);
  }

  // ===== Настройки =====
  showSettings() {
    const s = this.currentSettings;
    const html = `
      <h2>Настройки игры</h2>
      <div class="setting-row">
        <label for="set-draw">Карт достаётся из колоды:</label>
        <select id="set-draw">
          <option value="1" ${s.drawCount === 1 ? 'selected' : ''}>1 карту</option>
          <option value="3" ${s.drawCount === 3 ? 'selected' : ''}>3 карты</option>
        </select>
      </div>
      <div class="setting-row">
        <label for="set-empty">На пустые ячейки можно класть:</label>
        <select id="set-empty">
          <option value="king" ${s.emptyKingOnly ? 'selected' : ''}>Только короля</option>
          <option value="any" ${!s.emptyKingOnly ? 'selected' : ''}>Любую карту</option>
        </select>
      </div>
      <div class="setting-row">
        <label for="set-auto">Автоперемещение на базу:</label>
        <select id="set-auto">
          <option value="yes" ${s.autoFoundation ? 'selected' : ''}>Да</option>
          <option value="no" ${!s.autoFoundation ? 'selected' : ''}>Нет</option>
        </select>
      </div>
      <button class="save-btn" id="save-settings">Сохранить</button>
    `;
    this.showModal(html);

    document.getElementById('save-settings').addEventListener('click', () => {
      this.currentSettings.drawCount = parseInt(document.getElementById('set-draw').value);
      this.currentSettings.emptyKingOnly = document.getElementById('set-empty').value === 'king';
      this.currentSettings.autoFoundation = document.getElementById('set-auto').value === 'yes';
      Storage.saveSettings(this.currentSettings);
      this.hideModal();
    });
  }

  // ===== Статистика (на canvas) =====
  showStats() {
    const stats = Storage.getStats();
    const html = `
      <h2>Статистика</h2>
      <canvas id="stats-canvas" width="500" height="300"></canvas>
      <button class="save-btn" id="reset-stats">Сбросить статистику</button>
    `;
    this.showModal(html);

    const canvas = document.getElementById('stats-canvas');
    drawStatsCanvas(canvas, stats);

    document.getElementById('reset-stats').addEventListener('click', () => {
      if (confirm('Точно сбросить всю статистику?')) {
        Storage.saveStats({
          gamesPlayed: 0, gamesWon: 0,
          bestTime: null, totalTime: 0
        });
        this.showStats(); // перерисовать
      }
    });
  }

  // Форматирование времени
  formatTime(ms) {
    if (!ms && ms !== 0) return '00:00';
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
}
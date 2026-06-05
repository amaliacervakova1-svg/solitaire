// js/storage.js
// Работа с localStorage

const SETTINGS_KEY = 'solitaire_settings';
const STATS_KEY = 'solitaire_stats';

export class Storage {
  static getSettings() {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      try { return JSON.parse(raw); } catch (e) { return null; }
    }
    return null;
  }

  static saveSettings(settings) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }

  static getStats() {
    const raw = localStorage.getItem(STATS_KEY);
    if (raw) {
      try { return JSON.parse(raw); } catch (e) {}
    }
    return {
      gamesPlayed: 0,
      gamesWon: 0,
      bestTime: null,
      totalTime: 0
    };
  }

  static saveStats(stats) {
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  }

  // Добавить результат завершённой игры
  static addGameResult(won, timeMs) {
    const stats = this.getStats();
    stats.gamesPlayed++;
    if (won) {
      stats.gamesWon++;
      stats.totalTime += timeMs;
      if (stats.bestTime === null || timeMs < stats.bestTime) {
        stats.bestTime = timeMs;
      }
    }
    this.saveStats(stats);
  }
}
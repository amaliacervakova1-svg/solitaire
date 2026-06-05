// js/app.js
// Точка входа — просто создаём UI и запускаем

import { UI } from './ui.js';

// Ждём полной загрузки DOM
document.addEventListener('DOMContentLoaded', () => {
  new UI();
});
// js/stats.js
// Отрисовка статистики на <canvas> (требование: если игра не на canvas — статистику рисуем на canvas)

export function drawStatsCanvas(canvas, stats) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;

  // Фон
  ctx.fillStyle = '#f5f5f5';
  ctx.fillRect(0, 0, W, H);

  // Заголовок
  ctx.fillStyle = '#2e7d32';
  ctx.font = 'bold 22px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('Статистика', W / 2, 35);

  // Числовые показатели
  ctx.font = '16px Arial';
  ctx.fillStyle = '#333';
  ctx.textAlign = 'left';
  const x = 40;
  let y = 75;
  const line = 28;

  ctx.fillText(`Сыграно партий: ${stats.gamesPlayed}`, x, y); y += line;
  ctx.fillText(`Выиграно: ${stats.gamesWon}`, x, y); y += line;

  const winRate = stats.gamesPlayed > 0
    ? Math.round(stats.gamesWon / stats.gamesPlayed * 100)
    : 0;
  ctx.fillText(`Процент побед: ${winRate}%`, x, y); y += line;

  ctx.fillText(`Лучшее время: ${formatTime(stats.bestTime)}`, x, y); y += line;

  const avgTime = stats.gamesWon > 0
    ? Math.round(stats.totalTime / stats.gamesWon)
    : null;
  ctx.fillText(`Среднее время (победы): ${formatTime(avgTime)}`, x, y); y += line + 10;

  // Полоса побед/поражений
  const barX = x;
  const barY = y;
  const barW = W - 80;
  const barH = 28;

  ctx.fillStyle = '#e0e0e0';
  ctx.fillRect(barX, barY, barW, barH);

  if (stats.gamesPlayed > 0) {
    const wonW = (stats.gamesWon / stats.gamesPlayed) * barW;
    ctx.fillStyle = '#4caf50';
    ctx.fillRect(barX, barY, wonW, barH);
  }

  ctx.strokeStyle = '#333';
  ctx.lineWidth = 1;
  ctx.strokeRect(barX, barY, barW, barH);

  ctx.fillStyle = '#333';
  ctx.font = '13px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('Победы / Всего партий', W / 2, barY + barH + 18);
}

function formatTime(ms) {
  if (ms === null || ms === undefined) return '—';
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}
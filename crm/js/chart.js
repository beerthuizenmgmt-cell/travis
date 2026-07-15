export function drawDualLineChart(canvasId, labels, seriesA, seriesB, opts = {}) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const colorA = opts.colorA || '#0048ff';
  const colorB = opts.colorB || '#059669';
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.parentElement.getBoundingClientRect();
  const h = 220;
  canvas.width = rect.width * dpr;
  canvas.height = h * dpr;
  canvas.style.width = rect.width + 'px';
  canvas.style.height = h + 'px';
  ctx.scale(dpr, dpr);

  const w = rect.width;
  const pad = { top: 20, right: 20, bottom: 30, left: 56 };
  const chartW = w - pad.left - pad.right;
  const chartH = h - pad.top - pad.bottom;
  const all = [...seriesA, ...seriesB];
  const max = Math.max(...all, 1) * 1.15;
  const min = Math.min(0, ...all);

  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = '#eef2fc';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + (chartH / 4) * i;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(w - pad.right, y);
    ctx.stroke();
    const val = max - ((max - min) / 4) * i;
    ctx.fillStyle = '#6b6b7b';
    ctx.font = '11px DM Sans, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('€' + Math.round(val / 100) / 10 + 'k', pad.left - 8, y + 4);
  }

  function drawLine(data, color) {
    if (data.length < 2) return;
    const points = data.map((v, i) => ({
      x: pad.left + (chartW / (data.length - 1)) * i,
      y: pad.top + chartH - ((v - min) / (max - min || 1)) * chartH,
    }));
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.stroke();
    points.forEach((p) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
    });
  }

  drawLine(seriesA, colorA);
  drawLine(seriesB, colorB);

  ctx.fillStyle = '#6b6b7b';
  ctx.font = '11px DM Sans, sans-serif';
  ctx.textAlign = 'center';
  labels.forEach((label, i) => {
    const x = pad.left + (chartW / (labels.length - 1 || 1)) * i;
    ctx.fillText(label, x, h - 8);
  });
}

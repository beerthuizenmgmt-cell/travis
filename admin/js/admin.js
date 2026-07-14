// Navigation
const navLinks = document.querySelectorAll('.nav-link[data-page]');
const pages = document.querySelectorAll('.page');

function showPage(pageId) {
  pages.forEach(p => p.classList.remove('active'));
  navLinks.forEach(l => l.classList.remove('active'));
  const page = document.getElementById(`page-${pageId}`);
  const link = document.querySelector(`.nav-link[data-page="${pageId}"]`);
  if (page) page.classList.add('active');
  if (link) link.classList.add('active');
  document.getElementById('sidebar')?.classList.remove('open');
}

navLinks.forEach(link => {
  link.addEventListener('click', e => {
    e.preventDefault();
    const page = link.dataset.page;
    showPage(page);
    history.replaceState(null, '', `#${page}`);
  });
});

const hash = location.hash.slice(1);
if (hash && document.getElementById(`page-${hash}`)) {
  showPage(hash);
}

// Sidebar toggle (mobile)
document.getElementById('sidebarToggle')?.addEventListener('click', () => {
  document.getElementById('sidebar')?.classList.toggle('open');
});

// Filter chips
document.querySelectorAll('.filter-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    chip.parentElement?.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
  });
});

// Toast helper
function toast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 3000);
}

document.getElementById('newCampaignBtn')?.addEventListener('click', () => {
  toast('Nieuwe campagne wizard komt binnenkort beschikbaar');
});

document.querySelectorAll('.btn-primary').forEach(btn => {
  if (btn.id === 'newCampaignBtn') return;
  btn.addEventListener('click', () => toast('Functie wordt geladen...'));
});

// Charts
function drawLineChart(canvasId, labels, data, color = '#ff5c35') {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = 220 * dpr;
  canvas.style.width = rect.width + 'px';
  canvas.style.height = '220px';
  ctx.scale(dpr, dpr);

  const w = rect.width;
  const h = 220;
  const pad = { top: 20, right: 20, bottom: 40, left: 50 };
  const chartW = w - pad.left - pad.right;
  const chartH = h - pad.top - pad.bottom;
  const max = Math.max(...data) * 1.1;
  const min = Math.min(...data) * 0.85;

  ctx.clearRect(0, 0, w, h);

  // Grid lines
  ctx.strokeStyle = '#e8e8ea';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + (chartH / 4) * i;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(w - pad.right, y);
    ctx.stroke();
    const val = max - ((max - min) / 4) * i;
    ctx.fillStyle = '#939395';
    ctx.font = '11px Inter, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('€' + Math.round(val / 1000) + 'k', pad.left - 8, y + 4);
  }

  // Area fill
  const points = data.map((v, i) => ({
    x: pad.left + (chartW / (data.length - 1)) * i,
    y: pad.top + chartH - ((v - min) / (max - min)) * chartH,
  }));

  const gradient = ctx.createLinearGradient(0, pad.top, 0, h - pad.bottom);
  gradient.addColorStop(0, color + '40');
  gradient.addColorStop(1, color + '05');
  ctx.beginPath();
  ctx.moveTo(points[0].x, h - pad.bottom);
  points.forEach(p => ctx.lineTo(p.x, p.y));
  ctx.lineTo(points[points.length - 1].x, h - pad.bottom);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  // Line
  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.stroke();

  // Dots
  points.forEach(p => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
  });

  // X labels
  ctx.fillStyle = '#939395';
  ctx.font = '11px Inter, sans-serif';
  ctx.textAlign = 'center';
  labels.forEach((label, i) => {
    const x = pad.left + (chartW / (labels.length - 1)) * i;
    ctx.fillText(label, x, h - 12);
  });
}

function drawBarChart(canvasId, labels, datasets) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = 240 * dpr;
  canvas.style.width = rect.width + 'px';
  canvas.style.height = '240px';
  ctx.scale(dpr, dpr);

  const w = rect.width;
  const h = 240;
  const pad = { top: 20, right: 20, bottom: 40, left: 50 };
  const chartW = w - pad.left - pad.right;
  const chartH = h - pad.top - pad.bottom;
  const colors = ['#ff5c35', '#3b82f6', '#8b5cf6', '#22c55e'];
  const groupW = chartW / labels.length;
  const barW = groupW / (datasets.length + 1);

  ctx.clearRect(0, 0, w, h);

  const allVals = datasets.flatMap(d => d.data);
  const max = Math.max(...allVals) * 1.15;

  datasets.forEach((set, si) => {
    set.data.forEach((v, i) => {
      const barH = (v / max) * chartH;
      const x = pad.left + groupW * i + barW * (si + 0.5);
      const y = pad.top + chartH - barH;
      ctx.fillStyle = colors[si];
      ctx.beginPath();
      ctx.roundRect(x, y, barW * 0.8, barH, [4, 4, 0, 0]);
      ctx.fill();
    });
  });

  ctx.fillStyle = '#939395';
  ctx.font = '11px Inter, sans-serif';
  ctx.textAlign = 'center';
  labels.forEach((label, i) => {
    ctx.fillText(label, pad.left + groupW * i + groupW / 2, h - 12);
  });

  // Legend
  datasets.forEach((set, i) => {
    ctx.fillStyle = colors[i];
    ctx.fillRect(pad.left + i * 100, 8, 12, 12);
    ctx.fillStyle = '#636466';
    ctx.font = '12px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(set.label, pad.left + i * 100 + 18, 18);
  });
}

const revenueData = [42000, 51000, 48000, 62000, 58000, 71000, 68000, 82000, 76000, 89420];
const revenueLabels = ['1 jun', '5 jun', '9 jun', '13 jun', '17 jun', '21 jun', '25 jun', '29 jun', '3 jul', '7 jul'];

function initCharts() {
  drawLineChart('revenueChart', revenueLabels, revenueData);
  drawBarChart('channelChart', ['E-mail', 'SMS', 'Push', 'WhatsApp'], [
    { label: 'Omzet', data: [55400, 19600, 8900, 5520] },
    { label: 'Verzonden', data: [77200, 27400, 12400, 7440] },
  ]);
}

initCharts();
window.addEventListener('resize', initCharts);

export function formatEuro(bedrag) {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(Number(bedrag) || 0);
}

export function formatDatum(datum) {
  if (!datum) return '—';
  return new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(datum));
}

export function huidigeMaand() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function maandBereik(maandStr) {
  const [jaar, maand] = maandStr.split('-').map(Number);
  const start = new Date(Date.UTC(jaar, maand - 1, 1));
  const eind = new Date(Date.UTC(jaar, maand, 1));
  return { start: start.toISOString().slice(0, 10), eind: eind.toISOString().slice(0, 10) };
}

export function toast(msg, isError = false) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.toggle('error', isError);
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 3200);
}

export function openModal(id) {
  document.getElementById(id)?.classList.add('open');
}

export function closeModal(id) {
  document.getElementById(id)?.classList.remove('open');
}

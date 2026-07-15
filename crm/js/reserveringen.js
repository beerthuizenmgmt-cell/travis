import { fetchReservations, createReservation, deleteReservation, fetchCommissieRegels } from './data.js';
import { berekenCommissieVoorReservering, brutoOmzetVoorReservering } from './commissieEngine.js';
import { formatEuro, formatDatum, openModal, closeModal, toast } from './utils.js';

const state = { dienstFilter: 'alle', maandFilter: '' };

function extraRowHtml(type = '', bedrag = '') {
  return `<div class="extra-row">
    <input type="text" class="extra-type" placeholder="bv. Visagie" value="${type}">
    <input type="number" class="extra-bedrag" placeholder="Bedrag (€)" step="0.01" value="${bedrag}">
    <button type="button" class="btn-icon extra-remove" aria-label="Verwijder">✕</button>
  </div>`;
}

function readExtras() {
  return [...document.querySelectorAll('#extrasList .extra-row')]
    .map((row) => ({
      type: row.querySelector('.extra-type').value.trim(),
      bedrag: Number(row.querySelector('.extra-bedrag').value || 0),
    }))
    .filter((e) => e.type && e.bedrag);
}

function resetForm() {
  document.getElementById('reservationForm').reset();
  document.getElementById('extrasList').innerHTML = '';
}

export function initReserveringenPage() {
  document.getElementById('addReservationBtn')?.addEventListener('click', () => {
    resetForm();
    openModal('reservationModalBackdrop');
  });
  document.getElementById('cancelReservationBtn')?.addEventListener('click', () => closeModal('reservationModalBackdrop'));
  document.getElementById('addExtraBtn')?.addEventListener('click', () => {
    document.getElementById('extrasList').insertAdjacentHTML('beforeend', extraRowHtml());
  });
  document.getElementById('extrasList')?.addEventListener('click', (e) => {
    if (e.target.classList.contains('extra-remove')) e.target.closest('.extra-row').remove();
  });

  document.getElementById('reservationForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await createReservation({
        klantnaam: document.getElementById('rKlant').value.trim(),
        datum: document.getElementById('rDatum').value,
        dienst: document.getElementById('rDienst').value,
        pakket: document.getElementById('rPakket').value.trim(),
        bruto_prijs: Number(document.getElementById('rBruto').value || 0),
        productie_kosten: Number(document.getElementById('rProductie').value || 0),
        status: document.getElementById('rStatus').value,
        extras: readExtras(),
        bron: 'handmatig',
      });
      closeModal('reservationModalBackdrop');
      toast('Reservering opgeslagen.');
      await renderReserveringen();
    } catch (err) {
      toast(`Opslaan mislukt: ${err.message}`, true);
    }
  });

  document.getElementById('reservationFilters')?.addEventListener('click', (e) => {
    const chip = e.target.closest('.filter-chip');
    if (!chip) return;
    document.querySelectorAll('#reservationFilters .filter-chip').forEach((c) => c.classList.remove('active'));
    chip.classList.add('active');
    state.dienstFilter = chip.dataset.dienst;
    renderReserveringen();
  });

  document.getElementById('reservationMonthFilter')?.addEventListener('change', (e) => {
    state.maandFilter = e.target.value;
    renderReserveringen();
  });

  document.getElementById('reservationsBody')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('.delete-reservation');
    if (!btn) return;
    if (!confirm('Deze reservering verwijderen?')) return;
    try {
      await deleteReservation(btn.dataset.id);
      toast('Reservering verwijderd.');
      await renderReserveringen();
    } catch (err) {
      toast(`Verwijderen mislukt: ${err.message}`, true);
    }
  });
}

export async function renderReserveringen() {
  const regels = await fetchCommissieRegels();
  let range = {};
  if (state.maandFilter) {
    const [j, m] = state.maandFilter.split('-').map(Number);
    range = {
      start: new Date(Date.UTC(j, m - 1, 1)).toISOString().slice(0, 10),
      eind: new Date(Date.UTC(j, m, 1)).toISOString().slice(0, 10),
    };
  }
  let reservations = await fetchReservations(range);
  if (state.dienstFilter !== 'alle') {
    reservations = reservations.filter((r) => r.dienst === state.dienstFilter);
  }

  const body = document.getElementById('reservationsBody');
  const empty = document.getElementById('reservationsEmpty');
  if (!reservations.length) {
    body.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  body.innerHTML = reservations.map((r) => {
    const c = berekenCommissieVoorReservering(r, regels);
    return `<tr>
      <td>${r.klantnaam}</td>
      <td>${r.dienst}</td>
      <td>${r.pakket}</td>
      <td>${formatDatum(r.datum)}</td>
      <td>${formatEuro(brutoOmzetVoorReservering(r))}</td>
      <td>${formatEuro(c.nettoBasis)}</td>
      <td class="money">${formatEuro(c.totaalCommissie)}</td>
      <td><span class="status status-${r.status}">${r.status}</span></td>
      <td><button class="btn-icon delete-reservation" data-id="${r.id}" aria-label="Verwijder">✕</button></td>
    </tr>`;
  }).join('');
}

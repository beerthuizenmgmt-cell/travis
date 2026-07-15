import {
  fetchReservations, createReservation, deleteReservation, markReservationBekeken, fetchNieuweAantal,
  fetchProductieKostenRegels,
  searchClients, createClient, fetchClientById, updateClient, sendReservationEmail,
} from './data.js';
import { brutoOmzetVoorReservering, nettoVoorReservering } from './commissieEngine.js';
import { openClientDetail } from './klanten.js';
import { formatEuro, formatDatum, openModal, closeModal, toast } from './utils.js';

const state = { dienstFilter: 'alle', maandFilter: '', onlyNew: false };
let productieRegels = [];
let lastAutofilledValue = null;

const bronLabels = {
  handmatig: 'Zelf',
  calendly_import: 'Calendly',
  nathanisya_invoer: 'Invoerportaal',
};

function vindProductieDefault(dienst, pakket) {
  const p = pakket.trim().toLowerCase();
  if (!p) return null;
  return productieRegels.find((r) => r.dienst === dienst && r.pakket.trim().toLowerCase() === p) || null;
}

function updateProductieHint() {
  const dienst = document.getElementById('rDienst').value;
  const pakket = document.getElementById('rPakket').value;
  const productieInput = document.getElementById('rProductie');
  const hint = document.getElementById('productieHint');
  const match = vindProductieDefault(dienst, pakket);

  if (!match) {
    hint.textContent = '';
    return;
  }
  hint.textContent = `Standaard voor ${dienst} ${pakket}: ${formatEuro(match.bedrag)}`;

  const huidigeWaarde = productieInput.value === '' ? null : Number(productieInput.value);
  const onaangeraakt = huidigeWaarde === null || huidigeWaarde === 0 || huidigeWaarde === lastAutofilledValue;
  if (onaangeraakt) {
    productieInput.value = match.bedrag;
    lastAutofilledValue = match.bedrag;
  }
}

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
  document.getElementById('productieHint').textContent = '';
  document.getElementById('rClientId').value = '';
  document.getElementById('rClientHint').textContent = '';
  document.getElementById('rClientSuggest').innerHTML = '';
  document.getElementById('rClientSuggest').classList.remove('open');
  document.getElementById('rKlantEmail').value = '';
  document.getElementById('rSendEmail').checked = false;
  updateEmailHint();
  lastAutofilledValue = null;
}

function updateEmailHint() {
  const status = document.getElementById('rStatus')?.value;
  const hint = document.getElementById('rEmailHint');
  const wrap = document.getElementById('rSendEmailWrap');
  const checkbox = document.getElementById('rSendEmail');
  if (!hint || !wrap) return;
  if (status === 'geannuleerd') {
    wrap.style.opacity = '0.5';
    checkbox.disabled = true;
    checkbox.checked = false;
    hint.textContent = '— niet beschikbaar bij geannuleerd';
  } else {
    wrap.style.opacity = '1';
    checkbox.disabled = false;
    hint.textContent = status === 'concept'
      ? '— stuurt betaallink via Stripe'
      : '— stuurt bevestigingsmail';
  }
}

function escKlant(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

let clientSearchTimer = null;
function initClientPicker() {
  const input = document.getElementById('rKlant');
  const hidden = document.getElementById('rClientId');
  const suggest = document.getElementById('rClientSuggest');
  const hint = document.getElementById('rClientHint');
  if (!input) return;

  input.addEventListener('input', () => {
    hidden.value = '';
    hint.textContent = '';
    const term = input.value.trim();
    clearTimeout(clientSearchTimer);
    if (!term) {
      suggest.innerHTML = '';
      suggest.classList.remove('open');
      return;
    }
    clientSearchTimer = setTimeout(async () => {
      let resultaten = [];
      try {
        resultaten = await searchClients(term);
      } catch {
        resultaten = [];
      }
      if (!resultaten.length) {
        suggest.innerHTML = '';
        suggest.classList.remove('open');
        return;
      }
      suggest.innerHTML = resultaten.map((c) => `<button type="button" class="client-suggest-item" data-id="${c.id}" data-naam="${escKlant(c.naam)}" data-email="${escKlant(c.email || '')}">
        <strong>${escKlant(c.naam)}</strong>${c.bedrijf ? ` <span class="text-muted">· ${escKlant(c.bedrijf)}</span>` : ''}
      </button>`).join('');
      suggest.classList.add('open');
    }, 200);
  });

  suggest.addEventListener('click', (e) => {
    const item = e.target.closest('.client-suggest-item');
    if (!item) return;
    input.value = item.dataset.naam;
    hidden.value = item.dataset.id;
    if (item.dataset.email) document.getElementById('rKlantEmail').value = item.dataset.email;
    hint.textContent = 'Bestaande klant gekoppeld.';
    suggest.innerHTML = '';
    suggest.classList.remove('open');
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.client-picker')) {
      suggest.classList.remove('open');
    }
  });
}

// Bepaal de client_id: gekozen suggestie, exacte naammatch, of nieuwe klant.
async function resolveClientId(naam) {
  const gekozen = document.getElementById('rClientId').value;
  if (gekozen) return gekozen;
  const schoon = naam.trim();
  if (!schoon) return null;
  try {
    const resultaten = await searchClients(schoon);
    const exact = resultaten.find((c) => c.naam.trim().toLowerCase() === schoon.toLowerCase());
    if (exact) return exact.id;
    const nieuw = await createClient({ naam: schoon });
    return nieuw.id;
  } catch {
    return null;
  }
}

export async function updateNewCountBadges() {
  let count = 0;
  try {
    count = await fetchNieuweAantal();
  } catch {
    count = 0;
  }
  document.getElementById('sidebarNewCount').textContent = count > 0 ? String(count) : '';
  const chipBadge = document.getElementById('newCountBadge');
  if (chipBadge) chipBadge.textContent = count > 0 ? `(${count})` : '';
}

export async function openReservationForClient(client) {
  resetForm();
  try {
    productieRegels = await fetchProductieKostenRegels();
  } catch {
    productieRegels = [];
  }
  if (client?.naam) {
    document.getElementById('rKlant').value = client.naam;
    document.getElementById('rClientId').value = client.id || '';
    document.getElementById('rClientHint').textContent = 'Klant gekoppeld.';
  }
  if (client?.email) document.getElementById('rKlantEmail').value = client.email;
  updateEmailHint();
  openModal('reservationModalBackdrop');
}

export function initReserveringenPage() {
  document.getElementById('addReservationBtn')?.addEventListener('click', async () => {
    resetForm();
    try {
      productieRegels = await fetchProductieKostenRegels();
    } catch {
      productieRegels = [];
    }
    updateEmailHint();
    openModal('reservationModalBackdrop');
  });
  document.getElementById('cancelReservationBtn')?.addEventListener('click', () => closeModal('reservationModalBackdrop'));
  initClientPicker();
  document.getElementById('rStatus')?.addEventListener('change', updateEmailHint);
  document.getElementById('rDienst')?.addEventListener('change', updateProductieHint);
  document.getElementById('rPakket')?.addEventListener('input', updateProductieHint);
  document.getElementById('addExtraBtn')?.addEventListener('click', () => {
    document.getElementById('extrasList').insertAdjacentHTML('beforeend', extraRowHtml());
  });
  document.getElementById('extrasList')?.addEventListener('click', (e) => {
    if (e.target.classList.contains('extra-remove')) e.target.closest('.extra-row').remove();
  });

  document.getElementById('reservationForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const klantnaam = document.getElementById('rKlant').value.trim();
      const klantEmail = document.getElementById('rKlantEmail').value.trim() || null;
      const status = document.getElementById('rStatus').value;
      const sendEmail = document.getElementById('rSendEmail').checked;
      const clientId = await resolveClientId(klantnaam);

      if (clientId && klantEmail) {
        try {
          const client = await fetchClientById(clientId);
          if (client && !client.email) await updateClient(clientId, { email: klantEmail });
        } catch { /* niet kritisch */ }
      }

      const saved = await createReservation({
        klantnaam,
        client_id: clientId,
        klant_email: klantEmail,
        datum: document.getElementById('rDatum').value,
        dienst: document.getElementById('rDienst').value,
        pakket: document.getElementById('rPakket').value.trim(),
        bruto_prijs: Number(document.getElementById('rBruto').value || 0),
        productie_kosten: Number(document.getElementById('rProductie').value || 0),
        status,
        extras: readExtras(),
        bron: 'handmatig',
        bekeken: true,
      });

      closeModal('reservationModalBackdrop');
      toast('Reservering opgeslagen.');
      await renderReserveringen();

      if (sendEmail && status !== 'geannuleerd') {
        if (!klantEmail) {
          toast('Geen e-mailadres ingevuld — mail niet verstuurd.', true);
          return;
        }
        try {
          const result = await sendReservationEmail(saved.id);
          toast(result.type === 'betaal'
            ? `Betaalmail verstuurd naar ${result.email}.`
            : `Bevestigingsmail verstuurd naar ${result.email}.`);
          await renderReserveringen();
        } catch (mailErr) {
          toast(`Reservering opgeslagen, maar mail mislukt: ${mailErr.message}`, true);
        }
      }
    } catch (err) {
      toast(`Opslaan mislukt: ${err.message}`, true);
    }
  });

  document.getElementById('reservationFilters')?.addEventListener('click', (e) => {
    const onlyNewChip = e.target.closest('#onlyNewFilterChip');
    if (onlyNewChip) {
      state.onlyNew = !state.onlyNew;
      onlyNewChip.classList.toggle('active', state.onlyNew);
      renderReserveringen();
      return;
    }
    const chip = e.target.closest('.filter-chip[data-dienst]');
    if (!chip) return;
    document.querySelectorAll('#reservationFilters .filter-chip[data-dienst]').forEach((c) => c.classList.remove('active'));
    chip.classList.add('active');
    state.dienstFilter = chip.dataset.dienst;
    renderReserveringen();
  });

  document.getElementById('reservationMonthFilter')?.addEventListener('change', (e) => {
    state.maandFilter = e.target.value;
    renderReserveringen();
  });

  document.getElementById('reservationsBody')?.addEventListener('click', async (e) => {
    const clientLink = e.target.closest('.open-client-link');
    if (clientLink) {
      e.preventDefault();
      await openClientDetail(clientLink.dataset.id);
      return;
    }
    const deleteBtn = e.target.closest('.delete-reservation');
    if (deleteBtn) {
      if (!confirm('Deze reservering verwijderen?')) return;
      try {
        await deleteReservation(deleteBtn.dataset.id);
        toast('Reservering verwijderd.');
        await renderReserveringen();
        await updateNewCountBadges();
      } catch (err) {
        toast(`Verwijderen mislukt: ${err.message}`, true);
      }
      return;
    }
    const bekekenBtn = e.target.closest('.mark-bekeken');
    if (bekekenBtn) {
      try {
        await markReservationBekeken(bekekenBtn.dataset.id);
        await renderReserveringen();
        await updateNewCountBadges();
      } catch (err) {
        toast(`Bijwerken mislukt: ${err.message}`, true);
      }
      return;
    }
    const mailBtn = e.target.closest('.send-reservation-mail');
    if (mailBtn) {
      mailBtn.disabled = true;
      try {
        const result = await sendReservationEmail(mailBtn.dataset.id);
        toast(result.type === 'betaal'
          ? `Betaalmail opnieuw verstuurd naar ${result.email}.`
          : `Bevestigingsmail opnieuw verstuurd naar ${result.email}.`);
        await renderReserveringen();
      } catch (err) {
        toast(`Mail versturen mislukt: ${err.message}`, true);
      } finally {
        mailBtn.disabled = false;
      }
    }
  });
}

export async function renderReserveringen() {
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
  if (state.onlyNew) {
    reservations = reservations.filter((r) => !r.bekeken);
  }

  const body = document.getElementById('reservationsBody');
  const empty = document.getElementById('reservationsEmpty');
  if (!reservations.length) {
    body.innerHTML = '';
    empty.style.display = 'block';
    await updateNewCountBadges();
    return;
  }
  empty.style.display = 'none';

  body.innerHTML = reservations.map((r) => {
    const nieuw = !r.bekeken;
    const naamCell = r.client_id
      ? `<a href="#" class="open-client-link" data-id="${r.client_id}">${escKlant(r.klantnaam)}</a>`
      : escKlant(r.klantnaam);
    return `<tr style="${nieuw ? 'background:var(--brand-light)' : ''}">
      <td>${naamCell}${nieuw ? ' <span class="status status-bevestigd">nieuw</span>' : ''}</td>
      <td>${r.dienst}</td>
      <td>${r.pakket}</td>
      <td class="text-muted">${bronLabels[r.bron] || r.bron}</td>
      <td>${formatDatum(r.datum)}</td>
      <td>${formatEuro(brutoOmzetVoorReservering(r))}</td>
      <td class="money">${formatEuro(nettoVoorReservering(r))}</td>
      <td><span class="status status-${r.status}">${r.status}</span></td>
      <td style="white-space:nowrap">
        ${r.status !== 'geannuleerd' ? `<button class="btn-icon send-reservation-mail" data-id="${r.id}" title="${r.email_verzonden_op ? 'Mail opnieuw versturen' : 'Mail versturen'}" aria-label="Mail versturen">✉</button>` : ''}
        ${nieuw ? `<button class="btn-icon mark-bekeken" data-id="${r.id}" aria-label="Markeer als bekeken" title="Markeer als bekeken">✓</button>` : ''}
        <button class="btn-icon delete-reservation" data-id="${r.id}" aria-label="Verwijder">✕</button>
      </td>
    </tr>`;
  }).join('');

  await updateNewCountBadges();
}

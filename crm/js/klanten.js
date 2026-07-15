import {
  fetchClients, fetchClientBookingStats, fetchClientById,
  createClient, updateClient, deleteClient,
  fetchReservationsByClient, fetchClientNotes, createClientNote,
  fetchKlantTaken, createKlantTaak, updateKlantTaak, deleteKlantTaak,
  fetchCommissieRegels,
} from './data.js';
import { berekenCommissieVoorReservering, brutoOmzetVoorReservering } from './commissieEngine.js';
import { formatEuro, formatDatum, openModal, closeModal, toast } from './utils.js';

const state = { zoek: '', clients: [], stats: new Map(), huidigeKlant: null };

const BRON_OPTIES = ['Calendly', 'Nathanisya', 'Instagram', 'Doorverwijzing', 'Walk-in', 'Website', 'Overig'];

function normalizeNaam(naam) {
  return String(naam || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function namesSimilar(a, b) {
  const na = normalizeNaam(a);
  const nb = normalizeNaam(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.length >= 4 && nb.length >= 4 && (na.includes(nb) || nb.includes(na))) return true;
  if (Math.abs(na.length - nb.length) > 3) return false;
  let dist = 0;
  const max = Math.max(na.length, nb.length);
  for (let i = 0; i < max; i += 1) {
    if (na[i] !== nb[i]) dist += 1;
    if (dist > 2) return false;
  }
  return dist <= 2 && Math.min(na.length, nb.length) >= 4;
}

function resolveBronValue(bron) {
  if (!bron) return '';
  const exact = BRON_OPTIES.find((o) => o.toLowerCase() === bron.trim().toLowerCase());
  if (exact) return exact;
  const partial = BRON_OPTIES.find((o) => bron.toLowerCase().includes(o.toLowerCase()));
  return partial || bron;
}

function setBronSelect(bron) {
  const select = document.getElementById('cBron');
  if (!select) return;
  const value = resolveBronValue(bron);
  if (value && !BRON_OPTIES.includes(value) && ![...select.options].some((o) => o.value === value)) {
    select.insertAdjacentHTML('beforeend', `<option value="${esc(value)}">${esc(value)}</option>`);
  }
  select.value = BRON_OPTIES.includes(value) || [...select.options].some((o) => o.value === value) ? value : '';
}

function findDuplicateClients({ naam, email, excludeId }) {
  const dupes = [];
  const seen = new Set();
  for (const client of state.clients) {
    if (excludeId && client.id === excludeId) continue;
    let reason = null;
    if (email && client.email && email.toLowerCase() === client.email.toLowerCase()) {
      reason = 'hetzelfde e-mailadres';
    } else if (naam && namesSimilar(naam, client.naam)) {
      reason = 'een vergelijkbare naam';
    }
    if (reason && !seen.has(client.id)) {
      seen.add(client.id);
      dupes.push({ client, reason });
    }
  }
  return dupes;
}

function confirmDuplicates(dupes) {
  if (!dupes.length) return true;
  const lines = dupes.map(({ client, reason }) => `• ${client.naam}${client.email ? ` (${client.email})` : ''} — ${reason}`);
  return confirm(`Mogelijke dubbele klant:\n\n${lines.join('\n')}\n\nToch opslaan?`);
}

function morgenDatum() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function renderFormContactActions() {
  const wrap = document.getElementById('cContactActions');
  if (!wrap) return;
  const email = document.getElementById('cEmail')?.value.trim();
  const telefoon = document.getElementById('cTelefoon')?.value.trim();
  const links = [];
  if (email) links.push(`<a href="mailto:${encodeURIComponent(email)}">✉ E-mail sturen</a>`);
  if (telefoon) links.push(`<a href="tel:${telefoon.replace(/[^\d+]/g, '')}">📞 Bellen</a>`);
  if (!links.length) {
    wrap.hidden = true;
    wrap.innerHTML = '';
    return;
  }
  wrap.hidden = false;
  wrap.innerHTML = links.join('');
}

function renderContactValue(label, val) {
  if (!val) return '—';
  if (label === 'E-mail') {
    return `<a href="mailto:${encodeURIComponent(val)}">${esc(val)}</a>`;
  }
  if (label === 'Telefoon') {
    return `<a href="tel:${val.replace(/[^\d+]/g, '')}">${esc(val)}</a>`;
  }
  return esc(val);
}

function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

const dienstLabels = { foto: 'Fotostudio', podcast: 'Podcast', influencer: 'Influencer' };

export function initKlantenPage() {
  document.getElementById('addClientBtn')?.addEventListener('click', () => openClientForm());
  document.getElementById('cancelClientBtn')?.addEventListener('click', () => closeModal('clientModalBackdrop'));

  document.getElementById('clientSearch')?.addEventListener('input', (e) => {
    state.zoek = e.target.value.trim().toLowerCase();
    renderClientList();
  });

  document.getElementById('clientForm')?.addEventListener('submit', onClientFormSubmit);
  document.getElementById('cEmail')?.addEventListener('input', renderFormContactActions);
  document.getElementById('cTelefoon')?.addEventListener('input', renderFormContactActions);

  document.getElementById('clientsBody')?.addEventListener('click', (e) => {
    const editBtn = e.target.closest('.edit-client');
    if (editBtn) {
      e.stopPropagation();
      const client = state.clients.find((c) => c.id === editBtn.dataset.id);
      if (client) openClientForm(client);
      return;
    }
    const delBtn = e.target.closest('.delete-client');
    if (delBtn) {
      e.stopPropagation();
      onDeleteClient(delBtn.dataset.id);
      return;
    }
    const row = e.target.closest('tr[data-id]');
    if (row) openClientDetail(row.dataset.id);
  });

  document.getElementById('cdEditBtn')?.addEventListener('click', () => {
    if (state.huidigeKlant) openClientForm(state.huidigeKlant);
  });
  document.getElementById('cdNoteForm')?.addEventListener('submit', onNoteSubmit);
  document.getElementById('cdTaskForm')?.addEventListener('submit', onTaskSubmit);
  document.getElementById('cdTasks')?.addEventListener('click', onTaskClick);
}

export async function renderKlanten() {
  const [clients, stats] = await Promise.all([fetchClients(), fetchClientBookingStats()]);
  state.clients = clients;
  state.stats = stats;
  renderClientList();
}

function renderClientList() {
  const body = document.getElementById('clientsBody');
  const empty = document.getElementById('clientsEmpty');
  let lijst = state.clients;
  if (state.zoek) {
    lijst = lijst.filter((c) => `${c.naam} ${c.bedrijf || ''} ${c.email || ''}`.toLowerCase().includes(state.zoek));
  }
  if (!lijst.length) {
    body.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';
  body.innerHTML = lijst.map((c) => {
    const s = state.stats.get(c.id) || { aantal: 0, laatste: null };
    const contact = c.email || c.telefoon || '—';
    return `<tr data-id="${c.id}" style="cursor:pointer">
      <td><strong>${esc(c.naam)}</strong></td>
      <td class="text-muted">${esc(contact)}</td>
      <td>${esc(c.bedrijf || '—')}</td>
      <td class="text-muted">${esc(c.bron || '—')}</td>
      <td>${s.aantal}</td>
      <td>${s.laatste ? formatDatum(s.laatste) : '—'}</td>
      <td style="white-space:nowrap">
        <button class="btn-icon edit-client" data-id="${c.id}" title="Bewerken" aria-label="Bewerken">✎</button>
        <button class="btn-icon delete-client" data-id="${c.id}" title="Verwijderen" aria-label="Verwijderen">✕</button>
      </td>
    </tr>`;
  }).join('');
}

function openClientForm(client = null) {
  const form = document.getElementById('clientForm');
  form.reset();
  const bronSelect = document.getElementById('cBron');
  bronSelect?.querySelectorAll('option[data-legacy]').forEach((o) => o.remove());

  document.getElementById('cId').value = client?.id || '';
  document.getElementById('cNaam').value = client?.naam || '';
  document.getElementById('cBedrijf').value = client?.bedrijf || '';
  document.getElementById('cEmail').value = client?.email || '';
  document.getElementById('cTelefoon').value = client?.telefoon || '';
  setBronSelect(client?.bron || '');
  document.getElementById('cNotitieKort').value = client?.notitie_kort || '';
  document.getElementById('clientModalTitle').textContent = client ? 'Klant bewerken' : 'Klant toevoegen';

  const opts = document.getElementById('cNewClientOptions');
  if (opts) opts.style.display = client ? 'none' : '';
  document.getElementById('cOpenReservation').checked = false;
  document.getElementById('cAddTask').checked = false;

  renderFormContactActions();
  openModal('clientModalBackdrop');
}

async function onClientFormSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('cId').value;
  const isNew = !id;
  const fields = {
    naam: document.getElementById('cNaam').value.trim(),
    bedrijf: document.getElementById('cBedrijf').value.trim() || null,
    email: document.getElementById('cEmail').value.trim() || null,
    telefoon: document.getElementById('cTelefoon').value.trim() || null,
    bron: document.getElementById('cBron').value.trim() || null,
    notitie_kort: document.getElementById('cNotitieKort').value.trim() || null,
  };

  const dupes = findDuplicateClients({ naam: fields.naam, email: fields.email, excludeId: id || null });
  if (!confirmDuplicates(dupes)) return;

  const openReservation = isNew && document.getElementById('cOpenReservation')?.checked;
  const addTask = isNew && document.getElementById('cAddTask')?.checked;

  try {
    let saved = null;
    if (id) {
      await updateClient(id, fields);
      saved = { id, ...fields };
      toast('Klant bijgewerkt.');
    } else {
      saved = await createClient(fields);
      toast('Klant toegevoegd.');
      if (addTask) {
        await createKlantTaak({
          client_id: saved.id,
          tekst: 'Bel klant binnen 24u',
          deadline: morgenDatum(),
        });
      }
    }
    closeModal('clientModalBackdrop');
    await renderKlanten();
    if (id && state.huidigeKlant?.id === id) await openClientDetail(id);
    if (openReservation && saved) {
      const { openReservationForClient } = await import('./reserveringen.js');
      await openReservationForClient(saved);
    }
  } catch (err) {
    toast(`Opslaan mislukt: ${err.message}`, true);
  }
}

async function onDeleteClient(id) {
  const client = state.clients.find((c) => c.id === id);
  const s = state.stats.get(id);
  let vraag = `Klant "${client?.naam || ''}" verwijderen?`;
  if (s?.aantal) vraag += `\n\nLet op: de ${s.aantal} boeking(en) blijven bestaan, maar zijn niet meer aan een klant gekoppeld.`;
  if (!confirm(vraag)) return;
  try {
    await deleteClient(id);
    toast('Klant verwijderd.');
    await renderKlanten();
  } catch (err) {
    toast(`Verwijderen mislukt: ${err.message}`, true);
  }
}

export async function openClientDetail(id) {
  try {
    const client = await fetchClientById(id);
    if (!client) {
      toast('Klant niet gevonden.', true);
      return;
    }
    state.huidigeKlant = client;
    document.getElementById('cdNaam').textContent = client.naam;
    const metaParts = [client.bedrijf, client.bron ? `via ${client.bron}` : null].filter(Boolean);
    document.getElementById('cdMeta').textContent = metaParts.join(' · ') || '—';

    document.getElementById('cdContact').innerHTML = [
      ['E-mail', client.email],
      ['Telefoon', client.telefoon],
      ['Bedrijf', client.bedrijf],
      ['Bron', client.bron],
    ].map(([label, val]) => `<div class="cd-field"><span>${label}</span><strong>${renderContactValue(label, val)}</strong></div>`).join('')
      + (client.notitie_kort ? `<div class="cd-field cd-field-full"><span>Notitie</span><strong>${esc(client.notitie_kort)}</strong></div>` : '');

    openModal('clientDetailBackdrop');
    await Promise.all([renderClientBookings(id), renderClientTasks(id), renderClientNotes(id)]);
  } catch (err) {
    toast(`Kon klant niet laden: ${err.message}`, true);
  }
}

async function renderClientBookings(clientId) {
  const [reservations, regels] = await Promise.all([
    fetchReservationsByClient(clientId),
    fetchCommissieRegels(),
  ]);
  const head = document.getElementById('cdBookingsHead');
  const body = document.getElementById('cdBookingsBody');
  const empty = document.getElementById('cdBookingsEmpty');
  head.innerHTML = '<th>Datum</th><th>Dienst</th><th>Pakket</th><th>Bruto</th><th>Commissie</th><th>Status</th>';
  if (!reservations.length) {
    body.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';
  body.innerHTML = reservations.map((r) => {
    const c = berekenCommissieVoorReservering(r, regels);
    return `<tr>
      <td>${formatDatum(r.datum)}</td>
      <td>${dienstLabels[r.dienst] || esc(r.dienst)}</td>
      <td>${esc(r.pakket)}</td>
      <td>${formatEuro(brutoOmzetVoorReservering(r))}</td>
      <td class="money">${formatEuro(c.totaalCommissie)}</td>
      <td><span class="status status-${r.status}">${r.status}</span></td>
    </tr>`;
  }).join('');
}

async function renderClientNotes(clientId) {
  const notes = await fetchClientNotes(clientId);
  const wrap = document.getElementById('cdNotes');
  if (!notes.length) {
    wrap.innerHTML = '<p class="text-muted" style="padding:8px 0">Nog geen notities.</p>';
    return;
  }
  wrap.innerHTML = notes.map((n) => `<div class="note-item">
    <p>${esc(n.tekst)}</p>
    <span class="text-muted">${formatDatum(n.created_at)}</span>
  </div>`).join('');
}

async function renderClientTasks(clientId) {
  const taken = await fetchKlantTaken(clientId);
  const wrap = document.getElementById('cdTasks');
  if (!taken.length) {
    wrap.innerHTML = '<p class="text-muted" style="padding:8px 0">Geen openstaande taken.</p>';
    return;
  }
  const vandaag = new Date().toISOString().slice(0, 10);
  wrap.innerHTML = taken.map((t) => {
    const overdue = t.deadline && t.deadline < vandaag && !t.afgerond;
    return `<div class="task-item ${t.afgerond ? 'done' : ''} ${overdue ? 'overdue' : ''}" data-id="${t.id}">
      <label class="task-check"><input type="checkbox" class="task-toggle" data-id="${t.id}" ${t.afgerond ? 'checked' : ''}> ${esc(t.tekst)}</label>
      <div class="task-meta">
        ${t.deadline ? `<span class="${overdue ? 'text-warn' : 'text-muted'}">${formatDatum(t.deadline)}</span>` : ''}
        <button type="button" class="btn-icon task-delete" data-id="${t.id}" title="Verwijderen">✕</button>
      </div>
    </div>`;
  }).join('');
}

async function onTaskSubmit(e) {
  e.preventDefault();
  if (!state.huidigeKlant) return;
  const textEl = document.getElementById('cdTaskText');
  const deadlineEl = document.getElementById('cdTaskDeadline');
  const tekst = textEl.value.trim();
  if (!tekst) return;
  try {
    await createKlantTaak({
      client_id: state.huidigeKlant.id,
      tekst,
      deadline: deadlineEl.value || null,
    });
    textEl.value = '';
    deadlineEl.value = '';
    await renderClientTasks(state.huidigeKlant.id);
    toast('Taak toegevoegd.');
  } catch (err) {
    toast(`Taak opslaan mislukt: ${err.message}`, true);
  }
}

async function onTaskClick(e) {
  const toggle = e.target.closest('.task-toggle');
  if (toggle) {
    try {
      await updateKlantTaak(toggle.dataset.id, { afgerond: toggle.checked });
      if (state.huidigeKlant) await renderClientTasks(state.huidigeKlant.id);
    } catch (err) {
      toast(`Bijwerken mislukt: ${err.message}`, true);
    }
    return;
  }
  const del = e.target.closest('.task-delete');
  if (del) {
    if (!confirm('Taak verwijderen?')) return;
    try {
      await deleteKlantTaak(del.dataset.id);
      if (state.huidigeKlant) await renderClientTasks(state.huidigeKlant.id);
    } catch (err) {
      toast(`Verwijderen mislukt: ${err.message}`, true);
    }
  }
}

async function onNoteSubmit(e) {
  e.preventDefault();
  if (!state.huidigeKlant) return;
  const textEl = document.getElementById('cdNoteText');
  const tekst = textEl.value.trim();
  if (!tekst) return;
  try {
    await createClientNote(state.huidigeKlant.id, tekst);
    textEl.value = '';
    await renderClientNotes(state.huidigeKlant.id);
  } catch (err) {
    toast(`Notitie opslaan mislukt: ${err.message}`, true);
  }
}

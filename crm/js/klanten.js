import {
  fetchClients, fetchClientBookingStats, fetchClientById,
  createClient, updateClient, deleteClient, fetchTeamLeden,
  fetchReservationsByClient, fetchClientNotes, createClientNote,
  fetchKlantTaken, createKlantTaak, updateKlantTaak, deleteKlantTaak,
} from './data.js';
import { brutoOmzetVoorReservering, nettoVoorReservering } from './commissieEngine.js';
import { formatEuro, formatDatum, openModal, closeModal, toast } from './utils.js';

const state = {
  zoek: '', filterStatus: '', filterBron: '', filterInteresse: '',
  clients: [], stats: new Map(), huidigeKlant: null, teamMap: new Map(),
};

const BRON_OPTIES = ['Calendly', 'Nathanisya', 'Instagram', 'Doorverwijzing', 'Walk-in', 'Website', 'Overig'];

const STATUS_LABELS = {
  lead: 'Lead',
  contact: 'Contact',
  klant: 'Klant',
  inactief: 'Inactief',
};

const INTERESSE_LABELS = {
  foto: 'Fotostudio',
  podcast: 'Podcast',
  influencer: 'Influencer',
  meerdere: 'Meerdere',
  onbekend: 'Onbekend',
};

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
  const instagram = document.getElementById('cInstagram')?.value.trim().replace(/^@/, '');
  const links = [];
  if (email) links.push(`<a href="mailto:${encodeURIComponent(email)}">✉ E-mail</a>`);
  if (telefoon) {
    const digits = telefoon.replace(/[^\d+]/g, '');
    links.push(`<a href="tel:${digits}">📞 Bellen</a>`);
    links.push(`<a href="https://wa.me/${digits.replace(/^\+/, '')}" target="_blank" rel="noopener">💬 WhatsApp</a>`);
  }
  if (instagram) links.push(`<a href="https://instagram.com/${encodeURIComponent(instagram)}" target="_blank" rel="noopener">📷 Instagram</a>`);
  if (!links.length) {
    wrap.hidden = true;
    wrap.innerHTML = '';
    return;
  }
  wrap.hidden = false;
  wrap.innerHTML = links.join('');
}

function parseTags(str) {
  return String(str || '').split(',').map((t) => t.trim()).filter(Boolean);
}

function renderTagsHtml(tags) {
  const list = parseTags(tags);
  if (!list.length) return '';
  return list.map((t) => `<span class="tag-chip">${esc(t)}</span>`).join('');
}

function statusBadge(status) {
  const s = status || 'lead';
  return `<span class="client-status status-${s}">${STATUS_LABELS[s] || s}</span>`;
}

function normalizeInstagram(raw) {
  const v = String(raw || '').trim();
  if (!v) return null;
  return v.replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/\/$/, '') || null;
}

function normalizeWebsite(raw) {
  const v = String(raw || '').trim();
  if (!v) return null;
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

function renderContactValue(label, val, client = null) {
  if (!val && label !== 'Tags') return '—';
  if (label === 'E-mail') return `<a href="mailto:${encodeURIComponent(val)}">${esc(val)}</a>`;
  if (label === 'Telefoon') {
    const digits = val.replace(/[^\d+]/g, '');
    return `<a href="tel:${digits}">${esc(val)}</a> · <a href="https://wa.me/${digits.replace(/^\+/, '')}" target="_blank" rel="noopener">WhatsApp</a>`;
  }
  if (label === 'Instagram' && val) {
    const handle = normalizeInstagram(val);
    return `<a href="https://instagram.com/${encodeURIComponent(handle)}" target="_blank" rel="noopener">@${esc(handle)}</a>`;
  }
  if (label === 'Website' && val) {
    const url = normalizeWebsite(val);
    return `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(val)}</a>`;
  }
  if (label === 'Tags') return renderTagsHtml(val) || '—';
  if (label === 'Toegewezen aan' && client?.toegewezen_aan) {
    return esc(state.teamMap.get(client.toegewezen_aan) || '—');
  }
  return esc(val);
}

function exportClientsCsv() {
  const headers = ['naam', 'email', 'telefoon', 'bedrijf', 'status', 'interesse', 'bron', 'tags', 'instagram', 'website'];
  const rows = state.clients.map((c) => headers.map((h) => {
    const v = c[h] ?? '';
    const s = String(v).replace(/"/g, '""');
    return `"${s}"`;
  }).join(','));
  const blob = new Blob([[headers.join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `klanten-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast(`${state.clients.length} klanten geëxporteerd.`);
}

function renderPipelineKpis() {
  const el = document.getElementById('clientPipelineKpis');
  if (!el) return;
  const counts = { lead: 0, contact: 0, klant: 0, inactief: 0 };
  for (const c of state.clients) {
    const s = c.status || 'lead';
    counts[s] = (counts[s] || 0) + 1;
  }
  el.innerHTML = `
    <div class="kpi-card"><span class="kpi-label">Leads</span><span class="kpi-value">${counts.lead}</span></div>
    <div class="kpi-card"><span class="kpi-label">Contact gehad</span><span class="kpi-value">${counts.contact}</span></div>
    <div class="kpi-card"><span class="kpi-label">Klanten</span><span class="kpi-value money">${counts.klant}</span></div>
    <div class="kpi-card"><span class="kpi-label">Inactief</span><span class="kpi-value">${counts.inactief}</span></div>
  `;
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
  document.getElementById('exportClientsBtn')?.addEventListener('click', exportClientsCsv);

  document.getElementById('clientSearch')?.addEventListener('input', (e) => {
    state.zoek = e.target.value.trim().toLowerCase();
    renderClientList();
  });

  document.getElementById('clientStatusFilters')?.addEventListener('click', (e) => {
    const chip = e.target.closest('.filter-chip[data-status]');
    if (!chip) return;
    state.filterStatus = chip.dataset.status;
    chip.parentElement.querySelectorAll('.filter-chip').forEach((c) => c.classList.remove('active'));
    chip.classList.add('active');
    renderClientList();
  });

  document.getElementById('clientBronFilter')?.addEventListener('change', (e) => {
    state.filterBron = e.target.value;
    renderClientList();
  });

  document.getElementById('clientInteresseFilter')?.addEventListener('change', (e) => {
    state.filterInteresse = e.target.value;
    renderClientList();
  });

  document.getElementById('clientForm')?.addEventListener('submit', onClientFormSubmit);
  document.getElementById('cEmail')?.addEventListener('input', renderFormContactActions);
  document.getElementById('cTelefoon')?.addEventListener('input', renderFormContactActions);
  document.getElementById('cInstagram')?.addEventListener('input', renderFormContactActions);

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
  const [clients, stats, team] = await Promise.all([
    fetchClients(),
    fetchClientBookingStats(),
    fetchTeamLeden().catch(() => []),
  ]);
  state.clients = clients;
  state.stats = stats;
  state.teamMap = new Map(team.map((t) => [t.id, t.naam || t.email]));
  renderPipelineKpis();
  renderClientList();
}

function filterClients() {
  let lijst = state.clients;
  if (state.zoek) {
    lijst = lijst.filter((c) => {
      const hay = `${c.naam} ${c.bedrijf || ''} ${c.email || ''} ${c.tags || ''} ${c.telefoon || ''}`.toLowerCase();
      return hay.includes(state.zoek);
    });
  }
  if (state.filterStatus) lijst = lijst.filter((c) => (c.status || 'lead') === state.filterStatus);
  if (state.filterBron) lijst = lijst.filter((c) => c.bron === state.filterBron);
  if (state.filterInteresse) lijst = lijst.filter((c) => c.interesse === state.filterInteresse);
  return lijst;
}

function renderClientList() {
  const body = document.getElementById('clientsBody');
  const empty = document.getElementById('clientsEmpty');
  const lijst = filterClients();
  if (!lijst.length) {
    body.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';
  body.innerHTML = lijst.map((c) => {
    const s = state.stats.get(c.id) || { aantal: 0, laatste: null };
    const contact = c.email || c.telefoon || '—';
    const interesse = INTERESSE_LABELS[c.interesse] || '—';
    return `<tr data-id="${c.id}" style="cursor:pointer">
      <td><strong>${esc(c.naam)}</strong>${c.bedrijf ? `<div class="text-muted" style="font-size:12px">${esc(c.bedrijf)}</div>` : ''}</td>
      <td>${statusBadge(c.status)}</td>
      <td class="text-muted">${esc(contact)}</td>
      <td>${esc(interesse)}</td>
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

async function populateTeamSelect(selectedId = '') {
  const select = document.getElementById('cToegewezen');
  if (!select) return;
  let team = [];
  try {
    team = await fetchTeamLeden();
    state.teamMap = new Map(team.map((t) => [t.id, t.naam || t.email]));
  } catch { /* geen team-toegang */ }
  select.innerHTML = '<option value="">— Niemand —</option>'
    + team.map((t) => `<option value="${t.id}" ${t.id === selectedId ? 'selected' : ''}>${esc(t.naam || t.email)}</option>`).join('');
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
  document.getElementById('cStatus').value = client?.status || 'lead';
  document.getElementById('cInteresse').value = client?.interesse || '';
  setBronSelect(client?.bron || '');
  document.getElementById('cTags').value = client?.tags || '';
  document.getElementById('cInstagram').value = client?.instagram || '';
  document.getElementById('cWebsite').value = client?.website || '';
  document.getElementById('cNotitieKort').value = client?.notitie_kort || '';
  document.getElementById('clientModalTitle').textContent = client ? 'Klant bewerken' : 'Klant toevoegen';

  populateTeamSelect(client?.toegewezen_aan || '');

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
    status: document.getElementById('cStatus').value || 'lead',
    interesse: document.getElementById('cInteresse').value || null,
    bron: document.getElementById('cBron').value.trim() || null,
    tags: document.getElementById('cTags').value.trim() || null,
    instagram: normalizeInstagram(document.getElementById('cInstagram').value),
    website: normalizeWebsite(document.getElementById('cWebsite').value),
    toegewezen_aan: document.getElementById('cToegewezen').value || null,
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
    const badgeEl = document.getElementById('cdStatusBadge');
    if (badgeEl) {
      const st = client.status || 'lead';
      badgeEl.className = `client-status status-${st}`;
      badgeEl.textContent = STATUS_LABELS[st] || st;
    }

    const metaParts = [
      client.bedrijf,
      client.bron ? `via ${client.bron}` : null,
      client.interesse ? INTERESSE_LABELS[client.interesse] : null,
    ].filter(Boolean);
    document.getElementById('cdMeta').textContent = metaParts.join(' · ') || '—';

    const tagsEl = document.getElementById('cdTags');
    if (tagsEl) tagsEl.innerHTML = renderTagsHtml(client.tags);

    document.getElementById('cdContact').innerHTML = [
      ['E-mail', client.email],
      ['Telefoon', client.telefoon],
      ['Bedrijf', client.bedrijf],
      ['Bron', client.bron],
      ['Interesse', client.interesse ? INTERESSE_LABELS[client.interesse] : null],
      ['Instagram', client.instagram],
      ['Website', client.website],
      ['Toegewezen aan', client.toegewezen_aan],
      ['Tags', client.tags],
    ].map(([label, val]) => `<div class="cd-field${label === 'Tags' ? ' cd-field-full' : ''}"><span>${label}</span><strong>${renderContactValue(label, val, client)}</strong></div>`).join('')
      + (client.notitie_kort ? `<div class="cd-field cd-field-full"><span>Notitie</span><strong>${esc(client.notitie_kort)}</strong></div>` : '');

    openModal('clientDetailBackdrop');
    await Promise.all([renderClientBookings(id), renderClientTasks(id), renderClientNotes(id)]);
  } catch (err) {
    toast(`Kon klant niet laden: ${err.message}`, true);
  }
}

async function renderClientBookings(clientId) {
  const reservations = await fetchReservationsByClient(clientId);
  const head = document.getElementById('cdBookingsHead');
  const body = document.getElementById('cdBookingsBody');
  const empty = document.getElementById('cdBookingsEmpty');
  head.innerHTML = '<th>Datum</th><th>Dienst</th><th>Pakket</th><th>Bruto</th><th>Netto</th><th>Status</th>';
  if (!reservations.length) {
    body.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';
  body.innerHTML = reservations.map((r) => `<tr>
      <td>${formatDatum(r.datum)}</td>
      <td>${dienstLabels[r.dienst] || esc(r.dienst)}</td>
      <td>${esc(r.pakket)}</td>
      <td>${formatEuro(brutoOmzetVoorReservering(r))}</td>
      <td class="money">${formatEuro(nettoVoorReservering(r))}</td>
      <td><span class="status status-${r.status}">${r.status}</span></td>
    </tr>`).join('');
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

import { initAuth, onAuthChange, signIn, signOut, getSession, prefillLoginForm } from '../../js/auth.js';
import {
  createReservation, fetchEigenReservations,
  searchClients, fetchClients, fetchClientById,
  fetchBoekingenZonderBedragen, fetchClientNotes, createClientNote,
  fetchKlantTaken, createKlantTaak, updateKlantTaak,
  fetchOwnProfile, fetchOwnPermissions,
} from '../../js/data.js';
import { formatDatum, toast, openModal, closeModal, renderUserProfile, animateLoginToApp, animateAppToLogin, transitionPanels, initModals } from '../../js/utils.js';
import { resolvePortal, redirectToPortal, PORTALS } from '../../js/authRedirect.js';
import { supabaseConfigured } from '../../js/supabaseClient.js';
import { loadUserPermissions, can } from '../../js/permissions.js';

const dienstLabels = { foto: 'Fotostudio', podcast: 'Podcast', influencer: 'Influencer' };
let huidigeKlantId = null;

function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

const loginScreen = document.getElementById('loginScreen');
const appLayout = document.getElementById('appLayout');
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');

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

document.getElementById('addExtraBtn')?.addEventListener('click', () => {
  document.getElementById('extrasList').insertAdjacentHTML('beforeend', extraRowHtml());
});
document.getElementById('extrasList')?.addEventListener('click', (e) => {
  if (e.target.classList.contains('extra-remove')) e.target.closest('.extra-row').remove();
});

document.getElementById('logoutBtn')?.addEventListener('click', () => signOut());

loginForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.textContent = '';
  loginForm.classList.add('is-submitting');
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const rememberMe = document.getElementById('loginRemember')?.checked ?? true;
  try {
    await signIn(email, password, rememberMe);
  } catch (err) {
    loginError.textContent = err.message || 'Inloggen mislukt.';
  } finally {
    loginForm.classList.remove('is-submitting');
  }
});

document.getElementById('reservationForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const session = getSession();
  if (!session) return;
  try {
    await createReservation({
      klantnaam: document.getElementById('rKlant').value.trim(),
      client_id: document.getElementById('rClientId').value || null,
      datum: document.getElementById('rDatum').value,
      dienst: document.getElementById('rDienst').value,
      pakket: document.getElementById('rPakket').value.trim(),
      bruto_prijs: Number(document.getElementById('rBruto').value || 0),
      extras: readExtras(),
      status: 'bevestigd',
      bron: 'nathanisya_invoer',
      created_by: session.user.id,
    });
    document.getElementById('reservationForm').reset();
    document.getElementById('extrasList').innerHTML = '';
    document.getElementById('rClientId').value = '';
    document.getElementById('rClientHint').textContent = '';
    toast('Reservering ingestuurd.');
    await renderEigenLijst();
  } catch (err) {
    toast(`Insturen mislukt: ${err.message}`, true);
  }
});

async function renderEigenLijst() {
  const body = document.getElementById('eigenReserveringenBody');
  const empty = document.getElementById('eigenReserveringenEmpty');
  const reserveringen = await fetchEigenReservations();
  if (!reserveringen.length) {
    body.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';
  body.innerHTML = reserveringen.map((r) => `<tr>
    <td>${r.klantnaam}</td>
    <td>${r.dienst}</td>
    <td>${r.pakket}</td>
    <td>${formatDatum(r.datum)}</td>
    <td><span class="status status-${r.status}">${r.status}</span></td>
  </tr>`).join('');
}

// ── Klantkiezer bij reservering (alleen bestaande klanten koppelen) ──
let klantZoekTimer = null;
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
    clearTimeout(klantZoekTimer);
    if (!term) { suggest.innerHTML = ''; suggest.classList.remove('open'); return; }
    klantZoekTimer = setTimeout(async () => {
      let resultaten = [];
      try { resultaten = await searchClients(term); } catch { resultaten = []; }
      if (!resultaten.length) { suggest.innerHTML = ''; suggest.classList.remove('open'); return; }
      suggest.innerHTML = resultaten.map((c) => `<button type="button" class="client-suggest-item" data-id="${c.id}" data-naam="${esc(c.naam)}">
        <strong>${esc(c.naam)}</strong>${c.bedrijf ? ` <span class="text-muted">· ${esc(c.bedrijf)}</span>` : ''}
      </button>`).join('');
      suggest.classList.add('open');
    }, 200);
  });

  suggest.addEventListener('click', (e) => {
    const item = e.target.closest('.client-suggest-item');
    if (!item) return;
    input.value = item.dataset.naam;
    hidden.value = item.dataset.id;
    hint.textContent = 'Bestaande klant gekoppeld.';
    suggest.innerHTML = '';
    suggest.classList.remove('open');
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.client-picker')) suggest.classList.remove('open');
  });
}

// ── Tabs ──
const invoerPanels = {
  reservering: document.getElementById('tab-reservering'),
  klanten: document.getElementById('tab-klanten'),
};
let currentInvoerTab = 'reservering';

async function switchInvoerTab(tab) {
  if (currentInvoerTab === tab) return;
  const fromEl = invoerPanels[currentInvoerTab];
  const toEl = invoerPanels[tab];
  if (!toEl) return;
  document.querySelectorAll('#invoerTabs .filter-chip').forEach((c) => {
    c.classList.toggle('active', c.dataset.tab === tab);
  });
  await transitionPanels(fromEl, toEl);
  currentInvoerTab = tab;
  if (tab === 'klanten') {
    await renderKlantenLijst().catch((err) => toast(`Kon klanten niet laden: ${err.message}`, true));
  }
}

function initTabs() {
  document.getElementById('invoerTabs')?.addEventListener('click', (e) => {
    const chip = e.target.closest('.filter-chip[data-tab]');
    if (!chip) return;
    switchInvoerTab(chip.dataset.tab);
  });
}

// ── Klantenlijst + zoeken ──
let alleKlanten = [];
function initKlantenTab() {
  document.getElementById('klantZoek')?.addEventListener('input', (e) => {
    const zoek = e.target.value.trim().toLowerCase();
    const gefilterd = zoek
      ? alleKlanten.filter((c) => `${c.naam} ${c.bedrijf || ''} ${c.email || ''}`.toLowerCase().includes(zoek))
      : alleKlanten;
    tekenKlantenRijen(gefilterd);
  });

  document.getElementById('klantenBody')?.addEventListener('click', (e) => {
    const row = e.target.closest('tr[data-id]');
    if (row) openKlantDetail(row.dataset.id);
  });

  document.getElementById('cdTaskForm')?.addEventListener('submit', onTaskSubmit);
  document.getElementById('cdTasks')?.addEventListener('click', onTaskClick);
}

async function renderKlantenLijst() {
  alleKlanten = await fetchClients();
  tekenKlantenRijen(alleKlanten);
}

function tekenKlantenRijen(lijst) {
  const body = document.getElementById('klantenBody');
  const empty = document.getElementById('klantenEmpty');
  if (!lijst.length) {
    body.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';
  body.innerHTML = lijst.map((c) => `<tr data-id="${c.id}" style="cursor:pointer">
    <td><strong>${esc(c.naam)}</strong></td>
    <td class="text-muted">${esc(c.email || c.telefoon || '—')}</td>
    <td>${esc(c.bedrijf || '—')}</td>
  </tr>`).join('');
}

async function openKlantDetail(id) {
  try {
    const client = await fetchClientById(id);
    if (!client) { toast('Klant niet gevonden.', true); return; }
    huidigeKlantId = id;
    document.getElementById('cdNaam').textContent = client.naam;
    const metaParts = [client.bedrijf, client.bron ? `via ${client.bron}` : null].filter(Boolean);
    document.getElementById('cdMeta').textContent = metaParts.join(' · ') || '—';
    document.getElementById('cdContact').innerHTML = [
      ['E-mail', client.email],
      ['Telefoon', client.telefoon],
      ['Bedrijf', client.bedrijf],
      ['Bron', client.bron],
    ].map(([label, val]) => {
      let display = esc(val || '—');
      if (val && label === 'E-mail') display = `<a href="mailto:${encodeURIComponent(val)}">${esc(val)}</a>`;
      if (val && label === 'Telefoon') display = `<a href="tel:${val.replace(/[^\d+]/g, '')}">${esc(val)}</a>`;
      return `<div class="cd-field"><span>${label}</span><strong>${display}</strong></div>`;
    }).join('')
      + (client.notitie_kort ? `<div class="cd-field cd-field-full"><span>Notitie</span><strong>${esc(client.notitie_kort)}</strong></div>` : '');
    openModal('clientDetailBackdrop');
    await Promise.all([renderKlantBoekingen(id), renderKlantTasks(id), renderKlantNotities(id)]);
  } catch (err) {
    toast(`Kon klant niet laden: ${err.message}`, true);
  }
}

async function renderKlantBoekingen(id) {
  const boekingen = await fetchBoekingenZonderBedragen(id);
  const body = document.getElementById('cdBookingsBody');
  const empty = document.getElementById('cdBookingsEmpty');
  if (!boekingen.length) {
    body.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';
  body.innerHTML = boekingen.map((b) => `<tr>
    <td>${formatDatum(b.datum)}</td>
    <td>${dienstLabels[b.dienst] || esc(b.dienst)}</td>
    <td>${esc(b.pakket)}</td>
    <td><span class="status status-${b.status}">${b.status}</span></td>
  </tr>`).join('');
}

async function renderKlantNotities(id) {
  const notes = await fetchClientNotes(id);
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

async function renderKlantTasks(id) {
  const taken = await fetchKlantTaken(id);
  const wrap = document.getElementById('cdTasks');
  if (!taken.length) {
    wrap.innerHTML = '<p class="text-muted" style="padding:8px 0">Geen taken.</p>';
    return;
  }
  const vandaag = new Date().toISOString().slice(0, 10);
  wrap.innerHTML = taken.map((t) => {
    const overdue = t.deadline && t.deadline < vandaag && !t.afgerond;
    return `<div class="task-item ${t.afgerond ? 'done' : ''} ${overdue ? 'overdue' : ''}">
      <label class="task-check"><input type="checkbox" class="task-toggle" data-id="${t.id}" ${t.afgerond ? 'checked' : ''}> ${esc(t.tekst)}</label>
      ${t.deadline ? `<span class="${overdue ? 'text-warn' : 'text-muted'}" style="font-size:11px">${formatDatum(t.deadline)}</span>` : ''}
    </div>`;
  }).join('');
}

async function onTaskSubmit(e) {
  e.preventDefault();
  if (!huidigeKlantId) return;
  const textEl = document.getElementById('cdTaskText');
  const deadlineEl = document.getElementById('cdTaskDeadline');
  const tekst = textEl.value.trim();
  if (!tekst) return;
  try {
    await createKlantTaak({ client_id: huidigeKlantId, tekst, deadline: deadlineEl.value || null });
    textEl.value = '';
    deadlineEl.value = '';
    await renderKlantTasks(huidigeKlantId);
    toast('Taak toegevoegd.');
  } catch (err) {
    toast(`Taak opslaan mislukt: ${err.message}`, true);
  }
}

async function onTaskClick(e) {
  const toggle = e.target.closest('.task-toggle');
  if (!toggle || !huidigeKlantId) return;
  try {
    await updateKlantTaak(toggle.dataset.id, { afgerond: toggle.checked });
    await renderKlantTasks(huidigeKlantId);
  } catch (err) {
    toast(`Bijwerken mislukt: ${err.message}`, true);
  }
}

async function onNoteSubmit(e) {
  e.preventDefault();
  if (!huidigeKlantId) return;
  const textEl = document.getElementById('cdNoteText');
  const tekst = textEl.value.trim();
  if (!tekst) return;
  try {
    await createClientNote(huidigeKlantId, tekst);
    textEl.value = '';
    await renderKlantNotities(huidigeKlantId);
  } catch (err) {
    toast(`Notitie opslaan mislukt: ${err.message}`, true);
  }
}

function renderConfigWarning() {
  loginError.textContent = 'Supabase is nog niet geconfigureerd. Vraag de beheerder om dit in te stellen.';
}

initClientPicker();
initTabs();
initKlantenTab();

function applyInvoerPermissions() {
  const canSubmit = can('invoer.reserveringen_insturen');
  const canClients = can('invoer.klanten_bekijken');
  const resTab = document.querySelector('[data-tab="reservering"]');
  const klantTab = document.querySelector('[data-tab="klanten"]');
  if (resTab) resTab.style.display = canSubmit ? '' : 'none';
  if (klantTab) klantTab.style.display = canClients ? '' : 'none';
  if (!canSubmit && canClients && currentInvoerTab !== 'klanten') {
    switchInvoerTab('klanten');
  }
  const noteForm = document.getElementById('cdNoteForm');
  const taskForm = document.getElementById('cdTaskForm');
  if (noteForm) noteForm.style.display = can('invoer.klant_notities') ? '' : 'none';
  if (taskForm) taskForm.style.display = can('invoer.klant_taken') ? '' : 'none';
}

let authCheckId = 0;

onAuthChange(async (session) => {
  const checkId = ++authCheckId;
  if (!session) {
    if (appLayout.style.display !== 'none' && loginScreen.style.display !== 'flex') {
      await animateAppToLogin(loginScreen, appLayout);
    } else {
      appLayout.style.display = 'none';
      loginScreen.style.display = 'flex';
    }
    if (!supabaseConfigured) renderConfigWarning();
    return;
  }

  let profile = null;
  let permissions = [];
  try {
    profile = await fetchOwnProfile(session.user.id);
    permissions = await fetchOwnPermissions();
  } catch (err) {
    console.error(err);
    if (checkId !== authCheckId) return;
    loginScreen.style.display = 'flex';
    appLayout.style.display = 'none';
    loginError.textContent = 'Profiel laden mislukt. Vernieuw de pagina.';
    return;
  }

  if (checkId !== authCheckId) return;

  const { portal, error } = resolvePortal(profile, permissions);
  if (portal !== PORTALS.INVOER) {
    if (portal === PORTALS.CRM || portal === PORTALS.MARKETING) {
      redirectToPortal(portal);
      return;
    }
    loginScreen.style.display = 'flex';
    appLayout.style.display = 'none';
    loginError.textContent = error || 'Je account heeft geen toegang tot het invoerportaal.';
    return;
  }

  await loadUserPermissions(profile, permissions);

  const fromLoginScreen = loginScreen.style.display !== 'none';
  if (fromLoginScreen) {
    await animateLoginToApp(loginScreen, appLayout);
  } else {
    appLayout.style.display = 'block';
    loginScreen.style.display = 'none';
  }
  renderUserProfile(session, profile);
  applyInvoerPermissions();
  if (can('invoer.reserveringen_insturen')) {
    renderEigenLijst().catch((err) => toast(`Kon lijst niet laden: ${err.message}`, true));
  }
});

prefillLoginForm();
initModals();
initAuth();

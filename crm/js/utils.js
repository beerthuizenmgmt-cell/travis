export function waitMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function animateLoginToApp(loginScreen, appLayout) {
  if (!loginScreen || !appLayout) return;
  loginScreen.classList.add('is-leaving');
  await waitMs(280);
  loginScreen.style.display = 'none';
  loginScreen.classList.remove('is-leaving');
  appLayout.style.display = appLayout.dataset.layoutDisplay || 'flex';
  appLayout.classList.add('is-entering');
  await waitMs(420);
  appLayout.classList.remove('is-entering');
}

export async function animateAppToLogin(loginScreen, appLayout) {
  if (!loginScreen || !appLayout) return;
  appLayout.classList.add('is-leaving');
  await waitMs(220);
  appLayout.style.display = 'none';
  appLayout.classList.remove('is-leaving');
  loginScreen.style.display = 'flex';
  loginScreen.classList.add('is-entering');
  await waitMs(380);
  loginScreen.classList.remove('is-entering');
}

export async function transitionPanels(fromEl, toEl) {
  if (!toEl) return;
  if (fromEl && fromEl !== toEl) {
    fromEl.classList.add('panel-leaving');
    await waitMs(180);
    fromEl.classList.remove('active', 'panel-leaving');
  }
  toEl.classList.add('active', 'panel-entering');
  await waitMs(320);
  toEl.classList.remove('panel-entering');
}

export function profileInitials(naam, email) {
  const n = String(naam || '').trim();
  if (n) {
    const parts = n.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    return n.slice(0, 2).toUpperCase();
  }
  const e = String(email || '').trim();
  return e ? e.slice(0, 2).toUpperCase() : '?';
}

export function renderUserProfile(session, profile) {
  const email = session?.user?.email || '';
  const naam = profile?.naam?.trim() || email.split('@')[0] || 'Gebruiker';
  const rolLabel = profile?.rol === 'eigenaar' ? 'Eigenaar' : 'Medewerker';
  const nameEl = document.getElementById('profileName');
  const metaEl = document.getElementById('profileMeta');
  if (nameEl) nameEl.textContent = naam;
  if (metaEl) metaEl.textContent = email ? `${rolLabel} · ${email}` : rolLabel;
}

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

export function kwartaalBereik(jaar, kwartaal) {
  const q = Number(kwartaal);
  const j = Number(jaar);
  const startMonth = (q - 1) * 3;
  const start = new Date(Date.UTC(j, startMonth, 1));
  const eind = new Date(Date.UTC(j, startMonth + 3, 1));
  return { start: start.toISOString().slice(0, 10), eind: eind.toISOString().slice(0, 10) };
}

export function kwartaalLabel(jaar, kwartaal) {
  return `Q${kwartaal} ${jaar}`;
}

export function maandLabel(maandStr) {
  const [j, m] = maandStr.split('-').map(Number);
  return new Intl.DateTimeFormat('nl-NL', { month: 'long', year: 'numeric' }).format(new Date(j, m - 1, 1));
}

export function huidigKwartaal() {
  const d = new Date();
  const q = Math.floor(d.getMonth() / 3) + 1;
  return { jaar: d.getFullYear(), kwartaal: q };
}

export function periodeEindLabel(eindIso) {
  const d = new Date(eindIso);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
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
  document.body.classList.add('modal-open');
}

export function closeModal(id) {
  document.getElementById(id)?.classList.remove('open');
  if (!document.querySelector('.modal-backdrop.open')) {
    document.body.classList.remove('modal-open');
  }
}

export function initModals() {
  document.querySelectorAll('.modal-backdrop').forEach((backdrop) => {
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) closeModal(backdrop.id);
    });
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const open = document.querySelector('.modal-backdrop.open');
    if (open) closeModal(open.id);
  });

  document.querySelectorAll('.modal-close').forEach((btn) => {
    btn.addEventListener('click', () => {
      const backdrop = btn.closest('.modal-backdrop');
      if (backdrop) closeModal(backdrop.id);
    });
  });
}

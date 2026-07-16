import { supabaseConfigured } from './supabaseClient.js';
import { initAuth, onAuthChange, signIn, signOut, prefillLoginForm } from './auth.js';
import { toast, renderUserProfile, animateLoginToApp, animateAppToLogin, transitionPanels, waitMs, initModals } from './utils.js';
import { fetchOwnProfile, fetchOwnPermissions } from './data.js';
import {
  loadUserPermissions, applySidebarPermissions, firstAllowedPage, can, PAGE_PERMISSIONS,
} from './permissions.js';
import { resolvePortal, redirectToPortal, PORTALS } from './authRedirect.js';
import { renderDashboard, initDashboardPage } from './dashboard.js';
import { initReserveringenPage, renderReserveringen, updateNewCountBadges } from './reserveringen.js';
import { initKlantenPage, renderKlanten } from './klanten.js';
import { initCsvImport } from './csvImport.js';
import { renderMaandoverzicht, initMaandoverzichtPage } from './maandoverzicht.js';
import { initAdvertentiekostenPage, renderAdvertentiekosten } from './advertentiekosten.js';
import { initInstellingenPage, renderInstellingen } from './instellingen.js';
import { initTeamPage, renderTeam } from './team.js';

const loginScreen = document.getElementById('loginScreen');
const appLayout = document.getElementById('appLayout');
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');

const pageRenderers = {
  dashboard: renderDashboard,
  reserveringen: renderReserveringen,
  klanten: renderKlanten,
  maandoverzicht: renderMaandoverzicht,
  advertentiekosten: renderAdvertentiekosten,
  team: renderTeam,
  instellingen: renderInstellingen,
};

const titles = {
  dashboard: 'Dashboard',
  reserveringen: 'Reserveringen',
  klanten: 'Klanten',
  maandoverzicht: 'Maandoverzicht',
  advertentiekosten: 'Advertentiekosten',
  team: 'Team & rollen',
  instellingen: 'Instellingen',
};

const navLinks = document.querySelectorAll('.nav-link[data-page]');
const pages = document.querySelectorAll('.page');
const topbarTitle = document.getElementById('topbarTitle');
let currentPageId = null;
let isFirstPageLoad = true;

async function setTopbarTitle(text) {
  if (!topbarTitle) return;
  if (topbarTitle.textContent === text) {
    topbarTitle.textContent = text;
    return;
  }
  topbarTitle.classList.add('is-changing');
  await waitMs(120);
  topbarTitle.textContent = text;
  topbarTitle.classList.remove('is-changing');
}

async function showPage(pageId, { animate = true } = {}) {
  const required = PAGE_PERMISSIONS[pageId];
  if (required && !can(required)) {
    pageId = firstAllowedPage() || 'dashboard';
  }
  if (!pageRenderers[pageId]) pageId = firstAllowedPage() || 'dashboard';

  const nextEl = document.getElementById(`page-${pageId}`);
  const currentEl = document.querySelector('.page.active');
  const shouldAnimate = animate && !isFirstPageLoad && currentEl && currentEl !== nextEl;

  if (currentPageId === pageId && currentEl) {
    try {
      await pageRenderers[pageId]();
    } catch (err) {
      console.error(err);
      toast(`Kon ${titles[pageId]} niet laden: ${err.message}`, true);
    }
    return;
  }

  navLinks.forEach((l) => l.classList.remove('active'));
  document.querySelectorAll(`.nav-link[data-page="${pageId}"]`).forEach((l) => l.classList.add('active'));
  document.getElementById('sidebar')?.classList.remove('open');

  if (shouldAnimate) {
    await transitionPanels(currentEl, nextEl);
  } else {
    pages.forEach((p) => p.classList.remove('active', 'panel-entering', 'panel-leaving'));
    nextEl?.classList.add('active');
  }

  currentPageId = pageId;
  isFirstPageLoad = false;
  await setTopbarTitle(titles[pageId] || 'Dashboard');

  try {
    await pageRenderers[pageId]();
  } catch (err) {
    console.error(err);
    toast(`Kon ${titles[pageId]} niet laden: ${err.message}`, true);
  }
}

navLinks.forEach((link) => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    const page = link.dataset.page;
    history.replaceState(null, '', `#${page}`);
    showPage(page);
  });
});

window.addEventListener('hashchange', () => {
  const hash = location.hash.slice(1);
  if (hash && pageRenderers[hash]) showPage(hash, { animate: false });
});

document.getElementById('sidebarToggle')?.addEventListener('click', () => {
  document.getElementById('sidebar')?.classList.toggle('open');
});

document.getElementById('logoutBtn')?.addEventListener('click', async () => {
  await signOut();
});

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

function renderConfigWarning() {
  loginError.textContent = 'Supabase is nog niet geconfigureerd. Zie README voor de setup-stappen (.env aanmaken met VITE_SUPABASE_URL en VITE_SUPABASE_ANON_KEY).';
}

let authCheckId = 0;

onAuthChange(async (session) => {
  const checkId = ++authCheckId;

  if (!session) {
    currentPageId = null;
    isFirstPageLoad = true;
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
  try {
    profile = await fetchOwnProfile(session.user.id);
  } catch (err) {
    console.error(err);
    if (checkId !== authCheckId) return;
    loginScreen.style.display = 'flex';
    appLayout.style.display = 'none';
    loginError.textContent = 'Profiel laden mislukt. Vernieuw de pagina of probeer opnieuw in te loggen.';
    return;
  }

  if (checkId !== authCheckId) return;

  if (!profile) {
    loginScreen.style.display = 'flex';
    appLayout.style.display = 'none';
    loginError.textContent = 'Geen profiel gevonden voor dit account. Vraag de beheerder om je account te koppelen via Team & rollen.';
    return;
  }

  let permissions = [];
  if (profile.rol !== 'eigenaar' && profile.rol !== 'klant') {
    try {
      permissions = await fetchOwnPermissions();
    } catch (err) {
      console.error(err);
    }
  }

  if (checkId !== authCheckId) return;

  const { portal, error } = resolvePortal(profile, permissions);
  if (portal !== PORTALS.CRM) {
    if (portal === PORTALS.INVOER || portal === PORTALS.MARKETING) {
      redirectToPortal(portal);
      return;
    }
    loginScreen.style.display = 'flex';
    appLayout.style.display = 'none';
    loginError.textContent = error || 'Je account heeft geen toegang tot het CRM-dashboard.';
    return;
  }

  await loadUserPermissions(profile, permissions);

  const fromLoginScreen = loginScreen.style.display !== 'none';
  if (fromLoginScreen) {
    await animateLoginToApp(loginScreen, appLayout);
  } else {
    appLayout.style.display = 'flex';
    loginScreen.style.display = 'none';
  }
  renderUserProfile(session, profile);
  applySidebarPermissions();
  const hash = location.hash.slice(1);
  await showPage(hash || firstAllowedPage() || 'dashboard', { animate: !fromLoginScreen });
  updateNewCountBadges();
});

initReserveringenPage();
initKlantenPage();
initDashboardPage();
initCsvImport();
initMaandoverzichtPage();
initAdvertentiekostenPage();
initTeamPage();
initInstellingenPage();
initModals();
prefillLoginForm();
initAuth();

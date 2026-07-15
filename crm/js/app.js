import { supabaseConfigured } from './supabaseClient.js';
import { initAuth, onAuthChange, signIn, signOut } from './auth.js';
import { toast } from './utils.js';
import { renderDashboard } from './dashboard.js';
import { initReserveringenPage, renderReserveringen } from './reserveringen.js';
import { initCsvImport } from './csvImport.js';
import { renderMaandoverzicht, initMaandoverzichtPage } from './maandoverzicht.js';
import { initAdvertentiekostenPage, renderAdvertentiekosten } from './advertentiekosten.js';
import { initInstellingenPage, renderInstellingen } from './instellingen.js';

const loginScreen = document.getElementById('loginScreen');
const appLayout = document.getElementById('appLayout');
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');

const pageRenderers = {
  dashboard: renderDashboard,
  reserveringen: renderReserveringen,
  maandoverzicht: renderMaandoverzicht,
  advertentiekosten: renderAdvertentiekosten,
  instellingen: renderInstellingen,
};

const navLinks = document.querySelectorAll('.nav-link[data-page]');
const pages = document.querySelectorAll('.page');
const topbarTitle = document.getElementById('topbarTitle');
const titles = {
  dashboard: 'Dashboard',
  reserveringen: 'Reserveringen',
  maandoverzicht: 'Maandoverzicht',
  advertentiekosten: 'Advertentiekosten',
  instellingen: 'Instellingen',
};

async function showPage(pageId) {
  if (!pageRenderers[pageId]) pageId = 'dashboard';
  pages.forEach((p) => p.classList.remove('active'));
  navLinks.forEach((l) => l.classList.remove('active'));
  document.getElementById(`page-${pageId}`)?.classList.add('active');
  document.querySelectorAll(`.nav-link[data-page="${pageId}"]`).forEach((l) => l.classList.add('active'));
  document.getElementById('sidebar')?.classList.remove('open');
  topbarTitle.textContent = titles[pageId] || 'Dashboard';
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

document.getElementById('sidebarToggle')?.addEventListener('click', () => {
  document.getElementById('sidebar')?.classList.toggle('open');
});

document.getElementById('logoutBtn')?.addEventListener('click', async () => {
  await signOut();
});

loginForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.textContent = '';
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  try {
    await signIn(email, password);
  } catch (err) {
    loginError.textContent = err.message || 'Inloggen mislukt.';
  }
});

function renderConfigWarning() {
  loginError.textContent = 'Supabase is nog niet geconfigureerd. Zie README voor de setup-stappen (.env aanmaken met VITE_SUPABASE_URL en VITE_SUPABASE_ANON_KEY).';
}

onAuthChange((session) => {
  if (session) {
    loginScreen.style.display = 'none';
    appLayout.style.display = 'flex';
    const hash = location.hash.slice(1);
    showPage(hash || 'dashboard');
  } else {
    appLayout.style.display = 'none';
    loginScreen.style.display = 'flex';
    if (!supabaseConfigured) renderConfigWarning();
  }
});

initReserveringenPage();
initCsvImport();
initMaandoverzichtPage();
initAdvertentiekostenPage();
initInstellingenPage();
initAuth();

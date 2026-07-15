import { supabaseConfigured } from '../../crm/js/supabaseClient.js';
import { initAuth, onAuthChange, signIn, prefillLoginForm } from '../../crm/js/auth.js';
import { resolvePostLoginPortal, redirectToPortal, PORTALS } from '../../crm/js/authRedirect.js';

const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');

const params = new URLSearchParams(window.location.search);
const queryError = params.get('error');
if (queryError) loginError.textContent = decodeURIComponent(queryError);

loginForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.textContent = '';
  loginForm.classList.add('is-submitting');
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const rememberMe = document.getElementById('loginRemember')?.checked ?? true;
  try {
    const session = await signIn(email, password, rememberMe);
    await routeSession(session);
  } catch (err) {
    loginError.textContent = err.message || 'Inloggen mislukt.';
  } finally {
    loginForm.classList.remove('is-submitting');
  }
});

async function routeSession(session) {
  if (!session?.user?.id) return;
  try {
    const { portal, error } = await resolvePostLoginPortal(session.user.id);
    if (error && portal === PORTALS.LOGIN) {
      loginError.textContent = error;
      return;
    }
    const next = params.get('next');
    const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : null;
    if (safeNext && portal === PORTALS.MARKETING && safeNext.startsWith('/admin')) {
      redirectToPortal(safeNext);
      return;
    }
    redirectToPortal(portal);
  } catch (err) {
    loginError.textContent = err.message || 'Kon je account niet laden.';
  }
}

onAuthChange(async (session) => {
  if (!session) {
    if (!supabaseConfigured) {
      loginError.textContent = 'Supabase is nog niet geconfigureerd. Vul VITE_SUPABASE_URL en VITE_SUPABASE_ANON_KEY in .env in.';
    }
    return;
  }
  await routeSession(session);
});

prefillLoginForm();
initAuth();

import { supabase, supabaseConfigured, REMEMBER_KEY } from './supabaseClient.js';

const SAVED_EMAIL_KEY = 'crm_saved_email';

let currentSession = null;
let authInitialized = false;
const listeners = [];

export function onAuthChange(fn) {
  listeners.push(fn);
  if (authInitialized) fn(currentSession);
}

function notify() {
  listeners.forEach((fn) => fn(currentSession));
}

export function prefillLoginForm() {
  const rememberEl = document.getElementById('loginRemember');
  const emailEl = document.getElementById('loginEmail');
  const remembered = localStorage.getItem(REMEMBER_KEY) !== 'false';
  if (rememberEl) rememberEl.checked = remembered;
  const savedEmail = localStorage.getItem(SAVED_EMAIL_KEY);
  if (emailEl && savedEmail) emailEl.value = savedEmail;
}

export async function initAuth() {
  if (!supabaseConfigured) {
    authInitialized = true;
    notify();
    return;
  }

  // Herstel sessie uit storage vóór we UI updaten (voorkomt uitloggen bij refresh).
  const { data: { session } } = await supabase.auth.getSession();
  currentSession = session;
  authInitialized = true;
  notify();

  supabase.auth.onAuthStateChange((_event, session) => {
    currentSession = session;
    notify();
  });
}

export function getSession() {
  return currentSession;
}

export async function signIn(email, password, rememberMe = true) {
  if (!supabaseConfigured) {
    throw new Error('Supabase is nog niet geconfigureerd. Vul VITE_SUPABASE_URL en VITE_SUPABASE_ANON_KEY in .env in.');
  }
  localStorage.setItem(REMEMBER_KEY, rememberMe ? 'true' : 'false');
  if (rememberMe) {
    localStorage.setItem(SAVED_EMAIL_KEY, email);
  } else {
    localStorage.removeItem(SAVED_EMAIL_KEY);
  }
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  currentSession = data.session;
  notify();
  return data.session;
}

export async function signOut() {
  if (!supabaseConfigured) return;
  await supabase.auth.signOut();
  currentSession = null;
  notify();
}

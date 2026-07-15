import { supabase, supabaseConfigured } from './supabaseClient.js';

let currentSession = null;
const listeners = [];

export function onAuthChange(fn) {
  listeners.push(fn);
  fn(currentSession);
}

function notify() {
  listeners.forEach((fn) => fn(currentSession));
}

export async function initAuth() {
  if (!supabaseConfigured) {
    notify();
    return;
  }
  const { data } = await supabase.auth.getSession();
  currentSession = data.session;
  notify();
  supabase.auth.onAuthStateChange((_event, session) => {
    currentSession = session;
    notify();
  });
}

export function getSession() {
  return currentSession;
}

export async function signIn(email, password) {
  if (!supabaseConfigured) {
    throw new Error('Supabase is nog niet geconfigureerd. Vul VITE_SUPABASE_URL en VITE_SUPABASE_ANON_KEY in .env in.');
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

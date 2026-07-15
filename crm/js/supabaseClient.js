import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const REMEMBER_KEY = 'crm_remember_me';

function shouldRememberSession() {
  return localStorage.getItem(REMEMBER_KEY) !== 'false';
}

const authStorage = {
  getItem(key) {
    return localStorage.getItem(key) ?? sessionStorage.getItem(key);
  },
  setItem(key, value) {
    const primary = shouldRememberSession() ? localStorage : sessionStorage;
    const secondary = shouldRememberSession() ? sessionStorage : localStorage;
    primary.setItem(key, value);
    secondary.removeItem(key);
  },
  removeItem(key) {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  },
};

export const supabaseConfigured = Boolean(url && anonKey);

export const supabase = supabaseConfigured
  ? createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: authStorage,
    },
  })
  : null;

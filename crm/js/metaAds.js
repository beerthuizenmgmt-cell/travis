import { supabase } from './supabaseClient.js';

async function invoke(action, extra = {}) {
  const { data, error } = await supabase.functions.invoke('meta-ads', {
    body: { action, ...extra },
  });
  if (error) throw new Error(error.message || 'Meta Ads-fout');
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function fetchMetaStatus() {
  return invoke('status');
}

export async function startMetaConnect() {
  const data = await invoke('auth-url');
  if (!data.url) throw new Error('Geen OAuth-URL ontvangen.');
  window.location.href = data.url;
}

export async function syncMetaAds() {
  return invoke('sync');
}

export async function disconnectMetaAds() {
  return invoke('disconnect');
}

export async function fetchMetaCampaigns() {
  return invoke('campaigns');
}

export async function updateMetaCampaignDienst(campaignId, dienst) {
  return invoke('update-campaign', { campaignId, dienst: dienst || null });
}

export function parseMetaCallbackParams() {
  const hash = location.hash.replace(/^#/, '');
  const hashParams = new URLSearchParams(hash.includes('?') ? hash.split('?')[1] : '');
  const searchParams = new URLSearchParams(location.search);
  const meta = hashParams.get('meta') || searchParams.get('meta');
  const msg = hashParams.get('msg') || searchParams.get('msg');
  if (!meta) return null;
  if (hash.includes('meta=')) {
    history.replaceState(null, '', location.pathname + location.search + '#advertentiekosten');
  }
  return { meta, msg };
}

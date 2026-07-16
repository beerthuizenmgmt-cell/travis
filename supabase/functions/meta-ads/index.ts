// Meta Ads: OAuth, sync spend, campagne-mapping.
// Secrets: META_APP_ID, META_APP_SECRET, SITE_URL
// Deploy: supabase functions deploy meta-ads --no-verify-jwt

import { createClient } from 'npm:@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const metaAppId = Deno.env.get('META_APP_ID')!;
const metaAppSecret = Deno.env.get('META_APP_SECRET')!;
const siteUrl = (Deno.env.get('SITE_URL') || 'http://localhost:5173').replace(/\/$/, '');
const graphVersion = 'v21.0';

const admin = createClient(supabaseUrl, serviceRoleKey);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', Connection: 'keep-alive' },
  });
}

function redirect(url: string) {
  return new Response(null, { status: 302, headers: { Location: url, ...corsHeaders } });
}

function callbackUri() {
  return `${supabaseUrl}/functions/v1/meta-ads?action=callback`;
}

async function requireEigenaar(req: Request) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return { error: json({ error: 'Niet ingelogd.' }, 401) };

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) return { error: json({ error: 'Niet ingelogd.' }, 401) };

  const { data: profile } = await admin.from('profiles').select('rol').eq('id', user.id).maybeSingle();
  if (profile?.rol !== 'eigenaar') return { error: json({ error: 'Geen toegang.' }, 403) };

  return { user };
}

async function oauthGet(params: Record<string, string>) {
  const url = new URL(`https://graph.facebook.com/${graphVersion}/oauth/access_token`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || 'Meta OAuth-fout');
  return data;
}

async function graphGet(path: string, token: string, params: Record<string, string> = {}) {
  const url = new URL(`https://graph.facebook.com/${graphVersion}/${path}`);
  url.searchParams.set('access_token', token);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || 'Meta API-fout');
  return data;
}

async function exchangeCode(code: string) {
  const short = await oauthGet({
    client_id: metaAppId,
    client_secret: metaAppSecret,
    redirect_uri: callbackUri(),
    code,
  });
  const long = await oauthGet({
    grant_type: 'fb_exchange_token',
    client_id: metaAppId,
    client_secret: metaAppSecret,
    fb_exchange_token: short.access_token,
  });
  const expiresIn = Number(long.expires_in || 0);
  const tokenExpiresAt = expiresIn
    ? new Date(Date.now() + expiresIn * 1000).toISOString()
    : null;
  return { accessToken: long.access_token as string, tokenExpiresAt };
}

async function pickAdAccount(token: string) {
  const data = await graphGet('me/adaccounts', token, {
    fields: 'id,name,account_id',
    limit: '25',
  });
  const accounts = data.data || [];
  if (!accounts.length) throw new Error('Geen Meta ad account gevonden op dit account.');
  return accounts[0];
}

async function syncCampaigns(userId: string, adAccountId: string, token: string) {
  const actId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
  const data = await graphGet(`${actId}/campaigns`, token, {
    fields: 'id,name,status',
    limit: '100',
  });
  const rows = (data.data || []).map((c: { id: string; name: string; status?: string }) => ({
    owner_id: userId,
    campaign_id: c.id,
    campaign_name: c.name,
    status: c.status || null,
    updated_at: new Date().toISOString(),
  }));
  if (rows.length) {
    await admin.from('meta_campaigns').upsert(rows, { onConflict: 'owner_id,campaign_id' });
  }
  return rows.length;
}

async function syncSpend(userId: string, adAccountId: string, token: string) {
  const actId = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
  const now = new Date();
  const since = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const until = now.toISOString().slice(0, 10);
  const timeRange = JSON.stringify({ since, until });

  const insights = await graphGet(`${actId}/insights`, token, {
    level: 'campaign',
    fields: 'campaign_id,campaign_name,spend',
    time_range: timeRange,
    limit: '100',
  });

  const { data: mappings } = await admin
    .from('meta_campaigns')
    .select('campaign_id, dienst')
    .eq('owner_id', userId);

  const dienstMap = new Map((mappings || []).map((m) => [m.campaign_id, m.dienst]));
  const periode = since;
  let synced = 0;

  for (const row of insights.data || []) {
    const spend = Number(row.spend || 0);
    if (spend <= 0) continue;
    const campaignId = row.campaign_id as string;
    const externalRef = `meta_${campaignId}_${periode.slice(0, 7)}`;
    const dienst = dienstMap.get(campaignId) || null;
    await admin.from('advertentiekosten').upsert({
      periode,
      bron: 'meta',
      bedrag: spend,
      notities: `Meta: ${row.campaign_name}`,
      dienst,
      meta_campaign_id: campaignId,
      external_ref: externalRef,
      synced_at: new Date().toISOString(),
    }, { onConflict: 'external_ref' });
    synced += 1;
  }

  await admin.from('meta_connections').update({ last_sync_at: new Date().toISOString() }).eq('owner_id', userId);
  return synced;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const url = new URL(req.url);
  let body: Record<string, unknown> = {};
  if (req.method === 'POST') {
    body = await req.json().catch(() => ({}));
  }
  const action = url.searchParams.get('action') || (body.action as string | undefined);

  try {
    if (action === 'callback') {
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');
      const err = url.searchParams.get('error_description') || url.searchParams.get('error');
      if (err) return redirect(`${siteUrl}/crm/#advertentiekosten?meta=error&msg=${encodeURIComponent(err)}`);
      if (!code || !state) return redirect(`${siteUrl}/crm/#advertentiekosten?meta=error&msg=${encodeURIComponent('OAuth mislukt.')}`);

      const { data: stateRow } = await admin.from('meta_oauth_states').select('owner_id').eq('state', state).maybeSingle();
      if (!stateRow?.owner_id) return redirect(`${siteUrl}/crm/#advertentiekosten?meta=error&msg=${encodeURIComponent('Sessie verlopen.')}`);
      await admin.from('meta_oauth_states').delete().eq('state', state);

      const { accessToken, tokenExpiresAt } = await exchangeCode(code);
      const account = await pickAdAccount(accessToken);
      const adAccountId = account.account_id || account.id.replace('act_', '');

      await admin.from('meta_connections').upsert({
        owner_id: stateRow.owner_id,
        ad_account_id: adAccountId,
        ad_account_name: account.name || adAccountId,
        access_token: accessToken,
        token_expires_at: tokenExpiresAt,
        connected_at: new Date().toISOString(),
      }, { onConflict: 'owner_id' });

      await syncCampaigns(stateRow.owner_id, adAccountId, accessToken);
      await syncSpend(stateRow.owner_id, adAccountId, accessToken);

      return redirect(`${siteUrl}/crm/#advertentiekosten?meta=connected`);
    }

    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

    const act = body.action || action;
    const auth = await requireEigenaar(req);
    if ('error' in auth) return auth.error;
    const { user } = auth;

    if (act === 'status') {
      const { data: conn } = await admin
        .from('meta_connections')
        .select('ad_account_id, ad_account_name, connected_at, last_sync_at, token_expires_at')
        .eq('owner_id', user.id)
        .maybeSingle();
      const { count } = await admin.from('meta_campaigns').select('*', { count: 'exact', head: true }).eq('owner_id', user.id);
      return json({ connected: Boolean(conn), connection: conn, campaignCount: count || 0 });
    }

    if (act === 'auth-url') {
      if (!metaAppId || !metaAppSecret) {
        return json({ error: 'Meta App ID/Secret niet geconfigureerd in Supabase secrets.' }, 503);
      }
      const state = crypto.randomUUID();
      await admin.from('meta_oauth_states').insert({ state, owner_id: user.id, created_at: new Date().toISOString() });
      const oauthUrl = new URL(`https://www.facebook.com/${graphVersion}/dialog/oauth`);
      oauthUrl.searchParams.set('client_id', metaAppId);
      oauthUrl.searchParams.set('redirect_uri', callbackUri());
      oauthUrl.searchParams.set('state', state);
      oauthUrl.searchParams.set('scope', 'ads_read,ads_management');
      return json({ url: oauthUrl.toString() });
    }

    const { data: conn } = await admin.from('meta_connections').select('*').eq('owner_id', user.id).maybeSingle();
    if (!conn) return json({ error: 'Meta Ads is nog niet gekoppeld.' }, 400);

    if (act === 'sync') {
      await syncCampaigns(user.id, conn.ad_account_id, conn.access_token);
      const synced = await syncSpend(user.id, conn.ad_account_id, conn.access_token);
      return json({ ok: true, synced });
    }

    if (act === 'disconnect') {
      await admin.from('meta_connections').delete().eq('owner_id', user.id);
      await admin.from('meta_campaigns').delete().eq('owner_id', user.id);
      return json({ ok: true });
    }

    if (act === 'update-campaign') {
      const { campaignId, dienst } = body as { campaignId?: string; dienst?: string | null };
      if (!campaignId) return json({ error: 'campaignId ontbreekt.' }, 400);
      await admin.from('meta_campaigns').update({
        dienst: dienst || null,
        updated_at: new Date().toISOString(),
      }).eq('owner_id', user.id).eq('campaign_id', campaignId);
      return json({ ok: true });
    }

    if (act === 'campaigns') {
      const { data: campaigns } = await admin
        .from('meta_campaigns')
        .select('campaign_id, campaign_name, dienst, status, updated_at')
        .eq('owner_id', user.id)
        .order('campaign_name');
      return json({ campaigns: campaigns || [] });
    }

    return json({ error: 'Onbekende actie.' }, 400);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Onbekende fout' }, 500);
  }
});

import { supabase } from './supabaseClient.js';

export async function fetchOwnProfile(userId) {
  let uid = userId;
  if (!uid) {
    const { data: { session } } = await supabase.auth.getSession();
    uid = session?.user?.id;
  }
  if (!uid) return null;
  const { data, error } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle();
  if (error) throw error;
  return data;
}

export async function fetchOwnPermissions() {
  const { data, error } = await supabase.rpc('eigen_permissions');
  if (error) throw error;
  return data || [];
}

export async function fetchPermissionDefinitions() {
  const { data, error } = await supabase
    .from('permission_definitions')
    .select('*')
    .order('sort_order');
  if (error) throw error;
  return data || [];
}

export async function saveProfilePermissions(profileId, keys) {
  const { error } = await supabase.rpc('set_profile_permissions', {
    p_profile_id: profileId,
    p_keys: keys,
  });
  if (error) throw error;
}

// ── Team & rollen ───────────────────────────────────────
export async function fetchTeamLeden() {
  const { data, error } = await supabase.rpc('team_leden');
  if (error) throw error;
  return data || [];
}

export async function updateTeamLid(id, fields) {
  const { error } = await supabase.from('profiles').update(fields).eq('id', id);
  if (error) throw error;
}

async function invokeTeamManage(body) {
  const { data, error } = await supabase.functions.invoke('team-manage', { body });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function createTeamLid({ email, password, naam, rol, permissions }) {
  return invokeTeamManage({ action: 'create', email, password, naam, rol, permissions });
}

export async function deleteTeamLid(userId) {
  return invokeTeamManage({ action: 'delete', user_id: userId });
}

export async function resetTeamLidPassword(userId, password) {
  return invokeTeamManage({ action: 'reset_password', user_id: userId, password });
}

export async function fetchCommissieRegels() {
  const { data, error } = await supabase.from('commissie_regels').select('*').order('volgorde');
  if (error) throw error;
  return data;
}

export async function updateCommissieRegel(id, percentage) {
  const { error } = await supabase.from('commissie_regels').update({ percentage }).eq('id', id);
  if (error) throw error;
}

export async function fetchProductieKostenRegels() {
  const { data, error } = await supabase.from('productie_kosten_regels').select('*').order('dienst').order('pakket');
  if (error) throw error;
  return data;
}

export async function createProductieKostenRegel(regel) {
  const { error } = await supabase.from('productie_kosten_regels').insert(regel);
  if (error) throw error;
}

export async function updateProductieKostenRegel(id, bedrag) {
  const { error } = await supabase.from('productie_kosten_regels').update({ bedrag }).eq('id', id);
  if (error) throw error;
}

export async function deleteProductieKostenRegel(id) {
  const { error } = await supabase.from('productie_kosten_regels').delete().eq('id', id);
  if (error) throw error;
}

export async function fetchInstellingen() {
  const { data, error } = await supabase.from('instellingen').select('*').limit(1).maybeSingle();
  if (error) throw error;
  return data;
}

export async function saveInstellingen(id, fields) {
  const { error } = await supabase
    .from('instellingen')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function fetchReservations({ start, eind } = {}) {
  let query = supabase.from('reservations').select('*').order('datum', { ascending: false });
  if (start) query = query.gte('datum', start);
  if (eind) query = query.lt('datum', eind);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function createReservation(reservation) {
  const { data, error } = await supabase.from('reservations').insert(reservation).select().single();
  if (error) throw error;
  return data;
}

export async function sendReservationEmail(reservationId) {
  const { data, error } = await supabase.functions.invoke('reservation-email', {
    body: { reservation_id: reservationId },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function createReservationsBulk(reservations) {
  const { error } = await supabase.from('reservations').insert(reservations);
  if (error) throw error;
}

export async function deleteReservation(id) {
  const { error } = await supabase.from('reservations').delete().eq('id', id);
  if (error) throw error;
}

export async function markReservationBekeken(id) {
  const { error } = await supabase.from('reservations').update({ bekeken: true }).eq('id', id);
  if (error) throw error;
}

export async function fetchNieuweAantal() {
  const { count, error } = await supabase
    .from('reservations')
    .select('id', { count: 'exact', head: true })
    .eq('bekeken', false);
  if (error) throw error;
  return count || 0;
}

export async function fetchEigenReservations() {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) return [];
  const { data, error } = await supabase
    .from('reservations')
    .select('id, dienst, pakket, klantnaam, datum, status, created_at')
    .eq('created_by', userData.user.id)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

// ── Klanten ─────────────────────────────────────────────
export async function fetchClients() {
  const { data, error } = await supabase.from('clients').select('*').order('naam');
  if (error) throw error;
  return data;
}

export async function fetchClientsCount() {
  const { count, error } = await supabase.from('clients').select('id', { count: 'exact', head: true });
  if (error) throw error;
  return count || 0;
}

export async function fetchClientPipelineStats() {
  const { data, error } = await supabase.from('clients').select('status, bron, created_at');
  if (error) throw error;
  const byStatus = { lead: 0, contact: 0, klant: 0, inactief: 0 };
  const byBron = {};
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const since = weekAgo.toISOString();
  let leadsThisWeek = 0;
  for (const row of data || []) {
    const st = row.status || 'lead';
    byStatus[st] = (byStatus[st] || 0) + 1;
    if (row.bron) byBron[row.bron] = (byBron[row.bron] || 0) + 1;
    if (row.created_at >= since && (st === 'lead' || st === 'contact')) leadsThisWeek += 1;
  }
  return { byStatus, byBron, leadsThisWeek, total: data?.length || 0 };
}

export async function fetchClientById(id) {
  const { data, error } = await supabase.from('clients').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function searchClients(term) {
  const q = (term || '').trim();
  let query = supabase.from('clients').select('id, naam, email, bedrijf').order('naam').limit(20);
  if (q) query = query.ilike('naam', `%${q}%`);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function createClient(client) {
  const { data: userData } = await supabase.auth.getUser();
  const payload = { ...client, created_by: userData?.user?.id || null };
  const { data, error } = await supabase.from('clients').insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function updateClient(id, fields) {
  const { error } = await supabase
    .from('clients')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteClient(id) {
  const { error } = await supabase.from('clients').delete().eq('id', id);
  if (error) throw error;
}

// Lichte aggregatie: aantal boekingen + laatste datum per klant, in JS berekend.
export async function fetchClientBookingStats() {
  const { data, error } = await supabase
    .from('reservations')
    .select('client_id, datum')
    .not('client_id', 'is', null);
  if (error) throw error;
  const stats = new Map();
  for (const row of data) {
    const cur = stats.get(row.client_id) || { aantal: 0, laatste: null };
    cur.aantal += 1;
    if (!cur.laatste || row.datum > cur.laatste) cur.laatste = row.datum;
    stats.set(row.client_id, cur);
  }
  return stats;
}

// Volledige boekingen (met bedragen) — voor de eigenaar op de klantkaart.
export async function fetchReservationsByClient(clientId) {
  const { data, error } = await supabase
    .from('reservations')
    .select('*')
    .eq('client_id', clientId)
    .order('datum', { ascending: false });
  if (error) throw error;
  return data;
}

// Boekingen zonder bedragen — voor Nathanisya (via de veilige functie).
export async function fetchBoekingenZonderBedragen(clientId) {
  const { data, error } = await supabase.rpc('boekingen_klant', { p_client_id: clientId });
  if (error) throw error;
  return (data || []).sort((a, b) => (a.datum < b.datum ? 1 : -1));
}

export async function fetchClientNotes(clientId) {
  const { data, error } = await supabase
    .from('client_notes')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function createClientNote(clientId, tekst) {
  const { data: userData } = await supabase.auth.getUser();
  const { error } = await supabase.from('client_notes').insert({
    client_id: clientId,
    tekst,
    created_by: userData?.user?.id || null,
  });
  if (error) throw error;
}

// ── Opvolgtaken ─────────────────────────────────────────
export async function fetchKlantTaken(clientId) {
  const { data, error } = await supabase
    .from('klant_taken')
    .select('*')
    .eq('client_id', clientId)
    .order('afgerond')
    .order('deadline', { ascending: true, nullsFirst: false });
  if (error) throw error;
  return data;
}

export async function fetchOpenTakenCount() {
  const { count, error } = await supabase
    .from('klant_taken')
    .select('id', { count: 'exact', head: true })
    .eq('afgerond', false);
  if (error) throw error;
  return count || 0;
}

export async function fetchOpenTakenDezeWeek() {
  const { data, error } = await supabase
    .from('klant_taken')
    .select('*, clients(naam)')
    .eq('afgerond', false)
    .order('deadline', { ascending: true, nullsFirst: false })
    .limit(20);
  if (error) throw error;

  const vandaag = new Date();
  vandaag.setHours(0, 0, 0, 0);
  const zondag = new Date(vandaag);
  zondag.setDate(vandaag.getDate() + (7 - vandaag.getDay()) % 7);
  if (zondag < vandaag) zondag.setDate(zondag.getDate() + 7);

  return (data || []).filter((t) => {
    if (!t.deadline) return true;
    const d = new Date(t.deadline);
    return d <= zondag || d < vandaag; // deze week of achterstallig
  }).slice(0, 10);
}

export async function createKlantTaak(taak) {
  const { data: userData } = await supabase.auth.getUser();
  const { data, error } = await supabase.from('klant_taken').insert({
    ...taak,
    created_by: userData?.user?.id || null,
  }).select().single();
  if (error) throw error;
  return data;
}

export async function updateKlantTaak(id, fields) {
  const { error } = await supabase.from('klant_taken').update(fields).eq('id', id);
  if (error) throw error;
}

export async function deleteKlantTaak(id) {
  const { error } = await supabase.from('klant_taken').delete().eq('id', id);
  if (error) throw error;
}

export async function fetchAdvertentiekosten({ start, eind } = {}) {
  let query = supabase.from('advertentiekosten').select('*').order('periode', { ascending: false });
  if (start) query = query.gte('periode', start);
  if (eind) query = query.lt('periode', eind);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function createAdvertentiekosten(entry) {
  const { error } = await supabase.from('advertentiekosten').insert(entry);
  if (error) throw error;
}

export async function deleteAdvertentiekosten(id) {
  const { error } = await supabase.from('advertentiekosten').delete().eq('id', id);
  if (error) throw error;
}

export async function fetchMetaCampaignsLocal() {
  const { data, error } = await supabase
    .from('meta_campaigns')
    .select('campaign_id, campaign_name, dienst, status')
    .order('campaign_name');
  if (error) throw error;
  return data || [];
}

import { supabase } from './supabaseClient.js';

export async function fetchCommissieRegels() {
  const { data, error } = await supabase.from('commissie_regels').select('*').order('volgorde');
  if (error) throw error;
  return data;
}

export async function updateCommissieRegel(id, percentage) {
  const { error } = await supabase.from('commissie_regels').update({ percentage }).eq('id', id);
  if (error) throw error;
}

export async function fetchInstellingen() {
  const { data, error } = await supabase.from('instellingen').select('*').limit(1).maybeSingle();
  if (error) throw error;
  return data;
}

export async function saveInstellingen(id, minimumGarantie, bonusTiers) {
  const { error } = await supabase
    .from('instellingen')
    .update({ minimum_garantie: minimumGarantie, bonus_tiers: bonusTiers, updated_at: new Date().toISOString() })
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
  const { error } = await supabase.from('reservations').insert(reservation);
  if (error) throw error;
}

export async function createReservationsBulk(reservations) {
  const { error } = await supabase.from('reservations').insert(reservations);
  if (error) throw error;
}

export async function deleteReservation(id) {
  const { error } = await supabase.from('reservations').delete().eq('id', id);
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

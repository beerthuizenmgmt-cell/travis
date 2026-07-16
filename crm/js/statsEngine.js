import { brutoOmzetVoorReservering, berekenWinst } from './commissieEngine.js';

export const DIENST_LABELS = { foto: 'Fotostudio', podcast: 'Podcast', influencer: 'Influencer' };

export function trendPct(huidig, vorig) {
  const cur = Number(huidig) || 0;
  const prev = Number(vorig) || 0;
  if (!prev && !cur) return null;
  if (!prev) return cur > 0 ? 100 : 0;
  return ((cur - prev) / prev) * 100;
}

export function formatTrend(pct) {
  if (pct === null || Number.isNaN(pct)) return '';
  const rounded = Math.abs(pct) < 0.05 ? 0 : pct;
  const sign = rounded > 0 ? '+' : rounded < 0 ? '−' : '';
  const cls = rounded > 0 ? 'up' : rounded < 0 ? 'down' : 'flat';
  return { cls, text: `${sign}${Math.abs(rounded).toFixed(1)}% vs vorige maand` };
}

export function omzetPerDienst(reservations) {
  const totals = { foto: 0, podcast: 0, influencer: 0 };
  for (const r of reservations.filter((x) => x.status === 'bevestigd')) {
    if (totals[r.dienst] !== undefined) totals[r.dienst] += brutoOmzetVoorReservering(r);
  }
  return totals;
}

export function boekingenPerDienst(reservations) {
  const totals = { foto: 0, podcast: 0, influencer: 0 };
  for (const r of reservations.filter((x) => x.status === 'bevestigd')) {
    if (totals[r.dienst] !== undefined) totals[r.dienst] += 1;
  }
  return totals;
}

export function adSpendPerDienst(adkosten) {
  const totals = { foto: 0, podcast: 0, influencer: 0, overig: 0 };
  for (const a of adkosten || []) {
    if (a.dienst && totals[a.dienst] !== undefined) totals[a.dienst] += Number(a.bedrag || 0);
    else totals.overig += Number(a.bedrag || 0);
  }
  return totals;
}

export function roasPerDienst(omzet, spend) {
  const out = {};
  for (const key of ['foto', 'podcast', 'influencer']) {
    const s = spend[key] || 0;
    const o = omzet[key] || 0;
    out[key] = s > 0 ? o / s : null;
  }
  return out;
}

export function totaalRoas(omzetTotaal, spendTotaal) {
  return spendTotaal > 0 ? omzetTotaal / spendTotaal : null;
}

export function kostenPerBoeking(spendTotaal, aantalBoekingen) {
  return aantalBoekingen > 0 ? spendTotaal / aantalBoekingen : null;
}

export function dashboardSnapshot(reservations, adkosten) {
  const winst = berekenWinst(reservations, adkosten);
  const omzet = omzetPerDienst(reservations);
  const boekingen = boekingenPerDienst(reservations);
  const spend = adSpendPerDienst(adkosten);
  const spendTotaal = (adkosten || []).reduce((s, a) => s + Number(a.bedrag || 0), 0);
  return {
    winst,
    omzet,
    boekingen,
    spend,
    spendTotaal,
    roas: roasPerDienst(omzet, spend),
    totaalRoas: totaalRoas(winst.brutoOmzet, spendTotaal),
    kostenPerBoeking: kostenPerBoeking(spendTotaal, winst.aantalBevestigd),
  };
}

export function begroeting(naam) {
  const uur = new Date().getHours();
  const voornaam = String(naam || '').trim().split(/\s+/)[0] || 'daar';
  let deel = 'Goedemorgen';
  if (uur >= 12 && uur < 18) deel = 'Goedemiddag';
  else if (uur >= 18) deel = 'Goedenavond';
  return `${deel}, ${voornaam}`;
}

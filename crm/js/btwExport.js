import { brutoOmzetVoorReservering, berekenWinst } from './commissieEngine.js';
import { winstPerDienst, DIENST_LABELS } from './statsEngine.js';
import { formatEuro, formatDatum } from './utils.js';

export const BTW_BRON_LABELS = { meta: 'Meta Ads', google: 'Google Ads', handmatig: 'Handmatig' };

export function btwInstellingen(inst) {
  return {
    bedrijfsnaam: inst?.bedrijfsnaam?.trim() || 'Beerthuizen Management',
    kvkNummer: inst?.kvk_nummer?.trim() || '',
    btwNummer: inst?.btw_nummer?.trim() || '',
    btwTarief: Number(inst?.btw_tarief ?? 21),
    prijzenInclBtw: inst?.prijzen_incl_btw !== false,
    kostenInclBtw: Boolean(inst?.kosten_incl_btw),
    kostenBtwHerleidbaar: inst?.kosten_btw_herleidbaar !== false,
  };
}

export function splitsOmzetBtw(bedrag, opts) {
  const tarief = opts.btwTarief / 100;
  const amount = Number(bedrag) || 0;
  if (!amount) return { excl: 0, btw: 0, incl: 0 };

  if (opts.prijzenInclBtw) {
    const excl = amount / (1 + tarief);
    const btw = amount - excl;
    return { excl, btw, incl: amount };
  }
  const excl = amount;
  const btw = amount * tarief;
  return { excl, btw, incl: amount + btw };
}

export function splitsKostenBtw(bedrag, opts) {
  const amount = Number(bedrag) || 0;
  if (!amount || !opts.kostenBtwHerleidbaar) return { excl: amount, btw: 0, incl: amount };

  const tarief = opts.btwTarief / 100;
  if (opts.kostenInclBtw) {
    const excl = amount / (1 + tarief);
    const btw = amount - excl;
    return { excl, btw, incl: amount };
  }
  const excl = amount;
  const btw = amount * tarief;
  return { excl, btw, incl: amount + btw };
}

function fmtNum(n) {
  return (Number(n) || 0).toFixed(2).replace('.', ',');
}

function csvEscape(val) {
  const s = String(val ?? '').replace(/"/g, '""');
  return `"${s}"`;
}

function csvRow(cols) {
  return cols.map(csvEscape).join(';');
}

export function buildBtwRapport({ reservations, adkosten, instellingen, periodeLabel, periodeStart, periodeEind }) {
  const opts = btwInstellingen(instellingen);
  const bevestigd = [...(reservations || [])]
    .filter((r) => r.status === 'bevestigd')
    .sort((a, b) => String(a.datum).localeCompare(String(b.datum)));

  const omzetRegels = bevestigd.map((r) => {
    const bruto = brutoOmzetVoorReservering(r);
    const btw = splitsOmzetBtw(bruto, opts);
    const extras = Array.isArray(r.extras) ? r.extras : [];
    const extrasTekst = extras.map((e) => `${e.type || 'Extra'} ${formatEuro(e.bedrag)}`).join(', ');
    return {
      datum: r.datum,
      klantnaam: r.klantnaam,
      dienst: DIENST_LABELS[r.dienst] || r.dienst,
      pakket: r.pakket,
      omschrijving: extrasTekst ? `${r.pakket} (${extrasTekst})` : r.pakket,
      brutoOmzet: bruto,
      omzetExcl: btw.excl,
      omzetBtw: btw.btw,
      omzetIncl: btw.incl,
      productieKosten: Number(r.productie_kosten || 0),
    };
  });

  const productieRegels = bevestigd.map((r) => {
    const k = splitsKostenBtw(Number(r.productie_kosten || 0), opts);
    return {
      datum: r.datum,
      klantnaam: r.klantnaam,
      dienst: DIENST_LABELS[r.dienst] || r.dienst,
      pakket: r.pakket,
      omschrijving: `Productiekosten ${r.pakket}`,
      bedragExcl: k.excl,
      btw: k.btw,
      bedragIncl: k.incl,
    };
  }).filter((r) => r.bedragExcl > 0 || r.btw > 0);

  const adRegels = (adkosten || []).map((a) => {
    const k = splitsKostenBtw(Number(a.bedrag || 0), opts);
    const maand = a.periode ? String(a.periode).slice(0, 7) : '';
    return {
      periode: maand,
      bron: BTW_BRON_LABELS[a.bron] || a.bron,
      dienst: a.dienst ? (DIENST_LABELS[a.dienst] || a.dienst) : 'Algemeen',
      notities: a.notities || '',
      bedragExcl: k.excl,
      btw: k.btw,
      bedragIncl: k.incl,
    };
  }).filter((r) => r.bedragExcl > 0 || r.btw > 0);

  const omzetExclTotaal = omzetRegels.reduce((s, r) => s + r.omzetExcl, 0);
  const omzetBtwTotaal = omzetRegels.reduce((s, r) => s + r.omzetBtw, 0);
  const omzetInclTotaal = omzetRegels.reduce((s, r) => s + r.omzetIncl, 0);

  const voorbelastingProductie = productieRegels.reduce((s, r) => s + r.btw, 0);
  const voorbelastingAds = adRegels.reduce((s, r) => s + r.btw, 0);
  const voorbelastingTotaal = voorbelastingProductie + voorbelastingAds;

  const kostenExclTotaal = productieRegels.reduce((s, r) => s + r.bedragExcl, 0)
    + adRegels.reduce((s, r) => s + r.bedragExcl, 0);

  const teBetalenBtw = omzetBtwTotaal - voorbelastingTotaal;
  const winst = berekenWinst(reservations, adkosten);
  const perDienst = winstPerDienst(reservations, adkosten);

  return {
    opts,
    periodeLabel,
    periodeStart,
    periodeEind,
    gegenereerdOp: new Date().toISOString(),
    omzetRegels,
    productieRegels,
    adRegels,
    perDienst,
    samenvatting: {
      aantalBoekingen: bevestigd.length,
      omzetExclTotaal,
      omzetBtwTotaal,
      omzetInclTotaal,
      rubriek1aOmzetExcl: omzetExclTotaal,
      rubriek1aBtw: omzetBtwTotaal,
      voorbelastingProductie,
      voorbelastingAds,
      voorbelastingTotaal,
      kostenExclTotaal,
      teBetalenBtw,
      brutoOmzet: winst.brutoOmzet,
      productieTotaal: winst.productieTotaal,
      advertentieTotaal: winst.advertentieTotaal,
      winst: winst.winst,
      winstPercentage: winst.winstPercentage,
    },
  };
}

export function buildBtwCsv(rapport) {
  const { opts, samenvatting, periodeLabel } = rapport;
  const lines = [];

  lines.push(csvRow(['BTW-AANGIFTE ONDERBOUWING']));
  lines.push(csvRow(['Bedrijfsnaam', opts.bedrijfsnaam]));
  lines.push(csvRow(['KVK-nummer', opts.kvkNummer || '—']));
  lines.push(csvRow(['BTW-identificatienummer', opts.btwNummer || '—']));
  lines.push(csvRow(['Periode', periodeLabel]));
  lines.push(csvRow(['Gegenereerd op', new Date(rapport.gegenereerdOp).toLocaleString('nl-NL')]));
  lines.push(csvRow(['BTW-tarief omzet', `${opts.btwTarief}%`]));
  lines.push(csvRow(['Prijzen in CRM', opts.prijzenInclBtw ? 'Inclusief BTW' : 'Exclusief BTW']));
  lines.push('');

  lines.push(csvRow(['BTW-SAMENVATTING (rubrieken aangifte)']));
  lines.push(csvRow(['Rubriek', 'Omschrijving', 'Bedrag excl. BTW', 'BTW-bedrag']));
  lines.push(csvRow(['1a', `Leveringen/diensten belast met hoog tarief (${opts.btwTarief}%)`, fmtNum(samenvatting.rubriek1aOmzetExcl), fmtNum(samenvatting.rubriek1aBtw)]));
  lines.push(csvRow(['5a', 'Verschuldigde omzetbelasting (rubriek 1a)', '', fmtNum(samenvatting.omzetBtwTotaal)]));
  lines.push(csvRow(['5b', 'Voorbelasting (aftrekbare BTW op kosten)', '', fmtNum(samenvatting.voorbelastingTotaal)]));
  lines.push(csvRow(['', '— productiekosten', '', fmtNum(samenvatting.voorbelastingProductie)]));
  lines.push(csvRow(['', '— advertentiekosten', '', fmtNum(samenvatting.voorbelastingAds)]));
  lines.push(csvRow(['5g', 'Te betalen / terug te vragen (5a − 5b)', '', fmtNum(samenvatting.teBetalenBtw)]));
  lines.push('');

  lines.push(csvRow(['OMZET SPECIFICATIE (bevestigde boekingen)']));
  lines.push(csvRow(['Datum', 'Klant', 'Dienst', 'Omschrijving', 'Omzet excl. BTW', 'BTW', 'Omzet incl. BTW', 'Productiekosten']));
  for (const r of rapport.omzetRegels) {
    lines.push(csvRow([
      r.datum, r.klantnaam, r.dienst, r.omschrijving,
      fmtNum(r.omzetExcl), fmtNum(r.omzetBtw), fmtNum(r.omzetIncl), fmtNum(r.productieKosten),
    ]));
  }
  lines.push(csvRow(['Totaal', '', '', '', fmtNum(samenvatting.omzetExclTotaal), fmtNum(samenvatting.omzetBtwTotaal), fmtNum(samenvatting.omzetInclTotaal), '']));
  lines.push('');

  lines.push(csvRow(['PRODUCTIEKOSTEN SPECIFICATIE']));
  lines.push(csvRow(['Datum', 'Klant', 'Dienst', 'Omschrijving', 'Bedrag excl. BTW', 'BTW (voorbelasting)', 'Bedrag incl. BTW']));
  for (const r of rapport.productieRegels) {
    lines.push(csvRow([r.datum, r.klantnaam, r.dienst, r.omschrijving, fmtNum(r.bedragExcl), fmtNum(r.btw), fmtNum(r.bedragIncl)]));
  }
  lines.push('');

  lines.push(csvRow(['ADVERTENTIEKOSTEN SPECIFICATIE']));
  lines.push(csvRow(['Maand', 'Bron', 'Dienst', 'Notities', 'Bedrag excl. BTW', 'BTW (voorbelasting)', 'Bedrag incl. BTW']));
  for (const r of rapport.adRegels) {
    lines.push(csvRow([r.periode, r.bron, r.dienst, r.notities, fmtNum(r.bedragExcl), fmtNum(r.btw), fmtNum(r.bedragIncl)]));
  }
  lines.push('');

  lines.push(csvRow(['WINST PER DIENST']));
  lines.push(csvRow(['Dienst', 'Boekingen', 'Bruto omzet', 'Productiekosten', 'Advertentiekosten', 'Winst', 'Winst %']));
  for (const d of rapport.perDienst) {
    lines.push(csvRow([
      d.label, d.boekingen, fmtNum(d.brutoOmzet), fmtNum(d.productieKosten),
      fmtNum(d.advertentieKosten), fmtNum(d.winst),
      d.winstPercentage !== null ? `${d.winstPercentage.toFixed(1)}%` : '—',
    ]));
  }
  lines.push('');

  lines.push(csvRow(['BEDRIJFSRESULTAAT']));
  lines.push(csvRow(['Bruto omzet', fmtNum(samenvatting.brutoOmzet)]));
  lines.push(csvRow(['Productiekosten', fmtNum(samenvatting.productieTotaal)]));
  lines.push(csvRow(['Advertentiekosten', fmtNum(samenvatting.advertentieTotaal)]));
  lines.push(csvRow(['Winst vóór belasting', fmtNum(samenvatting.winst)]));
  lines.push(csvRow(['Winstmarge', `${samenvatting.winstPercentage.toFixed(1)}%`]));

  return `\uFEFF${lines.join('\n')}`;
}

export function buildBtwHtml(rapport) {
  const { opts, samenvatting, periodeLabel, periodeStart, periodeEind } = rapport;
  const euro = (n) => formatEuro(n);
  const pct = (n) => `${Number(n).toFixed(1)}%`;

  const omzetRows = rapport.omzetRegels.map((r) => `
    <tr>
      <td>${formatDatum(r.datum)}</td>
      <td>${esc(r.klantnaam)}</td>
      <td>${esc(r.dienst)}</td>
      <td>${esc(r.omschrijving)}</td>
      <td class="num">${euro(r.omzetExcl)}</td>
      <td class="num">${euro(r.omzetBtw)}</td>
      <td class="num">${euro(r.omzetIncl)}</td>
    </tr>`).join('');

  const productieRows = rapport.productieRegels.map((r) => `
    <tr>
      <td>${formatDatum(r.datum)}</td>
      <td>${esc(r.klantnaam)}</td>
      <td>${esc(r.dienst)}</td>
      <td class="num">${euro(r.bedragExcl)}</td>
      <td class="num">${euro(r.btw)}</td>
      <td class="num">${euro(r.bedragIncl)}</td>
    </tr>`).join('');

  const adRows = rapport.adRegels.map((r) => `
    <tr>
      <td>${esc(r.periode)}</td>
      <td>${esc(r.bron)}</td>
      <td>${esc(r.dienst)}</td>
      <td>${esc(r.notities)}</td>
      <td class="num">${euro(r.bedragExcl)}</td>
      <td class="num">${euro(r.btw)}</td>
      <td class="num">${euro(r.bedragIncl)}</td>
    </tr>`).join('');

  const dienstRows = rapport.perDienst.map((d) => `
    <tr>
      <td><strong>${esc(d.label)}</strong></td>
      <td class="num">${d.boekingen}</td>
      <td class="num">${euro(d.brutoOmzet)}</td>
      <td class="num">${euro(d.productieKosten)}</td>
      <td class="num">${euro(d.advertentieKosten)}</td>
      <td class="num money">${euro(d.winst)}</td>
      <td class="num">${d.winstPercentage !== null ? pct(d.winstPercentage) : '—'}</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="utf-8">
  <title>BTW-onderbouwing ${esc(periodeLabel)} — ${esc(opts.bedrijfsnaam)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; color: #0a0a0f; line-height: 1.5; max-width: 960px; margin: 0 auto; padding: 32px 24px; }
    h1 { font-size: 22px; margin: 0 0 4px; }
    h2 { font-size: 15px; margin: 28px 0 10px; border-bottom: 2px solid #0048ff; padding-bottom: 4px; }
    .meta { color: #6b6b7b; font-size: 13px; margin-bottom: 24px; }
    .meta p { margin: 2px 0; }
    .kpi-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 16px 0; }
    .kpi { border: 1px solid #dce4f5; border-radius: 8px; padding: 12px; }
    .kpi-label { font-size: 11px; text-transform: uppercase; color: #6b6b7b; font-weight: 700; }
    .kpi-value { font-size: 20px; font-weight: 800; margin-top: 4px; }
    .kpi-value.warn { color: #dc2626; }
    .kpi-value.money { color: #059669; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 8px; }
    th, td { border: 1px solid #dce4f5; padding: 7px 10px; text-align: left; }
    th { background: #eef2fc; font-size: 11px; text-transform: uppercase; letter-spacing: 0.03em; }
    td.num { text-align: right; font-variant-numeric: tabular-nums; }
    td.money { color: #059669; font-weight: 700; }
    tfoot td { font-weight: 700; background: #f4f7ff; }
    .btw-box { background: #e6eeff; border: 1px solid #0048ff; border-radius: 10px; padding: 16px; margin: 16px 0; }
    .btw-box table { margin: 0; }
    .btw-box th, .btw-box td { border-color: rgba(0,72,255,0.15); }
    .disclaimer { font-size: 11px; color: #6b6b7b; margin-top: 32px; padding-top: 16px; border-top: 1px solid #dce4f5; }
    @media print {
      body { padding: 16px; }
      h2 { page-break-after: avoid; }
      table { page-break-inside: auto; }
      tr { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <h1>BTW-onderbouwing &amp; omzetoverzicht</h1>
  <div class="meta">
    <p><strong>${esc(opts.bedrijfsnaam)}</strong></p>
    ${opts.kvkNummer ? `<p>KVK: ${esc(opts.kvkNummer)}</p>` : ''}
    ${opts.btwNummer ? `<p>BTW-nummer: ${esc(opts.btwNummer)}</p>` : '<p><em>BTW-nummer nog niet ingevuld in Instellingen</em></p>'}
    <p>Periode: <strong>${esc(periodeLabel)}</strong> (${esc(periodeStart)} t/m ${esc(periodeEind)})</p>
    <p>Gegenereerd: ${new Date(rapport.gegenereerdOp).toLocaleString('nl-NL')}</p>
    <p>BTW-tarief omzet: ${opts.btwTarief}% · Prijzen in CRM: ${opts.prijzenInclBtw ? 'inclusief BTW' : 'exclusief BTW'}</p>
  </div>

  <h2>1. BTW-samenvatting (aangifte)</h2>
  <div class="btw-box">
    <table>
      <thead><tr><th>Rubriek</th><th>Omschrijving</th><th class="num">Excl. BTW</th><th class="num">BTW-bedrag</th></tr></thead>
      <tbody>
        <tr><td>1a</td><td>Omzet belast met hoog tarief (${opts.btwTarief}%)</td><td class="num">${euro(samenvatting.rubriek1aOmzetExcl)}</td><td class="num">${euro(samenvatting.rubriek1aBtw)}</td></tr>
        <tr><td>5a</td><td>Verschuldigde omzetbelasting</td><td></td><td class="num">${euro(samenvatting.omzetBtwTotaal)}</td></tr>
        <tr><td>5b</td><td>Voorbelasting (productie + advertenties)</td><td></td><td class="num">${euro(samenvatting.voorbelastingTotaal)}</td></tr>
        <tr><td>5g</td><td><strong>Te betalen / terug te vragen</strong></td><td></td><td class="num"><strong>${euro(samenvatting.teBetalenBtw)}</strong></td></tr>
      </tbody>
    </table>
  </div>

  <div class="kpi-grid">
    <div class="kpi"><div class="kpi-label">Bevestigde boekingen</div><div class="kpi-value">${samenvatting.aantalBoekingen}</div></div>
    <div class="kpi"><div class="kpi-label">Omzet incl. BTW</div><div class="kpi-value">${euro(samenvatting.omzetInclTotaal)}</div></div>
    <div class="kpi"><div class="kpi-label">Winst vóór belasting</div><div class="kpi-value ${samenvatting.winst >= 0 ? 'money' : 'warn'}">${euro(samenvatting.winst)} (${pct(samenvatting.winstPercentage)})</div></div>
  </div>

  <h2>2. Omzet specificatie</h2>
  <table>
    <thead><tr><th>Datum</th><th>Klant</th><th>Dienst</th><th>Omschrijving</th><th class="num">Excl. BTW</th><th class="num">BTW</th><th class="num">Incl. BTW</th></tr></thead>
    <tbody>${omzetRows || '<tr><td colspan="7">Geen bevestigde boekingen in deze periode.</td></tr>'}</tbody>
    <tfoot><tr><td colspan="4">Totaal</td><td class="num">${euro(samenvatting.omzetExclTotaal)}</td><td class="num">${euro(samenvatting.omzetBtwTotaal)}</td><td class="num">${euro(samenvatting.omzetInclTotaal)}</td></tr></tfoot>
  </table>

  <h2>3. Winst per dienst</h2>
  <table>
    <thead><tr><th>Dienst</th><th class="num">Boekingen</th><th class="num">Bruto omzet</th><th class="num">Productie</th><th class="num">Ads</th><th class="num">Winst</th><th class="num">Winst %</th></tr></thead>
    <tbody>${dienstRows}</tbody>
  </table>

  <h2>4. Productiekosten</h2>
  <table>
    <thead><tr><th>Datum</th><th>Klant</th><th>Dienst</th><th class="num">Excl. BTW</th><th class="num">BTW</th><th class="num">Incl. BTW</th></tr></thead>
    <tbody>${productieRows || '<tr><td colspan="6">Geen productiekosten in deze periode.</td></tr>'}</tbody>
  </table>

  <h2>5. Advertentiekosten</h2>
  <table>
    <thead><tr><th>Maand</th><th>Bron</th><th>Dienst</th><th>Notities</th><th class="num">Excl. BTW</th><th class="num">BTW</th><th class="num">Incl. BTW</th></tr></thead>
    <tbody>${adRows || '<tr><td colspan="7">Geen advertentiekosten in deze periode.</td></tr>'}</tbody>
  </table>

  <p class="disclaimer">
    Dit overzicht is gegenereerd vanuit het Beerthuizen CRM op basis van ingevoerde reserveringen en kosten.
    Controleer de bedragen altijd met je eigen administratie en facturen voordat je de BTW-aangifte indient bij de Belastingdienst.
    Vul je KVK- en BTW-nummer aan via Instellingen voor een volledig dossier.
  </p>
</body>
</html>`;
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function downloadFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function exportBtwRapport(rapport, slug) {
  const html = buildBtwHtml(rapport);
  const csv = buildBtwCsv(rapport);
  downloadFile(`btw-onderbouwing-${slug}.html`, html, 'text/html;charset=utf-8');
  setTimeout(() => {
    downloadFile(`btw-onderbouwing-${slug}.csv`, csv, 'text/csv;charset=utf-8');
  }, 400);
}

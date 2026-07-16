import { fetchReservations, fetchAdvertentiekosten, fetchInstellingen } from './data.js';
import { berekenWinst, groepeerPerPakket } from './commissieEngine.js';
import { winstPerDienst, ongekoppeldeAdSpend, DIENST_LABELS } from './statsEngine.js';
import { buildBtwRapport, exportBtwRapport } from './btwExport.js';
import {
  formatEuro, huidigeMaand, maandBereik, maandLabel, toast,
  kwartaalBereik, kwartaalLabel, huidigKwartaal, periodeEindLabel, openModal, closeModal,
} from './utils.js';

function winstPctLabel(pct) {
  if (pct === null || pct === undefined) return '—';
  return `${pct.toFixed(1)}%`;
}

function winstPctClass(pct) {
  if (pct === null || pct === undefined) return '';
  if (pct >= 50) return 'money';
  if (pct >= 25) return '';
  return 'warn';
}

function renderDienstWinstTable(rows, vorigeRows) {
  const vorigMap = new Map((vorigeRows || []).map((r) => [r.dienst, r]));
  return rows.map((d) => {
    const vorig = vorigMap.get(d.dienst);
    const trend = vorig && vorig.winst > 0
      ? `<span class="dienst-trend ${d.winst >= vorig.winst ? 'up' : 'down'}">${d.winst >= vorig.winst ? '↑' : '↓'} vs vorige maand</span>`
      : '';
    return `<tr>
      <td><span class="dienst-badge dienst-${d.dienst}">${d.label}</span></td>
      <td class="num">${d.boekingen}</td>
      <td class="num">${formatEuro(d.brutoOmzet)}</td>
      <td class="num warn">${formatEuro(d.productieKosten)}</td>
      <td class="num">${formatEuro(d.advertentieKosten)}</td>
      <td class="num ${d.winst >= 0 ? 'money' : 'warn'}">${formatEuro(d.winst)}</td>
      <td class="num ${winstPctClass(d.winstPercentage)}">${winstPctLabel(d.winstPercentage)}</td>
      <td class="dienst-trend-cell">${trend}</td>
    </tr>`;
  }).join('');
}

export function initMaandoverzichtPage() {
  const picker = document.getElementById('overviewMonthPicker');
  picker.value = huidigeMaand();
  picker.addEventListener('change', renderMaandoverzicht);

  const { jaar, kwartaal } = huidigKwartaal();
  document.getElementById('btwExportJaar').value = jaar;
  document.getElementById('btwExportKwartaal').value = kwartaal;

  document.querySelectorAll('input[name="btwPeriodeType"]').forEach((el) => {
    el.addEventListener('change', updateBtwPeriodeFields);
  });
  updateBtwPeriodeFields();

  document.getElementById('btwExportBtn')?.addEventListener('click', () => {
    document.getElementById('btwExportMaand').value = document.getElementById('overviewMonthPicker').value || huidigeMaand();
    openModal('btwExportModal');
  });

  document.getElementById('btwExportCancelBtn')?.addEventListener('click', () => closeModal('btwExportModal'));

  document.getElementById('btwExportConfirmBtn')?.addEventListener('click', async () => {
    const btn = document.getElementById('btwExportConfirmBtn');
    btn.disabled = true;
    try {
      await runBtwExport();
      closeModal('btwExportModal');
      toast('BTW-export gedownload (HTML + CSV).');
    } catch (err) {
      toast(`Export mislukt: ${err.message}`, true);
    } finally {
      btn.disabled = false;
    }
  });
}

function updateBtwPeriodeFields() {
  const type = document.querySelector('input[name="btwPeriodeType"]:checked')?.value || 'kwartaal';
  document.getElementById('btwKwartaalFields').style.display = type === 'kwartaal' ? 'grid' : 'none';
  document.getElementById('btwMaandFields').style.display = type === 'maand' ? 'block' : 'none';
}

async function runBtwExport() {
  const type = document.querySelector('input[name="btwPeriodeType"]:checked')?.value || 'kwartaal';
  let start;
  let eind;
  let periodeLabel;
  let slug;

  if (type === 'maand') {
    const maand = document.getElementById('btwExportMaand').value;
    ({ start, eind } = maandBereik(maand));
    periodeLabel = maandLabel(maand);
    slug = maand;
  } else {
    const jaar = Number(document.getElementById('btwExportJaar').value);
    const kwartaal = Number(document.getElementById('btwExportKwartaal').value);
    ({ start, eind } = kwartaalBereik(jaar, kwartaal));
    periodeLabel = kwartaalLabel(jaar, kwartaal);
    slug = `${jaar}-Q${kwartaal}`;
  }

  const [reservations, adkosten, instellingen] = await Promise.all([
    fetchReservations({ start, eind }),
    fetchAdvertentiekosten({ start, eind }),
    fetchInstellingen(),
  ]);

  const rapport = buildBtwRapport({
    reservations,
    adkosten,
    instellingen,
    periodeLabel,
    periodeStart: start,
    periodeEind: periodeEindLabel(eind),
  });

  exportBtwRapport(rapport, slug);
}

function vorigeMaand(maandStr) {
  const [j, m] = maandStr.split('-').map(Number);
  const d = new Date(j, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export async function renderMaandoverzicht() {
  const picker = document.getElementById('overviewMonthPicker');
  const maand = picker.value || huidigeMaand();
  const { start, eind } = maandBereik(maand);
  const vorigStart = maandBereik(vorigeMaand(maand));

  const [reservations, adkosten, vorigReservations, vorigAdkosten] = await Promise.all([
    fetchReservations({ start, eind }),
    fetchAdvertentiekosten({ start, eind }),
    fetchReservations(vorigStart),
    fetchAdvertentiekosten(vorigStart),
  ]);

  const winst = berekenWinst(reservations, adkosten);
  const groepen = groepeerPerPakket(reservations);
  const dienstRows = winstPerDienst(reservations, adkosten);
  const vorigDienstRows = winstPerDienst(vorigReservations, vorigAdkosten);
  const ongekoppeld = ongekoppeldeAdSpend(adkosten);

  const kpiEl = document.getElementById('overviewKpis');
  kpiEl.innerHTML = `
    <div class="kpi-card"><span class="kpi-label">Bevestigde reserveringen</span><span class="kpi-value">${winst.aantalBevestigd}</span></div>
    <div class="kpi-card"><span class="kpi-label">Bruto omzet</span><span class="kpi-value">${formatEuro(winst.brutoOmzet)}</span></div>
    <div class="kpi-card"><span class="kpi-label">Productiekosten</span><span class="kpi-value warn">${formatEuro(winst.productieTotaal)}</span></div>
    <div class="kpi-card"><span class="kpi-label">Advertentiekosten</span><span class="kpi-value warn">${formatEuro(winst.advertentieTotaal)}</span></div>
    <div class="kpi-card"><span class="kpi-label">Winst (${winst.winstPercentage.toFixed(1)}%)</span><span class="kpi-value ${winst.winst >= 0 ? 'money' : 'warn'}">${formatEuro(winst.winst)}</span></div>
  `;

  const dienstBody = document.getElementById('overviewDienstBody');
  if (dienstBody) {
    dienstBody.innerHTML = dienstRows.some((d) => d.boekingen || d.brutoOmzet || d.advertentieKosten)
      ? renderDienstWinstTable(dienstRows, vorigDienstRows)
      : '<tr><td colspan="8" class="text-muted">Geen bevestigde reserveringen in deze maand.</td></tr>';
  }

  const body = document.getElementById('overviewBreakdownBody');
  body.innerHTML = groepen.length
    ? groepen.map((g) => `<tr>
        <td><span class="dienst-badge dienst-${g.dienst}">${DIENST_LABELS[g.dienst] || g.dienst}</span></td>
        <td>${g.pakket}</td>
        <td class="num">${g.aantal}</td>
        <td class="num">${formatEuro(g.brutoOmzet)}</td>
        <td class="num warn">${formatEuro(g.productieKosten)}</td>
        <td class="num ${winstPctClass(g.winstPercentage)}">${winstPctLabel(g.winstPercentage)}</td>
        <td class="num money">${formatEuro(g.netto)}</td>
      </tr>`).join('')
    : '<tr><td colspan="7" class="text-muted">Geen bevestigde reserveringen in deze maand.</td></tr>';

  const warnEl = document.getElementById('overviewAdWarning');
  if (warnEl) {
    if (ongekoppeld > 0) {
      warnEl.style.display = 'block';
      warnEl.innerHTML = `<strong>Let op:</strong> ${formatEuro(ongekoppeld)} advertentiekosten is nog niet gekoppeld aan een dienst — die telt alleen mee in het totaal, niet per dienst. <a href="#advertentiekosten" class="nav-link" data-page="advertentiekosten">Koppelen →</a>`;
    } else {
      warnEl.style.display = 'none';
    }
  }

  const formulaEl = document.getElementById('overviewFormula');
  formulaEl.innerHTML = winst.aantalBevestigd
    ? `Bruto omzet (${formatEuro(winst.brutoOmzet)}) minus productiekosten (${formatEuro(winst.productieTotaal)}) en advertentiekosten (${formatEuro(winst.advertentieTotaal)}) = winst ${formatEuro(winst.winst)} (${winst.winstPercentage.toFixed(1)}%).`
    : 'Nog geen bevestigde reserveringen in deze maand.';
}

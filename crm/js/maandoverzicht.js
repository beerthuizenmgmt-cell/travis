import { fetchReservations, fetchAdvertentiekosten } from './data.js';
import { berekenWinst, groepeerPerPakket } from './commissieEngine.js';
import { formatEuro, huidigeMaand, maandBereik } from './utils.js';

export function initMaandoverzichtPage() {
  const picker = document.getElementById('overviewMonthPicker');
  picker.value = huidigeMaand();
  picker.addEventListener('change', renderMaandoverzicht);
}

export async function renderMaandoverzicht() {
  const picker = document.getElementById('overviewMonthPicker');
  const maand = picker.value || huidigeMaand();
  const { start, eind } = maandBereik(maand);

  const [reservations, adkosten] = await Promise.all([
    fetchReservations({ start, eind }),
    fetchAdvertentiekosten({ start, eind }),
  ]);

  const winst = berekenWinst(reservations, adkosten);
  const groepen = groepeerPerPakket(reservations);

  const kpiEl = document.getElementById('overviewKpis');
  kpiEl.innerHTML = `
    <div class="kpi-card"><span class="kpi-label">Bevestigde reserveringen</span><span class="kpi-value">${winst.aantalBevestigd}</span></div>
    <div class="kpi-card"><span class="kpi-label">Bruto omzet</span><span class="kpi-value">${formatEuro(winst.brutoOmzet)}</span></div>
    <div class="kpi-card"><span class="kpi-label">Productiekosten</span><span class="kpi-value warn">${formatEuro(winst.productieTotaal)}</span></div>
    <div class="kpi-card"><span class="kpi-label">Winst (${winst.winstPercentage.toFixed(1)}%)</span><span class="kpi-value ${winst.winst >= 0 ? 'money' : 'warn'}">${formatEuro(winst.winst)}</span></div>
  `;

  const body = document.getElementById('overviewBreakdownBody');
  body.innerHTML = groepen.length
    ? groepen.map((g) => `<tr>
        <td>${g.dienst}</td>
        <td>${g.pakket}</td>
        <td>${g.aantal}</td>
        <td>${formatEuro(g.brutoOmzet)}</td>
        <td>${formatEuro(g.productieKosten)}</td>
        <td class="money">${formatEuro(g.netto)}</td>
      </tr>`).join('')
    : '<tr><td colspan="6" class="text-muted">Geen bevestigde reserveringen in deze maand.</td></tr>';

  const formulaEl = document.getElementById('overviewFormula');
  formulaEl.innerHTML = winst.aantalBevestigd
    ? `Bruto omzet (${formatEuro(winst.brutoOmzet)}) minus productiekosten (${formatEuro(winst.productieTotaal)}) en advertentiekosten (${formatEuro(winst.advertentieTotaal)}) = winst ${formatEuro(winst.winst)} (${winst.winstPercentage.toFixed(1)}%).`
    : 'Nog geen bevestigde reserveringen in deze maand.';
}

import { fetchReservations, fetchAdvertentiekosten, fetchCommissieRegels, fetchInstellingen } from './data.js';
import { berekenMaandoverzicht, berekenWinst, groepeerPerPakket } from './commissieEngine.js';
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

  const [regels, instellingen, reservations, adkosten] = await Promise.all([
    fetchCommissieRegels(),
    fetchInstellingen(),
    fetchReservations({ start, eind }),
    fetchAdvertentiekosten({ start, eind }),
  ]);

  const overzicht = berekenMaandoverzicht(reservations, regels, instellingen);
  const winst = berekenWinst(reservations, adkosten, overzicht.uitbetaling);

  const kpiEl = document.getElementById('overviewKpis');
  kpiEl.innerHTML = `
    <div class="kpi-card"><span class="kpi-label">Bevestigde reserveringen</span><span class="kpi-value">${overzicht.aantalKlanten}</span></div>
    <div class="kpi-card"><span class="kpi-label">Commissie (excl. bonus)</span><span class="kpi-value">${formatEuro(overzicht.totaalCommissie)}</span></div>
    <div class="kpi-card"><span class="kpi-label">Volumebonus</span><span class="kpi-value">${formatEuro(overzicht.bonus)}</span></div>
    <div class="kpi-card"><span class="kpi-label">Totaal te betalen</span><span class="kpi-value money">${formatEuro(overzicht.uitbetaling)}</span></div>
  `;

  const groepen = groepeerPerPakket(overzicht.perReservering);
  const body = document.getElementById('overviewBreakdownBody');
  body.innerHTML = groepen.length
    ? groepen.map((g) => `<tr>
        <td>${g.dienst}</td>
        <td>${g.pakket}</td>
        <td>${g.aantal}</td>
        <td>${formatEuro(g.brutoOmzet)}</td>
        <td>${formatEuro(g.nettoBasis)}</td>
        <td class="money">${formatEuro(g.commissie)}</td>
      </tr>`).join('')
    : '<tr><td colspan="6" class="text-muted">Geen bevestigde reserveringen in deze maand.</td></tr>';

  const formulaEl = document.getElementById('overviewFormula');
  formulaEl.innerHTML = overzicht.minimumToegepast
    ? `<strong>Minimumgarantie toegepast:</strong> commissie + bonus (${formatEuro(overzicht.totaalCommissie + overzicht.bonus)}) lag onder de minimumgarantie van ${formatEuro(overzicht.minimumGarantie)}, dus die minimumgarantie geldt. Winst deze maand: ${formatEuro(winst.winst)} (${winst.winstPercentage.toFixed(1)}%) na aftrek van productiekosten en advertentiekosten.`
    : `Commissie (${formatEuro(overzicht.totaalCommissie)}) + volumebonus (${formatEuro(overzicht.bonus)}) = ${formatEuro(overzicht.uitbetaling)}, boven de minimumgarantie van ${formatEuro(overzicht.minimumGarantie)}. Winst deze maand: ${formatEuro(winst.winst)} (${winst.winstPercentage.toFixed(1)}%) na aftrek van productiekosten en advertentiekosten.`;
}

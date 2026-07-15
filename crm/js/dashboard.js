import { fetchReservations, fetchAdvertentiekosten, fetchCommissieRegels, fetchInstellingen, fetchClientsCount, fetchOpenTakenCount, fetchOpenTakenDezeWeek } from './data.js';
import { berekenMaandoverzicht, berekenWinst, brutoOmzetVoorReservering, berekenCommissieVoorReservering } from './commissieEngine.js';
import { formatEuro, formatDatum, huidigeMaand, maandBereik } from './utils.js';
import { drawDualLineChart } from './chart.js';

function laatsteMaanden(n) {
  const maanden = [];
  const nu = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(nu.getFullYear(), nu.getMonth() - i, 1);
    maanden.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return maanden;
}

export async function renderDashboard() {
  const [regels, instellingen, klantenTotaal, openTaken] = await Promise.all([
    fetchCommissieRegels(),
    fetchInstellingen(),
    fetchClientsCount().catch(() => 0),
    fetchOpenTakenCount().catch(() => 0),
  ]);
  const maanden = laatsteMaanden(6);
  const omzetSerie = [];
  const winstSerie = [];
  let dezeMaandData = null;

  for (const maand of maanden) {
    const { start, eind } = maandBereik(maand);
    const [reservations, adkosten] = await Promise.all([
      fetchReservations({ start, eind }),
      fetchAdvertentiekosten({ start, eind }),
    ]);
    const overzicht = berekenMaandoverzicht(reservations, regels, instellingen);
    const winst = berekenWinst(reservations, adkosten, overzicht.uitbetaling);
    omzetSerie.push(winst.brutoOmzet);
    winstSerie.push(winst.winst);
    if (maand === huidigeMaand()) {
      dezeMaandData = { reservations, adkosten, overzicht, winst };
    }
  }

  if (!dezeMaandData) {
    const { start, eind } = maandBereik(huidigeMaand());
    const reservations = await fetchReservations({ start, eind });
    const adkosten = await fetchAdvertentiekosten({ start, eind });
    const overzicht = berekenMaandoverzicht(reservations, regels, instellingen);
    const winst = berekenWinst(reservations, adkosten, overzicht.uitbetaling);
    dezeMaandData = { reservations, adkosten, overzicht, winst };
  }

  const labels = maanden.map((m) => {
    const [j, mnd] = m.split('-');
    return new Intl.DateTimeFormat('nl-NL', { month: 'short' }).format(new Date(Number(j), Number(mnd) - 1, 1));
  });
  drawDualLineChart('revenueChart', labels, omzetSerie, winstSerie);

  const { overzicht, winst } = dezeMaandData;
  const kpiEl = document.getElementById('dashboardKpis');
  kpiEl.classList.add('cols-6');
  kpiEl.innerHTML = `
    <div class="kpi-card"><span class="kpi-label">Omzet deze maand</span><span class="kpi-value">${formatEuro(winst.brutoOmzet)}</span></div>
    <div class="kpi-card"><span class="kpi-label">Te betalen aan Nathanisya</span><span class="kpi-value money">${formatEuro(overzicht.uitbetaling)}</span>${overzicht.minimumToegepast ? '<div class="kpi-sub">Minimumgarantie toegepast</div>' : ''}</div>
    <div class="kpi-card"><span class="kpi-label">Advertentiekosten</span><span class="kpi-value warn">${formatEuro(winst.advertentieTotaal)}</span></div>
    <div class="kpi-card"><span class="kpi-label">Winst (${winst.winstPercentage.toFixed(1)}%)</span><span class="kpi-value ${winst.winst >= 0 ? 'money' : 'warn'}">${formatEuro(winst.winst)}</span></div>
    <div class="kpi-card"><span class="kpi-label">Totaal klanten</span><span class="kpi-value">${klantenTotaal}</span></div>
    <div class="kpi-card"><span class="kpi-label">Openstaande taken</span><span class="kpi-value ${openTaken ? 'warn' : ''}">${openTaken}</span></div>
  `;

  const taken = await fetchOpenTakenDezeWeek().catch(() => []);
  const tasksCard = document.getElementById('dashboardTasksCard');
  const tasksBody = document.getElementById('dashboardTasksBody');
  if (taken.length) {
    tasksCard.style.display = 'block';
    tasksBody.innerHTML = taken.map((t) => `<tr>
      <td>${t.tekst}</td>
      <td>${t.clients?.naam || '—'}</td>
      <td>${t.deadline ? formatDatum(t.deadline) : '—'}</td>
    </tr>`).join('');
  } else {
    tasksCard.style.display = 'none';
  }

  const recentBody = document.getElementById('dashboardRecentBody');
  const recent = [...dezeMaandData.reservations].slice(0, 6);
  recentBody.innerHTML = recent.length
    ? recent.map((r) => {
        const c = berekenCommissieVoorReservering(r, regels);
        return `<tr><td>${r.klantnaam}</td><td>${r.dienst}</td><td>${r.pakket}</td><td>${formatDatum(r.datum)}</td><td>${formatEuro(brutoOmzetVoorReservering(r))}</td><td class="money">${formatEuro(c.totaalCommissie)}</td></tr>`;
      }).join('')
    : '<tr><td colspan="6" class="text-muted">Nog geen reserveringen deze maand.</td></tr>';
}

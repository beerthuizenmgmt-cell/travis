import { fetchReservations, fetchAdvertentiekosten, fetchClientsCount, fetchOpenTakenCount, fetchOpenTakenDezeWeek, fetchClientPipelineStats } from './data.js';
import { berekenWinst, brutoOmzetVoorReservering, nettoVoorReservering } from './commissieEngine.js';
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
  const [klantenTotaal, openTaken] = await Promise.all([
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
    const winst = berekenWinst(reservations, adkosten);
    omzetSerie.push(winst.brutoOmzet);
    winstSerie.push(winst.winst);
    if (maand === huidigeMaand()) {
      dezeMaandData = { reservations, winst };
    }
  }

  if (!dezeMaandData) {
    const { start, eind } = maandBereik(huidigeMaand());
    const [reservations, adkosten] = await Promise.all([
      fetchReservations({ start, eind }),
      fetchAdvertentiekosten({ start, eind }),
    ]);
    dezeMaandData = { reservations, winst: berekenWinst(reservations, adkosten) };
  }

  const labels = maanden.map((m) => {
    const [j, mnd] = m.split('-');
    return new Intl.DateTimeFormat('nl-NL', { month: 'short' }).format(new Date(Number(j), Number(mnd) - 1, 1));
  });
  drawDualLineChart('revenueChart', labels, omzetSerie, winstSerie);

  const { winst } = dezeMaandData;
  const kpiEl = document.getElementById('dashboardKpis');
  kpiEl.classList.add('cols-6');
  kpiEl.innerHTML = `
    <div class="kpi-card"><span class="kpi-label">Omzet deze maand</span><span class="kpi-value">${formatEuro(winst.brutoOmzet)}</span></div>
    <div class="kpi-card"><span class="kpi-label">Productiekosten</span><span class="kpi-value warn">${formatEuro(winst.productieTotaal)}</span></div>
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

  const pipeline = await fetchClientPipelineStats().catch(() => null);
  const pipelineCard = document.getElementById('dashboardPipelineCard');
  const pipelineEl = document.getElementById('dashboardPipeline');
  if (pipeline && pipelineCard && pipelineEl) {
    pipelineCard.style.display = 'block';
    const bronTop = Object.entries(pipeline.byBron).sort((a, b) => b[1] - a[1]).slice(0, 4);
    pipelineEl.innerHTML = `
      <div class="pipeline-stat"><span class="pipeline-num">${pipeline.byStatus.lead || 0}</span><span class="pipeline-label">Leads</span></div>
      <div class="pipeline-stat"><span class="pipeline-num">${pipeline.byStatus.contact || 0}</span><span class="pipeline-label">Contact gehad</span></div>
      <div class="pipeline-stat"><span class="pipeline-num">${pipeline.byStatus.klant || 0}</span><span class="pipeline-label">Klanten</span></div>
      <div class="pipeline-stat"><span class="pipeline-num warn">${pipeline.leadsThisWeek}</span><span class="pipeline-label">Nieuw deze week</span></div>
      ${bronTop.length ? `<div class="pipeline-bron"><strong>Top bronnen:</strong> ${bronTop.map(([b, n]) => `${b} (${n})`).join(' · ')}</div>` : ''}
    `;
  } else if (pipelineCard) {
    pipelineCard.style.display = 'none';
  }

  const recentBody = document.getElementById('dashboardRecentBody');
  const recent = [...dezeMaandData.reservations].slice(0, 6);
  recentBody.innerHTML = recent.length
    ? recent.map((r) => `<tr><td>${r.klantnaam}</td><td>${r.dienst}</td><td>${r.pakket}</td><td>${formatDatum(r.datum)}</td><td>${formatEuro(brutoOmzetVoorReservering(r))}</td><td class="money">${formatEuro(nettoVoorReservering(r))}</td></tr>`).join('')
    : '<tr><td colspan="6" class="text-muted">Nog geen reserveringen deze maand.</td></tr>';
}

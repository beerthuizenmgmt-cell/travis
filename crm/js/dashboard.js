import {
  fetchReservations, fetchAdvertentiekosten, fetchClientsCount,
  fetchOpenTakenCount, fetchOpenTakenDezeWeek, fetchClientPipelineStats, fetchOwnProfile,
} from './data.js';
import { berekenWinst, brutoOmzetVoorReservering, nettoVoorReservering } from './commissieEngine.js';
import {
  dashboardSnapshot, trendPct, formatTrend, begroeting,
  DIENST_LABELS,
} from './statsEngine.js';
import { fetchMetaStatus } from './metaAds.js';
import { formatEuro, formatDatum, huidigeMaand, maandBereik } from './utils.js';
import { drawDualLineChart } from './chart.js';
import { getSession } from './auth.js';

function laatsteMaanden(n) {
  const maanden = [];
  const nu = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(nu.getFullYear(), nu.getMonth() - i, 1);
    maanden.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return maanden;
}

function vorigeMaand(maandStr) {
  const [j, m] = maandStr.split('-').map(Number);
  const d = new Date(j, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function kpiTrendHtml(huidig, vorig) {
  const t = formatTrend(trendPct(huidig, vorig));
  if (!t.text) return '';
  return `<div class="kpi-trend ${t.cls}">${t.text}</div>`;
}

function roasLabel(val) {
  if (val === null || val === undefined) return '—';
  return `${val.toFixed(1)}x`;
}

export async function renderDashboard() {
  const maand = huidigeMaand();
  const vorig = vorigeMaand(maand);

  const [klantenTotaal, openTaken, session] = await Promise.all([
    fetchClientsCount().catch(() => 0),
    fetchOpenTakenCount().catch(() => 0),
    getSession(),
  ]);

  let profile = null;
  if (session?.user?.id) {
    profile = await fetchOwnProfile(session.user.id).catch(() => null);
  }

  const greetingEl = document.getElementById('dashboardGreeting');
  const subEl = document.getElementById('dashboardSub');
  if (greetingEl) greetingEl.textContent = begroeting(profile?.naam);
  if (subEl) {
    const parts = [];
    if (openTaken) parts.push(`${openTaken} openstaande ${openTaken === 1 ? 'taak' : 'taken'}`);
    parts.push(`Overzicht ${new Intl.DateTimeFormat('nl-NL', { month: 'long', year: 'numeric' }).format(new Date())}`);
    subEl.textContent = parts.join(' · ');
  }

  const maanden = laatsteMaanden(6);
  const omzetSerie = [];
  const winstSerie = [];
  let dezeMaandData = null;
  let vorigeMaandData = null;

  for (const m of maanden) {
    const { start, eind } = maandBereik(m);
    const [reservations, adkosten] = await Promise.all([
      fetchReservations({ start, eind }),
      fetchAdvertentiekosten({ start, eind }),
    ]);
    const winst = berekenWinst(reservations, adkosten);
    omzetSerie.push(winst.brutoOmzet);
    winstSerie.push(winst.winst);
    if (m === maand) dezeMaandData = { reservations, adkosten, winst };
    if (m === vorig) vorigeMaandData = { reservations, adkosten, winst };
  }

  if (!dezeMaandData) {
    const { start, eind } = maandBereik(maand);
    const [reservations, adkosten] = await Promise.all([
      fetchReservations({ start, eind }),
      fetchAdvertentiekosten({ start, eind }),
    ]);
    dezeMaandData = { reservations, adkosten, winst: berekenWinst(reservations, adkosten) };
  }
  if (!vorigeMaandData) {
    const { start, eind } = maandBereik(vorig);
    const [reservations, adkosten] = await Promise.all([
      fetchReservations({ start, eind }),
      fetchAdvertentiekosten({ start, eind }),
    ]);
    vorigeMaandData = { reservations, adkosten, winst: berekenWinst(reservations, adkosten) };
  }

  const labels = maanden.map((m) => {
    const [j, mnd] = m.split('-');
    return new Intl.DateTimeFormat('nl-NL', { month: 'short' }).format(new Date(Number(j), Number(mnd) - 1, 1));
  });
  drawDualLineChart('revenueChart', labels, omzetSerie, winstSerie);

  const snap = dashboardSnapshot(dezeMaandData.reservations, dezeMaandData.adkosten);
  const snapVorig = dashboardSnapshot(vorigeMaandData.reservations, vorigeMaandData.adkosten);
  const { winst } = dezeMaandData;

  const kpiEl = document.getElementById('dashboardKpis');
  kpiEl.classList.add('cols-6');
  kpiEl.innerHTML = `
    <div class="kpi-card"><span class="kpi-label">Omzet deze maand</span><span class="kpi-value">${formatEuro(winst.brutoOmzet)}</span>${kpiTrendHtml(winst.brutoOmzet, vorigeMaandData.winst.brutoOmzet)}</div>
    <div class="kpi-card"><span class="kpi-label">Winst (${winst.winstPercentage.toFixed(1)}%)</span><span class="kpi-value ${winst.winst >= 0 ? 'money' : 'warn'}">${formatEuro(winst.winst)}</span>${kpiTrendHtml(winst.winst, vorigeMaandData.winst.winst)}</div>
    <div class="kpi-card"><span class="kpi-label">ROAS (totaal)</span><span class="kpi-value">${roasLabel(snap.totaalRoas)}</span><div class="kpi-sub">${snap.spendTotaal ? `${formatEuro(snap.spendTotaal)} ad spend` : 'Nog geen ad spend'}</div></div>
    <div class="kpi-card"><span class="kpi-label">Kosten per boeking</span><span class="kpi-value">${snap.kostenPerBoeking ? formatEuro(snap.kostenPerBoeking) : '—'}</span><div class="kpi-sub">${winst.aantalBevestigd} bevestigd</div></div>
    <div class="kpi-card"><span class="kpi-label">Totaal klanten</span><span class="kpi-value">${klantenTotaal}</span><div class="kpi-sub">in je database</div></div>
    <div class="kpi-card"><span class="kpi-label">Openstaande taken</span><span class="kpi-value ${openTaken ? 'warn' : ''}">${openTaken}</span></div>
  `;

  const dienstEl = document.getElementById('dashboardDiensten');
  if (dienstEl) {
    dienstEl.innerHTML = ['foto', 'podcast', 'influencer'].map((d) => {
      const omzet = snap.omzet[d] || 0;
      const spend = snap.spend[d] || 0;
      const roas = snap.roas[d];
      const boek = snap.boekingen[d] || 0;
      return `<article class="dienst-card dienst-${d}">
        <span class="dienst-card-label">${DIENST_LABELS[d]}</span>
        <span class="dienst-card-omzet">${formatEuro(omzet)}</span>
        <div class="dienst-card-meta">
          <span>${boek} boeking${boek === 1 ? '' : 'en'}</span>
          <span>Spend ${formatEuro(spend)}</span>
          <span class="dienst-roas">ROAS ${roasLabel(roas)}</span>
        </div>
      </article>`;
    }).join('');
  }

  const metaEl = document.getElementById('dashboardMetaAds');
  if (metaEl) {
    try {
      const meta = await fetchMetaStatus();
      if (meta.connected) {
        const conn = meta.connection;
        metaEl.innerHTML = `
          <div class="meta-dash-connected">
            <div><strong>Meta Ads gekoppeld</strong><span class="text-muted">${conn.ad_account_name || conn.ad_account_id}</span></div>
            <div class="meta-dash-stats">
              <span>Campagnes: ${meta.campaignCount}</span>
              <span>Laatste sync: ${conn.last_sync_at ? formatDatum(conn.last_sync_at) : '—'}</span>
              <span>Totale ROAS: ${roasLabel(snap.totaalRoas)}</span>
            </div>
            <a href="#advertentiekosten" class="nav-link" data-page="advertentiekosten">Beheer advertenties →</a>
          </div>`;
      } else {
        metaEl.innerHTML = `
          <div class="meta-dash-empty">
            <p>Koppel Meta Ads om spend automatisch te synchroniseren en ROAS per dienst te zien.</p>
            <a href="#advertentiekosten" class="nav-link btn btn-secondary btn-sm" data-page="advertentiekosten">Naar koppeling →</a>
          </div>`;
      }
    } catch {
      metaEl.innerHTML = `<p class="text-muted">Meta-status kon niet worden geladen.</p>`;
    }
  }

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
    ? recent.map((r) => `<tr><td>${r.klantnaam}</td><td><span class="dienst-badge dienst-${r.dienst}">${DIENST_LABELS[r.dienst] || r.dienst}</span></td><td>${r.pakket}</td><td>${formatDatum(r.datum)}</td><td>${formatEuro(brutoOmzetVoorReservering(r))}</td><td class="money">${formatEuro(nettoVoorReservering(r))}</td></tr>`).join('')
    : '<tr><td colspan="6" class="text-muted">Nog geen reserveringen deze maand.</td></tr>';
}

export function initDashboardPage() {
  document.getElementById('dashAddReservation')?.addEventListener('click', () => {
    document.getElementById('addReservationBtn')?.click();
  });
  document.getElementById('dashAddClient')?.addEventListener('click', () => {
    document.getElementById('addClientBtn')?.click();
  });
}

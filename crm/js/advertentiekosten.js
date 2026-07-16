import { fetchAdvertentiekosten, createAdvertentiekosten, deleteAdvertentiekosten, fetchMetaCampaignsLocal } from './data.js';
import {
  fetchMetaStatus, startMetaConnect, syncMetaAds, disconnectMetaAds, updateMetaCampaignDienst, parseMetaCallbackParams,
} from './metaAds.js';
import { DIENST_LABELS } from './statsEngine.js';
import { formatEuro, formatDatum, openModal, closeModal, toast } from './utils.js';

const BRON_LABELS = { meta: 'Meta Ads', google: 'Google Ads', handmatig: 'Handmatig' };

export function initAdvertentiekostenPage() {
  document.getElementById('addAdCostBtn')?.addEventListener('click', () => {
    document.getElementById('adCostForm').reset();
    openModal('adCostModalBackdrop');
  });
  document.getElementById('cancelAdCostBtn')?.addEventListener('click', () => closeModal('adCostModalBackdrop'));

  document.getElementById('adCostForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const maandWaarde = document.getElementById('acPeriode').value;
    if (!maandWaarde) return;
    try {
      await createAdvertentiekosten({
        periode: `${maandWaarde}-01`,
        bron: document.getElementById('acBron').value,
        bedrag: Number(document.getElementById('acBedrag').value || 0),
        notities: document.getElementById('acNotities').value.trim() || null,
        dienst: document.getElementById('acDienst').value || null,
      });
      closeModal('adCostModalBackdrop');
      toast('Advertentiekosten opgeslagen.');
      await renderAdvertentiekosten();
    } catch (err) {
      toast(`Opslaan mislukt: ${err.message}`, true);
    }
  });

  document.getElementById('adCostsBody')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('.delete-adcost');
    if (!btn) return;
    if (btn.dataset.synced === '1') {
      toast('Gesynchroniseerde Meta-kosten worden bij de volgende sync opnieuw aangemaakt. Koppel los of pauzeer de campagne in Meta.', true);
      return;
    }
    if (!confirm('Deze advertentiekosten verwijderen?')) return;
    try {
      await deleteAdvertentiekosten(btn.dataset.id);
      toast('Verwijderd.');
      await renderAdvertentiekosten();
    } catch (err) {
      toast(`Verwijderen mislukt: ${err.message}`, true);
    }
  });

  document.getElementById('metaCampaignsBody')?.addEventListener('change', async (e) => {
    if (!e.target.classList.contains('meta-dienst-select')) return;
    try {
      await updateMetaCampaignDienst(e.target.dataset.id, e.target.value || null);
      toast('Campagne gekoppeld aan dienst.');
      await renderAdvertentiekosten();
    } catch (err) {
      toast(`Opslaan mislukt: ${err.message}`, true);
    }
  });
}

async function renderMetaIntegration() {
  const card = document.getElementById('metaIntegrationCard');
  const statusEl = document.getElementById('metaStatus');
  const actionsEl = document.getElementById('metaActions');
  const campaignsCard = document.getElementById('metaCampaignsCard');
  if (!card) return;

  try {
    const status = await fetchMetaStatus();
    if (status.connected) {
      const c = status.connection;
      statusEl.innerHTML = `<span class="int-status connected">Gekoppeld · ${c.ad_account_name || c.ad_account_id}</span>
        <span class="text-muted">Laatste sync: ${c.last_sync_at ? formatDatum(c.last_sync_at) : 'nog niet'}</span>`;
      actionsEl.innerHTML = `
        <button type="button" class="btn btn-secondary" id="metaSyncBtn">↻ Synchroniseren</button>
        <button type="button" class="btn btn-secondary" id="metaDisconnectBtn">Ontkoppelen</button>`;
      document.getElementById('metaSyncBtn')?.addEventListener('click', async () => {
        try {
          const result = await syncMetaAds();
          toast(`Gesynchroniseerd (${result.synced || 0} campagnes).`);
          await renderAdvertentiekosten();
        } catch (err) {
          toast(`Sync mislukt: ${err.message}`, true);
        }
      });
      document.getElementById('metaDisconnectBtn')?.addEventListener('click', async () => {
        if (!confirm('Meta Ads ontkoppelen?')) return;
        try {
          await disconnectMetaAds();
          toast('Ontkoppeld.');
          await renderAdvertentiekosten();
        } catch (err) {
          toast(`Ontkoppelen mislukt: ${err.message}`, true);
        }
      });
      campaignsCard.style.display = 'block';
    } else {
      statusEl.innerHTML = '<span class="int-status">Niet gekoppeld</span><span class="text-muted">Koppel je Meta Ads account om spend automatisch binnen te halen.</span>';
      actionsEl.innerHTML = '<button type="button" class="btn btn-primary" id="metaConnectBtn">Verbind Meta Ads</button>';
      document.getElementById('metaConnectBtn')?.addEventListener('click', async () => {
        try {
          await startMetaConnect();
        } catch (err) {
          toast(`Koppelen mislukt: ${err.message}`, true);
        }
      });
      campaignsCard.style.display = 'none';
    }
  } catch (err) {
    statusEl.innerHTML = `<span class="int-status warn">Configuratie nodig</span><span class="text-muted">${err.message}</span>`;
    actionsEl.innerHTML = '';
    campaignsCard.style.display = 'none';
  }
}

async function renderMetaCampaigns() {
  const body = document.getElementById('metaCampaignsBody');
  if (!body) return;
  try {
    const campaigns = await fetchMetaCampaignsLocal();
    body.innerHTML = campaigns.length
      ? campaigns.map((c) => `<tr>
          <td>${c.campaign_name}</td>
          <td class="text-muted">${c.status || '—'}</td>
          <td>
            <select class="input-sm meta-dienst-select" data-id="${c.campaign_id}">
              <option value="">— kies dienst —</option>
              <option value="foto" ${c.dienst === 'foto' ? 'selected' : ''}>Fotostudio</option>
              <option value="podcast" ${c.dienst === 'podcast' ? 'selected' : ''}>Podcast</option>
              <option value="influencer" ${c.dienst === 'influencer' ? 'selected' : ''}>Influencer</option>
            </select>
          </td>
        </tr>`).join('')
      : '<tr><td colspan="3" class="text-muted">Nog geen campagnes — synchroniseer na koppeling.</td></tr>';
  } catch {
    body.innerHTML = '<tr><td colspan="3" class="text-muted">Campagnes laden mislukt.</td></tr>';
  }
}

export async function renderAdvertentiekosten() {
  const cb = parseMetaCallbackParams();
  if (cb?.meta === 'connected') toast('Meta Ads succesvol gekoppeld.');
  if (cb?.meta === 'error') toast(`Meta koppelen mislukt: ${cb.msg || 'onbekende fout'}`, true);

  await renderMetaIntegration();
  await renderMetaCampaigns();

  const kosten = await fetchAdvertentiekosten();
  const body = document.getElementById('adCostsBody');
  body.innerHTML = kosten.length
    ? kosten.map((k) => `<tr>
        <td>${new Intl.DateTimeFormat('nl-NL', { month: 'long', year: 'numeric' }).format(new Date(k.periode))}</td>
        <td>${BRON_LABELS[k.bron] || k.bron}${k.synced_at ? ' <span class="sync-badge">sync</span>' : ''}</td>
        <td>${k.dienst ? DIENST_LABELS[k.dienst] || k.dienst : '—'}</td>
        <td class="money">${formatEuro(k.bedrag)}</td>
        <td class="text-muted">${k.notities || '—'}</td>
        <td>${k.synced_at ? '—' : `<button class="btn-icon delete-adcost" data-id="${k.id}" data-synced="0" aria-label="Verwijder">✕</button>`}</td>
      </tr>`).join('')
    : '<tr><td colspan="6" class="text-muted">Nog geen advertentiekosten ingevoerd.</td></tr>';
}

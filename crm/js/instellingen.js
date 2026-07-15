import {
  fetchCommissieRegels, updateCommissieRegel,
  fetchProductieKostenRegels, createProductieKostenRegel, updateProductieKostenRegel, deleteProductieKostenRegel,
  fetchInstellingen, saveInstellingen,
} from './data.js';
import { toast } from './utils.js';

let instellingenId = null;
let bonusTiers = [];

function bonusRowHtml(tier, i) {
  return `<tr>
    <td><input type="number" class="bonus-vanaf" data-i="${i}" value="${tier.vanaf}"></td>
    <td><input type="number" class="bonus-bedrag" data-i="${i}" value="${tier.bonus}"></td>
    <td><button type="button" class="btn-icon bonus-remove" data-i="${i}" aria-label="Verwijder">✕</button></td>
  </tr>`;
}

function renderBonusTiers() {
  document.getElementById('bonusTiersBody').innerHTML = bonusTiers.map(bonusRowHtml).join('');
}

function productieRowHtml(r) {
  return `<tr>
    <td>${r.dienst}</td>
    <td>${r.pakket}</td>
    <td><input type="number" class="productie-bedrag" data-id="${r.id}" value="${r.bedrag}" step="0.01" style="width:100px"></td>
    <td><button type="button" class="btn-icon productie-remove" data-id="${r.id}" aria-label="Verwijder">✕</button></td>
  </tr>`;
}

async function renderProductieKostenRegels() {
  const regels = await fetchProductieKostenRegels();
  document.getElementById('productieKostenBody').innerHTML = regels.length
    ? regels.map(productieRowHtml).join('')
    : '<tr><td colspan="4" class="text-muted">Nog geen standaardbedragen ingesteld.</td></tr>';
}

export function initInstellingenPage() {
  document.getElementById('commissieRegelsBody')?.addEventListener('change', async (e) => {
    if (!e.target.classList.contains('regel-percentage')) return;
    const id = e.target.dataset.id;
    const value = Number(e.target.value);
    try {
      await updateCommissieRegel(id, value);
      toast('Percentage bijgewerkt.');
    } catch (err) {
      toast(`Bijwerken mislukt: ${err.message}`, true);
    }
  });

  document.getElementById('addBonusTierBtn')?.addEventListener('click', () => {
    bonusTiers.push({ vanaf: 0, bonus: 0 });
    renderBonusTiers();
  });

  document.getElementById('bonusTiersBody')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.bonus-remove');
    if (!btn) return;
    bonusTiers.splice(Number(btn.dataset.i), 1);
    renderBonusTiers();
  });

  document.getElementById('bonusTiersBody')?.addEventListener('input', (e) => {
    const i = Number(e.target.dataset.i);
    if (Number.isNaN(i)) return;
    if (e.target.classList.contains('bonus-vanaf')) bonusTiers[i].vanaf = Number(e.target.value);
    if (e.target.classList.contains('bonus-bedrag')) bonusTiers[i].bonus = Number(e.target.value);
  });

  document.getElementById('saveInstellingenBtn')?.addEventListener('click', async () => {
    const minimumGarantie = Number(document.getElementById('minimumGarantieInput').value || 0);
    try {
      await saveInstellingen(instellingenId, minimumGarantie, bonusTiers);
      toast('Instellingen opgeslagen.');
    } catch (err) {
      toast(`Opslaan mislukt: ${err.message}`, true);
    }
  });

  document.getElementById('addProductieRegelBtn')?.addEventListener('click', async () => {
    const dienst = document.getElementById('newProductieDienst').value;
    const pakket = document.getElementById('newProductiePakket').value.trim();
    const bedrag = Number(document.getElementById('newProductieBedrag').value || 0);
    if (!pakket) {
      toast('Vul een pakketnaam in.', true);
      return;
    }
    try {
      await createProductieKostenRegel({ dienst, pakket, bedrag });
      document.getElementById('newProductiePakket').value = '';
      document.getElementById('newProductieBedrag').value = '';
      toast('Standaardbedrag toegevoegd.');
      await renderProductieKostenRegels();
    } catch (err) {
      toast(`Toevoegen mislukt: ${err.message}`, true);
    }
  });

  document.getElementById('productieKostenBody')?.addEventListener('change', async (e) => {
    if (!e.target.classList.contains('productie-bedrag')) return;
    try {
      await updateProductieKostenRegel(e.target.dataset.id, Number(e.target.value));
      toast('Bedrag bijgewerkt.');
    } catch (err) {
      toast(`Bijwerken mislukt: ${err.message}`, true);
    }
  });

  document.getElementById('productieKostenBody')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('.productie-remove');
    if (!btn) return;
    try {
      await deleteProductieKostenRegel(btn.dataset.id);
      toast('Verwijderd.');
      await renderProductieKostenRegels();
    } catch (err) {
      toast(`Verwijderen mislukt: ${err.message}`, true);
    }
  });
}

export async function renderInstellingen() {
  const [regels, instellingen] = await Promise.all([fetchCommissieRegels(), fetchInstellingen()]);

  document.getElementById('commissieRegelsBody').innerHTML = regels.map((r) => `<tr>
    <td>${r.label}</td>
    <td class="text-muted">${r.basis}</td>
    <td><input type="number" class="regel-percentage" data-id="${r.id}" value="${r.percentage}" step="0.1" style="width:80px"> %</td>
    <td></td>
  </tr>`).join('');

  instellingenId = instellingen?.id || null;
  document.getElementById('minimumGarantieInput').value = instellingen?.minimum_garantie ?? 2400;
  bonusTiers = instellingen?.bonus_tiers ? JSON.parse(JSON.stringify(instellingen.bonus_tiers)) : [];
  renderBonusTiers();

  await renderProductieKostenRegels();
}

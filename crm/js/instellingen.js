import { fetchCommissieRegels, updateCommissieRegel, fetchInstellingen, saveInstellingen } from './data.js';
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
}

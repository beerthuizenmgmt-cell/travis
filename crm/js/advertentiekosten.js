import { fetchAdvertentiekosten, createAdvertentiekosten, deleteAdvertentiekosten } from './data.js';
import { formatEuro, openModal, closeModal, toast } from './utils.js';

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
    if (!confirm('Deze advertentiekosten verwijderen?')) return;
    try {
      await deleteAdvertentiekosten(btn.dataset.id);
      toast('Verwijderd.');
      await renderAdvertentiekosten();
    } catch (err) {
      toast(`Verwijderen mislukt: ${err.message}`, true);
    }
  });
}

export async function renderAdvertentiekosten() {
  const kosten = await fetchAdvertentiekosten();
  const body = document.getElementById('adCostsBody');
  body.innerHTML = kosten.length
    ? kosten.map((k) => `<tr>
        <td>${new Intl.DateTimeFormat('nl-NL', { month: 'long', year: 'numeric' }).format(new Date(k.periode))}</td>
        <td>${k.bron}</td>
        <td class="money">${formatEuro(k.bedrag)}</td>
        <td class="text-muted">${k.notities || '—'}</td>
        <td><button class="btn-icon delete-adcost" data-id="${k.id}" aria-label="Verwijder">✕</button></td>
      </tr>`).join('')
    : '<tr><td colspan="5" class="text-muted">Nog geen advertentiekosten ingevoerd.</td></tr>';
}

import {
  fetchProductieKostenRegels, createProductieKostenRegel, updateProductieKostenRegel, deleteProductieKostenRegel,
} from './data.js';
import { toast } from './utils.js';

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
  await renderProductieKostenRegels();
}

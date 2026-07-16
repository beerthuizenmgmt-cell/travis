import {
  fetchProductieKostenRegels, createProductieKostenRegel, updateProductieKostenRegel, deleteProductieKostenRegel,
  fetchInstellingen, saveInstellingen,
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

async function renderBedrijfsgegevens() {
  const inst = await fetchInstellingen();
  if (!inst) return;

  document.getElementById('bedrijfsnaam').value = inst.bedrijfsnaam || '';
  document.getElementById('kvkNummer').value = inst.kvk_nummer || '';
  document.getElementById('btwNummer').value = inst.btw_nummer || '';
  document.getElementById('btwTarief').value = inst.btw_tarief ?? 21;
  document.getElementById('prijzenInclBtw').checked = inst.prijzen_incl_btw !== false;
  document.getElementById('kostenInclBtw').checked = Boolean(inst.kosten_incl_btw);
  document.getElementById('kostenBtwHerleidbaar').checked = inst.kosten_btw_herleidbaar !== false;

  const form = document.getElementById('bedrijfForm');
  form.dataset.instellingenId = inst.id;
}

export function initInstellingenPage() {
  document.getElementById('bedrijfForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = e.target.dataset.instellingenId;
    if (!id) {
      toast('Instellingen konden niet worden geladen.', true);
      return;
    }
    try {
      await saveInstellingen(id, {
        bedrijfsnaam: document.getElementById('bedrijfsnaam').value.trim() || 'Beerthuizen Management',
        kvk_nummer: document.getElementById('kvkNummer').value.trim() || null,
        btw_nummer: document.getElementById('btwNummer').value.trim() || null,
        btw_tarief: Number(document.getElementById('btwTarief').value || 21),
        prijzen_incl_btw: document.getElementById('prijzenInclBtw').checked,
        kosten_incl_btw: document.getElementById('kostenInclBtw').checked,
        kosten_btw_herleidbaar: document.getElementById('kostenBtwHerleidbaar').checked,
      });
      toast('Bedrijfsgegevens opgeslagen.');
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
  await Promise.all([renderProductieKostenRegels(), renderBedrijfsgegevens()]);
}

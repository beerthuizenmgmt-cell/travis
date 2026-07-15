import { createReservationsBulk } from './data.js';
import { openModal, closeModal, toast } from './utils.js';

const targetFields = [
  { key: 'klantnaam', label: 'Klantnaam', required: true },
  { key: 'datum', label: 'Datum (YYYY-MM-DD)', required: true },
  { key: 'dienst', label: 'Dienst (foto/podcast/influencer)', required: true },
  { key: 'pakket', label: 'Pakket', required: true },
  { key: 'bruto_prijs', label: 'Bruto prijs', required: true },
  { key: 'productie_kosten', label: 'Productiekosten', required: false },
  { key: 'status', label: 'Status (bevestigd/concept/geannuleerd)', required: false },
];

const guessMap = {
  klantnaam: ['naam', 'klant', 'name', 'invitee'],
  datum: ['datum', 'date', 'start'],
  dienst: ['dienst', 'service', 'type'],
  pakket: ['pakket', 'package', 'event'],
  bruto_prijs: ['prijs', 'bedrag', 'price', 'amount'],
  productie_kosten: ['productie', 'editing', 'kosten'],
  status: ['status'],
};

let parsed = { headers: [], rows: [] };
let mapping = {};

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length);
  const splitLine = (line) => {
    const out = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === ',' && !inQuotes) { out.push(cur); cur = ''; continue; }
      cur += ch;
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };
  const headers = splitLine(lines[0]);
  const rows = lines.slice(1).map(splitLine);
  return { headers, rows };
}

function guessColumn(header) {
  const lower = header.toLowerCase();
  for (const [field, hints] of Object.entries(guessMap)) {
    if (hints.some((h) => lower.includes(h))) return field;
  }
  return '';
}

function renderStep1() {
  document.getElementById('csvStep1').style.display = 'block';
  document.getElementById('csvStep2').style.display = 'none';
  document.getElementById('csvStep3').style.display = 'none';
  ['csvStep1Label', 'csvStep2Label', 'csvStep3Label'].forEach((id, i) =>
    document.getElementById(id).classList.toggle('active', i === 0));
}

function renderStep2() {
  document.getElementById('csvStep1').style.display = 'none';
  document.getElementById('csvStep2').style.display = 'block';
  document.getElementById('csvStep3').style.display = 'none';
  ['csvStep1Label', 'csvStep2Label', 'csvStep3Label'].forEach((id, i) =>
    document.getElementById(id).classList.toggle('active', i === 1));

  const rowsEl = document.getElementById('csvMappingRows');
  rowsEl.innerHTML = targetFields.map((f) => {
    const options = ['<option value="">— niet importeren —</option>']
      .concat(parsed.headers.map((h) => `<option value="${h}" ${mapping[f.key] === h ? 'selected' : ''}>${h}</option>`))
      .join('');
    return `<div class="mapping-row"><span>${f.label}${f.required ? ' *' : ''}</span><select data-field="${f.key}">${options}</select></div>`;
  }).join('');
}

function renderStep3() {
  document.getElementById('csvStep1').style.display = 'none';
  document.getElementById('csvStep2').style.display = 'none';
  document.getElementById('csvStep3').style.display = 'block';
  ['csvStep1Label', 'csvStep2Label', 'csvStep3Label'].forEach((id, i) =>
    document.getElementById(id).classList.toggle('active', i === 2));
  document.getElementById('csvSummary').textContent = `${parsed.rows.length} rijen klaar om te importeren.`;
}

function buildReservationsFromMapping() {
  const idx = (field) => parsed.headers.indexOf(mapping[field]);
  return parsed.rows.map((row) => {
    const get = (field) => {
      const i = idx(field);
      return i >= 0 ? row[i] : '';
    };
    return {
      klantnaam: get('klantnaam') || 'Onbekend',
      datum: get('datum') || null,
      dienst: (get('dienst') || 'foto').toLowerCase(),
      pakket: get('pakket') || 'Onbekend',
      bruto_prijs: Number(get('bruto_prijs') || 0),
      productie_kosten: Number(get('productie_kosten') || 0),
      status: get('status') || 'bevestigd',
      extras: [],
      bron: 'calendly_import',
      bekeken: true,
    };
  }).filter((r) => r.datum);
}

export function initCsvImport() {
  const dropzone = document.getElementById('csvDropzone');
  const fileInput = document.getElementById('csvFileInput');

  dropzone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    const text = await file.text();
    parsed = parseCsv(text);
    mapping = {};
    parsed.headers.forEach((h) => {
      const guess = guessColumn(h);
      if (guess && !mapping[guess]) mapping[guess] = h;
    });
    renderStep2();
  });

  document.getElementById('csvBackBtn').addEventListener('click', renderStep1);
  document.getElementById('csvNextBtn').addEventListener('click', () => {
    document.querySelectorAll('#csvMappingRows select').forEach((sel) => {
      mapping[sel.dataset.field] = sel.value;
    });
    const missing = targetFields.filter((f) => f.required && !mapping[f.key]);
    if (missing.length) {
      toast(`Koppel eerst: ${missing.map((f) => f.label).join(', ')}`, true);
      return;
    }
    renderStep3();
  });

  document.getElementById('importCsvBtn')?.addEventListener('click', () => {
    parsed = { headers: [], rows: [] };
    mapping = {};
    renderStep1();
    fileInput.value = '';
    openModal('csvModalBackdrop');
  });
  document.getElementById('csvCancelBtn').addEventListener('click', () => closeModal('csvModalBackdrop'));

  document.getElementById('csvImportConfirmBtn').addEventListener('click', async () => {
    const reservations = buildReservationsFromMapping();
    if (!reservations.length) {
      toast('Geen geldige rijen om te importeren.', true);
      return;
    }
    try {
      await createReservationsBulk(reservations);
      closeModal('csvModalBackdrop');
      toast(`${reservations.length} reserveringen geïmporteerd.`);
      document.querySelector('.nav-link[data-page="reserveringen"]')?.click();
    } catch (err) {
      toast(`Import mislukt: ${err.message}`, true);
    }
  });
}

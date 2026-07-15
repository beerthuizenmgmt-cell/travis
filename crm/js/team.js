import {
  fetchTeamLeden, updateTeamLid, createTeamLid, deleteTeamLid, resetTeamLidPassword,
  fetchPermissionDefinitions, saveProfilePermissions,
} from './data.js';
import { getSession } from './auth.js';
import { formatDatum, toast, openModal, closeModal } from './utils.js';
import { PRESETS, PRESET_INVOER, CRM_PERMISSIONS, groupDefinitions } from './permissions.js';

const ROLLEN = {
  eigenaar: { label: 'Eigenaar', badge: 'role-badge-eigenaar' },
  invoer: { label: 'Medewerker', badge: 'role-badge-invoer' },
};

function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

let permissionDefs = [];
let teamCache = [];
let allPermissionKeys = [];

function readCheckedPermissions(containerId) {
  return [...document.querySelectorAll(`#${containerId} input[type="checkbox"]:checked`)]
    .map((el) => el.value);
}

function setCheckedPermissions(containerId, keys) {
  const set = new Set(keys || []);
  document.querySelectorAll(`#${containerId} input[type="checkbox"]`).forEach((el) => {
    el.checked = set.has(el.value);
  });
}

function renderPermissionGrid(containerId, selectedKeys = [], { disabled = false } = {}) {
  const wrap = document.getElementById(containerId);
  if (!wrap) return;
  const selected = new Set(selectedKeys);
  const groups = groupDefinitions(permissionDefs);

  wrap.innerHTML = [...groups.entries()].map(([category, items]) => `
    <div class="perm-group">
      <h4 class="perm-group-title">${esc(category)}</h4>
      <div class="perm-checks">
        ${items.map((def) => `
          <label class="perm-check ${disabled ? 'disabled' : ''}">
            <input type="checkbox" value="${esc(def.key)}" ${selected.has(def.key) ? 'checked' : ''} ${disabled ? 'disabled' : ''}>
            <span>
              <strong>${esc(def.label)}</strong>
              <small>${esc(def.description)}</small>
            </span>
          </label>
        `).join('')}
      </div>
    </div>
  `).join('');
}

function applyPreset(containerId, presetKey) {
  if (presetKey === 'alles') {
    setCheckedPermissions(containerId, allPermissionKeys);
    return;
  }
  const preset = PRESETS[presetKey];
  if (preset) setCheckedPermissions(containerId, preset.keys);
}

function togglePermissionSections(rol, prefix) {
  const isEigenaar = rol === 'eigenaar';
  document.getElementById(`${prefix}PermissionsWrap`)?.classList.toggle('hidden', isEigenaar);
  document.getElementById(`${prefix}EigenaarNote`)?.classList.toggle('hidden', !isEigenaar);
}

function permissionSummary(keys) {
  if (!keys?.length) return '<span class="text-muted">Geen rechten</span>';
  const labels = keys
    .map((k) => permissionDefs.find((d) => d.key === k)?.label || k)
    .slice(0, 3);
  const extra = keys.length > 3 ? ` +${keys.length - 3}` : '';
  return `<span class="perm-summary">${labels.map(esc).join(', ')}${extra}</span>`;
}

function teamRowHtml(lid, currentUserId) {
  const rol = ROLLEN[lid.rol] || { label: lid.rol, badge: '' };
  const isSelf = lid.id === currentUserId;
  const permCount = lid.rol === 'eigenaar'
    ? 'Alle rechten'
    : `${(lid.permissions || []).length} rechten`;
  return `<tr data-id="${lid.id}">
    <td>${esc(lid.naam || '—')}${isSelf ? ' <span class="text-muted">(jij)</span>' : ''}</td>
    <td>${esc(lid.email)}</td>
    <td><span class="role-badge ${rol.badge}">${esc(rol.label)}</span></td>
    <td>${lid.rol === 'eigenaar' ? permCount : permissionSummary(lid.permissions)}</td>
    <td>${formatDatum(lid.created_at)}</td>
    <td class="table-actions">
      <button type="button" class="btn-icon team-edit" data-id="${lid.id}" title="Bewerken">✎</button>
      ${isSelf ? '' : `<button type="button" class="btn-icon team-delete" data-id="${lid.id}" title="Verwijderen">✕</button>`}
    </td>
  </tr>`;
}

async function renderTeamTable() {
  const session = getSession();
  teamCache = await fetchTeamLeden();
  const body = document.getElementById('teamBody');
  body.innerHTML = teamCache.length
    ? teamCache.map((l) => teamRowHtml(l, session?.user?.id)).join('')
    : '<tr><td colspan="6" class="text-muted">Nog geen medewerkers. Voeg iemand toe via de knop rechtsboven.</td></tr>';
}

function openEditModal(lid) {
  document.getElementById('editTeamId').value = lid.id;
  document.getElementById('editTeamNaam').value = lid.naam || '';
  document.getElementById('editTeamRol').value = lid.rol;
  document.getElementById('editTeamPassword').value = '';
  document.getElementById('editTeamEmail').textContent = lid.email;
  togglePermissionSections(lid.rol, 'edit');
  renderPermissionGrid('editTeamPermissions', lid.permissions || [], { disabled: lid.rol === 'eigenaar' });
  openModal('teamEditBackdrop');
}

export function initTeamPage() {
  document.getElementById('addTeamBtn')?.addEventListener('click', () => {
    document.getElementById('addTeamForm').reset();
    document.getElementById('addTeamRol').value = 'invoer';
    togglePermissionSections('invoer', 'add');
    renderPermissionGrid('addTeamPermissions', PRESET_INVOER);
    openModal('teamAddBackdrop');
  });

  document.getElementById('addTeamRol')?.addEventListener('change', (e) => {
    togglePermissionSections(e.target.value, 'add');
    if (e.target.value === 'invoer') applyPreset('addTeamPermissions', 'invoer');
  });

  document.getElementById('editTeamRol')?.addEventListener('change', (e) => {
    togglePermissionSections(e.target.value, 'edit');
    if (e.target.value === 'invoer' && e.target.dataset.loaded !== '1') {
      applyPreset('editTeamPermissions', 'invoer');
    }
    renderPermissionGrid(
      'editTeamPermissions',
      readCheckedPermissions('editTeamPermissions'),
      { disabled: e.target.value === 'eigenaar' },
    );
  });

  document.querySelectorAll('[data-preset]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.target;
      applyPreset(target, btn.dataset.preset);
    });
  });

  document.getElementById('addTeamForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('addTeamEmail').value.trim();
    const password = document.getElementById('addTeamPassword').value;
    const naam = document.getElementById('addTeamNaam').value.trim();
    const rol = document.getElementById('addTeamRol').value;
    const permissions = rol === 'eigenaar' ? [] : readCheckedPermissions('addTeamPermissions');
    if (rol === 'invoer' && !permissions.length) {
      toast('Selecteer minimaal één permissie.', true);
      return;
    }
    try {
      const result = await createTeamLid({ email, password, naam, rol, permissions });
      if (rol === 'invoer' && permissions.length && result.user_id) {
        await saveProfilePermissions(result.user_id, permissions);
      }
      closeModal('teamAddBackdrop');
      await renderTeamTable();
      toast(result.linked ? 'Bestaand account gekoppeld.' : 'Medewerker toegevoegd.');
    } catch (err) {
      toast(`Toevoegen mislukt: ${err.message}`, true);
    }
  });

  document.getElementById('editTeamForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('editTeamId').value;
    const naam = document.getElementById('editTeamNaam').value.trim();
    const rol = document.getElementById('editTeamRol').value;
    const password = document.getElementById('editTeamPassword').value;
    const permissions = rol === 'eigenaar' ? [] : readCheckedPermissions('editTeamPermissions');
    const session = getSession();
    if (id === session?.user?.id && rol !== 'eigenaar') {
      toast('Je kunt je eigen rol niet wijzigen naar medewerker.', true);
      return;
    }
    if (rol === 'invoer' && !permissions.length) {
      toast('Selecteer minimaal één permissie.', true);
      return;
    }
    try {
      await updateTeamLid(id, { naam: naam || null, rol });
      if (rol === 'invoer') await saveProfilePermissions(id, permissions);
      if (password) await resetTeamLidPassword(id, password);
      closeModal('teamEditBackdrop');
      await renderTeamTable();
      toast(password ? 'Medewerker bijgewerkt en wachtwoord gewijzigd.' : 'Medewerker bijgewerkt.');
    } catch (err) {
      toast(`Bijwerken mislukt: ${err.message}`, true);
    }
  });

  document.getElementById('teamBody')?.addEventListener('click', async (e) => {
    const editBtn = e.target.closest('.team-edit');
    if (editBtn) {
      const lid = teamCache.find((l) => l.id === editBtn.dataset.id);
      if (lid) openEditModal(lid);
      return;
    }
    const delBtn = e.target.closest('.team-delete');
    if (!delBtn) return;
    const lid = teamCache.find((l) => l.id === delBtn.dataset.id);
    if (!lid) return;
    if (!confirm(`Medewerker "${lid.naam || lid.email}" definitief verwijderen? Dit account kan daarna niet meer inloggen.`)) return;
    try {
      await deleteTeamLid(lid.id);
      await renderTeamTable();
      toast('Medewerker verwijderd.');
    } catch (err) {
      toast(`Verwijderen mislukt: ${err.message}`, true);
    }
  });
}

export async function renderTeam() {
  permissionDefs = await fetchPermissionDefinitions();
  allPermissionKeys = permissionDefs.map((d) => d.key);
  await renderTeamTable();
}

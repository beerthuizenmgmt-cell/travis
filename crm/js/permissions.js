/** Permissie-catalogus, sessie-state en helpers. */

export const PRESET_INVOER = [
  'invoer.portaal',
  'invoer.reserveringen_insturen',
  'invoer.klanten_bekijken',
  'invoer.klant_notities',
  'invoer.klant_taken',
];

export const CRM_PERMISSIONS = [
  'crm.dashboard',
  'crm.reserveringen_bekijken',
  'crm.reserveringen_toevoegen',
  'crm.reserveringen_bewerken',
  'crm.reserveringen_verwijderen',
  'crm.reserveringen_email',
  'crm.reserveringen_csv',
  'crm.klanten_bekijken',
  'crm.klant_bedragen',
  'crm.klanten_bewerken',
  'crm.klanten_verwijderen',
  'crm.klant_notities',
  'crm.klant_taken',
  'crm.maandoverzicht',
  'crm.advertentiekosten_bekijken',
  'crm.advertentiekosten_bewerken',
  'crm.instellingen_bekijken',
  'crm.instellingen_bewerken',
  'crm.team_beheren',
];

export const PAGE_PERMISSIONS = {
  dashboard: 'crm.dashboard',
  reserveringen: 'crm.reserveringen_bekijken',
  klanten: 'crm.klanten_bekijken',
  maandoverzicht: 'crm.maandoverzicht',
  advertentiekosten: 'crm.advertentiekosten_bekijken',
  team: 'crm.team_beheren',
  instellingen: 'crm.instellingen_bekijken',
};

export const PRESETS = {
  invoer: { label: 'Invoer (standaard)', keys: PRESET_INVOER },
  crm_basis: {
    label: 'CRM basis',
    keys: [
      'crm.dashboard',
      'crm.reserveringen_bekijken',
      'crm.reserveringen_toevoegen',
      'crm.klanten_bekijken',
      'crm.klant_bedragen',
      'crm.klant_notities',
      'crm.klant_taken',
    ],
  },
  alles: { label: 'Alles selecteren', keys: null },
};

let userProfile = null;
let userPermissions = new Set();

export function getUserProfile() {
  return userProfile;
}

export function getUserPermissions() {
  return [...userPermissions];
}

export function can(key) {
  if (userProfile?.rol === 'eigenaar') return true;
  return userPermissions.has(key);
}

export function hasCrmAccess() {
  if (userProfile?.rol === 'eigenaar') return true;
  return CRM_PERMISSIONS.some((k) => userPermissions.has(k));
}

export function hasInvoerAccess() {
  if (userProfile?.rol === 'eigenaar') return true;
  return PRESET_INVOER.some((k) => userPermissions.has(k));
}

export async function loadUserPermissions(profile, permissionKeys) {
  userProfile = profile;
  if (profile?.rol === 'eigenaar') {
    userPermissions = new Set([...PRESET_INVOER, ...CRM_PERMISSIONS]);
    return;
  }
  userPermissions = new Set(permissionKeys || []);
}

export function applySidebarPermissions() {
  document.querySelectorAll('[data-permission]').forEach((el) => {
    const perm = el.dataset.permission;
    const allowed = !perm || can(perm);
    el.style.display = allowed ? '' : 'none';
  });
}

export function firstAllowedPage() {
  for (const [page, perm] of Object.entries(PAGE_PERMISSIONS)) {
    if (can(perm)) return page;
  }
  return null;
}

export function groupDefinitions(definitions) {
  const groups = new Map();
  for (const def of definitions) {
    if (!groups.has(def.category)) groups.set(def.category, []);
    groups.get(def.category).push(def);
  }
  return groups;
}

import { PAGE_PERMISSIONS } from './permissions.js';
import { fetchOwnProfile, fetchOwnPermissions } from './data.js';

export const PORTALS = {
  CRM: '/crm/',
  INVOER: '/crm/invoer/',
  MARKETING: '/admin/',
  LOGIN: '/login/',
};

/** Bepaal welk portaal bij profiel + permissies hoort. */
export function resolvePortal(profile, permissions = []) {
  if (!profile) {
    return {
      portal: PORTALS.LOGIN,
      error: 'Geen profiel gevonden voor dit account. Vraag de beheerder om je account te koppelen.',
    };
  }

  if (profile.rol === 'klant') {
    return { portal: PORTALS.MARKETING };
  }

  if (profile.rol === 'eigenaar') {
    return { portal: PORTALS.CRM };
  }

  if (!permissions.length) {
    return {
      portal: PORTALS.LOGIN,
      error: 'Je account heeft nog geen permissies. Vraag de beheerder om rechten toe te wijzen via Team & rollen.',
    };
  }

  const crmPerms = Object.values(PAGE_PERMISSIONS);
  const hasCrm = crmPerms.some((p) => permissions.includes(p));
  if (hasCrm) {
    return { portal: PORTALS.CRM };
  }

  if (permissions.some((p) => p.startsWith('invoer.'))) {
    return { portal: PORTALS.INVOER };
  }

  return {
    portal: PORTALS.LOGIN,
    error: 'Je account heeft geen toegang tot deze omgeving.',
  };
}

export async function resolvePostLoginPortal(userId) {
  const profile = await fetchOwnProfile(userId);
  let permissions = [];
  if (profile && profile.rol !== 'eigenaar' && profile.rol !== 'klant') {
    permissions = await fetchOwnPermissions();
  }
  return resolvePortal(profile, permissions);
}

export function redirectToPortal(portal, { replace = true } = {}) {
  const currentPath = window.location.pathname.replace(/\/$/, '') || '/';
  const targetPath = portal.replace(/\/$/, '') || '/';
  if (currentPath === targetPath) return;
  if (replace) window.location.replace(portal);
  else window.location.href = portal;
}

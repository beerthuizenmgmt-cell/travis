// Teambeheer: medewerkers aanmaken, verwijderen, wachtwoord resetten (alleen eigenaar).
// Deploy: supabase functions deploy team-manage

import { createClient } from 'npm:@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

const admin = createClient(supabaseUrl, serviceRoleKey);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', Connection: 'keep-alive' },
  });
}

async function applyPermissions(userId: string, rol: string, permissions: unknown) {
  if (rol !== 'invoer' || !Array.isArray(permissions)) return;
  await admin.from('profile_permissions').delete().eq('profile_id', userId);
  if (permissions.length) {
    await admin.from('profile_permissions').insert(
      permissions.map((key: string) => ({ profile_id: userId, permission_key: key })),
    );
  }
}

async function requireEigenaar(req: Request) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return { error: json({ error: 'Niet ingelogd.' }, 401) };

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) return { error: json({ error: 'Niet ingelogd.' }, 401) };

  const { data: profile } = await admin.from('profiles').select('rol').eq('id', user.id).maybeSingle();
  if (profile?.rol !== 'eigenaar') return { error: json({ error: 'Geen toegang.' }, 403) };

  return { user, userClient };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const auth = await requireEigenaar(req);
    if ('error' in auth && auth.error) return auth.error;
    const { user, userClient } = auth;

    const body = await req.json();
    const { action } = body;

    if (action === 'create') {
      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || '');
      const naam = String(body.naam || '').trim() || null;
      const rol = body.rol === 'eigenaar' ? 'eigenaar' : 'invoer';

      if (!email) return json({ error: 'E-mailadres is verplicht.' }, 400);
      if (password.length < 8) return json({ error: 'Wachtwoord moet minimaal 8 tekens zijn.' }, 400);

      const { data: existingId } = await userClient.rpc('auth_user_id_by_email', { p_email: email });

      if (existingId) {
        const { error: profileErr } = await admin.from('profiles').upsert({
          id: existingId,
          rol,
          naam,
        }, { onConflict: 'id' });
        if (profileErr) return json({ error: profileErr.message }, 500);

        if (password) {
          await admin.auth.admin.updateUserById(existingId, { password });
        }

        await applyPermissions(existingId, rol, body.permissions);
        return json({ ok: true, user_id: existingId, linked: true });
      }

      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { naam },
      });

      if (createErr) return json({ error: createErr.message }, 400);

      const userId = created.user?.id;
      if (!userId) return json({ error: 'Account kon niet worden aangemaakt.' }, 500);

      const { error: profileErr } = await admin.from('profiles').upsert({
        id: userId,
        rol,
        naam,
      }, { onConflict: 'id' });
      if (profileErr) return json({ error: profileErr.message }, 500);

      await applyPermissions(userId, rol, body.permissions);
      return json({ ok: true, user_id: userId, linked: false });
    }

    if (action === 'delete') {
      const userId = body.user_id as string;
      if (!userId) return json({ error: 'user_id ontbreekt.' }, 400);
      if (userId === user.id) return json({ error: 'Je kunt je eigen account niet verwijderen.' }, 400);

      const { error: delErr } = await admin.auth.admin.deleteUser(userId);
      if (delErr) return json({ error: delErr.message }, 400);

      return json({ ok: true });
    }

    if (action === 'reset_password') {
      const userId = body.user_id as string;
      const password = String(body.password || '');
      if (!userId) return json({ error: 'user_id ontbreekt.' }, 400);
      if (password.length < 8) return json({ error: 'Wachtwoord moet minimaal 8 tekens zijn.' }, 400);

      const { error: updErr } = await admin.auth.admin.updateUserById(userId, { password });
      if (updErr) return json({ error: updErr.message }, 400);

      return json({ ok: true });
    }

    return json({ error: 'Onbekende actie.' }, 400);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Onverwachte fout.' }, 500);
  }
});

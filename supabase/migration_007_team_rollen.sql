-- Teambeheer: eigenaar mag alle profielen beheren + RPC voor teamoverzicht.
-- Veilig om opnieuw te draaien.

-- Eigenaar: volledig CRUD op profiles (eigen profiel blijft via bestaande policy leesbaar voor iedereen).
drop policy if exists "eigenaar_all_profiles" on profiles;
create policy "eigenaar_all_profiles" on profiles
  for all to authenticated using (is_eigenaar()) with check (is_eigenaar());

-- Teamoverzicht met e-mail (alleen voor eigenaar).
create or replace function team_leden()
returns table (
  id uuid,
  email text,
  rol text,
  naam text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public, auth
as $$
  select p.id, u.email::text, p.rol, p.naam, p.created_at
  from profiles p
  join auth.users u on u.id = p.id
  where is_eigenaar()
  order by p.created_at;
$$;

revoke all on function team_leden() from public;
grant execute on function team_leden() to authenticated;

-- Zoek auth-user op e-mail (voor koppelen bestaand account).
create or replace function auth_user_id_by_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = public, auth
as $$
  select case when is_eigenaar() then (
    select id from auth.users where lower(email) = lower(trim(p_email)) limit 1
  ) else null end;
$$;

revoke all on function auth_user_id_by_email(text) from public;
grant execute on function auth_user_id_by_email(text) to authenticated;

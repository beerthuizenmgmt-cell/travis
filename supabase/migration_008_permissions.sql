-- Granulaire permissies per medewerker.
-- Veilig om opnieuw te draaien.

-- ── Permissie-catalogus ────────────────────────────────
create table if not exists permission_definitions (
  key text primary key,
  category text not null,
  label text not null,
  description text not null default '',
  sort_order int not null default 0
);

alter table permission_definitions enable row level security;

drop policy if exists "iedereen_leest_permissions_def" on permission_definitions;
create policy "iedereen_leest_permissions_def" on permission_definitions
  for select to authenticated using (true);

insert into permission_definitions (key, category, label, description, sort_order) values
  ('invoer.portaal', 'Invoerportaal', 'Toegang invoerportaal', 'Kan inloggen op /crm/invoer/', 10),
  ('invoer.reserveringen_insturen', 'Invoerportaal', 'Reserveringen insturen', 'Nieuwe boekingen doorgeven via het invoerformulier', 11),
  ('invoer.klanten_bekijken', 'Invoerportaal', 'Klanten bekijken', 'Klantenlijst en klantkaart openen (zonder bedragen)', 12),
  ('invoer.klant_notities', 'Invoerportaal', 'Klantnotities toevoegen', 'Notities schrijven op klantkaarten', 13),
  ('invoer.klant_taken', 'Invoerportaal', 'Opvolgtaken beheren', 'Taken toevoegen en afvinken (niet verwijderen)', 14),
  ('crm.dashboard', 'CRM', 'Dashboard', 'Omzet, winst, commissies en KPI''s bekijken', 20),
  ('crm.reserveringen_bekijken', 'CRM', 'Reserveringen bekijken', 'Alle reserveringen en bedragen inzien', 21),
  ('crm.reserveringen_toevoegen', 'CRM', 'Reserveringen toevoegen', 'Handmatig nieuwe reserveringen aanmaken', 22),
  ('crm.reserveringen_bewerken', 'CRM', 'Reserveringen bewerken', 'Bestaande reserveringen wijzigen', 23),
  ('crm.reserveringen_verwijderen', 'CRM', 'Reserveringen verwijderen', 'Reserveringen definitief verwijderen', 24),
  ('crm.reserveringen_email', 'CRM', 'E-mails versturen', 'Bevestigings- en betaalmails versturen', 25),
  ('crm.reserveringen_csv', 'CRM', 'CSV importeren', 'Bulk-import uit Calendly of andere exports', 26),
  ('crm.klanten_bekijken', 'CRM', 'Klanten bekijken', 'Klantenlijst en volledige klantkaart', 30),
  ('crm.klant_bedragen', 'CRM', 'Bedragen & commissie zien', 'Prijzen, commissie en omzet op klantkaart', 31),
  ('crm.klanten_bewerken', 'CRM', 'Klanten bewerken', 'Contactgegevens van klanten wijzigen', 32),
  ('crm.klanten_verwijderen', 'CRM', 'Klanten verwijderen', 'Klanten definitief verwijderen', 33),
  ('crm.klant_notities', 'CRM', 'Klantnotities beheren', 'Notities toevoegen op klantkaarten', 34),
  ('crm.klant_taken', 'CRM', 'Opvolgtaken beheren', 'Taken toevoegen, afvinken en verwijderen', 35),
  ('crm.maandoverzicht', 'CRM', 'Maandoverzicht', 'Commissie-uitbetaling en maandcijfers', 40),
  ('crm.advertentiekosten_bekijken', 'CRM', 'Advertentiekosten bekijken', 'Overzicht advertentie-uitgaven', 41),
  ('crm.advertentiekosten_bewerken', 'CRM', 'Advertentiekosten bewerken', 'Advertentiekosten invoeren en wijzigen', 42),
  ('crm.instellingen_bekijken', 'CRM', 'Instellingen bekijken', 'Commissieregels en productiekosten inzien', 43),
  ('crm.instellingen_bewerken', 'CRM', 'Instellingen bewerken', 'Commissieregels, bonus en kosten aanpassen', 44),
  ('crm.team_beheren', 'CRM', 'Team & rollen beheren', 'Medewerkers toevoegen, verwijderen en rechten instellen', 45)
on conflict (key) do update set
  category = excluded.category,
  label = excluded.label,
  description = excluded.description,
  sort_order = excluded.sort_order;

-- ── Per-profiel permissies ─────────────────────────────
create table if not exists profile_permissions (
  profile_id uuid not null references profiles(id) on delete cascade,
  permission_key text not null references permission_definitions(key) on delete cascade,
  primary key (profile_id, permission_key)
);

alter table profile_permissions enable row level security;

drop policy if exists "eigenaar_manage_profile_permissions" on profile_permissions;
create policy "eigenaar_manage_profile_permissions" on profile_permissions
  for all to authenticated using (is_eigenaar()) with check (is_eigenaar());

drop policy if exists "eigen_permissions_lezen" on profile_permissions;
create policy "eigen_permissions_lezen" on profile_permissions
  for select to authenticated using (auth.uid() = profile_id);

-- ── Helpers ────────────────────────────────────────────
create or replace function has_permission(p_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles where id = auth.uid() and rol = 'eigenaar'
  )
  or exists (
    select 1 from profile_permissions
    where profile_id = auth.uid() and permission_key = p_key
  );
$$;

revoke all on function has_permission(text) from public;
grant execute on function has_permission(text) to authenticated;

create or replace function is_invoer()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1 from profiles where id = auth.uid() and rol = 'eigenaar'
  )
  and (
    has_permission('invoer.portaal')
    or has_permission('invoer.reserveringen_insturen')
    or has_permission('invoer.klanten_bekijken')
    or has_permission('invoer.klant_notities')
    or has_permission('invoer.klant_taken')
  );
$$;

create or replace function eigen_permissions()
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select case
    when exists (select 1 from profiles where id = auth.uid() and rol = 'eigenaar')
      then (select coalesce(array_agg(key order by sort_order), '{}') from permission_definitions)
    else coalesce(
      (select array_agg(permission_key order by permission_key)
       from profile_permissions where profile_id = auth.uid()),
      '{}'::text[]
    )
  end;
$$;

revoke all on function eigen_permissions() from public;
grant execute on function eigen_permissions() to authenticated;

create or replace function set_profile_permissions(p_profile_id uuid, p_keys text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_eigenaar() then
    raise exception 'Geen toegang';
  end if;
  if exists (select 1 from profiles where id = p_profile_id and rol = 'eigenaar') then
    return;
  end if;
  delete from profile_permissions where profile_id = p_profile_id;
  insert into profile_permissions (profile_id, permission_key)
  select p_profile_id, k
  from unnest(coalesce(p_keys, '{}'::text[])) as k
  where exists (select 1 from permission_definitions where key = k);
end;
$$;

revoke all on function set_profile_permissions(uuid, text[]) from public;
grant execute on function set_profile_permissions(uuid, text[]) to authenticated;

-- ── Backfill: bestaande invoer-medewerkers krijgen standaardset ──
insert into profile_permissions (profile_id, permission_key)
select p.id, d.key
from profiles p
cross join (
  values
    ('invoer.portaal'),
    ('invoer.reserveringen_insturen'),
    ('invoer.klanten_bekijken'),
    ('invoer.klant_notities'),
    ('invoer.klant_taken')
) as d(key)
where p.rol = 'invoer'
on conflict do nothing;

-- ── Teamoverzicht met permissies ───────────────────────
drop function if exists team_leden();

create or replace function team_leden()
returns table (
  id uuid,
  email text,
  rol text,
  naam text,
  created_at timestamptz,
  permissions text[]
)
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    p.id,
    u.email::text,
    p.rol,
    p.naam,
    p.created_at,
    coalesce(array_agg(pp.permission_key order by pp.permission_key)
      filter (where pp.permission_key is not null), '{}'::text[])
  from profiles p
  join auth.users u on u.id = p.id
  left join profile_permissions pp on pp.profile_id = p.id
  where is_eigenaar()
  group by p.id, u.email, p.rol, p.naam, p.created_at
  order by p.created_at;
$$;

-- ── RLS: clients ───────────────────────────────────────
drop policy if exists "eigenaar_all_clients" on clients;
drop policy if exists "rollen_select_clients" on clients;
drop policy if exists "perm_select_clients" on clients;
drop policy if exists "perm_insert_clients" on clients;
drop policy if exists "perm_update_clients" on clients;
drop policy if exists "perm_delete_clients" on clients;

create policy "perm_select_clients" on clients for select to authenticated
  using (has_permission('crm.klanten_bekijken') or has_permission('invoer.klanten_bekijken'));
create policy "perm_insert_clients" on clients for insert to authenticated
  with check (has_permission('crm.klanten_bewerken'));
create policy "perm_update_clients" on clients for update to authenticated
  using (has_permission('crm.klanten_bewerken')) with check (has_permission('crm.klanten_bewerken'));
create policy "perm_delete_clients" on clients for delete to authenticated
  using (has_permission('crm.klanten_verwijderen'));

-- ── RLS: client_notes ──────────────────────────────────
drop policy if exists "eigenaar_all_client_notes" on client_notes;
drop policy if exists "invoer_select_client_notes" on client_notes;
drop policy if exists "invoer_insert_client_notes" on client_notes;
drop policy if exists "perm_select_client_notes" on client_notes;
drop policy if exists "perm_insert_client_notes" on client_notes;
drop policy if exists "perm_all_client_notes" on client_notes;

create policy "perm_select_client_notes" on client_notes for select to authenticated
  using (has_permission('crm.klant_notities') or has_permission('invoer.klant_notities')
    or has_permission('crm.klanten_bekijken') or has_permission('invoer.klanten_bekijken'));
create policy "perm_insert_client_notes" on client_notes for insert to authenticated
  with check (
    (has_permission('crm.klant_notities') or has_permission('invoer.klant_notities'))
    and created_by = auth.uid()
  );
create policy "perm_update_client_notes" on client_notes for update to authenticated
  using (has_permission('crm.klant_notities')) with check (has_permission('crm.klant_notities'));
create policy "perm_delete_client_notes" on client_notes for delete to authenticated
  using (has_permission('crm.klant_notities'));

-- ── RLS: klant_taken ───────────────────────────────────
drop policy if exists "eigenaar_all_klant_taken" on klant_taken;
drop policy if exists "invoer_select_klant_taken" on klant_taken;
drop policy if exists "invoer_insert_klant_taken" on klant_taken;
drop policy if exists "invoer_update_klant_taken" on klant_taken;
drop policy if exists "perm_select_klant_taken" on klant_taken;
drop policy if exists "perm_insert_klant_taken" on klant_taken;
drop policy if exists "perm_update_klant_taken" on klant_taken;
drop policy if exists "perm_delete_klant_taken" on klant_taken;

create policy "perm_select_klant_taken" on klant_taken for select to authenticated
  using (has_permission('crm.klant_taken') or has_permission('invoer.klant_taken')
    or has_permission('crm.klanten_bekijken') or has_permission('invoer.klanten_bekijken'));
create policy "perm_insert_klant_taken" on klant_taken for insert to authenticated
  with check (
    (has_permission('crm.klant_taken') or has_permission('invoer.klant_taken'))
    and created_by = auth.uid()
  );
create policy "perm_update_klant_taken" on klant_taken for update to authenticated
  using (has_permission('crm.klant_taken') or has_permission('invoer.klant_taken'))
  with check (has_permission('crm.klant_taken') or has_permission('invoer.klant_taken'));
create policy "perm_delete_klant_taken" on klant_taken for delete to authenticated
  using (has_permission('crm.klant_taken'));

-- ── RLS: reservations ──────────────────────────────────
drop policy if exists "eigenaar_select_reservations" on reservations;
drop policy if exists "invoer_select_eigen_reservations" on reservations;
drop policy if exists "eigenaar_insert_reservations" on reservations;
drop policy if exists "invoer_insert_reservations" on reservations;
drop policy if exists "eigenaar_update_reservations" on reservations;
drop policy if exists "eigenaar_delete_reservations" on reservations;
drop policy if exists "perm_select_reservations_all" on reservations;
drop policy if exists "perm_select_reservations_own" on reservations;
drop policy if exists "perm_insert_reservations" on reservations;
drop policy if exists "perm_update_reservations" on reservations;
drop policy if exists "perm_delete_reservations" on reservations;

create policy "perm_select_reservations_all" on reservations for select to authenticated
  using (has_permission('crm.reserveringen_bekijken'));
create policy "perm_select_reservations_own" on reservations for select to authenticated
  using (has_permission('invoer.reserveringen_insturen') and auth.uid() = created_by);
create policy "perm_insert_reservations" on reservations for insert to authenticated
  with check (
    has_permission('crm.reserveringen_toevoegen')
    or (has_permission('invoer.reserveringen_insturen')
      and bron = 'nathanisya_invoer' and created_by = auth.uid())
  );
create policy "perm_update_reservations" on reservations for update to authenticated
  using (has_permission('crm.reserveringen_bewerken'))
  with check (has_permission('crm.reserveringen_bewerken'));
create policy "perm_delete_reservations" on reservations for delete to authenticated
  using (has_permission('crm.reserveringen_verwijderen'));

-- ── RLS: commissie, instellingen, advertentiekosten ────
drop policy if exists "eigenaar_all_commissie_regels" on commissie_regels;
create policy "perm_commissie_regels" on commissie_regels for all to authenticated
  using (has_permission('crm.instellingen_bewerken') or has_permission('crm.instellingen_bekijken')
    or has_permission('crm.dashboard') or has_permission('crm.maandoverzicht'))
  with check (has_permission('crm.instellingen_bewerken'));

drop policy if exists "eigenaar_all_productie_kosten_regels" on productie_kosten_regels;
create policy "perm_productie_kosten_regels" on productie_kosten_regels for all to authenticated
  using (has_permission('crm.instellingen_bewerken') or has_permission('crm.instellingen_bekijken')
    or has_permission('crm.reserveringen_toevoegen'))
  with check (has_permission('crm.instellingen_bewerken'));

drop policy if exists "eigenaar_all_instellingen" on instellingen;
create policy "perm_instellingen_select" on instellingen for select to authenticated
  using (has_permission('crm.instellingen_bekijken') or has_permission('crm.instellingen_bewerken')
    or has_permission('crm.dashboard') or has_permission('crm.maandoverzicht'));
create policy "perm_instellingen_write" on instellingen for all to authenticated
  using (has_permission('crm.instellingen_bewerken'))
  with check (has_permission('crm.instellingen_bewerken'));

drop policy if exists "eigenaar_all_advertentiekosten" on advertentiekosten;
create policy "perm_advertentiekosten_select" on advertentiekosten for select to authenticated
  using (has_permission('crm.advertentiekosten_bekijken') or has_permission('crm.advertentiekosten_bewerken')
    or has_permission('crm.dashboard'));
create policy "perm_advertentiekosten_write" on advertentiekosten for all to authenticated
  using (has_permission('crm.advertentiekosten_bewerken'))
  with check (has_permission('crm.advertentiekosten_bewerken'));

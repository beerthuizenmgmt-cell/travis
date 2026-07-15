-- Migratie: rollen (eigenaar/invoer) + Nathanisya's invoerportaal + "nieuw"-markering.
-- Draai dit ALLEEN als je supabase/schema.sql al eerder hebt uitgevoerd
-- (dus je hebt al ingelogd op /crm/ en reserveringen/instellingen werken).
-- Veilig om opnieuw te draaien — alle stappen zijn idempotent.

create extension if not exists "pgcrypto";

-- ── Profielen & rollen ─────────────────────────
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  rol text not null check (rol in ('eigenaar', 'invoer')),
  naam text,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

drop policy if exists "eigen_profiel_lezen" on profiles;
create policy "eigen_profiel_lezen" on profiles
  for select using (auth.uid() = id);

create or replace function is_eigenaar()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles where id = auth.uid() and rol = 'eigenaar'
  );
$$;

-- ── Reserveringen: nieuwe kolommen + bron 'nathanisya_invoer' ──
alter table reservations add column if not exists created_by uuid references auth.users(id);
alter table reservations add column if not exists bekeken boolean not null default false;

alter table reservations drop constraint if exists reservations_bron_check;
alter table reservations add constraint reservations_bron_check
  check (bron in ('handmatig', 'calendly_import', 'nathanisya_invoer'));

create index if not exists reservations_created_by_idx on reservations (created_by);

-- Bestaande rijen zijn door jou (de eigenaar) ingevoerd of geïmporteerd —
-- markeer ze als al bekeken zodat je "nieuw"-overzicht niet vol oude data staat.
update reservations set bekeken = true where bekeken = false;

-- ── RLS: van "elke ingelogde gebruiker" naar rol-gescheiden toegang ──
drop policy if exists "owner_all_commissie_regels" on commissie_regels;
drop policy if exists "eigenaar_all_commissie_regels" on commissie_regels;
create policy "eigenaar_all_commissie_regels" on commissie_regels
  for all using (is_eigenaar()) with check (is_eigenaar());

drop policy if exists "owner_all_productie_kosten_regels" on productie_kosten_regels;
drop policy if exists "eigenaar_all_productie_kosten_regels" on productie_kosten_regels;
create policy "eigenaar_all_productie_kosten_regels" on productie_kosten_regels
  for all using (is_eigenaar()) with check (is_eigenaar());

drop policy if exists "owner_all_instellingen" on instellingen;
drop policy if exists "eigenaar_all_instellingen" on instellingen;
create policy "eigenaar_all_instellingen" on instellingen
  for all using (is_eigenaar()) with check (is_eigenaar());

drop policy if exists "owner_all_advertentiekosten" on advertentiekosten;
drop policy if exists "eigenaar_all_advertentiekosten" on advertentiekosten;
create policy "eigenaar_all_advertentiekosten" on advertentiekosten
  for all using (is_eigenaar()) with check (is_eigenaar());

drop policy if exists "owner_all_reservations" on reservations;
drop policy if exists "eigenaar_select_reservations" on reservations;
drop policy if exists "invoer_select_eigen_reservations" on reservations;
drop policy if exists "eigenaar_insert_reservations" on reservations;
drop policy if exists "invoer_insert_reservations" on reservations;
drop policy if exists "eigenaar_update_reservations" on reservations;
drop policy if exists "eigenaar_delete_reservations" on reservations;

create policy "eigenaar_select_reservations" on reservations
  for select using (is_eigenaar());

create policy "invoer_select_eigen_reservations" on reservations
  for select using (auth.uid() = created_by);

create policy "eigenaar_insert_reservations" on reservations
  for insert with check (is_eigenaar());

create policy "invoer_insert_reservations" on reservations
  for insert with check (
    not is_eigenaar() and bron = 'nathanisya_invoer' and created_by = auth.uid()
  );

create policy "eigenaar_update_reservations" on reservations
  for update using (is_eigenaar()) with check (is_eigenaar());

create policy "eigenaar_delete_reservations" on reservations
  for delete using (is_eigenaar());

-- ── Laatste stap (handmatig, na dit script) ──────────────────
-- Maak jezelf eigenaar (vervang het e-mailadres door dat van jouw account):
--
-- insert into profiles (id, rol, naam)
-- select id, 'eigenaar', 'Jouw naam' from auth.users where email = 'jij@voorbeeld.nl'
-- on conflict (id) do update set rol = 'eigenaar';
--
-- Zodra Nathanisya haar eigen account heeft (Authentication → Users →
-- Add user), geef je haar de 'invoer'-rol met hetzelfde patroon:
--
-- insert into profiles (id, rol, naam)
-- select id, 'invoer', 'Nathanisya' from auth.users where email = 'nathanisya@voorbeeld.nl'
-- on conflict (id) do update set rol = 'invoer';

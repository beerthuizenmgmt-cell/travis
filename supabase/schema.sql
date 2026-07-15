-- Beerthuizen CRM — schema voor reserveringen, commissieregels en advertentiekosten.
-- Uitvoeren in de SQL editor van je Supabase-project (Project → SQL Editor → New query).
--
-- Heb je dit script al eerder (vóór de rollen-functionaliteit) uitgevoerd?
-- Draai dan in plaats daarvan supabase/migration_002_rollen_en_bronnen.sql —
-- dit bestand hier is bedoeld voor een gloednieuw, leeg Supabase-project.

create extension if not exists "pgcrypto";

-- ─────────────────────────────────────────────
-- Profielen: koppelt een ingelogd account aan een rol.
-- 'eigenaar' ziet en beheert alles. 'invoer' (Nathanisya) kan alleen
-- reserveringen insturen en haar eigen ingestuurde lijst terugzien.
-- ─────────────────────────────────────────────
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  rol text not null check (rol in ('eigenaar', 'invoer', 'klant')),
  naam text,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "eigen_profiel_lezen" on profiles
  for select using (auth.uid() = id);

-- Security definer zodat deze check ook werkt binnen RLS-policies van
-- andere tabellen, zonder recursie op de profiles-tabel zelf.
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

-- ─────────────────────────────────────────────
-- Commissieregels: percentage per dienst/type, instelbaar zonder code-wijziging.
-- ─────────────────────────────────────────────
create table if not exists commissie_regels (
  id uuid primary key default gen_random_uuid(),
  dienst text not null check (dienst in ('foto', 'podcast', 'influencer')),
  type text not null check (type in ('pakket', 'extra', 'jaardeal')),
  label text not null,
  percentage numeric(5,2) not null check (percentage >= 0 and percentage <= 100),
  basis text not null check (basis in ('bruto', 'netto')),
  volgorde int not null default 0,
  created_at timestamptz not null default now(),
  unique (dienst, type)
);

-- ─────────────────────────────────────────────
-- Standaard productiekosten per dienst & pakket: jij vult dit zelf in
-- (verschilt per dienst/pakket) — wordt als suggestie voorgesteld bij
-- het toevoegen van een reservering en telt automatisch mee in de winst.
-- ─────────────────────────────────────────────
create table if not exists productie_kosten_regels (
  id uuid primary key default gen_random_uuid(),
  dienst text not null check (dienst in ('foto', 'podcast', 'influencer')),
  pakket text not null,
  bedrag numeric(10,2) not null default 0,
  created_at timestamptz not null default now(),
  unique (dienst, pakket)
);

-- ─────────────────────────────────────────────
-- Instellingen: minimumgarantie + volumebonus-tiers, ook instelbaar.
-- ─────────────────────────────────────────────
create table if not exists instellingen (
  id uuid primary key default gen_random_uuid(),
  minimum_garantie numeric(10,2) not null default 2400,
  bonus_tiers jsonb not null default '[{"vanaf": 15, "bonus": 300}, {"vanaf": 25, "bonus": 500}]',
  updated_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────
-- Reserveringen: één rij per boeking (fotostudio/podcast/influencer).
-- bron 'nathanisya_invoer' = via haar eigen invoerportaal ingestuurd;
-- 'calendly_import' = CSV-import of (later) automatische Calendly-koppeling.
-- bekeken = jij hebt deze reservering al gezien in het overzicht — zo
-- vind je in één oogopslag wat er nieuw is binnengekomen.
-- ─────────────────────────────────────────────
create table if not exists reservations (
  id uuid primary key default gen_random_uuid(),
  dienst text not null check (dienst in ('foto', 'podcast', 'influencer')),
  pakket text not null,
  klantnaam text not null,
  datum date not null,
  bruto_prijs numeric(10,2) not null default 0,
  productie_kosten numeric(10,2) not null default 0, -- editing/productie, voor netto-berekening podcast & influencer
  extras jsonb not null default '[]',                -- [{"type": "Visagie", "bedrag": 150}, ...]
  status text not null default 'bevestigd' check (status in ('bevestigd', 'geannuleerd', 'concept')),
  bron text not null default 'handmatig' check (bron in ('handmatig', 'calendly_import', 'nathanisya_invoer')),
  bekeken boolean not null default false,
  created_by uuid references auth.users(id),
  notities text,
  raw_payload jsonb, -- ruwe Calendly-webhookdata, voor als de automatische koppeling iets niet goed kon herkennen
  created_at timestamptz not null default now()
);

create index if not exists reservations_datum_idx on reservations (datum);
create index if not exists reservations_dienst_idx on reservations (dienst);
create index if not exists reservations_created_by_idx on reservations (created_by);

-- ─────────────────────────────────────────────
-- Advertentiekosten: handmatige invoer per maand/bron (Meta/Google-koppeling volgt later).
-- ─────────────────────────────────────────────
create table if not exists advertentiekosten (
  id uuid primary key default gen_random_uuid(),
  periode date not null, -- eerste dag van de maand, bv. 2026-07-01
  bron text not null check (bron in ('meta', 'google', 'handmatig')),
  bedrag numeric(10,2) not null default 0,
  notities text,
  created_at timestamptz not null default now()
);

create index if not exists advertentiekosten_periode_idx on advertentiekosten (periode);

-- ─────────────────────────────────────────────
-- Row Level Security.
-- Eigenaar: volledige toegang tot alles.
-- Invoer (Nathanisya): kan alleen reserveringen insturen (bron =
-- 'nathanisya_invoer') en haar eigen ingestuurde lijst teruglezen —
-- geen toegang tot commissies, instellingen of advertentiekosten.
-- ─────────────────────────────────────────────
alter table commissie_regels enable row level security;
alter table productie_kosten_regels enable row level security;
alter table instellingen enable row level security;
alter table reservations enable row level security;
alter table advertentiekosten enable row level security;

create policy "eigenaar_all_commissie_regels" on commissie_regels
  for all using (is_eigenaar()) with check (is_eigenaar());

create policy "eigenaar_all_productie_kosten_regels" on productie_kosten_regels
  for all using (is_eigenaar()) with check (is_eigenaar());

create policy "eigenaar_all_instellingen" on instellingen
  for all using (is_eigenaar()) with check (is_eigenaar());

create policy "eigenaar_all_advertentiekosten" on advertentiekosten
  for all using (is_eigenaar()) with check (is_eigenaar());

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

-- ─────────────────────────────────────────────
-- Seed: huidige afspraken uit docs/nathanisya-compleet.html.
-- instellingen krijgt een vast id zodat dit altijd één rij blijft, ook
-- als dit script per ongeluk opnieuw wordt uitgevoerd.
-- ─────────────────────────────────────────────
insert into instellingen (id, minimum_garantie, bonus_tiers)
values ('00000000-0000-0000-0000-000000000001', 2400, '[{"vanaf": 15, "bonus": 300}, {"vanaf": 25, "bonus": 500}]')
on conflict (id) do nothing;

insert into commissie_regels (dienst, type, label, percentage, basis, volgorde) values
  ('foto', 'pakket', 'Fotostudio — pakket', 16, 'bruto', 1),
  ('foto', 'extra', 'Fotostudio — extra''s (fotograaf, visagie, styling, catering)', 30, 'bruto', 2),
  ('podcast', 'pakket', 'Podcast — pakket', 28, 'netto', 3),
  ('podcast', 'extra', 'Podcast — extra''s & shorts', 35, 'bruto', 4),
  ('podcast', 'jaardeal', 'Podcast — jaardeal (12 maanden)', 22, 'netto', 5),
  ('influencer', 'pakket', 'Influencer — alle pakketten', 32, 'netto', 6)
on conflict (dienst, type) do nothing;

-- Indicatieve productiekosten uit het document — pas gerust aan naar je eigen cijfers.
insert into productie_kosten_regels (dienst, pakket, bedrag) values
  ('podcast', 'Growth', 900),
  ('podcast', 'Authority', 1800),
  ('influencer', 'Starter', 500),
  ('influencer', 'Growth', 800),
  ('influencer', 'Authority', 1200)
on conflict (dienst, pakket) do nothing;

-- ─────────────────────────────────────────────
-- Laatste stap (handmatig, na dit script): maak jezelf eigenaar.
-- Vervang het e-mailadres hieronder door het adres waarmee jij bent
-- ingelogd (Authentication → Users) en voer apart uit.
-- ─────────────────────────────────────────────
-- insert into profiles (id, rol, naam)
-- select id, 'eigenaar', 'Jouw naam' from auth.users where email = 'jij@voorbeeld.nl'
-- on conflict (id) do update set rol = 'eigenaar';

-- Beerthuizen CRM — schema voor reserveringen, commissieregels en advertentiekosten.
-- Uitvoeren in de SQL editor van je Supabase-project (Project → SQL Editor → New query).

create extension if not exists "pgcrypto";

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
  created_at timestamptz not null default now()
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
  bron text not null default 'handmatig' check (bron in ('handmatig', 'calendly_import')),
  notities text,
  created_at timestamptz not null default now()
);

create index if not exists reservations_datum_idx on reservations (datum);
create index if not exists reservations_dienst_idx on reservations (dienst);

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
-- Row Level Security: alleen de ingelogde eigenaar mag lezen/schrijven.
-- Eén account = eigenaar, dus elke ingelogde gebruiker van dit project is de eigenaar.
-- ─────────────────────────────────────────────
alter table commissie_regels enable row level security;
alter table instellingen enable row level security;
alter table reservations enable row level security;
alter table advertentiekosten enable row level security;

create policy "owner_all_commissie_regels" on commissie_regels
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "owner_all_instellingen" on instellingen
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "owner_all_reservations" on reservations
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "owner_all_advertentiekosten" on advertentiekosten
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ─────────────────────────────────────────────
-- Seed: huidige afspraken uit docs/nathanisya-compleet.html.
-- ─────────────────────────────────────────────
insert into instellingen (minimum_garantie, bonus_tiers)
values (2400, '[{"vanaf": 15, "bonus": 300}, {"vanaf": 25, "bonus": 500}]')
on conflict do nothing;

insert into commissie_regels (dienst, type, label, percentage, basis, volgorde) values
  ('foto', 'pakket', 'Fotostudio — pakket', 16, 'bruto', 1),
  ('foto', 'extra', 'Fotostudio — extra''s (fotograaf, visagie, styling, catering)', 30, 'bruto', 2),
  ('podcast', 'pakket', 'Podcast — pakket', 28, 'netto', 3),
  ('podcast', 'extra', 'Podcast — extra''s & shorts', 35, 'bruto', 4),
  ('podcast', 'jaardeal', 'Podcast — jaardeal (12 maanden)', 22, 'netto', 5),
  ('influencer', 'pakket', 'Influencer — alle pakketten', 32, 'netto', 6)
on conflict do nothing;

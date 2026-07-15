-- Migratie 004: Klantenbeheer — contactendatabase gekoppeld aan reserveringen.
--
-- Draai dit ALLEEN nadat schema.sql (of migration_002) al is uitgevoerd,
-- dus je hebt al reserveringen, rollen (eigenaar/invoer) en RLS werkend.
-- Alle stappen zijn idempotent — veilig om opnieuw te draaien.
--
-- Wat dit toevoegt:
--   * clients        — één kaart per klant (contactgegevens + bron)
--   * client_notes   — tijdlijn van notities/opvolging per klant
--   * reservations.client_id — koppeling boeking → klant
--   * boekingen_zonder_bedragen — view zonder geldkolommen (voor Nathanisya)
--   * RLS: eigenaar beheert alles; invoer (Nathanisya) bekijkt klanten +
--     voegt notities toe, ziet GEEN bedragen en mag niets bewerken/verwijderen.

create extension if not exists "pgcrypto";

-- ─────────────────────────────────────────────
-- Rol-helper voor de 'invoer'-rol (spiegelt is_eigenaar()).
-- security definer zodat de check ook binnen RLS-policies werkt.
-- ─────────────────────────────────────────────
create or replace function is_invoer()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles where id = auth.uid() and rol = 'invoer'
  );
$$;

-- ─────────────────────────────────────────────
-- clients: contactendatabase. Eén rij per klant.
-- ─────────────────────────────────────────────
create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  naam text not null,
  email text,
  telefoon text,
  bedrijf text,
  bron text,                 -- bv. Calendly, e-mail outreach, doorverwijzing
  notitie_kort text,         -- korte vaste notitie boven aan de kaart
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists clients_naam_idx on clients (lower(naam));

-- ─────────────────────────────────────────────
-- client_notes: tijdlijn van opvolging. Nathanisya kan hier toevoegen
-- zonder de kerngegevens van de klant aan te raken.
-- ─────────────────────────────────────────────
create table if not exists client_notes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  tekst text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists client_notes_client_idx on client_notes (client_id, created_at desc);

-- ─────────────────────────────────────────────
-- Koppeling reservering → klant. klantnaam blijft bestaan voor
-- imports/backwards-compat; client_id is de nette relatie.
-- ─────────────────────────────────────────────
alter table reservations add column if not exists client_id uuid references clients(id) on delete set null;
create index if not exists reservations_client_idx on reservations (client_id);

-- ─────────────────────────────────────────────
-- Functie zonder geldkolommen: hiermee ziet Nathanisya de volledige
-- boekingshistorie van een klant, maar NOOIT bedragen of commissie.
-- security definer zodat de functie langs de RLS van reservations gaat en
-- alle boekingen van de klant teruggeeft — maar alleen de veilige kolommen.
-- (Een security definer VIEW wordt door Supabase als risico gemarkeerd;
-- een functie met expliciete grants is het aanbevolen patroon.)
-- ─────────────────────────────────────────────
create or replace function boekingen_klant(p_client_id uuid)
returns table (
  id uuid,
  client_id uuid,
  klantnaam text,
  dienst text,
  pakket text,
  datum date,
  status text,
  bron text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select id, client_id, klantnaam, dienst, pakket, datum, status, bron, created_at
  from reservations
  where client_id = p_client_id;
$$;

revoke all on function boekingen_klant(uuid) from public;
revoke all on function boekingen_klant(uuid) from anon;
grant execute on function boekingen_klant(uuid) to authenticated;

-- ─────────────────────────────────────────────
-- Row Level Security.
-- ─────────────────────────────────────────────
alter table clients enable row level security;
alter table client_notes enable row level security;

-- clients: eigenaar volledig beheer; beide rollen mogen lezen.
drop policy if exists "eigenaar_all_clients" on clients;
create policy "eigenaar_all_clients" on clients
  for all to authenticated using (is_eigenaar()) with check (is_eigenaar());

drop policy if exists "rollen_select_clients" on clients;
create policy "rollen_select_clients" on clients
  for select to authenticated using (is_eigenaar() or is_invoer());

-- client_notes: eigenaar volledig; invoer mag lezen en toevoegen.
drop policy if exists "eigenaar_all_client_notes" on client_notes;
create policy "eigenaar_all_client_notes" on client_notes
  for all to authenticated using (is_eigenaar()) with check (is_eigenaar());

drop policy if exists "invoer_select_client_notes" on client_notes;
create policy "invoer_select_client_notes" on client_notes
  for select to authenticated using (is_invoer());

drop policy if exists "invoer_insert_client_notes" on client_notes;
create policy "invoer_insert_client_notes" on client_notes
  for insert to authenticated with check (is_invoer() and created_by = auth.uid());

-- ─────────────────────────────────────────────
-- Backfill: maak klanten uit bestaande reserveringen en koppel ze.
-- Idempotent: alleen reserveringen zonder client_id worden verwerkt,
-- en bestaande klanten met dezelfde (genormaliseerde) naam worden hergebruikt.
-- ─────────────────────────────────────────────
do $$
declare
  r record;
  bestaande_id uuid;
begin
  for r in
    select distinct klantnaam
    from reservations
    where client_id is null and coalesce(trim(klantnaam), '') <> ''
  loop
    select id into bestaande_id
    from clients
    where lower(trim(naam)) = lower(trim(r.klantnaam))
    limit 1;

    if bestaande_id is null then
      insert into clients (naam) values (trim(r.klantnaam))
      returning id into bestaande_id;
    end if;

    update reservations
    set client_id = bestaande_id
    where client_id is null
      and lower(trim(klantnaam)) = lower(trim(r.klantnaam));
  end loop;
end $$;

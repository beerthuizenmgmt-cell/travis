-- Meta Ads koppeling: tokens (alleen server-side), campagnes en sync naar advertentiekosten.

alter table advertentiekosten
  add column if not exists dienst text check (dienst is null or dienst in ('foto', 'podcast', 'influencer')),
  add column if not exists meta_campaign_id text,
  add column if not exists external_ref text,
  add column if not exists synced_at timestamptz;

create unique index if not exists advertentiekosten_external_ref_idx
  on advertentiekosten (external_ref) where external_ref is not null;

create table if not exists meta_connections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users(id) on delete cascade,
  ad_account_id text not null,
  ad_account_name text,
  access_token text not null,
  token_expires_at timestamptz,
  connected_at timestamptz not null default now(),
  last_sync_at timestamptz
);

alter table meta_connections enable row level security;

create table if not exists meta_campaigns (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  campaign_id text not null,
  campaign_name text not null,
  dienst text check (dienst is null or dienst in ('foto', 'podcast', 'influencer')),
  status text,
  updated_at timestamptz not null default now(),
  unique (owner_id, campaign_id)
);

alter table meta_campaigns enable row level security;

create table if not exists meta_oauth_states (
  state text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table meta_oauth_states enable row level security;

create policy "eigenaar_meta_campaigns" on meta_campaigns
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

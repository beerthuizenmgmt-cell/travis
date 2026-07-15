-- Klant-pipeline: status, interesse, tags, socials, toewijzing.

alter table clients add column if not exists status text not null default 'lead'
  check (status in ('lead', 'contact', 'klant', 'inactief'));

alter table clients add column if not exists interesse text
  check (interesse is null or interesse in ('foto', 'podcast', 'influencer', 'meerdere', 'onbekend'));

alter table clients add column if not exists tags text;
alter table clients add column if not exists instagram text;
alter table clients add column if not exists website text;
alter table clients add column if not exists toegewezen_aan uuid references profiles(id) on delete set null;

create index if not exists clients_status_idx on clients (status);
create index if not exists clients_bron_idx on clients (bron);

-- Bestaande klanten met boekingen → status klant
update clients c
set status = 'klant'
where status = 'lead'
  and exists (select 1 from reservations r where r.client_id = c.id);

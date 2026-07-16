-- Bedrijfs- en BTW-instellingen voor aangifte-export
alter table instellingen
  add column if not exists bedrijfsnaam text default 'Beerthuizen Management',
  add column if not exists kvk_nummer text,
  add column if not exists btw_nummer text,
  add column if not exists btw_tarief numeric(5,2) not null default 21,
  add column if not exists prijzen_incl_btw boolean not null default true,
  add column if not exists kosten_incl_btw boolean not null default false,
  add column if not exists kosten_btw_herleidbaar boolean not null default true;

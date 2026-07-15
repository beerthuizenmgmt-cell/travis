-- Klantrol: marketingportaal (/admin/) voor eindklanten; staff blijft eigenaar/invoer.

alter table profiles drop constraint if exists profiles_rol_check;
alter table profiles add constraint profiles_rol_check
  check (rol in ('eigenaar', 'invoer', 'klant'));

create or replace function is_klant()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles where id = auth.uid() and rol = 'klant'
  );
$$;

revoke all on function is_klant() from public;
grant execute on function is_klant() to authenticated;

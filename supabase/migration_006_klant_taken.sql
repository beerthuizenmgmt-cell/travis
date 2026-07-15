-- Migratie 006: opvolgtaken per klant.
-- Veilig om opnieuw te draaien.

create table if not exists klant_taken (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  reservation_id uuid references reservations(id) on delete set null,
  tekst text not null,
  deadline date,
  afgerond boolean not null default false,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists klant_taken_client_idx on klant_taken (client_id, afgerond, deadline);
create index if not exists klant_taken_deadline_idx on klant_taken (deadline) where not afgerond;

alter table klant_taken enable row level security;

drop policy if exists "eigenaar_all_klant_taken" on klant_taken;
create policy "eigenaar_all_klant_taken" on klant_taken
  for all to authenticated using (is_eigenaar()) with check (is_eigenaar());

drop policy if exists "invoer_select_klant_taken" on klant_taken;
create policy "invoer_select_klant_taken" on klant_taken
  for select to authenticated using (is_invoer());

drop policy if exists "invoer_insert_klant_taken" on klant_taken;
create policy "invoer_insert_klant_taken" on klant_taken
  for insert to authenticated with check (is_invoer() and created_by = auth.uid());

drop policy if exists "invoer_update_klant_taken" on klant_taken;
create policy "invoer_update_klant_taken" on klant_taken
  for update to authenticated using (is_invoer()) with check (is_invoer());

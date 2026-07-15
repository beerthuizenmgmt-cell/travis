-- Bij verwijderen van een klant: koppel reserveringen los (klantnaam blijft op de boeking).
alter table reservations drop constraint if exists reservations_client_id_fkey;
alter table reservations
  add constraint reservations_client_id_fkey
  foreign key (client_id) references clients(id) on delete set null;

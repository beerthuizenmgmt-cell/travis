-- Migratie: kolom voor de ruwe Calendly-webhookdata.
-- Draai dit ALLEEN als je schema.sql en migration_002 al eerder hebt uitgevoerd.
-- Veilig om opnieuw te draaien.

alter table reservations add column if not exists raw_payload jsonb;

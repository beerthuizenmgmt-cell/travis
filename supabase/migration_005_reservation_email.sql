-- Migratie 005: e-mail & Stripe betaallink voor reserveringen.
-- Veilig om opnieuw te draaien.

alter table reservations add column if not exists klant_email text;
alter table reservations add column if not exists betaling_link text;
alter table reservations add column if not exists stripe_checkout_id text;
alter table reservations add column if not exists email_verzonden_op timestamptz;

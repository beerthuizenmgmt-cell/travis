# Toettie Crew Entertainment

Letterlijke homepage-clone van [poofevents.nl](https://poofevents.nl/) (Elementor HTML/CSS/JS), met Toettie-logo en WhatsApp (`+31 6 55585299`).

## Run

```bash
npm run dev
```

- Homepage: http://localhost:5173/
- Admin: http://localhost:5173/admin/

De pagina laadt de originele Poof-styles/scripts; lokale polish zit in `css/toettie-polish.css` en `js/toettie-polish.js`.


## Admin Dashboard

Dutch-language admin panel with:

- Dashboard overview (KPIs, revenue chart, channel breakdown)
- Campagnes, Contacten, Flows, Analytics, Integraties, Instellingen
- Responsive sidebar navigation
- Canvas charts and data tables

Let op: dit paneel is een visuele demo met verzonnen voorbeelddata (fictieve klanten, "Travis Store"), niet gekoppeld aan een database. Voor echte bedrijfsdata, zie de CRM hieronder.

## CRM Dashboard (Beerthuizen Studios × Nathanisya)

Een echt werkend dashboard op `/crm/` om reserveringen, commissies en advertentiekosten bij te houden — met een Postgres-database via [Supabase](https://supabase.com) (gratis tier volstaat).

### Eenmalige setup

1. **Supabase-project aanmaken** — ga naar [supabase.com](https://supabase.com), maak een gratis project aan.
2. **Schema uitvoeren** — open in het Supabase-dashboard *SQL Editor → New query*:
   - **Nieuw project, nog nooit eerder uitgevoerd?** Plak de inhoud van [`supabase/schema.sql`](supabase/schema.sql) en voer uit.
   - **Had je dit CRM al draaien vóór de rollen-functionaliteit?** Voer in plaats daarvan [`supabase/migration_002_rollen_en_bronnen.sql`](supabase/migration_002_rollen_en_bronnen.sql) uit, gevolgd door [`supabase/migration_003_calendly_webhook.sql`](supabase/migration_003_calendly_webhook.sql). Beide zijn veilig om opnieuw te draaien.
   - **Klantenbeheer toevoegen (altijd nodig, ook bij bestaande projecten):** voer daarna [`supabase/migration_004_klanten.sql`](supabase/migration_004_klanten.sql) uit. Dit maakt de klantendatabase aan, koppelt bestaande reserveringen automatisch aan klanten (backfill) en zet de rechten goed. Veilig om opnieuw te draaien.
   - **E-mail & Stripe op reserveringen:** [`supabase/migration_005_reservation_email.sql`](supabase/migration_005_reservation_email.sql) — voegt klant-e-mail, betaallink en e-mailstatus toe.
   - **Opvolgtaken per klant:** [`supabase/migration_006_klant_taken.sql`](supabase/migration_006_klant_taken.sql) — taken met deadline, afvinken, RLS voor eigenaar en invoer.
   - **Team & rollen beheren:** [`supabase/migration_007_team_rollen.sql`](supabase/migration_007_team_rollen.sql) — eigenaar kan medewerkers en rollen beheren via `/crm/#team`.
   - **Granulaire permissies:** [`supabase/migration_008_permissions.sql`](supabase/migration_008_permissions.sql) — per medewerker aanvinkbare rechten (invoerportaal + CRM).
3. **Eigenaar-account aanmaken** — in het Supabase-dashboard: *Authentication → Users → Add user*, vul je eigen e-mail en wachtwoord in.
4. **Jezelf de eigenaar-rol geven** — in *SQL Editor*, met je eigen e-mailadres:
   ```sql
   insert into profiles (id, rol, naam)
   select id, 'eigenaar', 'Jouw naam' from auth.users where email = 'jij@voorbeeld.nl'
   on conflict (id) do update set rol = 'eigenaar';
   ```
   Zonder deze stap kun je inloggen maar zie je geen data — de eigenaar-rol is wat je volledige toegang geeft.
5. **Env-variabelen instellen** — kopieer `.env.example` naar `.env` en vul de `Project URL` en `anon public key` in (te vinden in *Project Settings → API*).

```bash
cp .env.example .env
# vul VITE_SUPABASE_URL en VITE_SUPABASE_ANON_KEY in
npm install
npm run dev
```

- **CRM (jouw dashboard):** http://localhost:5173/crm/
- **Invoerportaal (voor Nathanisya):** http://localhost:5173/crm/invoer/

### Nathanisya's invoerportaal — één overzicht, geen dubbel werk

In plaats van dat Nathanisya boekingen naar jou doorstuurt om zelf over te typen, heeft ze een eigen, sterk vereenvoudigde pagina op `/crm/invoer/`: een formulier (klant, datum, dienst, pakket, prijs, extra's) en een lijstje van wat ze zelf heeft ingestuurd — geen bedragen van anderen, geen commissie- of winstcijfers. Zodra ze op "Insturen" klikt, staat de reservering direct in jouw `/crm/` overzicht, gemarkeerd als **"nieuw"** (blauwe balk + vinkje om te bevestigen dat je hem gezien hebt) totdat jij hem afvinkt. Dat geldt ook voor CSV-imports en (straks) automatische Calendly-boekingen — alles komt in dezelfde ene tabel samen, met een kolom die laat zien waar elke reservering vandaan komt (Zelf / Calendly / Nathanisya).

Sinds de klantenmodule heeft haar portaal ook een tweede tab, **Klanten**: ze kan alle klanten opzoeken, hun contactgegevens en boekingshistorie bekijken, **opvolgtaken** toevoegen en afvinken, en notities/opvolging schrijven. Wat ze bewust **niet** ziet of kan: bedragen en commissies (de historie loopt via een aparte database-view zónder geldkolommen), taken verwijderen, en klantgegevens bewerken of verwijderen. Ook dat is op databaseniveau (Row Level Security) afgedwongen, niet alleen in de UI.

Om haar toegang te geven:
1. Ga in het CRM naar **Team & rollen** en klik *Medewerker toevoegen* (naam, e-mail, tijdelijk wachtwoord, rol **Invoer**), **of** handmatig via Supabase:
   - *Authentication → Users → Add user* — maak een account met háár e-mailadres.
   - Geef haar de `invoer`-rol via *SQL Editor*:
   ```sql
   insert into profiles (id, rol, naam)
   select id, 'invoer', 'Nathanisya' from auth.users where email = 'nathanisya@voorbeeld.nl'
   on conflict (id) do update set rol = 'invoer';
   ```
2. Stuur haar de link naar `/crm/invoer/` (na deployen bijvoorbeeld `https://jouw-domein.nl/crm/invoer/`) plus haar inloggegevens.

Ze kan met dit account niets anders zien of aanpassen dan haar eigen invoerformulier en lijst — dat is afgedwongen op databaseniveau (Row Level Security), niet alleen in de UI.

### Wat werkt nu, wat komt later

- **Reserveringen**: drie manieren om binnen te komen, allemaal in één overzicht — handmatig door jou, ingestuurd door Nathanisya via haar portaal, of in bulk geïmporteerd via CSV (bv. een export uit Calendly; de importwizard laat je zelf kolommen koppelen omdat elk exportformaat anders is). Bij het toevoegen kies je de klant via een zoekveld (of typ een nieuwe naam — die wordt automatisch als klant aangemaakt en gekoppeld).
- **Klanten**: je contactendatabase. Eén kaart per klant (naam, e-mail, telefoon, bedrijf, bron) met volledige boekingshistorie, commissie per boeking, **opvolgtaken** (met deadline, afvinken, verwijderen) en een tijdlijn van notities/opvolging. Klik op een klantnaam in het reserveringenoverzicht om direct de kaart te openen. Bestaande reserveringen zijn bij de migratie automatisch aan klanten gekoppeld.
- **Automatische Calendly-koppeling**: de code staat klaar in [`supabase/functions/calendly-webhook/`](supabase/functions/calendly-webhook/index.ts), maar is **nog niet getest** omdat daar nu nog geen Calendly API-toegang voor is. Calendly heeft geen eigen velden voor dienst/pakket/prijs — die herkent de functie via custom vragen op je Calendly-boekingspagina (of je vult ze zelf aan als een boeking als "concept" binnenkomt). Zodra je API-toegang hebt: zie de instructies bovenaan dat bestand.
- **Advertentiekosten**: nu handmatige invoer per maand/bron. Live koppeling met Meta Ads en Google Ads volgt zodra daar API-toegang voor is geregeld — de knoppen op de pagina staan al klaar.
- **Commissiepercentages, minimumgarantie, volumebonus én standaard productiekosten per dienst/pakket**: aanpasbaar via *Instellingen*, zonder dat daar development voor nodig is. Productiekosten verschillen per pakket (bv. podcast Growth vs. Authority) en worden bij het toevoegen van een reservering automatisch voorgesteld — je kunt ze per boeking altijd nog overschrijven.
- **Maandoverzicht**: precies wat je per pakket/dienst aan Nathanisya moet betalen, inclusief winst% na aftrek van productiekosten en advertentiekosten.
- **E-mail bij reserveringen**: optioneel na opslaan — bij status **Bevestigd** een bevestigingsmail, bij **Concept** een mail met automatische **Stripe betaallink**. Ook later opnieuw versturen via het ✉-icoon in het overzicht.
- **Stripe webhook**: na betaling zet de webhook de reservering automatisch op **Bevestigd** en stuurt een bevestigingsmail (zelfde Resend-setup als hieronder).
- **Opvolgtaken**: per klantkaart taken met optionele deadline; op het dashboard zie je openstaande taken (deze week + achterstallig). Nathanisya kan taken toevoegen en afvinken in haar portaal.
- **Team & rollen**: via *Team & rollen* medewerkers toevoegen en **per persoon permissies aanvinken** — precies zichtbaar wat ze mogen (invoerportaal én CRM). Sjablonen: *Invoer*, *CRM basis*, of *Alles*. Eigenaar heeft automatisch alle rechten.

### E-mail & Stripe instellen

De edge functions `reservation-email`, `stripe-webhook` en `team-manage` zijn gedeployed. Zet deze secrets in Supabase (*Project Settings → Edge Functions → Secrets*):

| Secret | Waarde |
|--------|--------|
| `STRIPE_SECRET_KEY` | `sk_test_...` of `sk_live_...` uit je [Stripe Dashboard](https://dashboard.stripe.com/apikeys) |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` — na het aanmaken van de webhook in Stripe (zie hieronder) |
| `RESEND_API_KEY` | `re_...` uit [Resend](https://resend.com) (gratis tier volstaat voor testen) |
| `FROM_EMAIL` | bv. `Beerthuizen Studios <reserveringen@jouwdomein.nl>` (domein verifiëren in Resend) |
| `SITE_URL` | bv. `https://jouwdomein.nl` (voor Stripe redirect na betaling) |

**Stripe webhook aanmaken** (Stripe Dashboard → Developers → Webhooks → Add endpoint):

- **URL:** `https://<jouw-project-ref>.supabase.co/functions/v1/stripe-webhook`
- **Event:** `checkout.session.completed`
- Kopieer het **Signing secret** naar `STRIPE_WEBHOOK_SECRET` in Supabase.

Zonder deze secrets wordt de reservering wél opgeslagen, maar faalt het versturen van mail met een duidelijke foutmelding. Zonder webhook blijft een reservering na Stripe-betaling op **Concept** staan totdat je handmatig op **Bevestigd** zet.

### Deployen

De CRM is een statische Vite-build die rechtstreeks met Supabase praat — geen eigen server nodig. Bouw met `npm run build` en host de `dist/`-map op bijvoorbeeld [Vercel](https://vercel.com) of [Netlify](https://netlify.com) (koppel je eigen account aan deze GitHub-repo en zet daar dezelfde env-variabelen). De Calendly-webhookfunctie (optioneel, pas nodig zodra je API-toegang hebt) deploy je apart met de Supabase CLI: `supabase functions deploy calendly-webhook`.

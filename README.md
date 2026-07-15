# Klaviyo Homepage Replica

A static 1:1 recreation of the [Klaviyo](https://www.klaviyo.com) marketing homepage.

## Structure

```
travis/
├── index.html          # Main homepage
├── css/
│   └── styles.css      # Full styling
├── js/
│   └── main.js         # Interactions (tabs, carousel, cookies)
├── assets/
│   └── favicon.svg     # Site favicon
└── README.md
```

## Features

- Sticky header with navigation
- Hero section with customer profile card and ribbon graphic
- Social proof brand banner
- AI Agents section (Composer & Customer Agent)
- Platform tabs (Marketing, AI, Service, Analytics, CDP)
- Stats, case studies carousel, integrations grid
- FAQ accordion, footer, cookie consent banner
- Fully responsive design

## Run locally

```bash
npm run dev
```

- **Homepage:** http://localhost:5173/
- **Admin dashboard:** http://localhost:5173/admin/

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
2. **Schema uitvoeren** — open in het Supabase-dashboard *SQL Editor → New query*, plak de inhoud van [`supabase/schema.sql`](supabase/schema.sql) en voer uit. Dit maakt de tabellen aan en zet de huidige commissieafspraken (16%/30% foto, 28%/35%/22% podcast, 32% influencer, minimum €2.400, volumebonus) als startwaarden klaar.
3. **Eigenaar-account aanmaken** — in het Supabase-dashboard: *Authentication → Users → Add user*, vul je eigen e-mail en wachtwoord in. Dit is het enige account waarmee je inlogt op `/crm/`.
4. **Env-variabelen instellen** — kopieer `.env.example` naar `.env` en vul de `Project URL` en `anon public key` in (te vinden in *Project Settings → API*).

```bash
cp .env.example .env
# vul VITE_SUPABASE_URL en VITE_SUPABASE_ANON_KEY in
npm install
npm run dev
```

- **CRM:** http://localhost:5173/crm/

### Wat werkt nu, wat komt later

- **Reserveringen**: handmatig invoeren, of in bulk importeren via CSV (bv. een export uit Calendly) — de importwizard laat je zelf kolommen koppelen omdat elk exportformaat anders is.
- **Advertentiekosten**: nu handmatige invoer per maand/bron. Live koppeling met Meta Ads en Google Ads volgt zodra daar API-toegang voor is geregeld — de knoppen op de pagina staan al klaar.
- **Commissiepercentages, minimumgarantie en volumebonus**: aanpasbaar via *Instellingen*, zonder dat daar development voor nodig is.
- **Maandoverzicht**: precies wat je per pakket/dienst aan Nathanisya moet betalen, inclusief winst% na aftrek van productiekosten en advertentiekosten.

### Deployen

De CRM is een statische Vite-build die rechtstreeks met Supabase praat — geen eigen server nodig. Bouw met `npm run build` en host de `dist/`-map op bijvoorbeeld [Vercel](https://vercel.com) of [Netlify](https://netlify.com) (koppel je eigen account aan deze GitHub-repo en zet daar dezelfde env-variabelen).

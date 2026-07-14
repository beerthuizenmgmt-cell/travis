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

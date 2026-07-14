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

Open `index.html` in a browser, or serve with any static server:

```bash
python3 -m http.server 8080
```

Then visit http://localhost:8080

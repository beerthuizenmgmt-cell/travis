// Calendly-webhook → automatische reservering in het CRM.
//
// LET OP — dit is voorbereid maar nog NIET getest tegen een echte Calendly-
// account, omdat daar nu nog geen API-toegang voor is. Calendly heeft geen
// native velden voor "dienst", "pakket" of "bruto prijs" — die moet je zelf
// als custom vragen op je Calendly-boekingspagina's zetten. Deze functie
// probeert de antwoorden te herkennen op basis van de vraagtekst, maar
// verifieer dit bij de eerste echte boeking en pas zo nodig `zoekAntwoord`
// hieronder aan met de exacte vraagteksten die jij gebruikt.
//
// Setup (pas als je Calendly API-toegang hebt):
//   1. supabase functions deploy calendly-webhook
//   2. Zet de secrets: supabase secrets set CALENDLY_SIGNING_KEY=... (optioneel, voor verificatie)
//   3. Maak in Calendly een webhook subscription aan die naar de functie-URL post
//      (https://<project-ref>.functions.supabase.co/calendly-webhook), event: invitee.created
//   4. Boek een testafspraak en controleer in /crm/ of de reservering goed binnenkomt
//      (staat als "concept" + bekeken=false als niet alles herkend kon worden)

import { createClient } from 'npm:@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const signingKey = Deno.env.get('CALENDLY_SIGNING_KEY'); // optioneel

const supabase = createClient(supabaseUrl, serviceRoleKey);

const dienstKeywords: Record<string, string[]> = {
  foto: ['foto', 'fotostudio', 'shoot'],
  podcast: ['podcast'],
  influencer: ['influencer'],
};

const pakketKeywords = ['starter', 'growth', 'authority'];

function zoekAntwoord(vragen: { question: string; answer: string }[], zoekwoorden: string[]): string | null {
  const match = vragen.find((qa) => zoekwoorden.some((w) => qa.question.toLowerCase().includes(w)));
  return match ? match.answer.trim() : null;
}

function raadDienst(eventTypeName: string, vragen: { question: string; answer: string }[]): string {
  const uitVraag = zoekAntwoord(vragen, ['dienst']);
  if (uitVraag) {
    for (const [dienst, keywords] of Object.entries(dienstKeywords)) {
      if (keywords.some((k) => uitVraag.toLowerCase().includes(k))) return dienst;
    }
  }
  const naam = (eventTypeName || '').toLowerCase();
  for (const [dienst, keywords] of Object.entries(dienstKeywords)) {
    if (keywords.some((k) => naam.includes(k))) return dienst;
  }
  return 'foto';
}

function raadPakket(eventTypeName: string, vragen: { question: string; answer: string }[]): string {
  const uitVraag = zoekAntwoord(vragen, ['pakket', 'package']);
  if (uitVraag) return uitVraag;
  const naam = eventTypeName || '';
  const match = pakketKeywords.find((p) => naam.toLowerCase().includes(p));
  return match ? match[0].toUpperCase() + match.slice(1) : naam || 'Onbekend';
}

async function verifieerHandtekening(req: Request, body: string): Promise<boolean> {
  if (!signingKey) return true; // geen sleutel ingesteld -> verificatie overgeslagen
  const header = req.headers.get('calendly-webhook-signature');
  if (!header) return false;
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=')) as [string, string][]);
  if (!parts.t || !parts.v1) return false;
  const signedPayload = `${parts.t}.${body}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(signingKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sigBuffer = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedPayload));
  const hex = Array.from(new Uint8Array(sigBuffer)).map((b) => b.toString(16).padStart(2, '0')).join('');
  return hex === parts.v1;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const rawBody = await req.text();

  const geldig = await verifieerHandtekening(req, rawBody);
  if (!geldig) {
    return new Response('Ongeldige handtekening', { status: 401 });
  }

  let json: any;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return new Response('Ongeldige JSON', { status: 400 });
  }

  if (json.event !== 'invitee.created') {
    // Andere events (bv. invitee.canceled) negeren we voor nu.
    return new Response('OK (genegeerd)', { status: 200 });
  }

  const payload = json.payload || {};
  const vragen: { question: string; answer: string }[] = payload.questions_and_answers || [];
  const eventTypeName: string = payload.event_type?.name || '';
  const startTime: string | undefined =
    payload.scheduled_event?.start_time || payload.calendar_event?.start_time || payload.event?.start_time;

  const dienst = raadDienst(eventTypeName, vragen);
  const pakket = raadPakket(eventTypeName, vragen);
  const bruto_prijs = Number(zoekAntwoord(vragen, ['prijs', 'bedrag', 'kosten']) || 0);
  const konAllesHerkennen = Boolean(startTime) && bruto_prijs > 0;

  const { error } = await supabase.from('reservations').insert({
    klantnaam: payload.name || payload.email || 'Onbekend (Calendly)',
    datum: startTime ? startTime.slice(0, 10) : new Date().toISOString().slice(0, 10),
    dienst,
    pakket,
    bruto_prijs,
    productie_kosten: 0,
    extras: [],
    status: konAllesHerkennen ? 'bevestigd' : 'concept',
    bron: 'calendly_import',
    bekeken: false,
    raw_payload: json,
    notities: konAllesHerkennen
      ? null
      : 'Automatisch aangemaakt vanuit Calendly, maar niet alle velden konden herkend worden — controleer en vul aan.',
  });

  if (error) {
    console.error('Kon reservering niet opslaan:', error);
    return new Response('Opslaan mislukt', { status: 500 });
  }

  return new Response('OK', { status: 200 });
});

// Stuur bevestigingsmail (status bevestigd) of betaalmail met Stripe-link (status concept).
//
// Secrets instellen in Supabase (Project Settings → Edge Functions → Secrets):
//   STRIPE_SECRET_KEY   — sk_test_... of sk_live_...
//   RESEND_API_KEY      — re_...
//   FROM_EMAIL          — bv. "Beerthuizen Studios <reserveringen@jouwdomein.nl>"
//   SITE_URL            — bv. https://beerthuizen.nl (voor Stripe redirect URLs)
//
// Deploy: supabase functions deploy reservation-email

import { createClient } from 'npm:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@17';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
const resendKey = Deno.env.get('RESEND_API_KEY');
const fromEmail = Deno.env.get('FROM_EMAIL') || 'Beerthuizen Studios <onboarding@resend.dev>';
const siteUrl = Deno.env.get('SITE_URL') || 'http://localhost:5173';

const admin = createClient(supabaseUrl, serviceRoleKey);

const dienstLabels: Record<string, string> = {
  foto: 'Fotostudio',
  podcast: 'Podcaststudio',
  influencer: 'Influencer',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', Connection: 'keep-alive' },
  });
}

function formatEuro(cents: number) {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(cents / 100);
}

function formatDatum(datum: string) {
  return new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(datum));
}

function berekenTotaalCent(res: {
  bruto_prijs: number;
  extras: { type?: string; bedrag?: number }[];
}) {
  const extras = Array.isArray(res.extras) ? res.extras : [];
  const extraTotaal = extras.reduce((s, e) => s + Number(e.bedrag || 0), 0);
  return Math.round((Number(res.bruto_prijs) + extraTotaal) * 100);
}

function bevestigingHtml(opts: {
  naam: string;
  dienst: string;
  pakket: string;
  datum: string;
  totaal: string;
  extras: { type?: string; bedrag?: number }[];
}) {
  const extraRows = opts.extras.length
    ? `<ul>${opts.extras.map((e) => `<li>${e.type}: €${Number(e.bedrag).toFixed(2)}</li>`).join('')}</ul>`
    : '';
  return `<!DOCTYPE html><html lang="nl"><body style="font-family:system-ui,sans-serif;color:#0a0a0f;max-width:560px;margin:0 auto;padding:24px">
    <img src="https://ncrwbiqilnoteenqblgb.supabase.co/storage/v1/object/public/assets/beerthuizen-logo.png" alt="Beerthuizen Studios" style="height:28px;margin-bottom:20px" onerror="this.style.display='none'">
    <h1 style="color:#0048ff;font-size:22px">Je reservering is bevestigd</h1>
    <p>Hoi ${opts.naam},</p>
    <p>Leuk nieuws — je boeking bij <strong>Productiehuis Beerthuizen Studios</strong> staat vast.</p>
    <table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:15px">
      <tr><td style="padding:8px 0;color:#6b6b7b">Dienst</td><td><strong>${opts.dienst}</strong></td></tr>
      <tr><td style="padding:8px 0;color:#6b6b7b">Pakket</td><td><strong>${opts.pakket}</strong></td></tr>
      <tr><td style="padding:8px 0;color:#6b6b7b">Datum</td><td><strong>${opts.datum}</strong></td></tr>
      <tr><td style="padding:8px 0;color:#6b6b7b">Totaal</td><td><strong>${opts.totaal}</strong></td></tr>
    </table>
    ${extraRows ? `<p><strong>Extra's:</strong></p>${extraRows}` : ''}
    <p>Heb je vragen? Antwoord op deze mail — wij helpen je graag verder.</p>
    <p style="color:#6b6b7b;font-size:13px;margin-top:32px">Productiehuis Beerthuizen Studios</p>
  </body></html>`;
}

function betaalHtml(opts: {
  naam: string;
  dienst: string;
  pakket: string;
  datum: string;
  totaal: string;
  betaalLink: string;
}) {
  return `<!DOCTYPE html><html lang="nl"><body style="font-family:system-ui,sans-serif;color:#0a0a0f;max-width:560px;margin:0 auto;padding:24px">
    <h1 style="color:#0048ff;font-size:22px">Rond je reservering af</h1>
    <p>Hoi ${opts.naam},</p>
    <p>Bedankt voor je interesse in <strong>Productiehuis Beerthuizen Studios</strong>. Je reservering staat klaar — betaal via onderstaande link om je plek definitief te bevestigen.</p>
    <table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:15px">
      <tr><td style="padding:8px 0;color:#6b6b7b">Dienst</td><td><strong>${opts.dienst}</strong></td></tr>
      <tr><td style="padding:8px 0;color:#6b6b7b">Pakket</td><td><strong>${opts.pakket}</strong></td></tr>
      <tr><td style="padding:8px 0;color:#6b6b7b">Datum</td><td><strong>${opts.datum}</strong></td></tr>
      <tr><td style="padding:8px 0;color:#6b6b7b">Te betalen</td><td><strong>${opts.totaal}</strong></td></tr>
    </table>
    <p style="text-align:center;margin:28px 0">
      <a href="${opts.betaalLink}" style="background:#0048ff;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:700;display:inline-block">Nu betalen</a>
    </p>
    <p style="color:#6b6b7b;font-size:13px">Deze link is persoonlijk voor jou. Heb je vragen? Antwoord gerust op deze mail.</p>
    <p style="color:#6b6b7b;font-size:13px;margin-top:32px">Productiehuis Beerthuizen Studios</p>
  </body></html>`;
}

async function sendEmail(to: string, subject: string, html: string) {
  if (!resendKey) throw new Error('RESEND_API_KEY is niet geconfigureerd in Supabase secrets.');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: fromEmail, to: [to], subject, html }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.message || `E-mail versturen mislukt (${res.status})`);
  return body;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Niet ingelogd.' }, 401);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) return json({ error: 'Niet ingelogd.' }, 401);

    const { data: profile } = await admin.from('profiles').select('rol').eq('id', user.id).maybeSingle();
    if (profile?.rol !== 'eigenaar') return json({ error: 'Geen toegang.' }, 403);

    const { reservation_id: reservationId } = await req.json();
    if (!reservationId) return json({ error: 'reservation_id ontbreekt.' }, 400);

    const { data: res, error: resErr } = await admin.from('reservations').select('*').eq('id', reservationId).single();
    if (resErr || !res) return json({ error: 'Reservering niet gevonden.' }, 404);

    if (res.status === 'geannuleerd') {
      return json({ error: 'Geannuleerde reserveringen kunnen geen mail krijgen.' }, 400);
    }

    let email = res.klant_email?.trim();
    if (!email && res.client_id) {
      const { data: client } = await admin.from('clients').select('email, naam').eq('id', res.client_id).maybeSingle();
      email = client?.email?.trim() || '';
    }
    if (!email) return json({ error: 'Geen e-mailadres voor deze klant. Vul het in bij de reservering of op de klantenkaart.' }, 400);

    const extras = Array.isArray(res.extras) ? res.extras : [];
    const totaalCent = berekenTotaalCent(res);
    if (totaalCent <= 0) return json({ error: 'Bedrag moet groter zijn dan €0 om een mail te sturen.' }, 400);

    const dienst = dienstLabels[res.dienst] || res.dienst;
    const datum = formatDatum(res.datum);
    const totaal = formatEuro(totaalCent);
    const naam = res.klantnaam;

    let betalingLink = res.betaling_link;
    let stripeCheckoutId = res.stripe_checkout_id;

    if (res.status === 'concept') {
      if (!betalingLink) {
        if (!stripeKey) return json({ error: 'STRIPE_SECRET_KEY is niet geconfigureerd in Supabase secrets.' }, 500);

        const stripe = new Stripe(stripeKey, { apiVersion: '2024-11-20.acacia' });
        const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
          {
            price_data: {
              currency: 'eur',
              product_data: { name: `${dienst} — ${res.pakket}` },
              unit_amount: Math.round(Number(res.bruto_prijs) * 100),
            },
            quantity: 1,
          },
        ];
        for (const extra of extras) {
          if (!extra.type || !extra.bedrag) continue;
          lineItems.push({
            price_data: {
              currency: 'eur',
              product_data: { name: `Extra: ${extra.type}` },
              unit_amount: Math.round(Number(extra.bedrag) * 100),
            },
            quantity: 1,
          });
        }

        const session = await stripe.checkout.sessions.create({
          mode: 'payment',
          customer_email: email,
          line_items: lineItems,
          success_url: `${siteUrl}/crm/?betaling=succes&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${siteUrl}/crm/?betaling=geannuleerd`,
          metadata: { reservation_id: res.id },
        });

        betalingLink = session.url;
        stripeCheckoutId = session.id;
      }
    }

    const subject = res.status === 'concept'
      ? `Betaal je reservering — ${dienst} · Beerthuizen Studios`
      : `Bevestiging reservering — ${dienst} · Beerthuizen Studios`;

    const html = res.status === 'concept'
      ? betaalHtml({ naam, dienst, pakket: res.pakket, datum, totaal, betaalLink: betalingLink! })
      : bevestigingHtml({ naam, dienst, pakket: res.pakket, datum, totaal, extras });

    await sendEmail(email, subject, html);

    await admin.from('reservations').update({
      klant_email: email,
      betaling_link: betalingLink,
      stripe_checkout_id: stripeCheckoutId,
      email_verzonden_op: new Date().toISOString(),
    }).eq('id', reservationId);

    return json({
      ok: true,
      type: res.status === 'concept' ? 'betaal' : 'bevestiging',
      email,
      betaling_link: betalingLink || null,
    });
  } catch (err) {
    console.error(err);
    return json({ error: err instanceof Error ? err.message : 'Onbekende fout.' }, 500);
  }
});

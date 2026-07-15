// Stripe webhook: na succesvolle betaling → reservering op bevestigd + bevestigingsmail.
//
// Setup:
//   1. supabase functions deploy stripe-webhook --no-verify-jwt
//   2. Secrets: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, RESEND_API_KEY, FROM_EMAIL
//   3. Stripe Dashboard → Developers → Webhooks → Add endpoint
//      URL: https://<project-ref>.supabase.co/functions/v1/stripe-webhook
//      Event: checkout.session.completed
//      Kopieer signing secret naar STRIPE_WEBHOOK_SECRET

import { createClient } from 'npm:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@17';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')!;
const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;
const resendKey = Deno.env.get('RESEND_API_KEY');
const fromEmail = Deno.env.get('FROM_EMAIL') || 'Beerthuizen Studios <onboarding@resend.dev>';

const admin = createClient(supabaseUrl, serviceRoleKey);
const stripe = new Stripe(stripeKey, { apiVersion: '2024-11-20.acacia' });

const dienstLabels: Record<string, string> = {
  foto: 'Fotostudio',
  podcast: 'Podcaststudio',
  influencer: 'Influencer',
};

function formatEuro(amount: number) {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(amount);
}

function formatDatum(datum: string) {
  return new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(datum));
}

function bevestigingHtml(opts: {
  naam: string; dienst: string; pakket: string; datum: string; totaal: string;
  extras: { type?: string; bedrag?: number }[];
}) {
  const extraRows = opts.extras.length
    ? `<ul>${opts.extras.map((e) => `<li>${e.type}: €${Number(e.bedrag).toFixed(2)}</li>`).join('')}</ul>`
    : '';
  return `<!DOCTYPE html><html lang="nl"><body style="font-family:system-ui,sans-serif;color:#0a0a0f;max-width:560px;margin:0 auto;padding:24px">
    <h1 style="color:#0048ff;font-size:22px">Betaling ontvangen — je reservering is bevestigd</h1>
    <p>Hoi ${opts.naam},</p>
    <p>Bedankt voor je betaling! Je boeking bij <strong>Productiehuis Beerthuizen Studios</strong> staat definitief vast.</p>
    <table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:15px">
      <tr><td style="padding:8px 0;color:#6b6b7b">Dienst</td><td><strong>${opts.dienst}</strong></td></tr>
      <tr><td style="padding:8px 0;color:#6b6b7b">Pakket</td><td><strong>${opts.pakket}</strong></td></tr>
      <tr><td style="padding:8px 0;color:#6b6b7b">Datum</td><td><strong>${opts.datum}</strong></td></tr>
      <tr><td style="padding:8px 0;color:#6b6b7b">Betaald</td><td><strong>${opts.totaal}</strong></td></tr>
    </table>
    ${extraRows ? `<p><strong>Extra's:</strong></p>${extraRows}` : ''}
    <p>Heb je vragen? Antwoord op deze mail — wij helpen je graag verder.</p>
    <p style="color:#6b6b7b;font-size:13px;margin-top:32px">Productiehuis Beerthuizen Studios</p>
  </body></html>`;
}

async function sendEmail(to: string, subject: string, html: string) {
  if (!resendKey) return;
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: fromEmail, to: [to], subject, html }),
  });
}

Deno.serve(async (req) => {
  const sig = req.headers.get('stripe-signature');
  if (!sig) return new Response('Geen signature', { status: 400 });

  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature mislukt:', err);
    return new Response('Ongeldige signature', { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const reservationId = session.metadata?.reservation_id;
    if (!reservationId) {
      console.warn('Geen reservation_id in session metadata');
      return new Response(JSON.stringify({ ok: true, skipped: true }), { status: 200 });
    }

    const { data: res, error } = await admin.from('reservations').select('*').eq('id', reservationId).single();
    if (error || !res) {
      console.error('Reservering niet gevonden:', reservationId);
      return new Response(JSON.stringify({ error: 'Reservering niet gevonden' }), { status: 404 });
    }

    if (res.status !== 'bevestigd') {
      await admin.from('reservations').update({ status: 'bevestigd' }).eq('id', reservationId);
    }

    const email = res.klant_email || session.customer_email;
    if (email && resendKey) {
      const extras = Array.isArray(res.extras) ? res.extras : [];
      const extraTotaal = extras.reduce((s: number, e: { bedrag?: number }) => s + Number(e.bedrag || 0), 0);
      const totaal = formatEuro(Number(res.bruto_prijs) + extraTotaal);
      const dienst = dienstLabels[res.dienst] || res.dienst;
      const html = bevestigingHtml({
        naam: res.klantnaam,
        dienst,
        pakket: res.pakket,
        datum: formatDatum(res.datum),
        totaal,
        extras,
      });
      await sendEmail(
        email,
        `Betaling ontvangen — ${dienst} · Beerthuizen Studios`,
        html,
      );
      await admin.from('reservations').update({
        email_verzonden_op: new Date().toISOString(),
        klant_email: email,
      }).eq('id', reservationId);
    }

    console.log(`Reservering ${reservationId} bevestigd na Stripe-betaling`);
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});

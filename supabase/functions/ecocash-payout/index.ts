// Gwaro: EcoCash payout Edge Function — NOT YET IMPLEMENTED.
//
// This is scaffolding for when real EcoCash merchant API access exists. It
// deliberately does nothing real yet — see the TODOs below.
//
// Why this has to be a server-side function and not a client-side call:
// EcoCash merchant credentials (API key/secret) must never be shipped to a
// browser — anyone could read them out of the page's JS and drain the
// merchant account. An Edge Function runs on Supabase's servers, so the
// credentials only ever live in its environment variables (set via
// `supabase secrets set`), never in code the client downloads.
//
// Until this is built out and deployed, payouts are handled manually by an
// admin (see the "Payouts" section of the admin view in src/App.jsx) — that
// flow doesn't call this function at all.
//
// To actually build this once you have Econet merchant credentials:
//   1. Get the real API details from Econet (base URL, auth scheme,
//      disbursement/B2C endpoint, required fields). Don't guess at these —
//      ask your Econet integration contact or their developer docs
//      directly; the specifics aren't reliably documented publicly and
//      change over time.
//   2. `supabase secrets set ECOCASH_API_KEY=... ECOCASH_MERCHANT_CODE=...`
//      (never commit these — they must only exist as secrets).
//   3. Replace the body below with a real fetch() to Econet's endpoint.
//   4. Deploy: `supabase functions deploy ecocash-payout`.
//   5. Call it from the client with:
//        supabase.functions.invoke('ecocash-payout', { body: { jobId } })
//      then update src/App.jsx's admin payout action to call this instead
//      of just marking payout_status as "sent" by hand.
//   6. Also implement the reverse flow (collecting the job budget from the
//      client) — EcoCash C2B/collections is a separate capability from
//      disbursement/B2C and may need separate merchant approval.

// @ts-nocheck — Deno-only import, not resolved by the Vite/Node toolchain
// used for the rest of this repo.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

serve(async (req) => {
  return new Response(
    JSON.stringify({
      error: "Not implemented — see the TODOs at the top of this file.",
    }),
    { status: 501, headers: { "Content-Type": "application/json" } }
  );
});

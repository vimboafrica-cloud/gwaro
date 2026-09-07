# Gwaro

A job-matching prototype for typists & writers in Zimbabwe: two-sided job
board (post → claim → deliver → approve & pay → rate), transparent payout
math (15% platform fee + 3% mobile-money transfer cost), role switching
(client/worker), and an admin view for dispute resolution.

Backed by a real shared **Supabase** database, with real passwordless email
auth — the job board is now genuinely shared across every device/browser,
not just saved locally.

## One-time Supabase setup

1. Create a free project at [supabase.com](https://supabase.com).
2. In the SQL Editor, run [`supabase/schema.sql`](supabase/schema.sql) — this
   creates the `profiles` and `jobs` tables, their row-level-security
   policies, and enables Realtime on `jobs`.
3. In **Project Settings → API**, copy the **Project URL** and the
   **anon/public key**.
4. Copy `.env.example` to `.env.local` and paste those two values in.
5. In **Authentication → Providers**, confirm Email is enabled (it is by
   default). Supabase's default email template includes the `{{ .Token }}`
   6-digit code this app uses — no template changes needed on the free tier.

## Running it

```bash
npm install
npm run dev
```

Open the printed local URL (default `http://localhost:5173`), enter your
email, and enter the 6-digit code that arrives by email to sign in.

### Becoming an admin

The admin dispute view is gated by an `is_admin` flag on your `profiles`
row (nobody has it by default). After signing in once, run in the SQL
Editor:

```sql
update public.profiles set is_admin = true
where id = (select id from auth.users where email = 'you@example.com');
```

Reload the app and an "Admin" link appears at the bottom.

## Getting client and worker in touch

There's no in-app chat or file upload yet, so once a job is claimed, each
side sees the other's phone number as a WhatsApp link (`Contact: Name ·
number`) — they coordinate the actual file transfer and any back-and-forth
over WhatsApp, which is already how this kind of work happens in Zimbabwe.
Phone number is collected at onboarding (existing accounts get a one-time
banner prompting for it). See
[supabase/migrations/0003_contact_phone.sql](supabase/migrations/0003_contact_phone.sql)
if you set up the database before this existed.

A real in-app chat + file-sharing system (Supabase Storage, a per-job
message thread) is a natural upgrade once it's clear people want to stay
on-platform for it rather than jump to WhatsApp anyway.

## Payouts: manual for now, on purpose

There's no automatic EcoCash/OneMoney API call yet — getting one requires
registering as an EcoCash merchant with Econet first (a business process,
not something that can be wired up without those credentials). Even once
that exists, the actual API call has to run server-side (a Supabase Edge
Function), never in the browser, since merchant credentials can't be shipped
to client-side JS.

So for now, payouts are tracked but sent by hand:

1. A worker adds their EcoCash number once (prompted the first time they're
   in worker mode).
2. When a client clicks **Approve & release payment**, the job moves to a
   "payout pending" state instead of instantly showing as paid.
3. The **Admin → Payouts** view lists everything waiting to be paid, with
   the worker's name, EcoCash number, and net amount.
4. An admin sends that amount from their own EcoCash app, then records the
   transaction reference in the app, which marks it as sent.

This is a real, usable workflow for a small pilot — plenty of early-stage
Zimbabwean marketplaces operate exactly this way before automating. See
[supabase/functions/ecocash-payout/index.ts](supabase/functions/ecocash-payout/index.ts)
for the scaffolding to replace this with a real API call once merchant
credentials exist, and
[supabase/migrations/0002_payouts.sql](supabase/migrations/0002_payouts.sql)
for the schema change (run this if you set up the database before this
feature existed).

## Current limitations (prototype, not production)

- **Payments**: tracked and manually reconciled (see above); no automatic
  EcoCash/OneMoney API call yet.
- **Wallet balance**: still a hardcoded placeholder ($42.50), not tied to
  real funds — this is separate from the payout tracking above and covers
  a client's own account balance, which isn't implemented.
- **Auth**: email-based magic link only; no phone/SMS sign-in yet (matches
  how most target users would actually reach the app, but costs money via
  an SMS provider like Twilio — deferred until closer to launch).
- **Email deliverability**: Resend's free `resend.dev` sender domain can
  only send to the Resend account's own email address. A real domain needs
  to be verified in Resend before anyone besides you can sign up.
- **Profile visibility**: any signed-in user can currently read any other
  user's profile row via the API, including `is_admin` and `ecocash_number`
  — fine for a small trusted pilot, worth tightening (column-level
  policies or a public-safe view) before a wider launch.

## Natural next steps

1. ~~Real backend + database (shared job board across all users/devices).~~ ✅
2. ~~Real accounts/auth.~~ ✅ (email magic link via Supabase Auth)
3. Real EcoCash/OneMoney payment integration — payout *tracking* is done
   (see above); the actual automated API call is still pending merchant
   access.
4. Verify a real domain for email so anyone can sign up, not just you.

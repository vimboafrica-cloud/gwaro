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

## Payment gate: a posted job doesn't go live until it's paid for

Previously nothing captured any payment at all, from anyone, ever — a
client could post, get matched, and pay nothing, since "budget" was just a
number on the screen. Now:

1. A client posts a job — it starts as **"Awaiting payment"**, invisible to
   workers (not in Browse jobs).
2. The client's "My jobs" view shows exactly where to send the money: your
   platform's EcoCash number.
3. **Admin → Incoming payments** lists every job waiting on this, with the
   client's name/phone and the amount to expect.
4. Once you've actually received it (checked in your own EcoCash app), mark
   it received with the transaction reference — only then does the job flip
   to "Open" and become claimable, and only then can client/worker see each
   other's contact info at all.

**Before this works, you must set your real EcoCash number** in
[src/App.jsx](src/App.jsx) — search for `PLATFORM_ECOCASH_NUMBER` near the
top and replace the placeholder. Nothing prevents the app from running with
the placeholder still in place, so don't forget this.

This is enforced at the database level, not just hidden in the UI: a
trigger blocks *any* attempt (from the app, or someone calling the Supabase
API directly with the public anon key) to move a job out of
`awaiting_payment` unless it's done by an admin account. Claiming a job is
similarly restricted to jobs actually in `open` status, not just "no worker
assigned yet" — see
[supabase/migrations/0004_payment_gate.sql](supabase/migrations/0004_payment_gate.sql).

**What this doesn't solve**: once a worker is revealed to a client (after a
first paid job), nothing stops them from arranging future jobs directly
over WhatsApp and skipping the platform entirely. That's a real, permanent
tradeoff of doing off-platform contact exchange — see the section below.
Mitigating it further (in-app masked messaging, non-circumvention terms,
loyalty/reputation incentives to stay on-platform) is worth revisiting once
there's real usage to observe.

## Platform rules and enforcement

New sign-ups must read and check a box agreeing to plain-language platform
rules (pay through Gwaro, don't take a Gwaro match off-platform to dodge
fees, be honest in disputes) before their account is created; existing
accounts get the same rules as a one-time gate on next sign-in. This is
**not a lawyer-drafted legal document** — get one reviewed before treating
it as actually enforceable.

The teeth behind it: an admin can suspend an account (currently wired up as
a "Suspend client"/"Suspend worker" button right on each disputed job in
**Admin → Reported jobs**; for anything not tied to a specific dispute, see
the SQL snippet in
[supabase/migrations/0005_trust_and_safety.sql](supabase/migrations/0005_trust_and_safety.sql)).
A suspended account sees a blocking screen instead of the app.

**Security fix bundled into the same migration**: the profiles table
previously let any signed-in user update *any* column on their own row via
the API — including `is_admin`. In other words, anyone could have called
`supabase.from('profiles').update({is_admin: true})` directly and granted
themselves admin. A trigger now blocks changes to `is_admin`/`suspended`/
`suspension_reason` from anyone who isn't already an admin.

**What this doesn't solve**: a rule with a penalty is a deterrent, not a
technical block — two people who've already met through Gwaro can still
just talk on WhatsApp and skip the app for their next job together, and
there's no way to detect that from here. The honest fix for that is making
staying on-platform worth more than leaving (the protection banner shown in
the app, and eventually things like visible reputation/repeat business),
not just banning people after the fact.

## Revenue reporting (Admin)

**Admin → Revenue** summarizes actual platform earnings, distinct from the
money that just passes through: the 15% commission is real revenue, the 3%
mobile-money transfer cost is a pass-through covering the real EcoCash fee,
not profit. Shows totals, a breakdown by category and by month, and an
**Export CSV** button (job-by-job detail: date, category, client, worker,
budget, commission, transfer cost, worker payout, payout reference) for
bookkeeping/tax filing. Computed entirely from data already loaded — no
database change needed.

Revenue is dated by `collection_confirmed_at` (when the client's payment
was actually confirmed) rather than when the job was posted, since that's
when the money genuinely arrived; falls back to `created_at` for jobs from
before that field existed.

This matters more than it might look: if you incorporate (see the OPC/Pvt
Ltd note below), keeping business revenue cleanly separated and exportable
is part of what actually makes the corporate structure hold up, not just
the registration paperwork.

## One-person company note

Zimbabwe doesn't have a distinctly-named "OPC" category, but a standard
**Private Company Limited by Shares** under the Companies and Other
Business Entities Act, 2019 can legally be formed with a single
shareholder who is also the sole director — functionally the same thing.
Not legal advice; get the actual registration reviewed by a lawyer/
accountant. If you do incorporate, two things in the app should change to
actually realize the liability-shield benefit (right now they undermine
it):

1. **`PLATFORM_ECOCASH_NUMBER`** (in `src/App.jsx`) is currently a personal
   number — client payments should go to a business EcoCash/bank account
   in the company's name instead, or a court/ZIMRA could disregard the
   corporate veil on the grounds that business and personal funds were
   never actually separated.
2. **Platform Rules** (`PLATFORM_RULES` in `src/App.jsx`) should name the
   actual legal entity once registered, so the rules are the company's
   terms, not one person's informal ones.

## Multi-currency: USD and ZiG (Zimbabwe Gold)

A client picks USD or ZiG when posting a job; that job's budget, bids, and
payout all stay in that same currency end to end.

**No exchange rate is stored or used anywhere in settlement logic.**
Zimbabwe's official-vs-parallel exchange rate gap is real and persistent
(~20%+ as of writing, not an occasional blip), so converting between the
two anywhere money actually moves would be taking on real financial risk
this platform has no business taking on. Concretely:

- The probation budget cap (new workers) is **two independent native
  constants** — `PROBATION_BUDGET_CAP_USD` and `PROBATION_BUDGET_CAP_ZIG`
  in `src/App.jsx` (mirrored in the `enforce_worker_claim_eligibility`
  trigger) — not one derived from the other. Update the ZiG one yourself as
  its value moves.
- **Revenue reports and wallet totals never sum across currencies.** A $10
  USD job and a ZiG 266 job are shown as two separate totals, never added
  into one number — doing so would imply a precision the actual exchange
  rate doesn't have.
- The average-price hint shown when posting a job is computed per
  category **and** per currency — never mixed.

Run [supabase/migrations/0009_multicurrency.sql](supabase/migrations/0009_multicurrency.sql)
to enable this on an existing project.

`PLATFORM_ECOCASH_NUMBER` is one number for both currencies — confirmed
operationally that EcoCash's USD and ZiG wallets both sit behind the same
phone number, so no per-currency split is needed there.

## Competitive bidding (optional, per job)

Alongside the original fixed-price/first-claim flow, a client can post a
job **"Open for bids"** instead of at a fixed price:

1. Client sets a target price (shown alongside the platform's average for
   that category, computed from completed jobs).
2. Approved workers submit their own price + an optional note. **Bids are
   private** — a worker only ever sees their own bid, never anyone else's.
3. The client reviews bids (each shows the bidder's star rating/completed
   jobs) in **My jobs** and awards one via `accept_bid()`.
4. Only now is the price actually known, so *this* is when the payment gate
   kicks in — the job moves to `awaiting_payment` at the winning bid's
   amount, same admin-confirms flow as a fixed-price job, then goes
   straight to `in_progress` (the worker is already decided, no separate
   claim step).
5. Everything downstream (delivery, revision requests, approval, payout,
   disputes) is identical either way.

There's no bidding deadline — a job stays open for bids until the client
awards one or clicks **Cancel this job**. The worker-approval gate and the
new-worker probation cap both still apply to whoever wins a bid — a client
literally cannot award a bid above the probation cap to a brand-new worker;
`accept_bid()` will reject it with a clear error.

Run [supabase/migrations/0007_bidding.sql](supabase/migrations/0007_bidding.sql)
to enable this on an existing project.

## Quality assurance

Four pieces, from lightest to heaviest:

1. **Request changes**: a delivered job isn't just approve-or-dispute
   anymore — the client can send it back with a note (`DeliveredReview` in
   [src/App.jsx](src/App.jsx)), which reopens it as `in_progress` with the
   note shown to the worker. `jobs.revision_count`/`revision_note` track it.
2. **Visible reputation**: once a worker is revealed to a client, their
   completed-job count and average rating show alongside their contact
   link, computed client-side from existing job data (no new table).
3. **Worker approval gate**: a worker can't claim jobs until they submit a
   short work sample and an admin approves it (**Admin → Worker
   approvals**). Existing workers were grandfathered in by the migration so
   this doesn't retroactively lock anyone out.
4. **Probationary cap**: until a worker has 3 completed jobs, they can only
   have one active job at a time and can't claim anything over $15 —
   enforced by the same `enforce_worker_claim_eligibility` trigger that
   checks approval, not just previewed in the UI.

Run
[supabase/migrations/0006_quality_assurance.sql](supabase/migrations/0006_quality_assurance.sql)
to enable all of this on an existing project.

**Bug fix bundled into that migration**: the "Suspend client/worker"
buttons added earlier never actually worked — `profiles` had no RLS policy
letting an admin update someone *else's* row at all (only "update your own
row"), so the update was silently filtered out before the enforcement
trigger even ran. Fixed with an explicit "admins can update any profile"
policy.

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

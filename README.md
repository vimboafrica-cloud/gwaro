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

## Current limitations (prototype, not production)

- **Payments**: the payout breakdown is calculated and displayed, but no
  real money moves yet — EcoCash/OneMoney integration is not implemented.
- **Wallet balance**: still a hardcoded placeholder ($42.50), not tied to
  real funds.
- **Auth**: email-based OTP only; no phone/SMS sign-in yet (matches how
  most target users would actually reach the app, but costs money via an
  SMS provider like Twilio — deferred until closer to launch).

## Natural next steps

1. ~~Real backend + database (shared job board across all users/devices).~~ ✅
2. ~~Real accounts/auth.~~ ✅ (email OTP via Supabase Auth)
3. Real EcoCash/OneMoney payment integration.

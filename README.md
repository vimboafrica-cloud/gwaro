# Gwaro

A job-matching prototype for typists & writers in Zimbabwe: two-sided job
board (post → claim → deliver → approve & pay → rate), transparent payout
math (15% platform fee + 3% mobile-money transfer cost), role switching
(client/worker), and a password-gated admin view for dispute resolution.

This started as a Claude Artifact prototype and has been pulled into a real
local Vite + React + Tailwind project.

## Running it

```bash
npm install
npm run dev
```

Then open the printed local URL (default `http://localhost:5173`).

## Current limitations (prototype, not production)

- **Storage**: uses the browser's `localStorage`, so data is per-device/
  per-browser only — it doesn't sync across people or devices. The original
  Artifact version used a shared sandbox storage API that doesn't exist
  outside that environment; a real backend + database is the next step to
  make the job board genuinely shared.
- **Identity**: "login" is just a name typed in on first visit, kept in
  `localStorage`. No passwords, no real accounts.
- **Admin gate**: the admin passcode (`gwaro-admin`, see `src/App.jsx`) is a
  demo-only gate, not real security.
- **Payments**: the payout breakdown is calculated and displayed, but no
  real money moves — EcoCash/OneMoney integration is not implemented.

## Natural next steps

1. Real backend + database (shared job board across all users/devices).
2. Real accounts/auth.
3. Real EcoCash/OneMoney payment integration.

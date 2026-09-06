-- Gwaro: add manual EcoCash payout tracking to an existing project.
-- Run this once in the SQL Editor. Safe to re-run (every change is
-- if-not-exists / drop-then-create).
--
-- Why "manual": a real EcoCash disbursement call needs merchant API
-- credentials from Econet, which this project doesn't have yet. Even once
-- it does, that call has to happen server-side (a Supabase Edge Function),
-- never from the browser — see supabase/functions/ecocash-payout/. Until
-- that's built, an admin sends the payout by hand from their own EcoCash
-- app and records the transaction reference here as a paper trail.

alter table public.profiles
  add column if not exists ecocash_number text;

alter table public.jobs
  add column if not exists payout_status text not null default 'none'
    check (payout_status in ('none','pending','sent')),
  add column if not exists payout_reference text,
  add column if not exists payout_sent_at timestamptz;

-- Re-affirm the jobs update policy so admins can set payout_status/reference
-- on any job, not just their own. (No-op if you already ran the latest
-- schema.sql — this just guarantees it either way.)
drop policy if exists "clients, involved workers, and admins can update jobs" on public.jobs;
create policy "clients, involved workers, and admins can update jobs"
  on public.jobs for update
  using (
    auth.uid() = client_id
    or auth.uid() = worker_id
    or worker_id is null
    or public.is_admin()
  )
  with check (
    auth.uid() = client_id
    or auth.uid() = worker_id
    or public.is_admin()
  );

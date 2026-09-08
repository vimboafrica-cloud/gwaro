-- Gwaro: Supabase schema
-- Run this once in a fresh project's SQL Editor (Supabase Dashboard -> SQL
-- Editor -> New query). Safe to re-run on an existing project too — table
-- creation and policies are all idempotent (if-exists / drop-then-create).
--
-- If you already ran an earlier version of this file, you don't need to
-- re-run the whole thing — see supabase/migrations/ for the incremental
-- change scripts instead, which are smaller and quicker to review.

-- ---------- profiles ----------
-- One row per authenticated user. Created client-side right after their
-- first sign-in (see src/hooks/useAuth.js), since Supabase Auth only knows
-- about the email/session, not the display name or client/worker role.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  role text not null default 'client' check (role in ('client','worker')),
  is_admin boolean not null default false,
  -- Where a worker's payout gets sent, and (for now) who an admin sends a
  -- client's collected funds from. See supabase/migrations/0002_payouts.sql.
  ecocash_number text,
  -- Shown to the other party once a job is claimed, so they can actually
  -- exchange the work (files, revisions, etc.) via WhatsApp — there's no
  -- in-app chat/file-sharing yet. See supabase/migrations/0003_contact_phone.sql.
  phone text,
  -- Platform rules acceptance and admin-only enforcement fields — see
  -- supabase/migrations/0005_trust_and_safety.sql, including why
  -- is_admin/suspended/suspension_reason need the trigger below and can't
  -- just rely on the general self-update policy.
  agreed_to_terms_at timestamptz,
  suspended boolean not null default false,
  suspension_reason text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles are viewable by everyone signed in" on public.profiles;
create policy "profiles are viewable by everyone signed in"
  on public.profiles for select
  using (auth.role() = 'authenticated');

drop policy if exists "users can insert their own profile" on public.profiles;
create policy "users can insert their own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

drop policy if exists "users can update their own profile" on public.profiles;
create policy "users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- helper used by jobs' RLS policy below
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

-- SECURITY: the "users can update their own profile" policy above allows a
-- user to change ANY column on their own row — without this trigger, any
-- signed-in user could call
-- `supabase.from('profiles').update({is_admin: true})` directly against the
-- API and self-promote to admin. This blocks changes to is_admin/suspended/
-- suspension_reason from anyone but an existing admin.
create or replace function public.enforce_profile_admin_fields()
returns trigger
language plpgsql
security definer
as $$
begin
  -- Only restricts real end-user API calls (auth.role() = 'authenticated').
  -- Direct SQL Editor access has no JWT / auth.uid() at all, so it's exempt
  -- — otherwise this would also block the "make yourself an admin"
  -- bootstrapping query below, which has to run before any admin exists.
  if auth.role() = 'authenticated'
     and (new.is_admin is distinct from old.is_admin
          or new.suspended is distinct from old.suspended
          or new.suspension_reason is distinct from old.suspension_reason)
     and not public.is_admin() then
    raise exception 'Only an admin can change admin/suspension fields';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_enforce_admin_fields on public.profiles;
create trigger profiles_enforce_admin_fields
  before update on public.profiles
  for each row
  execute function public.enforce_profile_admin_fields();

-- ---------- jobs ----------
create sequence if not exists public.jobs_id_seq;

create table if not exists public.jobs (
  id text primary key default ('GW-' || lpad(nextval('public.jobs_id_seq')::text, 4, '0')),
  category text not null,
  title text not null,
  description text default '',
  budget numeric not null check (budget > 0),
  deadline date,
  -- 'awaiting_payment' until an admin confirms the client's EcoCash payment
  -- arrived — see supabase/migrations/0004_payment_gate.sql for why this
  -- exists (nothing captured any payment at all before it did) and the
  -- trigger below that makes it a real gate, not just a UI convention.
  status text not null default 'awaiting_payment' check (status in ('awaiting_payment','open','in_progress','delivered','approved','cancelled')),
  client_id uuid not null references public.profiles(id),
  client_name text not null,
  worker_id uuid references public.profiles(id),
  worker_name text,
  rating int check (rating between 1 and 5),
  flagged boolean not null default false,
  -- Manual EcoCash payout tracking — see supabase/migrations/0002_payouts.sql
  -- for why this is manual rather than an automated API call.
  payout_status text not null default 'none' check (payout_status in ('none','pending','sent')),
  payout_reference text,
  payout_sent_at timestamptz,
  -- Manual EcoCash collection tracking (client -> platform), the mirror
  -- image of the payout fields above. See 0004_payment_gate.sql.
  collection_reference text,
  collection_confirmed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.jobs enable row level security;

drop policy if exists "jobs are viewable by everyone signed in" on public.jobs;
create policy "jobs are viewable by everyone signed in"
  on public.jobs for select
  using (auth.role() = 'authenticated');

-- Requires status = 'awaiting_payment' at insert time — a client can't post
-- a job that's already 'open', only the payment-gate trigger below (via an
-- admin) can move it there.
drop policy if exists "clients can post their own jobs" on public.jobs;
create policy "clients can post their own jobs"
  on public.jobs for insert
  with check (auth.uid() = client_id and status = 'awaiting_payment');

-- Covers: a client editing/cancelling their own job, a worker claiming an
-- open unclaimed job or updating a job already assigned to them, and an
-- admin resolving a disputed job (or recording a payout/payment)
-- regardless of who it belongs to. "Unclaimed" only counts as claimable
-- when status = 'open' — an awaiting_payment job has worker_id null too,
-- but shouldn't be claimable yet.
drop policy if exists "clients, involved workers, and admins can update jobs" on public.jobs;
create policy "clients, involved workers, and admins can update jobs"
  on public.jobs for update
  using (
    auth.uid() = client_id
    or auth.uid() = worker_id
    or (worker_id is null and status = 'open')
    or public.is_admin()
  )
  with check (
    auth.uid() = client_id
    or auth.uid() = worker_id
    or public.is_admin()
  );

-- Payment gate: only an admin can move a job out of 'awaiting_payment'.
-- This is enforced at the database level (not just hidden in the UI)
-- because the anon key is public in the shipped JS — without this, anyone
-- could call the API directly and open their own job without paying.
create or replace function public.enforce_payment_gate()
returns trigger
language plpgsql
security definer
as $$
begin
  if old.status = 'awaiting_payment' and new.status <> 'awaiting_payment' and not public.is_admin() then
    raise exception 'Only an admin can confirm payment and open this job';
  end if;
  return new;
end;
$$;

drop trigger if exists jobs_enforce_payment_gate on public.jobs;
create trigger jobs_enforce_payment_gate
  before update on public.jobs
  for each row
  execute function public.enforce_payment_gate();

-- Realtime: lets every open browser see job changes live (claims, delivery,
-- approval, disputes, payouts) without polling. Enable it either here or via
-- Dashboard -> Database -> Replication -> supabase_realtime.
alter publication supabase_realtime add table public.jobs;

-- ---------- make yourself an admin ----------
-- After you've signed in once (so a profiles row exists for your email),
-- run this to unlock the admin dispute/payout views:
--   update public.profiles set is_admin = true where id =
--     (select id from auth.users where email = 'you@example.com');

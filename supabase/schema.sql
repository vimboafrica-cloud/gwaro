-- Gwaro: Supabase schema
-- Run this once in your project's SQL Editor (Supabase Dashboard -> SQL Editor -> New query).

-- ---------- profiles ----------
-- One row per authenticated user. Created client-side right after their
-- first sign-in (see src/hooks/useAuth.js), since Supabase Auth only knows
-- about the email/session, not the display name or client/worker role.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  role text not null default 'client' check (role in ('client','worker')),
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles are viewable by everyone signed in"
  on public.profiles for select
  using (auth.role() = 'authenticated');

create policy "users can insert their own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

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

-- ---------- jobs ----------
create sequence if not exists public.jobs_id_seq;

create table if not exists public.jobs (
  id text primary key default ('GW-' || lpad(nextval('public.jobs_id_seq')::text, 4, '0')),
  category text not null,
  title text not null,
  description text default '',
  budget numeric not null check (budget > 0),
  deadline date,
  status text not null default 'open' check (status in ('open','in_progress','delivered','approved','cancelled')),
  client_id uuid not null references public.profiles(id),
  client_name text not null,
  worker_id uuid references public.profiles(id),
  worker_name text,
  rating int check (rating between 1 and 5),
  flagged boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.jobs enable row level security;

create policy "jobs are viewable by everyone signed in"
  on public.jobs for select
  using (auth.role() = 'authenticated');

create policy "clients can post their own jobs"
  on public.jobs for insert
  with check (auth.uid() = client_id);

-- Covers: a client editing/cancelling their own job, a worker claiming an
-- unclaimed job or updating a job already assigned to them, and an admin
-- resolving a disputed job regardless of who it belongs to.
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

-- Realtime: lets every open browser see job changes live (claims, delivery,
-- approval, disputes) without polling. Enable it either here or via
-- Dashboard -> Database -> Replication -> supabase_realtime.
alter publication supabase_realtime add table public.jobs;

-- ---------- make yourself an admin ----------
-- After you've signed in once (so a profiles row exists for your email),
-- run this to unlock the admin dispute view:
--   update public.profiles set is_admin = true where id =
--     (select id from auth.users where email = 'you@example.com');

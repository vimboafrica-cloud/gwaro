-- Gwaro: competitive bidding as an alternative to fixed-price first-claim.
--
-- How this fits into the existing lifecycle:
--   Fixed-price (unchanged): awaiting_payment -> [admin confirms] -> open
--     -> [worker claims] -> in_progress -> delivered -> approved
--   Bidding (new): bidding -> [workers submit bids] -> [client accepts one
--     via accept_bid()] -> awaiting_payment (price is only known now) ->
--     [admin confirms] -> in_progress (worker already assigned, no separate
--     claim step) -> delivered -> approved
--
-- Bids are private: a worker sees only their own bid on a job; the job's
-- client sees every bid on jobs they posted. Enforced by RLS below, and
-- naturally respected by the embedded `bids(*)` in useJobs' query.
--
-- Run once in the SQL Editor. Safe to re-run.

alter table public.jobs
  add column if not exists bidding_enabled boolean not null default false;

alter table public.jobs drop constraint if exists jobs_status_check;
alter table public.jobs add constraint jobs_status_check
  check (status in ('awaiting_payment','open','bidding','in_progress','delivered','approved','cancelled'));

-- A bidding job skips the payment gate at posting time (the price isn't
-- known yet) but still starts in a not-yet-open-for-work state.
drop policy if exists "clients can post their own jobs" on public.jobs;
create policy "clients can post their own jobs"
  on public.jobs for insert
  with check (
    auth.uid() = client_id
    and (
      (bidding_enabled = false and status = 'awaiting_payment')
      or (bidding_enabled = true and status = 'bidding')
    )
  );

-- ---------- bids ----------
create table if not exists public.bids (
  id uuid primary key default gen_random_uuid(),
  job_id text not null references public.jobs(id) on delete cascade,
  worker_id uuid not null references public.profiles(id),
  worker_name text not null,
  amount numeric not null check (amount > 0),
  note text,
  status text not null default 'pending' check (status in ('pending','accepted','rejected','withdrawn')),
  created_at timestamptz not null default now(),
  unique (job_id, worker_id)
);

alter table public.bids enable row level security;

drop policy if exists "a worker sees their own bids, a client sees bids on their jobs" on public.bids;
create policy "a worker sees their own bids, a client sees bids on their jobs"
  on public.bids for select
  using (
    auth.uid() = worker_id
    or exists (select 1 from public.jobs j where j.id = bids.job_id and j.client_id = auth.uid())
    or public.is_admin()
  );

drop policy if exists "an approved worker can bid on a job open for bidding" on public.bids;
create policy "an approved worker can bid on a job open for bidding"
  on public.bids for insert
  with check (
    auth.uid() = worker_id
    and exists (select 1 from public.profiles p where p.id = worker_id and p.worker_approved = true)
    and exists (select 1 from public.jobs j where j.id = bids.job_id and j.status = 'bidding' and j.bidding_enabled = true)
  );

-- A worker can edit/withdraw their own still-pending bid; the job's client
-- can reject a bid on their own job (accepting one goes through the
-- accept_bid() function below, not a plain update, since it has side
-- effects on the job and on every other bid).
drop policy if exists "a worker can update their pending bid, a client can reject one" on public.bids;
create policy "a worker can update their pending bid, a client can reject one"
  on public.bids for update
  using (
    (auth.uid() = worker_id and status = 'pending')
    or exists (select 1 from public.jobs j where j.id = bids.job_id and j.client_id = auth.uid())
    or public.is_admin()
  )
  with check (
    auth.uid() = worker_id
    or exists (select 1 from public.jobs j where j.id = bids.job_id and j.client_id = auth.uid())
    or public.is_admin()
  );

alter publication supabase_realtime add table public.bids;

-- Awarding a bid touches two tables atomically (the job, and every bid on
-- it) and needs its own authorization check (must be that job's client),
-- so it's a function rather than a plain client-side update. Runs as
-- security definer, which is also why the enforce_worker_claim_eligibility
-- trigger (still fires regardless — triggers aren't bypassed by RLS) is
-- what actually re-checks the winning worker's approval/probation status
-- here, exactly as it does for a normal claim.
create or replace function public.accept_bid(p_bid_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  v_job_id text;
  v_worker_id uuid;
  v_worker_name text;
  v_amount numeric;
  v_client_id uuid;
begin
  select b.job_id, b.worker_id, b.worker_name, b.amount, j.client_id
    into v_job_id, v_worker_id, v_worker_name, v_amount, v_client_id
    from public.bids b
    join public.jobs j on j.id = b.job_id
    where b.id = p_bid_id and b.status = 'pending';

  if v_job_id is null then
    raise exception 'Bid not found, or it has already been decided';
  end if;

  if auth.uid() <> v_client_id and not public.is_admin() then
    raise exception 'Only this job''s client can accept a bid';
  end if;

  update public.jobs
    set worker_id = v_worker_id,
        worker_name = v_worker_name,
        budget = v_amount,
        status = 'awaiting_payment',
        bidding_enabled = false
    where id = v_job_id;

  update public.bids set status = 'accepted' where id = p_bid_id;
  update public.bids set status = 'rejected' where job_id = v_job_id and id <> p_bid_id and status = 'pending';
end;
$$;

revoke all on function public.accept_bid(uuid) from public;
grant execute on function public.accept_bid(uuid) to authenticated;

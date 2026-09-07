-- Gwaro: require payment before a job goes live.
--
-- Previously a posted job went straight to "open" with nothing collected
-- from the client at all — the platform fee was never actually captured on
-- any job, first or repeat. Now: a posted job starts as 'awaiting_payment'
-- (invisible to workers), the client sends the budget to the platform's own
-- EcoCash number, an admin confirms receipt, and only then does it flip to
-- 'open' and become claimable — and only then is either party's contact
-- info revealed to the other.
--
-- This also closes a real bypass: without the trigger below, a client could
-- call the Supabase API directly (the anon key is public in the shipped JS)
-- and flip their own job straight to 'open' without paying anything, since
-- normal row-level security can't tell "legitimate app flow" from "someone
-- hand-crafting a request." The trigger enforces it at the database level
-- regardless of what any client sends.
--
-- Run once in the SQL Editor. Safe to re-run.

alter table public.jobs alter column status set default 'awaiting_payment';

alter table public.jobs drop constraint if exists jobs_status_check;
alter table public.jobs add constraint jobs_status_check
  check (status in ('awaiting_payment','open','in_progress','delivered','approved','cancelled'));

alter table public.jobs
  add column if not exists collection_reference text,
  add column if not exists collection_confirmed_at timestamptz;

-- Only an admin can move a job out of 'awaiting_payment'. Everything else
-- about updating a job (claiming, delivering, approving, disputes, payouts)
-- is untouched — this only guards that one specific transition.
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

-- Belt-and-braces: also make sure a client can only ever *insert* a job in
-- the awaiting_payment state, not post one directly as already 'open'.
drop policy if exists "clients can post their own jobs" on public.jobs;
create policy "clients can post their own jobs"
  on public.jobs for insert
  with check (auth.uid() = client_id and status = 'awaiting_payment');

-- Tighten the "claim" path: previously any signed-in user could attempt to
-- update any job with worker_id is null (the general "unclaimed" case),
-- which technically included jobs still awaiting payment. Now that only
-- counts as a valid claim target when the job is actually 'open'.
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

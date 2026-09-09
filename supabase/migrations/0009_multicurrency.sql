-- Gwaro: true multi-currency — a client picks USD or ZiG per job, and that
-- job's budget, bids, and payout are all in that same currency end to end.
--
-- Deliberately NOT storing or using a live exchange rate anywhere in
-- settlement logic — Zimbabwe's official-vs-parallel rate gap (~20%+,
-- persistent, not occasional) makes any single "the" rate a real financial
-- risk if it's used to move money. The only place a rate-like number
-- appears is the probation budget cap below, which is set natively in each
-- currency (two independent constants), not derived by converting one to
-- the other.
--
-- Run once in the SQL Editor. Safe to re-run.

alter table public.jobs
  add column if not exists currency text not null default 'USD' check (currency in ('USD', 'ZIG'));

-- Update the insert policy to allow currency through (no behavior change to
-- the check itself, just widening the column list implicitly via *).
-- (No policy change actually needed — the existing policy doesn't enumerate
-- columns — this comment exists so a reader isn't left wondering.)

-- Update the probation cap to be currency-aware: two independent native
-- caps, not one converted via a rate. Update probation_budget_cap_zig
-- yourself as ZiG's value moves — don't compute it from probation_budget_cap_usd.
create or replace function public.enforce_worker_claim_eligibility()
returns trigger
language plpgsql
security definer
as $$
declare
  probation_budget_cap_usd numeric := 15;
  probation_budget_cap_zig numeric := 400; -- keep roughly aligned with $15 yourself; not auto-derived
  probation_job_threshold integer := 3;
  completed_count integer;
  active_count integer;
  applicable_cap numeric;
begin
  if auth.role() = 'authenticated' and old.worker_id is null and new.worker_id is not null then
    if not exists (select 1 from public.profiles where id = new.worker_id and worker_approved = true) then
      raise exception 'Only approved workers can claim jobs';
    end if;

    select count(*) into completed_count
      from public.jobs where worker_id = new.worker_id and status = 'approved';

    if completed_count < probation_job_threshold then
      select count(*) into active_count
        from public.jobs where worker_id = new.worker_id and status in ('in_progress', 'delivered');

      if active_count >= 1 then
        raise exception 'New workers can only have one active job at a time until they have completed % jobs', probation_job_threshold;
      end if;

      applicable_cap := case when new.currency = 'ZIG' then probation_budget_cap_zig else probation_budget_cap_usd end;
      if new.budget > applicable_cap then
        raise exception 'New workers can only claim jobs up to % % until they have completed % jobs', new.currency, applicable_cap, probation_job_threshold;
      end if;
    end if;
  end if;
  return new;
end;
$$;

-- public_job_listings needs to expose currency too, for accurate
-- advertisement drafts. Dropped and recreated rather than CREATE OR
-- REPLACE, since Postgres won't let REPLACE insert a column in the middle
-- of an existing view's column list (only append at the end) — recreating
-- also means the anon grant needs to be re-applied.
drop view if exists public.public_job_listings;

create view public.public_job_listings as
select id, category, title, description, budget, currency, deadline, status, bidding_enabled, created_at
from public.jobs
where status in ('open', 'bidding');

grant select on public.public_job_listings to anon;

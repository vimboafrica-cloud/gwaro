-- Gwaro: revision requests, visible reputation (no schema needed — computed
-- client-side from existing job data), a worker-approval gate, a
-- probationary cap on new workers, and a retroactive fix for a real bug in
-- the "Suspend" feature shipped in 0005.
--
-- BUG FIX: profiles only had a policy letting a user update THEIR OWN row
-- (`auth.uid() = id`). There was never a policy letting an admin update
-- someone else's row at all, so the admin "Suspend client/worker" buttons
-- were silently no-ops — RLS blocked the update before the
-- enforce_profile_admin_fields trigger ever ran. (jobs already had the
-- equivalent "or public.is_admin()" clause; profiles didn't.)
--
-- Run once in the SQL Editor. Safe to re-run.

drop policy if exists "admins can update any profile" on public.profiles;
create policy "admins can update any profile"
  on public.profiles for update
  using (public.is_admin())
  with check (public.is_admin());

-- ---------- worker approval gate ----------
alter table public.profiles
  add column if not exists worker_approved boolean not null default false,
  add column if not exists worker_sample text,
  add column if not exists worker_sample_submitted_at timestamptz,
  add column if not exists worker_sample_feedback text;

-- Grandfather in anyone who already has activity as a worker before this
-- gate existed — otherwise this migration would suddenly lock out real
-- workers mid-use.
update public.profiles set worker_approved = true
where role = 'worker' or id in (select worker_id from public.jobs where worker_id is not null);

-- Only an admin can approve a worker or leave feedback — everything else on
-- a profile (including submitting your own sample) a user can still change
-- on themselves.
create or replace function public.enforce_profile_admin_fields()
returns trigger
language plpgsql
security definer
as $$
begin
  if auth.role() = 'authenticated'
     and (new.is_admin is distinct from old.is_admin
          or new.suspended is distinct from old.suspended
          or new.suspension_reason is distinct from old.suspension_reason
          or new.worker_approved is distinct from old.worker_approved
          or new.worker_sample_feedback is distinct from old.worker_sample_feedback)
     and not public.is_admin() then
    raise exception 'Only an admin can change admin/suspension/approval fields';
  end if;
  return new;
end;
$$;

-- ---------- revision requests ----------
alter table public.jobs
  add column if not exists revision_note text,
  add column if not exists revision_requested_at timestamptz,
  add column if not exists revision_count integer not null default 0;

-- ---------- probationary cap on new workers ----------
-- Until a worker has 3 completed (approved) jobs: they can only have one
-- active job (in_progress/delivered) at a time, and can't claim a job
-- budgeted over $15. Also blocks claiming at all for an unapproved worker.
-- Adjust the two constants below if you want different thresholds — keep
-- PROBATION_BUDGET_CAP in sync with the same number in src/App.jsx.
create or replace function public.enforce_worker_claim_eligibility()
returns trigger
language plpgsql
security definer
as $$
declare
  probation_budget_cap numeric := 15;
  probation_job_threshold integer := 3;
  completed_count integer;
  active_count integer;
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

      if new.budget > probation_budget_cap then
        raise exception 'New workers can only claim jobs up to $% until they have completed % jobs', probation_budget_cap, probation_job_threshold;
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists jobs_enforce_worker_claim_eligibility on public.jobs;
create trigger jobs_enforce_worker_claim_eligibility
  before update on public.jobs
  for each row
  execute function public.enforce_worker_claim_eligibility();

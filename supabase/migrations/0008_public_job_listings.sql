-- Gwaro: a narrow, deliberately public view for advertising open jobs
-- outside the app (e.g. a scheduled agent drafting WhatsApp/Facebook posts).
--
-- The `jobs` table itself requires an authenticated Supabase session to
-- read anything — correct, since it also holds client/worker identity and
-- payment fields. This view exposes only the handful of fields that are
-- already meant to be public once a job is open for workers to see, and
-- nothing else (no client_id, client_name, phone numbers, payout/collection
-- fields). It's granted to the `anon` role specifically so an unattended
-- script can read it using only the public anon key — never the
-- service_role key, which must never be handed to anything unattended.
--
-- Run once in the SQL Editor. Safe to re-run.

create or replace view public.public_job_listings as
select id, category, title, description, budget, deadline, status, bidding_enabled, created_at
from public.jobs
where status in ('open', 'bidding');

grant select on public.public_job_listings to anon;

-- Gwaro: add a contact phone number so client and worker can actually reach
-- each other once a job is claimed (to exchange the real files/details —
-- there was previously no way to do this at all). Run once in the SQL
-- Editor; safe to re-run.

alter table public.profiles
  add column if not exists phone text;

-- Gwaro: terms acceptance, account suspension, and closing a real security
-- hole found while building this.
--
-- SECURITY FIX: the existing "users can update their own profile" policy
-- lets a user update ANY column on their own row, including is_admin —
-- meaning any signed-in user could currently call
-- `supabase.from('profiles').update({is_admin: true})` directly against the
-- API and grant themselves admin. This migration closes that, and applies
-- the same protection to the new suspension fields below.
--
-- Run once in the SQL Editor. Safe to re-run.

alter table public.profiles
  add column if not exists agreed_to_terms_at timestamptz,
  add column if not exists suspended boolean not null default false,
  add column if not exists suspension_reason text;

-- Only an admin can change is_admin, suspended, or suspension_reason —
-- everything else on a profile (name, role, phone, ecocash_number,
-- agreed_to_terms_at) a user can still change on themselves as before.
create or replace function public.enforce_profile_admin_fields()
returns trigger
language plpgsql
security definer
as $$
begin
  -- Only restricts real end-user API calls (auth.role() = 'authenticated').
  -- Direct SQL Editor access has no JWT / auth.uid() at all, so it's exempt
  -- — otherwise this would also block the "make yourself an admin" /
  -- "suspend someone" bootstrapping queries below.
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

-- ---------- suspend someone ----------
-- No admin UI for this yet beyond the dispute-linked suspend button in
-- src/App.jsx — for anyone not tied to a specific reported job, suspend by
-- email:
--   update public.profiles set suspended = true,
--     suspension_reason = 'explain why here'
--   where id = (select id from auth.users where email = 'someone@example.com');
--
-- To lift a suspension:
--   update public.profiles set suspended = false, suspension_reason = null
--   where id = (select id from auth.users where email = 'someone@example.com');

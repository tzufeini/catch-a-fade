-- ============================================================================
-- Catch a Fade — barbers without a license can join; "Licensed" is a highlight (Oct 22, 2026)
-- - barbers.is_licensed: true only when the server verified a Florida barber
--   license (DBPR). Customers see it as a "Licensed" highlight on the profile.
-- - Only the server can set verification fields. Before this, a barber could
--   update their own row through the API and mark themselves verified.
-- Run once in Supabase → SQL Editor. Safe to re-run.
-- ============================================================================
alter table public.barbers add column if not exists is_licensed boolean not null default false;

-- barbers approved before today all had their license verified
update public.barbers b set is_licensed = true
  from auth.users u
 where u.id = b.profile_id and not b.is_demo
   and u.raw_app_meta_data #>> '{barber_review,license_check,status}' = 'verified';

-- A barber (or anyone with the public key) can't change these through the API;
-- the server (service role) and the SQL editor still can.
create or replace function public.caf_protect_barber_status() returns trigger
language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.is_verified := false; new.is_licensed := false; new.is_demo := false;
      new.rating := 5.0; new.cuts_completed := 0; new.stripe_account_id := null;
    else
      new.is_verified := old.is_verified; new.is_licensed := old.is_licensed; new.is_demo := old.is_demo;
      new.rating := old.rating; new.cuts_completed := old.cuts_completed; new.stripe_account_id := old.stripe_account_id;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists caf_protect_barber_status on public.barbers;
create trigger caf_protect_barber_status before insert or update on public.barbers
  for each row execute function public.caf_protect_barber_status();

select count(*) filter (where is_licensed) as licensed, count(*) as barbers from public.barbers;

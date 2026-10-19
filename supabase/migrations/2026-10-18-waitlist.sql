-- ============================================================================
-- Catch a Fade — "Notify me when a barber is near" (Oct 18, 2026)
-- Customers who open the app when nobody is online join a waitlist. When a
-- barber goes online nearby, the server pushes them a notification (at most
-- twice a day). Locations are rounded to ~1 km. Only the server reads or
-- writes this table (RLS on, no policies).
-- Run once in Supabase → SQL Editor. Safe to re-run.
-- ============================================================================
create table if not exists public.waitlist (
  customer_id uuid primary key references auth.users(id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  created_at timestamptz not null default now(),
  notified_at timestamptz
);
alter table public.waitlist enable row level security;
create index if not exists waitlist_latlng on public.waitlist (lat, lng);

select count(*) as waitlist_rows from public.waitlist;

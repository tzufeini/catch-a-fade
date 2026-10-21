-- ============================================================================
-- Catch a Fade — "Schedule a cut" (Oct 21, 2026)
-- scheduled_at: the booked time (null = now). reminded_at: when the
-- one-hour-before reminder went out. Run once in Supabase → SQL Editor. Safe to re-run.
-- ============================================================================
alter table public.bookings add column if not exists scheduled_at timestamptz;
alter table public.bookings add column if not exists reminded_at timestamptz;
create index if not exists bookings_scheduled_idx on public.bookings (scheduled_at) where scheduled_at is not null;

select column_name from information_schema.columns
 where table_schema = 'public' and table_name = 'bookings' and column_name in ('scheduled_at', 'reminded_at');

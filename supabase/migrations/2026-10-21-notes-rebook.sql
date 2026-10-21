-- ============================================================================
-- Catch a Fade — "My usual" notes for the barber + rebook reminders (Oct 21, 2026)
-- - bookings.notes: what the customer wants ("skin fade, #1 on the sides…"),
--   sent with the request and shown to that barber only (bookings RLS).
--   Filtered for objectionable language like chat and reviews (Guideline 1.2).
-- - bookings.rebook_reminded_at: when we sent the "time for a fresh cut?" push.
-- Run once in Supabase → SQL Editor. Safe to re-run.
-- ============================================================================
alter table public.bookings add column if not exists notes text;
alter table public.bookings add column if not exists rebook_reminded_at timestamptz;

-- the same language filter as messages and reviews, for any text column
create or replace function public.caf_block_objectionable_col() returns trigger
language plpgsql as $$
begin
  if public.caf_is_objectionable(to_jsonb(new) ->> TG_ARGV[0]) then
    raise exception 'This contains language that isn''t allowed on Catch a Fade.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists caf_filter_booking_notes on public.bookings;
create trigger caf_filter_booking_notes before insert or update of notes on public.bookings
  for each row execute function public.caf_block_objectionable_col('notes');

select column_name from information_schema.columns
 where table_schema = 'public' and table_name = 'bookings' and column_name in ('notes', 'rebook_reminded_at');

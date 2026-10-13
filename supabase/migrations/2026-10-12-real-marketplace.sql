-- ============================================================================
-- Catch a Fade — real marketplace (Oct 2026)
-- Replaces the simulated dispatch with a real barber-side flow:
--   customer requests → barber accepts → en route → arrived → PIN → completed.
-- Run once in Supabase → SQL Editor. Safe to re-run.
-- ============================================================================

-- 1. Remove the seeded test barbers (accounts on the fake .test domain).
--    Cascades to their profiles, barber rows, services and locations.
delete from auth.users where email like '%@catchafade.test';

-- 2. Demo barber flag. A demo barber is only ever shown to the App Review
--    account, so Apple can test the full flow; real customers never see it.
alter table public.barbers add column if not exists is_demo boolean not null default false;

-- 3. Booking statuses: add 'declined' (barber said no) and 'expired' (no answer).
alter table public.bookings drop constraint if exists bookings_status_check;
alter table public.bookings add constraint bookings_status_check
  check (status in ('requested','accepted','en_route','arrived','in_progress',
                    'completed','cancelled','declined','expired','no_show'));
alter table public.bookings add column if not exists service_name text;
alter table public.bookings add column if not exists accepted_at timestamptz;
alter table public.bookings add column if not exists completed_at timestamptz;
alter table public.bookings add column if not exists cancel_fee_cents int not null default 0;

-- Bookings are created and moved through their lifecycle by the server (it
-- verifies the payment hold and the PIN), never directly by the app — so a
-- client can't mark its own booking "completed" or skip the payment.
drop policy if exists bookings_insert on public.bookings;
drop policy if exists bookings_update on public.bookings;

-- 4. In-trip chat between the customer and their barber.
create table if not exists public.messages (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null references public.bookings(id) on delete cascade,
  sender_id   uuid not null references public.profiles(id) on delete cascade,
  body        text not null check (char_length(body) between 1 and 2000),
  created_at  timestamptz not null default now()
);
create index if not exists messages_booking_idx on public.messages(booking_id, created_at);
alter table public.messages enable row level security;

create or replace function public.in_booking(bk uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.bookings k
                where k.id = bk and (k.customer_id = auth.uid() or public.owns_barber(k.barber_id)));
$$;
drop policy if exists messages_read   on public.messages;
drop policy if exists messages_insert on public.messages;
create policy messages_read   on public.messages for select using (public.in_booking(booking_id));
create policy messages_insert on public.messages for insert
  with check (sender_id = auth.uid() and public.in_booking(booking_id));

-- 5. Keep each barber's rating = the average of their real reviews.
create or replace function public.refresh_barber_rating()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.barbers b
     set rating = coalesce((select round(avg(r.rating)::numeric, 1) from public.reviews r where r.barber_id = b.id), 5.0)
   where b.id = new.barber_id;
  return new;
end; $$;
drop trigger if exists reviews_refresh_rating on public.reviews;
create trigger reviews_refresh_rating after insert on public.reviews
  for each row execute function public.refresh_barber_rating();

-- 6. Realtime: bookings + locations were already published; add chat.
do $$
begin
  begin execute 'alter publication supabase_realtime add table public.messages'; exception when others then null; end;
  begin execute 'alter publication supabase_realtime add table public.bookings'; exception when others then null; end;
  begin execute 'alter publication supabase_realtime add table public.barber_locations'; exception when others then null; end;
end $$;

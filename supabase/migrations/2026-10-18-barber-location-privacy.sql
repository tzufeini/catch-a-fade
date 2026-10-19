-- ============================================================================
-- Catch a Fade — barber location privacy (Oct 18, 2026)
-- 1. Live GPS (barber_locations) was readable by ANY signed-in user. Now only
--    the barber and the customer of an active appointment with them can see it.
-- 2. barbers.home_lat/home_lng (the geocoded sign-up address, then the last
--    position while online) was public to the centimetre. It is now stored
--    rounded to ~1 km: enough for distance and the map, never a house.
-- Older app versions keep working: they read the same columns.
-- Run once in Supabase → SQL Editor. Safe to re-run.
-- ============================================================================

-- 1. live location: the barber, or the customer they're on an appointment with
create or replace function public.tracks_barber(bid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.bookings b
                where b.barber_id = bid and b.customer_id = auth.uid()
                  and b.status in ('accepted', 'en_route', 'arrived', 'in_progress'));
$$;
drop policy if exists barber_loc_read on public.barber_locations;
create policy barber_loc_read on public.barber_locations for select
  using (public.owns_barber(barber_id) or public.tracks_barber(barber_id));

-- 2. saved location: rounded to 2 decimals (~1 km) on every write
create or replace function public.caf_round_barber_home() returns trigger
language plpgsql as $$
begin
  if new.home_lat is not null then new.home_lat := round(new.home_lat::numeric, 2)::double precision; end if;
  if new.home_lng is not null then new.home_lng := round(new.home_lng::numeric, 2)::double precision; end if;
  return new;
end;
$$;
drop trigger if exists caf_round_barber_home on public.barbers;
create trigger caf_round_barber_home before insert or update of home_lat, home_lng on public.barbers
  for each row execute function public.caf_round_barber_home();
update public.barbers set home_lat = home_lat, home_lng = home_lng where home_lat is not null;

select id, home_lat, home_lng from public.barbers;

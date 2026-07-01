-- ============================================================================
-- Catch a Fade — database schema
-- Run this ONCE in the Supabase dashboard:  SQL Editor → New query → paste → Run
-- Safe to re-run (uses IF NOT EXISTS / OR REPLACE).
-- ============================================================================

-- ---------- PROFILES (one row per signed-up user; extends auth.users) --------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  role        text not null default 'customer' check (role in ('customer','barber')),
  full_name   text,
  phone       text,
  avatar_url  text,
  stripe_customer_id text,                 -- Stripe customer (saved cards)
  created_at  timestamptz not null default now()
);

-- ---------- BARBERS (extra data for users whose role = 'barber') -------------
create table if not exists public.barbers (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null unique references public.profiles(id) on delete cascade,
  bio          text,
  vehicle      text,
  home_lat     double precision,
  home_lng     double precision,
  rating       numeric(2,1) not null default 5.0,
  cuts_completed int not null default 0,
  is_verified  boolean not null default false,   -- passed background check
  is_available boolean not null default false,   -- currently taking jobs
  stripe_account_id text,                          -- Stripe Connect account (payouts)
  created_at   timestamptz not null default now()
);

-- ---------- SERVICES (each barber's offerings + prices) ----------------------
create table if not exists public.services (
  id           uuid primary key default gen_random_uuid(),
  barber_id    uuid not null references public.barbers(id) on delete cascade,
  name         text not null,
  price_cents  int  not null check (price_cents >= 0),
  duration_min int  not null default 45,
  created_at   timestamptz not null default now()
);

-- ---------- BOOKINGS (the core transaction) ----------------------------------
create table if not exists public.bookings (
  id                 uuid primary key default gen_random_uuid(),
  customer_id        uuid not null references public.profiles(id) on delete cascade,
  barber_id          uuid references public.barbers(id) on delete set null,
  service_id         uuid references public.services(id) on delete set null,
  status             text not null default 'requested'
                       check (status in ('requested','accepted','en_route','arrived','in_progress','completed','cancelled','no_show')),
  service_price_cents int not null default 0,    -- barber's price
  fee_cents          int not null default 0,     -- platform fee (Uber-style 25%)
  total_cents        int not null default 0,     -- what the customer pays
  address            text,
  lat                double precision,
  lng                double precision,
  arrival_pin        text,                        -- 4-digit code shown on arrival
  payment_intent_id  text,                        -- Stripe PaymentIntent
  scheduled_at       timestamptz,                 -- null = on-demand / now
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists bookings_customer_idx on public.bookings(customer_id);
create index if not exists bookings_barber_idx   on public.bookings(barber_id);

-- ---------- BARBER LIVE LOCATION (updated frequently; powers tracking) -------
create table if not exists public.barber_locations (
  barber_id  uuid primary key references public.barbers(id) on delete cascade,
  lat        double precision,
  lng        double precision,
  updated_at timestamptz not null default now()
);

-- ---------- REVIEWS ----------------------------------------------------------
create table if not exists public.reviews (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null unique references public.bookings(id) on delete cascade,
  customer_id uuid not null references public.profiles(id) on delete cascade,
  barber_id   uuid not null references public.barbers(id) on delete cascade,
  rating      int  not null check (rating between 1 and 5),
  body        text,
  created_at  timestamptz not null default now()
);

-- ---------- FAVORITES --------------------------------------------------------
create table if not exists public.favorites (
  customer_id uuid not null references public.profiles(id) on delete cascade,
  barber_id   uuid not null references public.barbers(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (customer_id, barber_id)
);

-- ---------- AUTO-CREATE a profile row whenever someone signs up --------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, phone, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.phone,
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
-- ROW-LEVEL SECURITY  (the publishable/app key can only do what these allow)
-- ============================================================================
alter table public.profiles        enable row level security;
alter table public.barbers         enable row level security;
alter table public.services        enable row level security;
alter table public.bookings        enable row level security;
alter table public.barber_locations enable row level security;
alter table public.reviews         enable row level security;
alter table public.favorites       enable row level security;

-- helper: does the current user own this barber row?
create or replace function public.owns_barber(b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.barbers where id = b and profile_id = auth.uid());
$$;

-- PROFILES: read any (it's a marketplace), edit only your own
drop policy if exists profiles_read   on public.profiles;
drop policy if exists profiles_insert on public.profiles;
drop policy if exists profiles_update on public.profiles;
create policy profiles_read   on public.profiles for select using (true);
create policy profiles_insert on public.profiles for insert with check (id = auth.uid());
create policy profiles_update on public.profiles for update using (id = auth.uid());

-- BARBERS: anyone can browse; a barber edits their own row
drop policy if exists barbers_read   on public.barbers;
drop policy if exists barbers_write  on public.barbers;
create policy barbers_read  on public.barbers for select using (true);
create policy barbers_write on public.barbers for all
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- SERVICES: anyone can browse; a barber manages their own
drop policy if exists services_read  on public.services;
drop policy if exists services_write on public.services;
create policy services_read  on public.services for select using (true);
create policy services_write on public.services for all
  using (public.owns_barber(barber_id)) with check (public.owns_barber(barber_id));

-- BOOKINGS: visible to the customer and the assigned barber; customer creates
drop policy if exists bookings_read   on public.bookings;
drop policy if exists bookings_insert on public.bookings;
drop policy if exists bookings_update on public.bookings;
create policy bookings_read   on public.bookings for select
  using (customer_id = auth.uid() or public.owns_barber(barber_id));
create policy bookings_insert on public.bookings for insert with check (customer_id = auth.uid());
create policy bookings_update on public.bookings for update
  using (customer_id = auth.uid() or public.owns_barber(barber_id));

-- BARBER LOCATIONS: any signed-in user can read (for tracking); barber writes own
drop policy if exists barber_loc_read  on public.barber_locations;
drop policy if exists barber_loc_write on public.barber_locations;
create policy barber_loc_read  on public.barber_locations for select using (auth.role() = 'authenticated');
create policy barber_loc_write on public.barber_locations for all
  using (public.owns_barber(barber_id)) with check (public.owns_barber(barber_id));

-- REVIEWS: anyone can read; the customer writes a review for their booking
drop policy if exists reviews_read   on public.reviews;
drop policy if exists reviews_insert on public.reviews;
create policy reviews_read   on public.reviews for select using (true);
create policy reviews_insert on public.reviews for insert with check (customer_id = auth.uid());

-- FAVORITES: each user manages their own
drop policy if exists favorites_all on public.favorites;
create policy favorites_all on public.favorites for all
  using (customer_id = auth.uid()) with check (customer_id = auth.uid());

-- ============================================================================
-- REALTIME — let the app subscribe to live booking + barber-location changes
-- ============================================================================
do $$
begin
  begin execute 'alter publication supabase_realtime add table public.bookings'; exception when others then null; end;
  begin execute 'alter publication supabase_realtime add table public.barber_locations'; exception when others then null; end;
end $$;

-- Done. Tables, security, and realtime are ready.

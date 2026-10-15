-- ============================================================================
-- Catch a Fade — Wait & Save, tips, Live Activities (Oct 15, 2026)
-- Run once in Supabase → SQL Editor. Safe to re-run.
-- ============================================================================

-- Wait & Save: the customer is flexible for up to 2 hours and pays less.
-- A flexible request stays open until flex_until instead of 3 minutes.
alter table public.bookings add column if not exists flex boolean not null default false;
alter table public.bookings add column if not exists flex_until timestamptz;

-- Tips after the cut: 100% goes to the barber (separate Stripe charge).
alter table public.bookings add column if not exists tip_cents int not null default 0;
alter table public.bookings add column if not exists tip_payment_intent_id text;

-- Lock-screen Live Activity: the customer's activity push token, so the server
-- can update "Andre is on the way" while the app is closed.
alter table public.bookings add column if not exists activity_token text;

-- ============================================================================
-- Catch a Fade — pay barbers who worked before connecting payouts (Oct 16, 2026)
-- Earnings from bookings charged before a barber's Stripe account was ready are
-- held by the platform, then transferred once the account is connected. These
-- columns record each transfer so nothing is ever paid twice.
-- Run once in Supabase → SQL Editor. Safe to re-run.
-- ============================================================================
alter table public.bookings add column if not exists payout_transfer_id text;
alter table public.bookings add column if not exists tip_transfer_id text;

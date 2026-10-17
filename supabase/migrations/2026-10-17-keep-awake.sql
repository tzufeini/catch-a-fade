-- ============================================================================
-- Catch a Fade — keep the server awake (Oct 17, 2026)
-- Render's free web service sleeps after 15 idle minutes, and GitHub's scheduled
-- keep-alive only actually runs every few hours. A sleeping server makes the first
-- customer wait ~50 s and pauses booking housekeeping (expiring requests, payouts).
-- The database pings the server every 5 minutes instead; the server's own
-- housekeeping then keeps the database active too.
-- Run once in Supabase → SQL Editor. Safe to re-run.
-- ============================================================================
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule(jobid) from cron.job where jobname = 'caf-keep-server-awake';
select cron.schedule('caf-keep-server-awake', '*/5 * * * *',
  $$ select net.http_get('https://catch-a-fade.onrender.com/api/health?from=cron', timeout_milliseconds := 60000) $$);

select jobname, schedule, active from cron.job where jobname = 'caf-keep-server-awake';

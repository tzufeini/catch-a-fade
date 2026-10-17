-- ============================================================================
-- Catch a Fade — objectionable-content filter (App Review Guideline 1.2)
-- Reviews and chat messages are written straight from the app, so the filter
-- lives in the database: anything matching the blocked patterns is rejected
-- before it's stored. Reporting and blocking are handled in the app.
-- Run once in Supabase → SQL Editor. Safe to re-run.
-- ============================================================================

create or replace function public.caf_is_objectionable(t text) returns boolean
language sql immutable as $$
  select coalesce(t, '') ~* (
    -- slurs (racial, ethnic, homophobic, ableist)
    '\m(n[i1!]gg(er|a|az|uh)s?|f[a@]gg?(ot|it)?s?|ch[i1]nks?|sp[i1]cs?|k[i1]kes?|wetbacks?|tr[a@]nn(y|ies)|retards?|g[o0]oks?|coons?|dykes?|beaners?|raghead)\M'
    -- sexual content
    || '|\m(porn|nudes?|blowjobs?|handjobs?|d[i1]ck ?pics?|send nudes|onlyfans|cum ?shot|pussy|c[u\*]nt)\M'
    -- threats of violence
    || '|\m(i( wi)?ll|gonna|going to) (kill|murder|shoot|stab|rape) (you|u|ya)\M'
    || '|\mkill (yo)?urself\M|\mkys\M'
  );
$$;

create or replace function public.caf_block_objectionable() returns trigger
language plpgsql as $$
begin
  if public.caf_is_objectionable(new.body) then
    raise exception 'This contains language that isn''t allowed on Catch a Fade.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists caf_filter_messages on public.messages;
create trigger caf_filter_messages before insert or update of body on public.messages
  for each row execute function public.caf_block_objectionable();

drop trigger if exists caf_filter_reviews on public.reviews;
create trigger caf_filter_reviews before insert or update of body on public.reviews
  for each row execute function public.caf_block_objectionable();

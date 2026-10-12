-- Phase 3/7: RLS deny-all for anon.
-- STATUS: apply-ready as of Phase 7 (no web page reads Supabase directly
-- anymore — every browser read goes through the API service key via the
-- same-origin proxy). Applying this closes the last Critical finding of
-- docs/AUDIT.md (anon + service key from one project).
--
-- Verify after applying:
--   1) anon SELECT on every table returns 0 rows / permission denied
--   2) the desk still works end-to-end (web → proxy → API → service key)
--   3) the external producer still ingests via POST /v1/signals/ingest

alter table signals enable row level security;
alter table analysed_signals enable row level security;
alter table news_signals enable row level security;
alter table notifications enable row level security;
alter table app_settings enable row level security;
alter table calendar_events enable row level security;
alter table calendar_fetch_attempts enable row level security;
alter table av_usage enable row level security;
alter table openrouter_usage enable row level security;

-- Intentionally NO permissive policies: anon/authenticated get nothing.
-- (Service-role bypasses RLS by design; no policy needed for the API.)

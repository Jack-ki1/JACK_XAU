-- Phase 3: RLS deny-all for anon. APPLY GATE: do NOT apply until Phase 5
-- moves the last direct browser reads (pages still use the anon client for
-- signals/notifications/calendar in Phase 3; deny-all would blank them).
-- From Phase 5 on, only the API service key touches these tables.
--
-- After applying, verify: anon SELECT on every table returns 0 rows, while
-- the service key still reads/writes.

alter table signals enable row level security;
alter table analysed_signals enable row level security;
alter table news_signals enable row level security;
alter table notifications enable row level security;
alter table app_settings enable row level security;
alter table calendar_events enable row level security;
alter table calendar_fetch_attempts enable row level security;
alter table av_usage enable row level security;
alter table openrouter_usage enable row level security;

-- Intentionally NO permissive policies: anon gets nothing.
-- (Service-role bypasses RLS by design; no policy needed for the API.)

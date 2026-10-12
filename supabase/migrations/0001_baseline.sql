-- Phase 3: baseline schema as reverse-engineered in Phase 0 (docs/DATA_MODEL.md).
-- Verify against the live project before applying.

-- JACK TRADE baseline — recreates schema as reverse-engineered in Phase 0.
-- MUST be verified against the live project before apply, especially RLS.
-- Open items: exact numeric precisions, defaults, indexes, RLS policies.

create table signals (
  id bigint generated always as identity primary key,
  signal_id text unique not null,
  symbol text not null default 'XAUUSD',
  direction text not null,
  signal_type text,
  path text,
  entry numeric,
  exits jsonb not null default '{}',
  risk jsonb not null default '{}',
  grade jsonb not null default '{}',
  htf_confluence jsonb not null default '[]',
  htf_rung text,
  execution_tf text,
  manual_entry_filter jsonb,
  window_info jsonb,
  signal_version text,
  status text not null default 'open',
  final_outcome text,
  sl_hit boolean, tp_hit boolean,
  resolved_at timestamptz,
  time_to_resolution text,
  created_at timestamptz not null default now(),
  last_checked_at timestamptz,
  ai_reviewed_at timestamptz
);

create table analysed_signals (
  id bigint generated always as identity primary key,
  signal_id text not null references signals(signal_id),
  direction text,
  llm_model text not null,
  verdict text not null,
  llm_entry numeric, llm_sl numeric, llm_tp numeric, llm_rr numeric,
  reasoning text not null default '',
  status text not null default 'open',
  final_outcome text,
  resolved_at timestamptz,
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (signal_id)
);

create table news_signals (
  id bigint generated always as identity primary key,
  signal_id text not null,
  direction text,
  triggering_event text,
  news_summary text,
  llm_model text not null,
  verdict text not null,
  llm_entry numeric, llm_sl numeric, llm_tp numeric, llm_rr numeric,
  reasoning text not null default '',
  status text not null default 'open',
  final_outcome text,
  resolved_at timestamptz,
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (signal_id)
);

create table notifications (
  id bigint generated always as identity primary key,
  type text not null,
  message text not null,
  detail text,
  created_at timestamptz not null default now()
);

create table app_settings (
  key text primary key,
  value jsonb,
  updated_at timestamptz not null default now()
);

create table calendar_events (
  id bigint generated always as identity primary key,
  event_time timestamptz not null,
  currency text, event_name text, impact text,
  fetched_for_date date
);
create index on calendar_events (event_time);

create table calendar_fetch_attempts (
  attempt_date date primary key,
  events_extracted int not null default 0
);

create table av_usage (
  usage_date date not null,
  key_name text not null default '',
  count int not null default 0,
  primary key (usage_date, key_name)
);

create table openrouter_usage (
  usage_date date not null,
  key_name text not null,
  count int not null default 0,
  primary key (usage_date, key_name)
);

-- RLS: target is deny-all for anon (Phase 3, API owns the service key).
-- Verify current live policies BEFORE applying: the web client reads these
-- tables directly today and will break the moment deny-all lands, by design.
-- alter table ... enable row level security; (no permissive policies)

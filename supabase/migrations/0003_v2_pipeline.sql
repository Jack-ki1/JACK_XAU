-- Phase 3/4 (v2): data foundation + signal pipeline.
-- Candle store, immutable signal event log, provider credit ledger,
-- AI audit trail, journal, alert dedupe, server-side read state.
-- Apply after 0001 (and ideally after 0002 RLS deny-all).

-- ===== Candles: our own store (backtests read ONLY from here) =========
create table if not exists candles (
  symbol text not null default 'XAUUSD',
  tf text not null,                 -- '1m' | '5m' | '15m' | '1h' | '4h' | '1d'
  ts_utc timestamptz not null,
  open numeric not null,
  high numeric not null,
  low numeric not null,
  close numeric not null,
  tick_volume bigint,               -- spot gold volume is TICK volume, not real
  source text not null default 'twelvedata',
  primary key (symbol, tf, ts_utc)
);
create index if not exists candles_tf_ts on candles (tf, ts_utc desc);

-- ===== Signal events: immutable log; signals row is a projection =======
create table if not exists signal_events (
  id bigint generated always as identity primary key,
  signal_id text not null,
  ts timestamptz not null default now(),
  type text not null,               -- created|opened|tp1|tp2|tp3|closed|stopped|expired|cancelled|analysed|news_flagged|stale|rejected
  payload jsonb not null default '{}'
);
create index if not exists signal_events_sig_ts on signal_events (signal_id, ts);

create table if not exists ingest_rejections (
  id bigint generated always as identity primary key,
  received_at timestamptz not null default now(),
  reason text not null,
  body jsonb
);

-- signals: v2 columns (strategy versioning, spread, ladder projection)
alter table signals add column if not exists strategy_version text;
alter table signals add column if not exists param_hash text;
alter table signals add column if not exists entry_spread numeric;
alter table signals add column if not exists ladder text not null default 'none';
alter table signals add column if not exists state text not null default 'open';

-- ===== Provider credit ledger (per-minute window + per-day) ============
create table if not exists provider_credits (
  bucket_start timestamptz not null,
  provider text not null,          -- 'twelvedata' | 'groq' | ...
  key_slot text not null,          -- 'resolution' | 'backtest' | 'analysed_signals' | ...
  credits int not null default 0,
  primary key (bucket_start, provider, key_slot)
);

-- ===== AI audit trail (v2 C9.2) ========================================
create table if not exists ai_runs (
  id bigint generated always as identity primary key,
  signal_id text,
  prompt_version text not null,
  model text not null,
  provider text not null default 'groq',
  input_snapshot jsonb not null default '{}',
  output jsonb,
  latency_ms int,
  tokens int,
  cost_estimate numeric,
  created_at timestamptz not null default now()
);
create index if not exists ai_runs_signal on ai_runs (signal_id, created_at desc);

-- ===== Journal (v2 C8) ==================================================
create table if not exists signal_journal (
  signal_id text primary key,
  notes text not null default '',
  tags jsonb not null default '[]',
  checklist jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

-- ===== Alerts: rules + deduped events + server read-state (v2 C10) =====
create table if not exists alert_rules (
  id bigint generated always as identity primary key,
  name text not null,
  kind text not null,              -- price_cross|level_break|news_tminus|signal_state|session|rule_breach|feed_stale|job_failed
  config jsonb not null default '{}',
  enabled boolean not null default true
);
create table if not exists alert_events (
  id bigint generated always as identity primary key,
  rule_id bigint references alert_rules(id) on delete set null,
  dedupe_key text not null,
  message text not null,
  detail jsonb,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  unique (dedupe_key)
);
create table if not exists desk_read_state (
  key text primary key,            -- 'signals' | 'analysed_signals' | 'notifications' | ...
  last_read_at timestamptz not null default now()
);

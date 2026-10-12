# JACK TRADE — Data model (reverse-engineered, Phase 0)

Everything below is inferred from code reads (no live Supabase access in
this environment). Columns marked **[inferred]** are used by the code but
their DDL (type, nullability, default) is guessed. Columns marked
**[enda]** are written by code paths outside this repo (the external
`main.py` ingest). Writers/readers cite file:line.

> Note on the brief §2.3 request for `supabase/migrations/0001_baseline.sql`:
> per the Phase 0 rule ("no source changes except the `pre-transform` tag
> and the `docs/` audit files"), the baseline DDL is proposed as §8 of
> *this document*, not as a separate migration file. Phase 1 will create
> `supabase/migrations/0001_baseline.sql` from it after verifying RLS
> against the live project.

## 1. `signals` — the core feed (written externally, resolved internally)

| Column | Type (as used) | Writer | Readers |
|---|---|---|---|
| `id` | int PK **[inferred]** | — (DB) | all pages (keys, updates by `id`) |
| `signal_id` | text unique **[inferred]** | **[enda]** `main.py` | join key everywhere |
| `symbol` | text (`XAUUSD`) | **[enda]** | signals:157, analysed merge |
| `direction` | `buy`/`sell` (+ legacy `long`) | **[enda]** | resolvers, blotter |
| `signal_type` | `sniper_confirmation`/`precision` | **[enda]** | filters, engine parity |
| `path` | `setup_a`/`setup_b`/null | **[enda]** | badges, patterns |
| `entry` | numeric | **[enda]** | SL/TP math |
| `exits` | jsonb `{sl, tp, tp1?, tp2?, tp3?, rr_selected?}` | **[enda]** | `check-open-signals:189-191`; blotter `getExits` (signals:35-40) |
| `risk` | jsonb `{sl_distance, tp_distance, tp_rr}` | **[enda]** | `getRiskReward` (signals:42-55) |
| `grade` | jsonb `{value, of, basis?}` | **[enda]** | badges, performance |
| `htf_confluence` | jsonb array `{tf, state, fade_active?, rejections?}` | **[enda]** | overview:49-52, signals detail |
| `htf_rung` | text (`15`…`12M`) | **[enda]** | performance rung breakdown |
| `execution_tf` | text (`1`/`3`/`5`) | **[enda]** | resolver interval map (`check-open-signals:61`) |
| `manual_entry_filter` | jsonb `{applicable, bias_1h, zone_tapped, discount_premium, session_open, doji_or_rejection}` | **[enda]** | signals detail, patterns |
| `window_info` | jsonb `{upper_breach_count, upper_open, lower_breach_count, lower_open}` | **[enda]** | signals detail (signals:261-266) |
| `signal_version` | text | **[enda]** | signals detail footer |
| `status` | `open`/`closed` | **[enda]**=`open`; resolvers→`closed` | all |
| `final_outcome` | `tp_hit`/`stopped_out`/null | resolvers | performance, analysis |
| `sl_hit`, `tp_hit` | bool | `check-open-signals:203-212` | badges |
| `resolved_at` | timestamptz | resolvers | analysis, performance |
| `time_to_resolution` | text (`"N seconds"`) | `check-open-signals:203` | display only |
| `created_at` | timestamptz | DB default **[inferred]** | ordering, session bucketing |
| `last_checked_at` | timestamptz | resolvers (cursor) | incremental fetch |
| `ai_reviewed_at` | timestamptz | `analysis/route.ts:198` | "reviewed" filter |

## 2. `analysed_signals` + 3. `news_signals` — LLM verdicts + own resolution

Both tables share the verdict shape; `news_signals` adds event context.

| Column | Writer |
|---|---|
| `id` | DB |
| `signal_id` (join → `signals.signal_id`) | `analyseOneSignal` (`analyseSignal.ts:292-304`); news variant (`process-news-signals:242-255`) |
| `direction` | copied from source signal (nullable — resolvers error out if missing: `check-analysed-signals:183-186`) |
| `llm_model` | `openai/gpt-oss-120b` (both features) |
| `verdict` | `valid`/`invalid` |
| `llm_entry`, `llm_sl` | copied from source (`llm_sl` always equals Pine's SL — key design invariant, see `check-analysed-signals:10-23`) |
| `llm_tp`, `llm_rr` | recomputed from `preferred_rr` when `invalid` (`analyseSignal.ts:284-290`) |
| `reasoning` | LLM 1–2 sentences |
| `triggering_event`, `news_summary` | news table only |
| `status` (`open`/`closed`), `final_outcome`, `resolved_at`, `last_checked_at` | resolvers (`check-analysed-signals`, `check-news-signals`) |
| `created_at` | DB default **[inferred]** |

Resolution semantics: `valid` rows sync for free from the source signal's
outcome (zero API cost); only `invalid` rows (different TP) are walked
against 1-minute bars. Same in both resolvers.

## 4. `notifications` — append-only event log

| Column | Writer |
|---|---|
| `id` | DB |
| `type` | `session_change`, `news_live`, `session_upcoming`, `market_status`, `price_level_break` (`check-transitions:66-157`) |
| `message` | human-readable sentence |
| `detail` | nullable context |
| `created_at` | DB default **[inferred]** |

Read by Topbar (`Topbar.tsx:85-92`, latest 20) + realtime INSERT subscription.
Never updated/deleted by code. No retention policy observed — grows forever;
Phase 3 should add pruning.

## 5. `app_settings` — key/value store (all values read as text-or-JSON)

Keys observed in code: `price_levels_cache_date`, `prev_day_high`,
`prev_day_low`, `prev_week_high`, `prev_week_low`,
`notified_daily_high_break`, `notified_daily_low_break`,
`notified_weekly_high_break`, `notified_weekly_low_break`
(`priceLevels.ts:69-120`); `last_known_session`,
`last_known_news_active`, `last_warned_upcoming_session`,
`last_known_market_open` (`check-transitions:69-139`);
`analysed_signals_enabled` (`toggle-analysed-signals`). Row shape:
`(key text PK, value ?, updated_at timestamptz?)` — `updated_at` is written
by the toggle route (`:33`) so it exists **[inferred]**.

## 6. Calendar + usage tables

- `calendar_events(event_time, currency, event_name, impact, fetched_for_date)` — written by `fetch-calendar:106-108`, read by news-window checks (`-30/+15 min` in transitions, `-30/+15` in process-news, `-30/+15`… note `news-window-status` uses −30/+15 while its comment says PRE 15/POST 30 — consistent in effect, naming only) and news-signals page (today UTC).
- `calendar_fetch_attempts(attempt_date PK, events_extracted)` — daily idempotency guard.
- `av_usage(usage_date, key_name, count)` — Twelve Data quota; `key_name` ∈ {`resolution`, `backtest`, `analysed_signals`}. NOTE: `backtest/route.ts:19-25` reads/writes **without** `key_name`, so backtest usage shares one global row while everything else is keyed — real inconsistency, fix in Phase 3.
- `openrouter_usage(usage_date, key_name, count)` — LLM quota; name retained after vendor switch (deliberate, `analysed-signals/page.tsx:119-122`); `key_name` ∈ {`analysed_signals`, `news_signals`}.

## 7. Environment variables (complete list from grep)

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_KEY`, `CRON_SECRET`, `TWELVEDATA_API_KEY` (backtest +
legacy analysis spot), `TWELVEDATA_API_KEY_RESOLUTION` (all three resolvers
+ price levels), `TWELVEDATA_API_KEY_ANALYSED_SIGNALS` (LLM price context),
`GROQ_API_KEY_ANALYSED_SIGNALS`, `GROQ_API_KEY_NEWS_SIGNALS`, `GROQ_API_KEY`
(legacy analysis route — third LLM key), `JBLANKED_API_KEY`,
`FINNHUB_API_KEY`. No `.env.example` exists — Phase 1 deliverable.
Legacy `GROQ_API_KEY` + `TWELVEDATA_API_KEY` reuse in `analysis/route.ts`
should be consolidated or deleted with that route in Phase 3.

## 8. Proposed baseline migration (to become `supabase/migrations/0001_baseline.sql` in Phase 1)

```sql
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
```

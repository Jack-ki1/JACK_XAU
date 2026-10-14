# ADR 0003 — v2 pipeline, honesty layer, and desk services

Date: 2026-10-13 (v2 transform). Status: accepted.

## Context

v1 proved the desk (signals → analysis → resolution → performance). The v2
brief demands: signal lifecycle correctness (R1), honest backtest reporting
(R4/R6), an AI audit trail (R9), desk-side alerts/read-state, live-account
visibility without trusting the browser, and a calmer visual system (B-*</%).

## Decision

* **Signal state machine in the shared engine** (`packages/engine/src/pipeline.ts`):
  `created→open→tp1→tp2→tp3→closed/stopped/expired/cancelled` with zod-validated
  transitions, an append-only `signal_events` log, and pessimistic same-bar
  resolution via the bar magnifier (a bar that touches both TP and SL counts as
  the LOSS). Resolution state is derived (`stateFromRow`), never double-booked.
* **Candle store over live-provider backtests** (`candles` table + `backfillCandles`
  job): gaps/outliers are detected at ingest, standard-ladder backfills run on a
  6h job, and backtests read our store first — provider credit spend and
  rate-limit flakiness stay out of research runs.
* **Honest stats as first-class fields** (`honestStats.ts`): Wilson CI on win
  rate, expectancy in R, profit factor, SQN, Sharpe/Sortino, small-sample flags.
  Golden backtest snapshot regenerated whenever stats change — silent
  regressions fail CI.
* **ai_runs append-only audit trail**: every Groq call (both verdict paths)
  logs `{prompt_version, model, input_snapshot, output, latency_ms, tokens}`,
  including failures. Prompts live in `apps/api/src/prompts/verdict.ts` with a
  version constant — prompt edits bump the version, so runs stay attributable.
  Logging is best-effort and never fails an analysis.
* **Alerts evaluated server-side** (`evaluateAlerts` job, 5m): system
  conditions (feed_stale, job_failed) always run; config rules
  (news_tminus, price_cross) come from `alert_rules`. Every event is deduped by
  `dedupe_key` (unique constraint) so a 5-minute job cannot spam a 24-hour
  condition.
* **Server-side read-state** (`desk_read_state`): the unseen badge hydrates from
  `PUT /v1/desk/read-state/notifications` on open — refreshes don't re-flag.
* **MT5 bridge is read-only and append-only** (`tools/mt5-bridge`, migration
  0004): the Windows script polls terminal account/positions into
  `mt5_snapshots`. The API never places orders; a missing bridge degrades one
  panel, nothing else.
* **Widget grid without a drag/resize library**: named layouts (Live/Review/
  Research) persist show/hide + order in `lib/layouts.ts` (zustand + localStorage).
  CSS grid handles layout. Revisit a dnd library only if reordering becomes a
  real pain — every drag lib costs bundle, a11y and hydration fights.
* **Theme migration, not theme deletion**: v1 themes map to the v2 palette
  (`midnight/graphite→aurora`), legacy CSS variable aliases keep v1 components
  compiling, and the no-FOUC boot script performs the same migration
  synchronously. Contrast gate rewritten for the new theme pairs before any
  component adopted them.

## Consequences

* Old signals without events still render: `stateFromRow` falls back to
  status/outcome fields, so migration 0003 is additive and safe.
* Pessimistic magnifier resolution can understate wins vs TradingView's
  strategy tester — `tools/parity` exists to measure the gap with exported CSV
  rather than argue about it.
* Append-only tables (`signal_events`, `ai_runs`, `alert_events`,
  `mt5_snapshots`) grow forever — acceptable at single-user volume; prune with
  a scheduled `DELETE ... older than 180d` if ever needed.
* Alert evaluation covers 4 of 8 declared rule kinds; the rest
  (level_break, signal_state, session, rule_breach) are schema-ready and
  evaluator work remains.

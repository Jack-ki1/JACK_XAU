# RUNBOOK — JACK TRADE

Single-user XAUUSD desk. Two processes, one repo, zero secrets in git.

## Quick start (local)

```bash
npm ci
cp .env.example .env.local          # optional: everything boots without it
npm run dev                         # web  → http://localhost:3000
npm run dev:api                     # api  → http://127.0.0.1:3101
```

- Web without the API: pages render, `/api/v1/*` forwarders return
  documented degraded payloads (news inactive, demo ribbon, zero stats).
- API without env: `/v1/health` → `auth_disabled`, jobs idle, repo reads
  return empty, candles fall back to `SIMULATED` bars (clearly labelled).

## Quick start (Docker)

```bash
docker compose up --build            # web :3000, api :3101
```

## Architecture

```
browser ── same-origin /api/v1/* ──► web (Next 16) ── injects API_TOKEN ──► api (Fastify :3101)
                                                                            ├─ jobs scheduler (9 locked jobs)
                                                                            ├─ providers: TwelveData / Groq / calendar / Finnhub
                                                                            ├─ repositories ──► Supabase (service key)
                                                                            └─ SSE /v1/stream ──► browser (DeskEvents)
external producer (main.py) ── POST /v1/signals/ingest (Bearer API_TOKEN or ?secret=CRON_SECRET)
Windows MT5 bridge (tools/mt5-bridge) ── POST /v1/mt5/sync (Bearer API_TOKEN, read-only)
```

- **Secrets live only in the API** (and the two server-only web vars
  `API_TOKEN`/`API_BASE_URL`). Nothing `NEXT_PUBLIC_` is sensitive.
- **RLS**: `supabase/migrations/0002_rls_deny_all.sql` is apply-ready —
  the web never touches Supabase directly anymore. Apply it, then verify
  anon reads return nothing while the desk keeps working.

## Secrets matrix

| Where | Var | Purpose |
|---|---|---|
| api + web | `API_TOKEN` | machine bearer for proxy ↔ api |
| api + web | `CRON_SECRET` | legacy cron query param + fallback |
| api | `NEXT_PUBLIC_SUPABASE_URL` | project URL (api reads it as plain env) |
| api | `SUPABASE_SERVICE_KEY` | service-role — **never** in web |
| api | `TWELVEDATA_API_KEY*` (×3) | backtest / resolution / analysis feeds |
| api | `GROQ_API_KEY_*` (×2) | analysed + news LLM verdicts |
| api | `JBLANKED_API_KEY`, `FINNHUB_API_KEY` | calendar, headlines |
| web | `NEXT_PUBLIC_SUPABASE_URL` | demo-mode flag only (presence ⇒ live) |

## Jobs (in-process, locked, idempotent)

`signalTransitions` (5m), `checkOpenSignals` (10m), `checkAnalysedSignals`
(10m), `checkNewsSignals` (10m), `analysePending` (10m), `newsSignals` (5m),
`refreshCalendar` (24h), `backfillCandles` (6h), `evaluateAlerts` (5m) —
see `apps/api/src/jobs/scheduler.ts`.

Manual trigger: `POST /v1/jobs/:name` with machine secret.
External-cron fallback (if you prefer system cron):
`curl -H "Authorization: Bearer $API_TOKEN" -X POST http://127.0.0.1:3101/v1/jobs/check_open`

### Legacy cron URLs (deprecated, still forwarded)

`/api/check-open-signals`, `/api/check-analysed-signals`,
`/api/check-news-signals`, `/api/check-transitions`,
`/api/process-news-signals`, `/api/analyse-signals`,
`/api/fetch-calendar`, `/api/analyse-signal-now`,
`/api/closed-signal-analysis`, `/api/news-window-status`,
`/api/settings/toggle-analysed-signals`

These thin forwarders keep any already-scheduled external cron working.
Migrate to the `/v1/*` equivalents and delete them when convenient.

## v2 desk endpoints

All under `/v1/*` with the machine bearer (except `/v1/health`).

| Area | Endpoints |
|---|---|
| Candle store | `GET /v1/ops/candles` (freshness), `POST /v1/ops/candles/backfill?days=7` |
| Credit ledger | `GET /v1/ops/credits` (per-key day/minute windows) |
| AI audit trail | `GET /v1/ops/ai-runs?signal_id=&limit=` — prompt_version, model, latency, tokens per run (success **and** failure) |
| Journal | `GET /v1/journal`, `GET/PUT /v1/journal/:signalId` (zod-validated: notes/tags/checklist) |
| Signal events | `GET /v1/signals/:id/events` — state-machine transition log |
| Read state | `GET/PUT /v1/desk/read-state/:key` — unread badges survive a refresh |
| Alerts | `GET/POST /v1/alerts/rules`, `PATCH/DELETE /v1/alerts/rules/:id`, `GET /v1/alerts/events`, `POST /v1/alerts/evaluate` |
| MT5 bridge | `POST /v1/mt5/sync`, `GET /v1/mt5/status` (see `tools/mt5-bridge/README.md`) |

## Degradation matrix

`GET /v1/health` returns a `degradation` object: per-subsystem
`ok | degraded | down` plus what still works. Summary:

| Down / degraded | What still works |
|---|---|
| No Supabase creds | Demo-mode UI, /v1/health, simulated candles; ingest/journal/alerts disabled |
| No TwelveData key | Simulated candles (labelled SIMULATED); resolution sweep off; backtest 503 |
| No Groq key | Signals resolve deterministically; LLM verdicts skipped (ai_runs untouched) |
| No calendar/Finnhub key | News verdicts off; calendar-only risk windows |
| `JOBS_ENABLED=false` | All jobs via manual `POST /v1/jobs/:name` |
| No MT5 bridge | Everything except the live-account mirror on `/v1/mt5/status` |

Overall `status` in the same payload: `ok` (all green), `degraded` (any
degraded), `down` (any hard-down dependency).

## Producer (TradingView → desk)

```bash
curl -X POST http://HOST:3101/v1/signals/ingest \
  -H "Authorization: Bearer $API_TOKEN" \
  -H 'Content-Type: application/json' -d @signal.json
```
Idempotent on `signal_id`. Emits SSE `signal_ingested`.

## Verification gates (also CI)

```bash
npm run typecheck        # web + api + engine + shared
npm run lint             # 0 errors
npm run check:contrast   # WCAG AA token gate (3 themes)
npm run test             # engine vitest (101 tests, golden backtest snapshot)
npm run build            # must pass with NO env (demo-mode boot)
```

## Troubleshooting

- **Blank badges / 503 from /api/v1/** — API not running or `API_BASE_URL`
  wrong; start `npm run dev:api`.
- **401 from /v1/** — `API_TOKEN`/`CRON_SECRET` mismatch between web and api.
- **Chart says SIMULATED** — no `TWELVEDATA_API_KEY_RESOLUTION`.
- **Backtest 503 `backtest_disabled`** — no `TWELVEDATA_API_KEY` (or kill
  switch `BACKTEST_ENABLED=false`).
- **SSE icon shows polling** — proxy blocked buffering; check
  `X-Accel-Buffering` reverse-proxy settings.
- **Applying RLS** — run migration `0002`, verify with a anon-key curl
  (must return 0 rows) and a desk reload (must still work).

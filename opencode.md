# opencode.md — What we did here (session record for future chats)

Repo: `Jack-ki1/JACK_XAU` (local `/home/jackson11/projects/trading/GOLD_TRADING_TOOL`)
Product: **JACK TRADE** — personal, single-user XAUUSD trading desk (no login, ever).
Work: (1) executed the full phased Transformation Prompt (Phases 0–9) back-to-back;
(2) executed the **v2 brief** (findings R1–R10, visual direction B*, functionality
blueprint C1–C11, phased plan E) — see the “v2 transform session” section at the
bottom. v1 is committed/tagged; v2 work sits in the working tree ready to commit.

## Git state

- Tag `pre-transform` @ `7b60fdf` (original first commit) — preserved.
- Branch chain (each phase = branch + green gate, merged ff-linearly into `main`):
  - `transform/phase-0-audit` (`fc29c62`) — audit docs
  - `transform/phase-1-safety` (`2714f09`) — safety pass
  - `transform/phase-2-monorepo` (`0d17155`, `2ed1f1f`) — workspaces
  - `transform/phase-3-backend` (`04e3ecc`, `e4397cb`) — Fastify API
  - `transform/phase-4-design-shell` (`d6d53a9`) — design system
  - `transform/phase-5-chart-blotter` (`8a80205`) — chart + blotter
  - `transform/phase-6-analytics-tester` (`d3c28eb`) — analytics + async backtester
  - `transform/phase-7-full-api` (`0609a8a` → `0609a8a`?) — every page on API
  - `transform/phase-8-polish` (`1dca6ce`) — Docker, RUNBOOK, README
  - `transform/phase-9-premium` (`49fd49f`) — premium UI refresh
- HEAD = `main` @ `ea06b3c` (“v1”); **v2 work is uncommitted** in the working
  tree (66 changed/new files, all gates green) — commit it as one v2 change.
- **Push must be done manually by user** (no GitHub credentials in this env):
  `git push origin main --tags`

## Architecture after the transformation

```
browser ── same-origin /api/v1/* ──► web (Next 16.3, apps/web)
                                        │ injects API_TOKEN server-side (proxy)
                                        ▼
                                   api (Fastify 5, apps/api, :3101)
                                        ├─ 7 locked in-process jobs (scheduler)
                                        ├─ providers: TwelveData, Groq, calendar, Finnhub
                                        ├─ repositories ──► Supabase (service key)
                                        └─ SSE /v1/stream ──► react-query invalidation

producer (main.py, external) ── POST /v1/signals/ingest (Bearer API_TOKEN | ?secret=CRON_SECRET)
```

- npm workspaces: `apps/web`, `apps/api`, `packages/engine` (pure, 37 vitest
  tests incl. golden backtest snapshot), `packages/shared` (zod contracts),
  `packages/config`.
- Web has **zero** supabase-js, zero provider keys, zero secrets (verified by grep).
- Secrets live only in the API (plus `API_TOKEN`/`API_BASE_URL` on web side,
  injected by `apps/web/src/app/api/v1/[...path]/route.ts`).
- Legacy `/api/check-*` cron forwarders intentionally KEPT (external crons may
  still hit them); migration path documented in `docs/RUNBOOK.md`.
- RLS: `supabase/migrations/0002_rls_deny_all.sql` is apply-ready but NOT yet
  applied (user must run it in Supabase — nothing in web talks to Supabase now).

## Phase-by-phase deliverables

- **P0** `docs/AUDIT.md`, `docs/DATA_MODEL.md`, `docs/UX_CRITIQUE.md`.
- **P1** removed login entirely, shared types, zod env validation
  (`lib/env.ts`), route guards, rate limits, CI workflow, demo mode +
  `DemoRibbon`, lint 71 → 0, `.env.example`.
- **P2** monorepo move to `apps/web`, backtest split into modules, engine
  tests (golden snapshot), ADR 0001.
- **P3** Fastify API (`apps/api/src`) owns jobs/secrets/DB: `/v1/{health,
  signals, desk, reports, ops, guarded}`, SSE hub, `POST /v1/signals/ingest`,
  token+rate-limit guards; web routes → thin forwarders + proxy; migrations
  0001/0002; ADR 0002; dead web files deleted.
- **P4** design tokens (`apps/web/src/styles/tokens.css`, 3 themes + color-blind
  + density), UI primitives (`components/ui/Button|Panel`), shell rewrite
  (Sidebar, Topbar, ⌘K CommandPalette, ThemeApplier), all 8 pages codemoded
  onto tokens, `scripts/contrast-check.mjs` (WCAG AA gate) wired into CI.
- **P5** `components/chart/ChartWorkspace.tsx` (lightweight-charts v5 candles,
  PD/PW price lines, tf switch, SIMULATED fallback), react-query + SSE bridge
  (`components/shell/Providers.tsx`), desk/candles/notifications API,
  shell+blotter off Supabase.
- **P6** `/v1/verdicts/:table`, signals cap → 1000, async backtester
  (POST 202 → poll `GET /v1/backtests/:id` + run history), sync `/api/backtest`
  bridge deleted, performance page on API.
- **P7** `/v1/signals/resolved`, `/v1/usage/analysed`, `/v1/signals?ids=…`,
  analysis/analysed/news pages rewired to API, `supabaseClient.ts` +
  `@supabase/supabase-js` removed from web, RLS 0002 marked apply-ready.
- **P8** `Dockerfile.web`, `Dockerfile.api`, `docker-compose.yml`,
  `.dockerignore`, `docs/RUNBOOK.md`, README rewritten, last legacy callers
  migrated to v1 client, chart attribution.
- **P9 (premium refresh)**
  - Self-hosted **Geist Sans + Geist Mono** (variable woff2 in
    `apps/web/src/fonts/`, loaded via `next/font/local`; no Google Fonts at
    build). `--font-inter`/`--font-jbmono` aliased in `globals.css` so old
    classes keep working.
  - Brighter, higher-chroma palettes in all 3 themes (aurora-navy midnight,
    punchier graphite/daylight); bull/bear/gold/blue all intensified.
    All 42 contrast pairs still pass AA (margins improved).
  - Glass topbar (`backdrop-blur-md`, gold→blue hairline), ambient aurora
    radial wash behind app (`AppShell`), gradient brand wordmark + gold logo
    glow, `:focus-visible` rings, `::selection`, scrollbar hover,
    panel shadows + `--radius: 10px`, button hover-lift, unified page h1s
    (26px semibold tracking -0.02em), `viewport.themeColor`.

## Verification state (all green, v2 working tree)

- `npm run typecheck` 0 errors (web+api+engine+shared)
- `npm run lint` 0 issues
- `npm run check:contrast` 69/69 pairs AA (3 themes + candle presets)
- `npm run test` 101/101 (engine vitest, golden snapshot regenerated)
- `npm run build` passes with NO env (demo-mode boot enforced)
- v1 smoke (8 pages 200, `/api/v1/*` via proxy, SSE) was green at the v1
  commit; live smoke not re-run after the v2 changes (gates above only).

## Environment quirks (important for future sessions)

- **`pkill -f "next start"`/`"next-server"` self-matches its own bash cmdline
  and kills its own shell → tool "timeout" with no output.** Always use
  bracket patterns: `pkill -f "next [s]tart"; pkill -f "next-[s]erver"`.
- Background servers: `API_TOKEN=… setsid nohup npm run … > /tmp/x.log 2>&1 < /dev/null &`
  then `sleep` + `curl --max-time`. Long compound commands with pkill tend to
  hang the bash tool.
- Web prod: `npm run start -w apps/web -- -p 3102` (needs `.next` build);
  API: `API_TOKEN=smoke-token-12345678 npm run dev:api` (port 3101).
- **Screenshots impossible**: Chromium (playwright, browser-automation skill)
  missing `libnspr4.so`; no passwordless sudo → cannot install. Verify via
  rendered HTML/CSS greps instead.
- **Docker not available** in this WSL distro (files written, `docker compose
  build` untested — user must run it locally).
- No GitHub credentials → pushes fail; user pushes manually.

## Open items / possible next steps

1. User: `git push origin main --tags`.
2. User: apply `supabase/migrations/0002_rls_deny_all.sql` (steps in RUNBOOK).
3. Migrate external crons from `/api/check-*` forwarders → `POST /v1/jobs/:name`.
4. `docker compose up --build` untested (no Docker here).
5. Visual screenshot QA blocked on system libs (see quirks).
6. Deferred polish: table-row density restyle, settings cards' inline styles
   (already close to new radius).
7. v2 deferred (schema-ready, evaluator/UI work remains): alert kinds
   `level_break` / `signal_state` / `session` / `rule_breach`; drag-resize
   widget layouts (order+show/hide shipped); TradingView tester CSV parity
   run needs a real export (`tools/parity`); MT5 bridge needs a Windows run.
8. Live smoke after v2 (start web+api, hit new endpoints) not yet run.

## v2 transform session (2026-10-13)

Executed the v2 brief (findings R1–R10, visual direction B*, functionality
blueprint C1–C11) on top of the merged v1. Decisions/defaults recorded in
`docs/AUDIT.md` (G1–G6) and `docs/adr/0003-v2-pipeline-and-desk-services.md`.

### Engine (`packages/engine`, +85 tests)

- `pipeline.ts` — signal state machine (created→open→tp1/tp2/tp3→closed/
  stopped/expired/cancelled), `applyTransition`/`projectToRow`/`stateFromRow`,
  `ladderPath`; append-only `signal_events` log.
- `backtest/magnifier.ts` — M1 bar magnifier; same-bar TP+SL ambiguity
  resolves **pessimistically** (loss), gaps fill at bar open.
- `honestStats.ts` — Wilson CI, expectancy R, profit factor, SQN, Sharpe/
  Sortino, small-sample flags; `BacktestSummary` extended (golden snapshot
  regenerated twice: honesty fields, then `rSequence`).
- `risk.ts` — `positionSize` (XAUUSD 100oz, $1/pt/lot, rounds lots DOWN,
  maxLots cap, ≥2% guideline warning) + `exposureSummary` (aggregate vs desk
  caps). Tested incl. direction symmetry.
- `research.ts` — seeded (mulberry32) `monteCarlo` (final-R percentiles,
  max-DD distribution, ruin rate), `walkForwardFolds`/`walkForwardSummary`
  (train/test degradation), `costAdjusted`/`costSummary` (point friction→R,
  winner-flip count).
- `levels.ts` += `roundNumberLevels`, `nearestLevel` (points+side),
  `levelConfluence` (tolerance band score).
- `timeModel.ts` — configurable day/week boundaries (default 00:00 UTC).
- Property tests via `fast-check`; `tools/parity/` harness for TradingView
  strategy-tester CSV comparison.

### API (`apps/api`)

- Migration `0003_v2_pipeline.sql`: `candles`, `signal_events`,
  `ingest_rejections`, `provider_credits`, `ai_runs`, `signal_journal`,
  `alert_rules`, `alert_events`, `desk_read_state` + 5 `signals` columns.
  `0004_mt5_sync.sql`: `mt5_snapshots` (append-only).
- `services/pipeline.ts` — zod-validated idempotent ingest (rejections
  logged), state machine + event log; `services/candles.ts` — store with
  gap/outlier detection + `backfillStandardLadder` (6h job) + freshness;
  `lib/credits.ts` — per-minute/per-day provider credit ledger;
  `providers/priceProvider.ts` — staleness-aware provider abstraction.
- **C9.2 audit trail**: prompts moved to `prompts/verdict.ts` with version
  constants; every Groq run (analysed + news, success AND failure) appends
  `ai_runs` (prompt_version, snapshot, output, latency, tokens) — logging is
  best-effort and can't break analysis. `completeVerdict` now returns run
  metadata.
- **C10 alerts**: `services/alerts.ts` (feed_stale, job_failed,
  news_tminus, price_cross; deduped by `dedupe_key`) as `evaluateAlerts`
  5m job + rules CRUD/events/evaluate routes; server-side read-state
  (`desk_read_state`) wired into the Topbar badge.
- **C11**: `/v1/health` gains a degradation matrix + overall
  `ok|degraded|down`; MT5 routes (`/v1/mt5/sync|status`); `tools/mt5-bridge`
  (read-only Windows Python bridge, retry/backoff, README).
- New/extended routes: ops credits/candles/backfill/ai-runs, journal
  GET/PUT (zod), read-state GET/PUT, `/v1/signals/:id/events`, alert rules.

### Web (`apps/web`)

- **Design system (B*)**: rewritten `styles/tokens.css` — themes renamed
  `daylight` (default) / `sunrise` / `aurora` (legacy midnight/graphite →
  aurora, migrated in uiStore + no-FOUC boot), bright fills carry navy text,
  glass/mesh/radius tokens, candle presets (`classic`/`sky-orange`/
  `mint-coral`, `data-candle`) with Okabe-Ito CB-safe option; legacy CSS
  aliases keep v1 components compiling. Contrast gate rewritten (69 pairs).
- Widget library `components/ui/widgets.tsx` (GlassCard, KpiTile, DeltaChip,
  Sparkline, Donut, Gauge, CountdownRing, StatusStrip…); `/dev/type` type
  specimen + `/dev/ui` gallery.
- **Overview rebuilt as a widget grid** (`lib/layouts.ts`): named layouts
  Live/Review/Research, per-layout order + show/hide, persisted; KPI tiles,
  chart workspace, desk-bias gauge + TF boxes, next-high-impact countdown,
  event feed, system status strip.
- **Risk desk `/risk`**: engine-backed size calculator (persisted inputs,
  prefill from open signals) + aggregate exposure vs caps (5 lots / 5%).
- **Blotter**: `SignalJournal` panel per expanded signal — journal editor
  (PUT `/journal/:id`), event timeline, ai_runs audit trail.
- Backtest page: inline summary type replaced with engine's
  `BacktestSummary` (drifted twice before); **Monte Carlo card** (2000
  seeded paths: median/p5–p95 final R, p95 max DD, ruin rate).
- PWA `manifest.ts` + 192/512 icons; nav/palette entries for Risk.
- Read-state hydration so notification badge survives refresh.

### Docs

- `docs/AUDIT.md` + “V2 delta audit” (R1–R10 verdicts, G1–G6 defaults),
  `docs/adr/0003`, DATA_MODEL §9 (v2 tables), RUNBOOK (9 jobs, v2 endpoint
  table, degradation matrix, test count), `LICENSE` (MIT),
  `tools/mt5-bridge/README.md`.

### Verification (this session, all green)

typecheck 0 · lint 0 · contrast 69/69 AA · engine 101/101 · build OK with
no env (`/risk`, `/dev/*`, `/manifest.webmanifest` all emitted).
Secret scan of the full diff: clean.

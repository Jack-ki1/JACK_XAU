# JACK TRADE — Phase 0 Audit

Branch: `transform/phase-0-audit`. Starting point tagged `pre-transform`.
No source files were modified in this phase; only this file plus
`docs/DATA_MODEL.md` and `docs/UX_CRITIQUE.md` were created.

Rule 1 of the brief ("verify before you trust") was applied throughout:
every hypothesis in §2.2 is marked CONFIRMED / PARTIALLY CONFIRMED /
REJECTED with file:line evidence. Where the code contradicts the brief,
the code won — differences are called out explicitly.

Stack as found: Next.js 16.3.0, React 19.2.8, TypeScript 5, Tailwind CSS 4,
`@supabase/supabase-js` 2.112.0. No test runner, no CI, no monorepo tooling.

---

## 2.1 Inventory

### 2.1.1 Command results (run 2026-10-12, clean checkout on audit branch)

| Command | Result |
|---|---|
| `npm ci` | PASS (exit 0). Note: `npm audit` reports 11 vulnerabilities (10 high, 1 critical) via transitive deps; nothing actioned in this phase. |
| `npx tsc --noEmit` | PASS (exit 0). |
| `npm run lint` (`eslint`, flat config `eslint.config.mjs`) | **FAIL — 71 errors, 3 warnings, exit 1.** Breakdown: ~60× `@typescript-eslint/no-explicit-any` across pages, API routes and lib; 3× `react-hooks/set-state-in-effect` (`app/(app)/news-signals/page.tsx:123`, `components/Sidebar.tsx:130`, `components/Topbar.tsx:95`); 5× `react/no-unescaped-entities`; 2× unused vars (`signals/page.tsx:10` `TIER_CHAIN`, `analysis/route.ts:204` `e`); 1× `@next/next/no-page-custom-font` (`app/layout.tsx:14`). |
| `npm run build` (no env vars set) | PASS (exit 0). 26/26 static pages generated. All 8 UI pages prerender as static; all 13 API routes dynamic (`ƒ`). |
| Runtime smoke (dev server, no env vars) | PASS. All 8 pages + `/login` return HTTP 200. `GET /api/news-window-status` returns `{"active":false,"event":null}` instead of crashing — degraded-data behaviour confirmed live. |

Key takeaway: the build is green but lint is deep red. `tsc` passes only
because the codebase leans on `any` (~60 sites) rather than real types.
Any "strict TypeScript" goal (Phase 1/§7) starts by fixing lint, not tsc.

### 2.1.2 Pages (`app/`)

| File | LOC | Purpose |
|---|---|---|
| `app/page.tsx` | 3 | Root: redirects `/` → `/overview`. |
| `app/layout.tsx` | 21 | Root layout: metadata (`JACK TRADE`), Google Fonts links. |
| `app/login/page.tsx` | 19 | Redirect shim: pushes to `/overview`. Not a login form (see §2.2 H1). |
| `app/(app)/layout.tsx` | 16 | App shell: `Sidebar` + `Topbar` + `{children}`. |
| `app/(app)/overview/page.tsx` | 230 | Market-cycle gauge, timeframe box grid, 30d stats. |
| `app/(app)/signals/page.tsx` | 279 | Signal blotter with expandable HTF-confluence detail. |
| `app/(app)/analysed-signals/page.tsx` | 381 | LLM verdict cards + toggle + quota display + resolved-levels ledger. Best-typed page (local interfaces). |
| `app/(app)/news-signals/page.tsx` | 278 | News-window status, today's calendar events, news-verdict cards. |
| `app/(app)/analysis/page.tsx` | 269 | Resolved-signal list + "Find Patterns" button → `closed-signal-analysis`. |
| `app/(app)/performance/page.tsx` | 445 | **>400 lines.** Win-rate ring, breakdowns by type/session/grade/rung/manual-filter, LLM success sections. |
| `app/(app)/backtest/page.tsx` | 529 | **>400 lines.** Param-override form, quick presets, multi-config results, diagnostics display. |
| `app/(app)/settings/page.tsx` | 31 | Static strategy-parameter display. Not wired to anything (copy admits it: "changes here will push through once wired"). |

### 2.1.3 API routes (`app/api/`)

| Route | LOC | Purpose | Secrets used | Mutates DB? | Cron guard? |
|---|---|---|---|---|---|
| `check-open-signals` | 227 | Resolve `open` signals vs Twelve Data bars (batched by interval) | `SUPABASE_SERVICE_KEY`, `TWELVEDATA_API_KEY_RESOLUTION` | YES (`signals` update) | YES (`CRON_SECRET`) |
| `check-analysed-signals` | 215 | Sync `valid` rows free; resolve `invalid` rows vs price | `SUPABASE_SERVICE_KEY`, `TWELVEDATA_API_KEY_RESOLUTION` | YES (`analysed_signals`) | YES |
| `check-news-signals` | 192 | Same pattern for `news_signals` | `SUPABASE_SERVICE_KEY`, `TWELVEDATA_API_KEY_RESOLUTION` | YES (`news_signals`) | YES |
| `check-transitions` | 159 | Session/news/market/level transitions → `notifications` | `SUPABASE_SERVICE_KEY`, `TWELVEDATA_API_KEY_RESOLUTION` (via `priceLevels`) | YES (`notifications`, `app_settings`) | YES |
| `process-news-signals` | 274 | Groq verdicts for signals inside news windows | `SUPABASE_SERVICE_KEY`, `GROQ_API_KEY_NEWS_SIGNALS`, `FINNHUB_API_KEY` (optional) | YES (`news_signals` insert) | YES |
| `analyse-signals` | 70 | Cron safety-net batch analysis (max 5/run) | `SUPABASE_SERVICE_KEY`, `GROQ_API_KEY_ANALYSED_SIGNALS` (via lib) | YES (`analysed_signals` insert) | YES |
| `analyse-signal-now` | 48 | Immediate single-signal analysis (primary path) | `SUPABASE_SERVICE_KEY`, Groq key (via lib) | YES (via lib) | YES |
| `fetch-calendar` | 128 | Daily JBlanked calendar fetch → `calendar_events` (idempotent) | `SUPABASE_SERVICE_KEY`, `JBLANKED_API_KEY` | YES (`calendar_events`, `calendar_fetch_attempts`) | YES |
| `news-window-status` | 57 | **UNGUARDED**, read-only: is a high-impact event within −30/+15 min? | `SUPABASE_SERVICE_KEY` (read) | NO | NO (by design — polled by UI) |
| `backtest` | 188 | Fetch 8 Twelve Data series, run engine per config (max 4) | `SUPABASE_SERVICE_KEY` (usage counter), `TWELVEDATA_API_KEY` | NO (usage counter only) | NO — **anyone can burn Twelve Data quota** (see H2) |
| `analysis` | 206 | Groq assessment of open unreviewed signals | `SUPABASE_SERVICE_KEY`, `GROQ_API_KEY`, `TWELVEDATA_API_KEY`, `FINNHUB_API_KEY` | YES (`signals.ai_reviewed_at` stamp) | NO — **unguarded LLM + quota spend** (see H2) |
| `closed-signal-analysis` | 111 | Deterministic pattern counts over last 200 closed signals | `SUPABASE_SERVICE_KEY` (read) | NO | NO (read-only, cheap — acceptable) |
| `settings/toggle-analysed-signals` | 36 | GET/POST `analysed_signals_enabled` flag | `SUPABASE_SERVICE_KEY` | YES (`app_settings`) | NO — **unguarded write** (see H2) |

### 2.1.4 Lib + components

| File | LOC | Purpose |
|---|---|---|
| `lib/backtest/engine.ts` | 917 | **>400 lines (largest logic file).** Box-chain, protected swings, Setup A/B + Precision generation, SL/RR exits, outcome walk, summary stats, diagnostics. As expected. Well-commented; pure except importing `getActiveSession` (for `bySession` only). |
| `lib/analysis/analyseSignal.ts` | 313 | Shared `analyseOneSignal()`: quota check, price context, calendar check, Groq call, insert. Used by both analysis paths — good dedup. |
| `lib/priceLevels.ts` | 182 | Prev day/week level cache + break detection. **Mixes pure detection with Supabase I/O + Twelve Data fetch** (see H5). |
| `lib/sessions.ts` | 113 | DST-aware sessions + market open/closed + upcoming-session. Pure (takes `Date`, no I/O). Best file in repo. |
| `lib/points.ts` | 23 | Point math (`POINT_SIZE = 0.01`). Duplicated elsewhere instead of imported (see H5). |
| `lib/supabaseClient.ts` | 6 | Browser anon-key client + `isSupabaseConfigured` flag (unused anywhere — dead export). |
| `components/Topbar.tsx` | 297 | Session/market/EAT/last-signal/news indicators + notifications bell. Owns 3 polling/subscription concerns. |
| `components/Sidebar.tsx` | 219 | Nav + 4 badge states (new signal, stale open, new analysed, news window). Owns 4 queries + 1 channel. |

### 2.1.5 Dependencies

`package.json` lists exactly 4 runtime + 6 dev deps. Findings:

- **No unused runtime deps**: `next`, `react`, `react-dom`, `@supabase/supabase-js` are all used. No duplicates.
- **No test framework, no validation, no query, no chart, no scheduler libs** — everything the transformation needs (`vitest`, `zod`, `lightweight-charts`, `@tanstack/*`, `zustand`, `fastify`, `pino`, …) is yet to be added with justification per phase, per §7.
- `isSupabaseConfigured` (`lib/supabaseClient.ts:7`) is exported but imported nowhere — dead code, remove in Phase 1.
- `TIER_CHAIN` in `signals/page.tsx:10` and `e` in `analysis/route.ts:204` — lint-flagged unused, remove in Phase 1.
- Transitive vulns: 11 (10 high, 1 critical) reported by `npm audit` after `npm ci`. Not investigated file-by-file in this phase; recommend `npm audit fix` review in Phase 1.

---

## 2.2 Hypotheses — verdicts with evidence

### H1: `app/login/page.tsx` is a leftover redirect stub; other auth remnants exist

**CONFIRMED (stub) / PARTIALLY CONFIRMED (remnants).**

- `app/login/page.tsx:1-19` is a client component whose only behaviour is `router.replace('/overview')`. No form, no credentials, no session. Safe to delete in Phase 1; root `app/page.tsx:1-3` already redirects `/` → `/overview`, so nothing links to it except muscle memory.
- No user-auth framework anywhere: no `next-auth`, no Clerk, no `middleware.ts`/`proxy.ts`, no cookies, no `getServerSession`, no roles. Grep for `sign-in|sign-up|getServerSession|clerk|next-auth` returns zero source hits.
- Remnants that DO exist (all non-blocking, all Phase 1 cleanup):
  - `app/(app)/analysed-signals/page.tsx:142-148` comment references "the anon/authenticated client" and RLS SELECT policy — accurate description of Supabase roles, not a login flow, but the word "authenticated" will confuse future readers. Reword when RLSdeny-all lands.
  - `app/api/analysis/route.ts:3-5` comment mentions "the anon key's read-only RLS policy" — same category.
  - README references to `login/page.tsx` (lines 92, 169-171) must be updated when the file is deleted.

### H2: API routes are unprotected; anyone with the URL can spend keys / mutate data

**CONFIRMED — with one correction: 9 of 13 routes ARE secret-guarded; 4 are not, and 3 of those 4 are the dangerous ones.**

- Guarded by `CRON_SECRET` (`?secret=` query param, 401 otherwise): `check-open-signals:120-122`, `check-analysed-signals:100-102`, `check-news-signals:81-83`, `check-transitions:59-61`, `process-news-signals:172-174`, `analyse-signals:28-30`, `analyse-signal-now:28-30`, `fetch-calendar:44-46`. Correct as far as it goes, BUT two weaknesses the brief anticipated:
  1. The secret travels in the **query string** (logged by proxies/CDNs), not an `Authorization` header. Fix in Phase 3 per §4.2.
  2. Every guarded route holds the **Supabase service key server-side** — fine today, but the same key is reachable from any of these handlers, so one SSRF/fetch bug exposes everything. Phase 3's repository layer + key scoping addresses this.
- **Unguarded and spendy (Critical):**
  - `POST /api/backtest` (`app/api/backtest/route.ts:96-99`) — no secret at all. Each call fans out to **8+ Twelve Data requests** (paginated, up to 40 pages/series in `fetchSeriesPaginated:34-55`) against `TWELVEDATA_API_KEY` (800/day). Anyone with the URL can drain the daily quota in a handful of calls.
  - `GET /api/analysis` (`app/api/analysis/route.ts:73-79`) — no secret. Spends Groq (`GROQ_API_KEY`, a *third* LLM key alongside the two `GROQ_API_KEY_*` keys) + Twelve Data + Finnhub, and **writes** `ai_reviewed_at` stamps.
  - `POST /api/settings/toggle-analysed-signals` (`route.ts:25-37`) — no secret, **unauthenticated write** to `app_settings`. Anyone can silently disable the analysis pipeline.
- Unguarded but acceptable: `news-window-status` (pure Supabase read, zero external cost — documented as intentional at `route.ts:1-8`) and `closed-signal-analysis` (one bounded Supabase read, no external calls).
- Secrets scan: no committed key material found. Grep for `eyJ…|gsk_…|sk-ant-|ghp_|AKIA|AIza|postgres://…` across `app lib components` returns only a `sha512-…eyJ…` integrity hash in `package-lock.json` (false positive). No `.env*` files exist in the worktree; `.gitignore` already covers `.env*` (line 32) plus `.vercel`. Single-commit history (`7b60fdf first commit`) contains no keys either. **No rotation needed.**

### H3: Browser uses anon key + realtime on `signals`/`notifications`; RLS status?

**CONFIRMED (client pattern) / UNVERIFIABLE (RLS) — Critical gap.**

- `lib/supabaseClient.ts:1-6` creates the browser client with `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`, placeholder fallback. Every page and both shell components import it.
- Realtime subscriptions confirmed: `signals` (overview:93-95, signals:91-93, performance:202-206, analysis:92-96), `analysed_signals` (analysed-signals:203-209, sidebar:120-122), `news_signals` (news-signals:128-130), `notifications` (topbar:138-140), `calendar_events` (news-signals:130).
- Direct anon-key table reads confirmed: `signals`, `analysed_signals`, `news_signals`, `calendar_events`, `notifications`, `openrouter_usage` (quota display), `av_usage` (backtest page reads usage — verify in Phase 3).
- **RLS cannot be verified from this repo**: no `supabase/` directory, no migration files, no policy definitions. The code *assumes* anon can SELECT everything above (and the in-code comment at `analysed-signals/page.tsx:142` shows the author already hit an RLS denial at least once). Whether anon can also WRITE is unknown and must be checked against the live project in Phase 1 before the deny-all migration. Marked Critical in the risk register below.

### H4: External triggers for cron/webhook routes; what invokes them today?

**CONFIRMED (design) / EXTERNAL (implementation lives outside the repo).**

- In-repo evidence: `check-open-signals/route.ts:3-6,34-39` documents "triggered externally by a free cron service (e.g. cron-job.org) … with the correct `?secret=` query param every 10 minutes". `check-transitions/route.ts:3` (every 5 min), `process-news-signals/route.ts:3-8` (every 5 min), `fetch-calendar/route.ts:3-9` (daily 00:05 UTC), `analyse-signals/route.ts:3-14` (every 10 min safety net). `analyse-signal-now/route.ts:3-15` documents the primary path: "triggered directly by main.py the instant a webhook signal is saved to Supabase".
- **Signal ingest is NOT in this repo.** No POST endpoint creates `signals` rows. `analyse-signal-now` only *reads* a row `main.py` supposedly wrote (`route.ts:38-45`, including a `not_found_yet` race path). `main.py` itself is not in the repo (grep: only the two comments above + `check-open-signals` cost notes). Topbar's tooltip (`Topbar.tsx:192`) says the last signal "was received from TradingView" — so the believed chain is TradingView alert → `main.py` (elsewhere) → Supabase `signals` insert → `analyse-signal-now` POST. **Open decision #1 (section 8 of the brief) is therefore the most important Phase 0 question: the ingest path must be found and documented before the backend is designed.**
- No `vercel.json`, no cron config, no GitHub workflow in the repo. All scheduling is external and unversioned — Phase 3 must codify it (jobs + RUNBOOK).

### H5: Business logic mixed with I/O; hard to test

**CONFIRMED — High severity. Three concrete cases:**

1. `lib/priceLevels.ts` — `checkPriceLevelBreaks()` (line 146) does Supabase settings I/O (`getSetting`/`setSetting`), Twelve Data fetches (`fetchPreviousCompletedBar`, `getLivePrice`), date logic, break detection AND notification-flag writes in one untestable unit. The pure part (compare price vs levels) is ~15 lines buried in I/O.
2. `lib/analysis/analyseSignal.ts` — `analyseOneSignal()` (line 257) does toggle check, dup check, quota check, two external fetches, LLM call, and insert. The pure parts (prompt building `buildPrompt:165`, RR recompute `284-290`) are separable but untested.
3. Point math is copy-pasted, not shared: `POINT_SIZE`/`POINT_VALUE = 0.01` is independently defined in `lib/points.ts:1`, `lib/backtest/engine.ts:100`, `overview/page.tsx:20`, `signals/page.tsx:5`, `performance/page.tsx:6`, each with its own `pointsBetween`/`netPointsForSignal`. Six definitions of one constant.
- Counter-example (what good looks like): `lib/sessions.ts` is pure — takes `date`, returns state, no imports from Supabase/fetch. The engine's core (`computeBoxChain`, `walkForOutcome`, `calcSL`, `pickNearestRR`) is likewise pure except `summarize()`'s `bySession`, which imports `getActiveSession` (works, but injects "now"-style logic into stats — note for Phase 2).

### H6: Data shapes implicit — no schema, no shared types, no runtime validation

**CONFIRMED — High severity.**

- No `supabase/` dir, no `.sql`, no `zod`, no shared types. `signals` rows are `any` at ~60 sites (the bulk of the lint failures).
- Two pages hand-maintain **separate copies** of the backtest result shape (`backtest/page.tsx:34-68` even carries a comment admitting "two hand-maintained copies of one shape WILL drift again — this is the second time").
- `closed-signal-analysis/route.ts:19-27` and `performance/page.tsx:43-51` each define their own `sessionForDate` with **hardcoded UTC hours** — contradicting the DST-aware `lib/sessions.ts` the rest of the app uses. Real inconsistency: the same signal can be labelled "London" by the Topbar and "Asian" by the Analysis page. Fix in Phase 2 (single `engine/sessions` source).
- No runtime validation anywhere: `req.json()` bodies (`backtest`, `toggle`), Twelve Data payloads (`(v: any)` maps in every resolver), Groq outputs (`JSON.parse` + hope in `analyseSignal.ts:243`, `process-news-signals:167`), JBlanked payload (explicit "HONEST GAP" at `fetch-calendar:15-19`). One malformed upstream response = unhandled throw = 500.
- Full reverse-engineered model is in `docs/DATA_MODEL.md` (this phase).

### H7: State/polling/realtime duplicated across Sidebar, Topbar, pages

**CONFIRMED — Medium severity, precisely scoped:**

- `news-window-status` is fetched independently by Topbar (`Topbar.tsx:115-126`, 30s interval), Sidebar (`Sidebar.tsx:101-111`, 60s interval) and news-signals page (`news-signals/page.tsx:44-52`, 60s interval) — 3× polling of one endpoint with 2 cadences.
- Latest-signal queries duplicated in Topbar (`checkLastSignal:99-113`) and Sidebar (`checkForNew:55-66`).
- Supabase channels per component (`sidebar-signal-watch`, `notifications-live`, `overview-live`, `signals-feed`, `analysed-signals-live`, `news-signals-live`, `performance-live`, `analysis-resolved-live`, …) — each with its own subscribe/unsubscribe; no shared store.
- EAT formatting reimplemented in 4 files (Topbar:38-55, signals:62-75, analysed-signals:60-66, news-signals:31-37).
- Session naming inconsistent (see H6 — three variants: `lib/sessions`, `performance/sessionForDate`, `analysis/getSession`).

### H8: No tests, no CI, no `.env.example`

**CONFIRMED in full.** No `*.test.*`/`*.spec.*` files. No `.github/` directory. No `.env.example`. Env vars are discoverable only by grepping `process.env` (full list catalogued in `docs/DATA_MODEL.md` §6). The brief's Phase 1 acceptance ("build passes with no env vars") already holds — verified live this phase.

---

## Risk register (for Phase 1+ planning)

| # | Risk | Severity |
|---|---|---|
| R1 | Unguarded `POST /api/backtest` can drain Twelve Data quota (H2) | Critical |
| R2 | Unguarded `POST /api/settings/toggle-analysed-signals` allows silent pipeline disable (H2) | Critical |
| R3 | Unguarded `GET /api/analysis` spends Groq + writes stamps (H2) | High |
| R4 | RLS posture unknown; anon may have more than SELECT (H3) | Critical |
| R5 | Signal ingest (`main.py`) lives outside the repo; contract undocumented (H4) | High |
| R6 | 71 lint errors; `any` everywhere hides type bugs (H6) | High |
| R7 | Session-label inconsistency across pages (H6) | Medium |
| R8 | 11 transitive vulns unreviewed | Medium |

## Where the brief differs from the code (rule 1 findings)

1. The brief's §4.4 mapping table lists `app/api/*` as 13 routes — correct, all 13 found and inventoried above.
2. The brief hypothesises a "login flow / auth gate" — **rejected**: only a redirect shim exists (H1).
3. The brief implies API routes are *wholly* unprotected — **corrected**: 9/13 carry a cron-secret guard; the exposure is 3 specific routes (R1–R3), not the whole surface.
4. The brief's colour-system starting tokens (§5.2) assume specific current colours; actual current palette is documented in `docs/UX_CRITIQUE.md` — several proposed tokens already exist under different names.
5. `AGENTS.md`'s Next.js breaking-changes notice was checked: `node_modules/next/dist/docs/` exists (`01-app`, `02-pages`, `03-architecture`, `04-community`). No Next.js source changes are made in Phase 0, so no doc-driven decisions were needed yet; the relevant guides (notably `01-app`) will be read before any App Router work in Phase 2+.

---

## V2 delta audit (brief v2 findings R1–R10, verified 2026-10-13 against post-transform HEAD)

The v1 transform (Phases 0–9) already closed most of R1–R10. This section
re-verifies each finding against the **current** code and records what remains.

### R1 — Login stub / workspace home

**CLOSED.** `app/login/` no longer exists (deleted in Phase 1). Root
`apps/web/src/app/page.tsx` still redirects `/` → `/overview`, which IS the
workspace home — the redirect is now correct behaviour, not an artefact.
No other auth remnants (grep for sign-in/getServerSession/next-auth: zero hits).

### R2 — Undocumented API routes

**CLOSED.** Every route now lives in `apps/api/src/routes/v1/*` with an
inventory in `docs/RUNBOOK.md`. Full current surface (all machine-guarded
except `/v1/health`):

| Group | Endpoints | Trigger | Secrets |
|---|---|---|---|
| health | `GET /v1/health` | polled | none (by design) |
| signals | `GET /v1/signals`, `GET /v1/signals/:id`, `POST /v1/signals/ingest`, `POST /v1/signals/:id/analyse`, `POST /v1/signals/analyse` | UI / producer / cron | API_TOKEN |
| desk | `GET /v1/{notifications, signals/resolved, usage/analysed, verdicts/:table, desk/status, market/candles}` | UI via proxy | API_TOKEN (injected) |
| reports | `GET /v1/{market/status, analysis/status, analysis/closed, performance, backtests, backtests/:id, stream}`, `POST /v1/backtests` | UI | API_TOKEN |
| ops | `POST /v1/jobs/:name`, `GET /v1/jobs`, `GET /v1/{news/window, calendar, levels, settings}`, `POST /v1/{calendar/refresh, transitions/check, resolution/check-*, news/process}`, `PATCH /v1/settings` | scheduler + UI + legacy cron | API_TOKEN / CRON_SECRET |

Legacy `/api/check-*` web routes remain as thin forwarders only.
Twelve Data credit burn (worst case, per day): resolvers 3 jobs × every
10 min ≈ 432 calls; levels 1/day×2 + 1 spot/5min ≈ 290; backtest up to
8 series × 40 pages, rate-limited to 10 runs/day; LLM price context ~5/run.

### R3 — Browser Supabase + localStorage unread state

**CLOSED for Supabase** (web has zero supabase-js since Phase 7; verified by
grep — only `lib/env.ts` mentions the URL as a demo-mode flag).
**PARTIALLY OPEN for unread state**: `components/shell/Sidebar.tsx:48-63`
still uses `localStorage` keys (`jacktrade_signals_last_seen`,
`jacktrade_analysed_signals_last_seen`) — per-browser, not per-desk.
v2 C10 supersedes this with server-side read-state (tracked in P11).

### R4 — priceLevels cache/notification mixing

**CLOSED.** Pure detection now in `packages/engine` (`detectBreaks`,
`weekRolledOver`); I/O in `apps/api/src/services/levels.ts`. Dedupe flags
still in `app_settings` — acceptable interim; alert dedupe table lands with
P11.

### R5 — `TWELVEDATA_API_KEY_RESOLUTION`

**ANSWERED.** It is a distinct env **slot**, not a mode flag: resolvers
(`services/resolution.ts`) and levels (`services/levels.ts:88`) read it via
`providers/twelveData.ts:87-89`. Three slots exist so the desk can point
backtest / resolution / LLM-context at different Twelve Data accounts. If the
same key value is placed in all three, they share one account's rate limit
(8/min, 800/day Basic); if different, limits are independent. Name kept for
back-compat; documented in `.env.example`. v2 P3 credit ledger tracks actual
spend per slot.

### R6 — Backtest engine as core IP / correctness risk

**PARTIALLY CLOSED.** Engine extracted to `packages/engine` (pure, split
modules), 37 vitest tests + golden snapshot. **Still missing (v2):**
TradingView parity checker (`tools/parity/`), look-ahead guard test,
M1 bar-magnifier resolution, cost model (spread/commission/slippage) —
scheduled in P2/P8.

### R7 — LLM audit trail / prompt versioning / calibration

**OPEN (v2 P10).** Verdicts still inserted without input snapshot, prompt
version or `ai_runs` row. No calibration metrics. Scheduled.

### R8 — Basics

**MOSTLY CLOSED.** `.env.example` ✓, CI ✓ (typecheck/lint/contrast/test/
build), tests ✓, migrations ✓, schema in `supabase/migrations/` ✓.
**Still missing:** LICENSE file (adding MIT this phase), repo topics/description
(user, via GitHub UI).

### R9 — Public repo exposes strategy

**OPEN — user action required.** Engine + prompts are in a public repo.
Recommend `gh repo edit --visibility private`. History scan re-run this
phase: **clean** (only zod's JWT test fixture in node_modules matches; no
rotation needed).

### R10 — Demo mode + typed env

**CLOSED.** `apps/web/src/lib/env.ts` + `apps/api/src/config/env.ts` (zod,
lenient). Build with empty creds is CI-enforced; DemoRibbon + simulated
chart bars verified.

### V2 open decisions (defaults chosen pending user input)

| # | Decision | Default taken |
|---|---|---|
| G1 | MT5 execution / bridge | Bridge code shipped in `tools/mt5-bridge/` (outbound-only, no order placement); user runs it on Windows when ready |
| G2 | Calendar provider | Keep JBlanked; normalise behind provider interface; FMP stub optional |
| G3 | Daily-candle boundary | Configurable `dayBoundary` setting (default 00:00 UTC), single source used by levels/analysis/backtest |
| G4 | Pine script for parity | Harness accepts TradingView Strategy Tester CSV export; report says "unverified" until first import |
| G5 | Repo private | Flagged to user; cannot change from this environment |
| G6 | Fonts / default theme | `/dev/type` specimen ships with Manrope+Inter+Geist Mono, Plus Jakarta, Sora candidates; app defaults Manrope+Inter+Geist Mono + Daylight theme until user picks |

# JACK TRADE

JACK TRADE is a personal XAUUSD trading dashboard designed as a single-user signal desk. It combines a live-style market overview, signal tracking, price-level monitoring, backtesting, and signal review workflows into one app.

This project is intentionally built for one person rather than a multi-user SaaS product. It keeps the experience direct, private, and opinionated: open the app, view the market context, monitor signal activity, and analyze trade quality without any login or public account flow.

## Project goal

The app is a working trading workspace for tracking and evaluating a Gold/XAUUSD strategy. It is meant to support a practical workflow around:

- monitoring market cycles and session state
- surfacing open / stale signals
- checking for news-window activity
- reviewing signal quality and resolved outcomes
- measuring historical performance through backtesting
- keeping attention on price-level breaks and key market events

The project blends frontend display, server-side APIs, Supabase-driven data reads, and custom logic for strategy evaluation.

---

## High-level architecture

This repository is a Next.js app using the App Router. The main pattern is:

- UI pages live under `app/(app)` and render the trading workspace
- API routes under `app/api` handle data collection, checks, and server-side processing
- shared logic and data access utilities live in `lib/`
- shared UI chrome like sidebar and topbar lives in `components/`
- Supabase is used as the main data layer for signals, notifications, settings, and realtime subscriptions

In practice, the app behaves like a local trading control panel with both:

1. a user-facing dashboard and signal review experience
2. operational background logic that checks statuses, market context, and alert conditions from the server side

---

## Tech stack

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS
- Supabase JavaScript client
- App Router structure for pages and API routes

This is a dashboard-heavy app, so the frontend is primarily built from focused client components that read from Supabase and render market state.

---

## Runtime model

The app is designed for a personal workflow and does not assume a public auth system. The dashboard is directly accessible, which keeps it streamlined for a single user.

The app also intentionally tolerates missing Supabase / environment configuration while still loading, instead of crashing early during static page generation. In other words, the project is resilient enough to boot in a local or partially configured environment, while route-level logic still expects real credentials when live features are actually used.

---

## Folder structure

```text
.
├── app/
│   ├── (app)/
│   │   ├── analysed-signals/page.tsx
│   │   ├── analysis/page.tsx
│   │   ├── backtest/page.tsx
│   │   ├── layout.tsx
│   │   ├── news-signals/page.tsx
│   │   ├── overview/page.tsx
│   │   ├── performance/page.tsx
│   │   ├── settings/page.tsx
│   │   └── signals/page.tsx
│   ├── api/
│   │   ├── analyse-signal-now/route.ts
│   │   ├── analyse-signals/route.ts
│   │   ├── analysis/route.ts
│   │   ├── backtest/route.ts
│   │   ├── check-analysed-signals/route.ts
│   │   ├── check-news-signals/route.ts
│   │   ├── check-open-signals/route.ts
│   │   ├── check-transitions/route.ts
│   │   ├── closed-signal-analysis/route.ts
│   │   ├── fetch-calendar/route.ts
│   │   ├── news-window-status/route.ts
│   │   ├── process-news-signals/route.ts
│   │   └── settings/toggle-analysed-signals/route.ts
│   ├── favicon.ico
│   ├── globals.css
│   ├── layout.tsx
│   ├── login/page.tsx
│   ├── page.tsx
│   └── ...
├── components/
│   ├── Sidebar.tsx
│   └── Topbar.tsx
├── lib/
│   ├── analysis/
│   │   └── analyseSignal.ts
│   ├── backtest/
│   │   └── engine.ts
│   ├── points.ts
│   ├── priceLevels.ts
│   ├── sessions.ts
│   └── supabaseClient.ts
├── public/
│   └── logo.png
├── .gitignore
├── AGENTS.md
├── CLAUDE.md
├── eslint.config.mjs
├── next.config.ts
├── next-env.d.ts
├── package.json
├── postcss.config.mjs
├── README.md
├── tsconfig.json
├── package-lock.json
└── ...
```

---

## Folder-by-folder breakdown

### `app/`

This is the app router entry point for the whole UI and server endpoints.

#### `app/(app)/`

This contains all the authenticated-style dashboard pages for the trading workspace. In this project, the app behaves as a direct-access dashboard, so these pages are treated as the main personal interface rather than a public landing page.

Files:

- `overview/page.tsx` — main homepage-like dashboard summarizing signal health, market cycle state, timeframe boxes, and recent performance
- `signals/page.tsx` — monitors the current signal pipeline and likely highlights open signals or signal feed activity
- `analysed-signals/page.tsx` — shows reviewed/analyzed signals after the system has processed them
- `analysis/page.tsx` — deeper review area for resolved outcomes and pattern/closed-signal analysis
- `performance/page.tsx` — performance statistics, win/loss summaries, and quality metrics
- `news-signals/page.tsx` — creates a dedicated view for news-triggered signals and relevant triggers
- `backtest/page.tsx` — runs or displays historical backtesting results
- `settings/page.tsx` — shows strategy parameters / environment settings view
- `layout.tsx` — the shell for the app pages; renders the sidebar and topbar and acts as the dashboard container

#### `app/api/`

All server endpoints live here. These are the operational brain of the app: they query Supabase, inspect signal state, trigger checks, and compute alerts.

Important routes:

- `check-open-signals/route.ts` — likely checks for open signals and evaluates if they are still relevant or stale
- `check-analysed-signals/route.ts` — checks processed or reviewed signals and status transitions
- `check-news-signals/route.ts` — inspects news-related signal triggers
- `check-transitions/route.ts` — handles flow between states such as open → closed / expired / reviewed
- `news-window-status/route.ts` — exposes whether a news window is active and whether it should be highlighted in the UI
- `fetch-calendar/route.ts` — fetches economic calendar information for risk-aware checks
- `process-news-signals/route.ts` — processes signals tied to news events and pushes them through the live pipeline
- `analyse-signals/route.ts` — runs the main signal analysis flow over pending / candidate signals
- `analyse-signal-now/route.ts` — handles one-off ad hoc signal analysis requests
- `analysis/route.ts` — related to signal analysis aggregation or payload generation
- `backtest/route.ts` — exposes backtest execution or returns backtest summaries
- `closed-signal-analysis/route.ts` — computes summarised patterns from closed signals
- `settings/toggle-analysed-signals/route.ts` — toggles whether analysed signals are displayed or enabled

These routes are central to making the dashboard a working signal desk instead of only a stateless UI.

#### `app/login/page.tsx`

The login page exists as a redirect-only personal entry point. In this user’s version, the app is intentionally single-user and bypasses sign-in.

#### `app/page.tsx`

This is the root page, which immediately redirects to the main app route (`/overview`).

#### `app/layout.tsx`

This sets the global metadata and browser-level layout shell, including the document title and the font setup.

#### `app/globals.css`

Global styling for the dashboard theme. This is where the trading terminal aesthetic is defined: dark UI, high-contrast accent colors, metric cards, borders, and status display styles.

---

### `components/`

#### `components/Sidebar.tsx`

The main left navigation used by the app. It includes:

- navigation links for overview, signals, analysis, news, performance, backtest, settings
- live dot badges for new/unread signal activity
- news-window alerts and stale-open signal status
- the app brand and the trading desk identity

It interacts with Supabase and local storage to decide whether new signals should be highlighted.

#### `components/Topbar.tsx`

This is the live status strip across the top of the dashboard. It includes:

- current session label
- market open / closed status
- EAT time display
- elapsed time since last signal
- active news indicator
- notification dropdown and notification status tracking

This component is one of the primary “live trading desk” interfaces in the app.

---

### `lib/`

This directory holds the reusable logic needed by both pages and APIs.

#### `lib/supabaseClient.ts`

Central Supabase client configuration. It guards against missing environment variables and provides a safe default client that won’t crash the app during build when credentials are absent.

Key responsibility:

- create the browser-side Supabase client
- expose `supabase`
- expose `isSupabaseConfigured` as a safe configuration check

#### `lib/sessions.ts`

This is a core concept file. It defines:

- `getActiveSession()` — which trading session is currently active
- `isMarketOpen()` — whether XAUUSD is open according to market-hours logic
- `getMarketStatus()` — a UI-friendly wrapper returning open/closed plus details
- `getUpcomingSession()` — checks if a new session is coming soon

The important design point here is that it uses real timezone-aware logic rather than static hour guesses, so the app behaves correctly across DST transitions.

#### `lib/priceLevels.ts`

This module tracks previous daily and weekly high/low levels and watches whether the live price breaks those levels.

It does a few important things:

- loads cached price-level state from Supabase app settings
- refreshes the level cache once per day
- fetches previous completed daily / weekly bars from Twelve Data
- checks for price-level break events
- writes “already notified” flags so the same break doesn’t spam the UI repeatedly

This is part of the live notification and market-risk layer.

#### `lib/points.ts`

A lightweight utility for converting price differences into points.

It supports:

- point distance calculations between entries and stops / targets
- signal summary generation for reward/risk ratio inspection

This is useful for showing how far a signal moved in points and for interpreting risk-adjusted outcomes.

#### `lib/backtest/engine.ts`

This is the historical engine used to simulate or reason about strategy behavior on past data.

It contains a large amount of logic for:

- bars and timeframe data models
- box-chain state and breakout analysis
- protected swing detection
- signal generation parameters and defaults
- historical signal simulation
- aggregated win/loss summaries, RR breakdowns, grade breakdowns, and session breakdowns

The file is effectively a custom strategy engine implementation rather than a thin wrapper around an external library. It is designed to approximate a Pine-script-like trading logic model in TypeScript so the app can simulate and review performance.

#### `lib/analysis/analyseSignal.ts`

This contains the signal-analysis logic used to review a trading signal before it is considered valid or invalid. It includes:

- prompt generation for a Groq/OpenAI-like model call
- signal context extraction
- live price movement evaluation
- calendar/news risk checks
- structured verdict output (`valid` or `invalid`)
- preferred RR selection logic when a signal is weak or misaligned

This is the main “decision-making” layer used to assess strategy quality and whether a signal should be treated as valid.

---

## Core concepts in the project

### 1. Signal lifecycle

The app treats a signal as a live decision object that flows through stages such as:

- created / incoming
- open
- analysed
- closed
- resolved with final outcome

Signals are stored and tracked in Supabase and the UI reads them live with realtime subscriptions.

### 2. Market cycle / box-chain state

The overview pages reference a “box-chain state” concept. This is a visual representation of market structure across multiple timeframes. The logic is designed to approximate an institutional-style trend / rejection state view, combining:

- timeframe alignment
- bullish vs bearish bias
- rejection count
- breakout distance
- whether price is outside/inside the active structure

This is a strategic concept that sits behind the user dashboard’s market cycle widgets.

### 3. Session awareness

The app cares about real trading sessions such as London, New York, Tokyo, and Sydney, and also whether the XAUUSD market is currently open. Session detection is intentionally timezone-aware instead of static or naive.

This matters because:

- news risk changes by time of day
- market liquidity changes by session
- session markers in the topbar and notifications should match actual market conditions

### 4. Price-level monitoring

The app monitors previous day/week high and low levels and notifies when price breaks them. This is a classic market-structure watch list used to support breakout and continuation decisions.

### 5. News risk detection

The app includes logic for event calendar checks and news-window status. This helps determine whether a signal is firing near a high-impact macro event and whether that adds risk or invalidates the signal.

### 6. Backtest and strategy review

The project is not only a live dashboard. It also contains a backtesting engine. This allows historical signal sets to be simulated and summarized by:

- total signals
- wins / losses
- still-open signals
- win rate
- net points
- RR level performance
- grade-driven performance
- session-driven performance

This gives the project a research dimension rather than only a real-time monitoring angle.

---

## Realtime and live update pattern

Several components and pages subscribe to Supabase `postgres_changes` events.

This means when data changes in tables like `signals` or `notifications`, the UI updates without needing a full page refresh. Examples include:

- live news alerts
- new signal notifications
- open-signal status refreshes
- analysis updates
- overview refreshes

The client’s watch pattern is a major part of the “live desk” feel.

---

## Data layer assumptions

The app assumes a Supabase-compatible database with tables such as:

- `signals`
- `analysed_signals`
- `notifications`
- `app_settings`

It also expects data fields like:

- `created_at`
- `status`
- `signal_type`
- `direction`
- `entry`
- `exits`
- `final_outcome`
- `htf_confluence`
- `signal_id`

If the database is not configured, the app is designed to still boot without crashing, but live tables and market monitoring features will not return real data until the environment is connected.

---

## Environment variables and configuration

The project is configured around a small set of environment variables that may be needed for real data integration.

Typical examples include:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_KEY`
- `TWELVEDATA_API_KEY_RESOLUTION`
- any model/API keys used in analysis routes

The app includes safe fallbacks in the Supabase client so the UI does not crash during build in the absence of credentials.

For a real personal deployment, you would normally configure these keys in `.env.local` or your hosting environment.

---

## Local development

Install dependencies:

```bash
npm install
```

Start the dev server:

```bash
npm run dev
```

Open the app in a browser:

```text
http://localhost:3000
```

The app redirects to the main dashboard route (`/overview`) by default.

---

## Production build

```bash
npm run build
npm run start
```

This will compile the Next.js app, generate the production bundle, and serve it for production testing.

---

## Important implementation notes

### Personal-use architecture

This project is intentionally direct-access rather than multi-user. That means:

- no public auth flow required
- direct access to the dashboard is expected
- the app is optimized for a single personal workflow rather than a shared team product

### Safe startup behavior

A notable design choice is that the app tries not to crash during build time just because external credentials are unavailable. This is important for local dev and future deployment flexibility.

### Branding

The current branding is set to `JACK TRADE` and the app is oriented around a personal trading identity instead of a company or public-facing product label.

---

## File-by-file summary

Here is a concise mapping of the most important files in the project:

- `app/page.tsx` — root redirect to the dashboard
- `app/layout.tsx` — global metadata and font setup
- `app/(app)/layout.tsx` — shared layout for the trading app shell
- `components/Sidebar.tsx` — left navigation and signal badges
- `components/Topbar.tsx` — market status strip and notification system
- `lib/supabaseClient.ts` — safe Supabase configuration and client export
- `lib/sessions.ts` — market sessions and market-open logic
- `lib/priceLevels.ts` — cached previous daily and weekly price levels, plus break detection
- `lib/points.ts` — point calculations for signal metrics
- `lib/backtest/engine.ts` — strategy backtesting and historical simulation logic
- `lib/analysis/analyseSignal.ts` — signal analysis and verdict generation
- `app/api/fetch-calendar/route.ts` — economic calendar retrieval
- `app/api/process-news-signals/route.ts` — news-triggered signal handling
- `app/api/analyse-signals/route.ts` — batch signal analysis route
- `app/api/analyse-signal-now/route.ts` — single-signal analysis route
- `app/api/check-open-signals/route.ts` — open-signal checking logic
- `app/api/check-news-signals/route.ts` — news-signal checks
- `app/api/check-analysed-signals/route.ts` — reviewed-signal checks
- `app/api/check-transitions/route.ts` — state transition handling
- `app/api/backtest/route.ts` — backtesting route exposure
- `app/api/closed-signal-analysis/route.ts` — closed-signal pattern summarization
- `app/api/news-window-status/route.ts` — live active/inactive news-window status
- `app/api/settings/toggle-analysed-signals/route.ts` — analysed-signal toggling endpoint

---

## What this project is not

This is not a generic template app. It is not a public app marketplace product or a shared SaaS project. It is instead a specialized internal-style trading dashboard that embodies the developer’s own workflow and analysis preferences.

It is designed to feel like a practical command center rather than a generic starter app.

---

## Recommended next steps

If you continue developing this project, the most useful next improvements are usually:

1. define the exact database schema for `signals`, `notifications`, and `app_settings`
2. wire the remaining routes to a real live Supabase or external data source
3. tighten the signal-analysis prompts and validation logic
4. refine the dashboard widgets around your preferred trading style and metric set
5. document the exact market logic and strategy rules for future reference
6. add a `.env.example` file so environment setup is explicit and repeatable

---

## Summary

JACK TRADE is a single-user XAUUSD trading dashboard with a strong emphasis on signal monitoring, market context, analysis quality, and historical performance review. It combines Next.js UI, Supabase data access, realtime updates, price-level monitoring, backtesting, and analysis logic into one integrated trading workspace.

The codebase is structured around real-world trading operations rather than a generic frontend shell. It is built to help a single user keep track of signal activity, market state, and strategy quality in one place.
# JACK_XAU

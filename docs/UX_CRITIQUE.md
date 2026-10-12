# JACK TRADE — UX critique (Phase 0)

Method note (honest limitation): the brief asked for screenshots of every
page at 1440px and 390px. This environment could not produce them — the
headless Chromium backing the browser-automation skill fails to launch
(`libnspr4.so` missing, no system-package rights to install it). What *was*
verified live: every page returns HTTP 200 with no env vars, and
`/api/news-window-status` degrades to `{"active":false}` without crashing.
The critique below is therefore from full source reads of all 8 pages +
shell (every file cited), plus computed WCAG contrast ratios — not from
pixels. Recommend re-shooting screenshots on a machine with a working
browser during Phase 4 (design system), when the UI is replaced anyway.

Current palette (from `app/globals.css` + inline styles): bg `#05070A`,
panels `#0B0F14`/`#0F141A`, borders `#1B232C`, accent teal `#2DD4BF`,
pink `#FF2E63` (top gradient strip only), green `#34D399`, red `#F87171`,
muted `#7C8896`, faint `#3A434D`, amber `#F5A623`, blues `#2B8CE0`/`#7DD3FC`.

## Measured contrast (computed, WCAG AA text ≥ 4.5:1)

| Pair | Ratio | Verdict |
|---|---|---|
| `#7C8896` muted on `#0B0F14` panel | 5.33:1 | PASS (but see §3 — it carries too much load) |
| `#EDEFF2` primary on panel | 16.68:1 | PASS |
| `#2DD4BF` teal on panel | 10.32:1 | PASS |
| `#34D399`/`#F87171`/`#F5A623`/`#2B8CE0` on panel | 5.4–10:1 | PASS |
| **`#3A434D` on `#0B0F14`** | **1.91:1** | **FAIL — used for real text**: path labels (`signals:160`), rung labels, grade counts, tier counts (`signals:203`, `overview:203`), "no data" copy. Must go in Phase 4 token pass. |

## 1. What is cluttered / wrong hierarchy

1. **Topbar tries to be 6 widgets in one strip** (`Topbar.tsx:181-234`): brand dot, dead "live price pending" text (permanent placeholder — there is no price feed), EAT clock, last-signal age, news badge, market badge, session badge, bell. On 390px this is a horizontally scrolling mush (`overflow-x-auto`) where the most important item (session) is `ml-auto` — i.e. scrolled out of view. The brief's "state in 2 seconds" rule fails on mobile first.
2. **Overview leads with a decorative gauge** (`overview:116-138`): a full-circle SVG ring that renders only binary BULLISH/BEARISH (dasharray `465 0` or `0 465` — it is a donut that is either full or empty, not a gauge). It consumes ~40% of viewport height to communicate one bit. Timeframe boxes below repeat the same information per-TF. A trader wants: price, session, open exposure, next news — none are on this page.
3. **Three pages show the same resolved-signal list**: `analysis` (resolved dropdown+list), `performance` (aggregates), `analysed-signals` (resolved ledger). No cross-links; each has its own filter chips with different labels for the same outcomes (`successful` vs `TP HIT` vs `tp_hit`).
4. **Backtest page is a 529-line form+results monolith** with inline type copies (admits drift risk in comments at :42-60). Results render all configs stacked vertically; no compare view, no run history.

## 2. Colour that fights the brief's own rules (§3.4)

- **Red/green used for decoration**: the top gradient strip is pink `#FF2E63` (`Topbar.tsx:169`) — a P&L colour used as chrome. The "new analysed" glow dot is teal-green (`Sidebar.tsx:151-154`) while "new signal" is red (`:158`) — red reads as *loss/danger*, not "unread". News blue `#2B8CE0` doubles as "TP HIT/successful" badge colour (`analysed-signals:296-298`, `analysis:199`) — success should be green-family only.
- **Teal overload**: `#2DD4BF` is simultaneously brand accent, active-nav bg, entry labels, toggle-on, verdict VALID, progress bars, links, focus. One accent used ~40×/page stops being an accent.
- **Session/market/news badges all glow identically** (`glowStyle` box-shadows on 4 colours at once) — everything shouting means nothing is prioritised. Alarm fatigue by construction.

## 3. Density problems

- **Too low where it matters**: signals blotter shows 3 stat boxes + 2 risk lines per card; ~2 signals per viewport. No table, no sorting, no virtualization (fine at 50 rows, but the brief's 10k-row target needs the planned DataTable).
- **Too high where it hurts**: Topbar (above), performance page stacks 6 full-width sections with repeated show/hide `<details>` blocks and near-identical `LlmSuccessSection` twice.
- **Numbers without context**: Net Points, win %, grades shown bare — no vs-prev-period, no average, no target (violates §3.4 "every number has context"). Prices are mono but non-tabular alignment across cards; live updates would jitter (no `tabular-nums`).

## 4. Missing states (per page)

| Page | Loading | Empty | Error | Other |
|---|---|---|---|---|
| overview | none (blank until query returns) | "waiting on live signal feed" ✓ | none — RLS failure looks like empty (same bug class fixed on analysed-signals, not here) | — |
| signals | "Loading…" text | ✓ | none | — |
| analysed-signals | none | ✓ | ✓ (best in app — surfaces RLS message) | quota-exhausted + paused banners ✓ |
| news-signals | none | weak | none | no countdown, no pre/post window shading |
| performance | none | ✓ per-section | none | — |
| backtest | button spinner ✓ | diagnostics shown raw | ✓ basic | no progress for long runs; blocks on fetch |
| analysis | "Loading…" | ✓ | ✓ for patterns | dead `<select onChange={() => {}}>` (:180-184) — a control that does nothing |
| settings | n/a (static) | n/a | n/a | entire page is a placeholder ("will push through once wired") |
| global | no `loading.tsx`/`error.tsx`/404 | — | no retry anywhere; no reconnect banner for dropped realtime | no demo-mode ribbon (brief §5.1 requires one) |

## 5. What a trader wants first (proposal — for Phase 4/5 design)

Top strip: **price + change, session + market state, next news countdown, open exposure (count + live points/R), connection dot**. Workspace home: chart centre (doesn't exist yet — highest-value add), blotter bottom, context right. Everything else one keypress away (`⌘K`). Current Overview content (cycle gauge, TF boxes) becomes a collapsible "Market structure" panel, not the home page.

## 6. Accessibility notes (quick pass)

- No visible focus rings defined; icon-only left-rail (planned) will need labels — current bottom nav on mobile is text+icon ✓.
- Toasts/connection state don't exist yet, so no `aria-live` gaps *yet* — bake in during Phase 4.
- Colour-alone signalling is pervasive (status by dot colour; win/loss by bar colour) — Phase 4 must add labels/signs/arrows per §7.
- `prefers-reduced-motion` not respected (`animate-pulse` everywhere,-modal spin).

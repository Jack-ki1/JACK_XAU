# TradingView parity checker

Compares the JACK engine's simulated trades against a **Strategy Tester
trade-list export** from the original Pine strategy, for the same symbol,
timeframe and period. v2 C3.2 / backlog rank 4.

## Why

The engine (`packages/engine`) is a TypeScript *approximation* of a Pine
script. Until this tool reports `parity_ok`, every backtest in the UI is
labelled **unverified**.

## How to export from TradingView

1. Open the strategy on the XAUUSD chart, same period you will backtest.
2. Strategy Tester → **List of Trades** tab.
3. Export → CSV (column set varies slightly by TV version; the importer
   detects `Type / Entry Time / Entry Price / Exit Time / Exit Price`).

## Produce the engine side

Run the engine over the same period and dump trades in the normalized
shape the comparator expects:

```json
[
  { "time": "2026-01-05T10:30:00Z", "direction": "buy", "entry": 2650.1, "exit": 2656.2, "outcome": "tp_hit" }
]
```

(API: `POST /v1/backtests` → run result contains `signals`; map
`time/direction/entry/tp|sl/outcome` into the shape above.)

## Compare

```bash
node tools/parity/parity.mjs --tv tv-export.csv --ours engine-trades.json --tol 0.15 --out parity-report.json
```

- exit code 0 + `verdict: parity_ok` when ≥95 % of TV trades matched on
  entry time (≤5 min) or entry price (≤ `--tol`), and no exit mismatches.
- mismatches are bucketed: `tvOnly` (TV fired, engine missed),
  `ourOnly` (engine fired, TV missed), `exitMismatches` (same entry,
  different exit) — the buckets tell you *why* parity fails.

No dependencies; plain Node ≥18.

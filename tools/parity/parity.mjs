#!/usr/bin/env node
// tools/parity — TradingView Strategy Tester parity checker (v2 C3.2).
// Compares a trade list exported from TradingView against a normalized
// trade list produced from the JACK engine (or any source with the same
// JSON shape). Until a parity report shows ≥95% match, the UI labels
// backtests "unverified".
//
// Usage:
//   node tools/parity/parity.mjs --tv tv-export.csv --ours engine-trades.json [--tol 0.15] [--out report.json]
//
// TV CSV: Strategy Tester → export. We detect the standard columns by
// header names (Type/Entry Time/Entry Price/Exit Time/Exit Price/P/L).
// Ours JSON: [{ "time": ISO, "direction": "buy"|"sell", "entry": n, "exit": n, "outcome": "tp_hit"|"stopped_out" }]
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

const { values: args } = parseArgs({
  options: {
    tv: { type: 'string' },
    ours: { type: 'string' },
    tol: { type: 'string', default: '0.15' },
    out: { type: 'string' },
  },
});

if (!args.tv || !args.ours) {
  console.error('Usage: parity.mjs --tv <tv-export.csv> --ours <engine-trades.json> [--tol 0.15] [--out report.json]');
  process.exit(2);
}

const TOL = parseFloat(args.tol);

function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQ = false;
      else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

function normTime(s) {
  // TradingView exports like "2026-01-05 10:30" (exchange tz) or ISO.
  const t = Date.parse(String(s).replace(' ', 'T') + (String(s).includes('Z') || String(s).includes('+') ? '' : 'Z'));
  return Number.isFinite(t) ? t : null;
}

function parseTvCsv(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const col = (...names) => headers.findIndex((h) => names.some((n) => h.includes(n)));
  const iType = col('type', 'direction');
  const iEntryT = col('entry time', 'entry date', 'open time');
  const iEntryP = col('entry price');
  const iExitT = col('exit time', 'close time');
  const iExitP = col('exit price');
  const rows = [];
  for (let li = 1; li < lines.length; li++) {
    const cells = splitCsvLine(lines[li]);
    const type = String(cells[iType] ?? '').toLowerCase();
    const dir = type.includes('buy') || type.includes('long') ? 'buy' : type.includes('sell') || type.includes('short') ? 'sell' : null;
    if (!dir) continue; // skip totals / notes rows
    const entry = parseFloat(cells[iEntryP]);
    const exit = parseFloat(cells[iExitP]);
    rows.push({
      time: normTime(cells[iEntryT]),
      direction: dir,
      entry,
      exit: Number.isFinite(exit) ? exit : null,
      exitTime: normTime(cells[iExitT]),
      source: 'tradingview',
    });
  }
  return rows;
}

function loadOurs(path) {
  const data = JSON.parse(readFileSync(path, 'utf8'));
  if (!Array.isArray(data)) throw new Error('ours JSON must be an array of trades');
  return data.map((t) => ({
    time: normTime(t.time),
    direction: t.direction,
    entry: Number(t.entry),
    exit: t.exit != null ? Number(t.exit) : null,
    outcome: t.outcome ?? null,
    source: 'engine',
  }));
}

const tvTrades = parseTvCsv(readFileSync(args.tv, 'utf8'));
const ourTrades = loadOurs(args.ours);

const matched = [];
const tvOnly = [];
const usedOur = new Set();

for (const tv of tvTrades) {
  let best = null;
  let bestD = Infinity;
  for (let i = 0; i < ourTrades.length; i++) {
    if (usedOur.has(i)) continue;
    const o = ourTrades[i];
    if (o.direction !== tv.direction) continue;
    if (tv.time != null && o.time != null) {
      const dt = Math.abs(o.time - tv.time);
      // entry time within 5 minutes OR entry price within tolerance
      const priceOk = Number.isFinite(tv.entry) && Math.abs(o.entry - tv.entry) <= TOL;
      const timeOk = dt <= 5 * 60 * 1000;
      if (!priceOk && !timeOk) continue;
      const d = (timeOk ? dt / 60000 : 999) + (priceOk ? 0 : 100);
      if (d < bestD) { bestD = d; best = i; }
    }
  }
  if (best == null) {
    tvOnly.push(tv);
  } else {
    usedOur.add(best);
    const o = ourTrades[best];
    const exitMatch =
      o.exit == null || tv.exit == null
        ? null
        : Math.abs(o.exit - tv.exit) <= TOL;
    matched.push({ tv, ours: o, entryMatch: true, exitMatch });
  }
}
const ourOnly = ourTrades.filter((_, i) => !usedOur.has(i));
const exitMismatches = matched.filter((m) => m.exitMatch === false);
const verdict =
  tvTrades.length === 0
    ? 'no_tv_trades'
    : matched.length / tvTrades.length >= 0.95 && exitMismatches.length === 0
      ? 'parity_ok'
      : 'parity_failed';

const report = {
  generatedAt: new Date().toISOString(),
  tolerance: TOL,
  tvTrades: tvTrades.length,
  ourTrades: ourTrades.length,
  matched: matched.length,
  tvOnly: tvOnly.length,
  ourOnly: ourOnly.length,
  exitMismatches: exitMismatches.length,
  matchRate: tvTrades.length ? matched.length / tvTrades.length : null,
  verdict,
  mismatches: {
    tvOnly: tvOnly.slice(0, 50),
    ourOnly: ourOnly.slice(0, 50),
    exitMismatches: exitMismatches.slice(0, 50),
  },
};

const json = JSON.stringify(report, null, 2);
if (args.out) writeFileSync(args.out, json);
console.log(json);
process.exit(verdict === 'parity_ok' ? 0 : 1);

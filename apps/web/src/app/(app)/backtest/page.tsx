// app/(app)/backtest/page.tsx
'use client'
/* eslint-disable react-hooks/set-state-in-effect -- async run results land from poll */
import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/apiClient'
import {
  DEFAULT_PARAMS, monteCarlo,
  type BacktestParams, type SimulatedSignal, type BacktestSummary, type MonteCarloResult,
} from '@jack-trade/engine'

interface BacktestMeta {
  barsCounts: Record<string, number>;
  oneMinuteRangeActuallyFetched: { earliest: string; latest: string } | null;
  creditsUsed: number;
  used: number;
  limit: number;
}

// async run object returned by the API (POST 202 → poll GET)
interface BtRun {
  id: string
  status: 'running' | 'done' | 'error'
  progress: string
  createdAt: string
  startDate: string
  endDate: string
  results?: ConfigResult[]
  meta?: BacktestMeta
  error?: string
}

// STAGE SYNC: ConfigOverrides rewritten to match the real, current
// BacktestParams shape -- targetRR, useManualEntryFilter,
// useDxyFilter, atrSLMult, orderBlockMinDispPct, dojiBodyMaxPct, and
// rejectionWickMinPct have all been removed from the actual engine
// (see backtest-engine.ts's own Stage Sync notes for why), so keeping
// them here would let you configure a variant the backend silently
// ignores. sniperRRLevels/precisionRRLevels are arrays now, not a
// single number -- left out of this simple override UI for now
// rather than half-supported; ask if you want ladder editing added.
interface ConfigOverrides {
  maxSLPoints?: number
  slBufferPointsFlat?: number
  minSLPoints?: number
  htfMidRejMinCount?: number
  confirmDisplacementPct?: number
  execCsodDisplacementPct?: number
  pullbackDispMinPct?: number
  pullbackDispMaxPct?: number
  swingPivotLen?: number
}

interface ConfigDraft {
  id: number
  name: string
  overrides: ConfigOverrides
  isQuickPreset: boolean // STAGE ADD: quick-added variants render as a minimal one-line summary, not the full checkbox card
}

interface ConfigResult {
  name: string
  params: BacktestParams
  // Imported directly (was a hand-maintained inline copy that drifted twice —
  // see git history). Engine owns this shape incl. the v2 honesty fields and
  // rSequence for the research-lab Monte Carlo.
  summary: BacktestSummary
  signals: SimulatedSignal[]
  // STAGE ADD: remembering the lesson from the last build failure --
  // this page keeps its OWN inline copy of the response shape, so
  // anything added to the backend MUST be added here too or the
  // TypeScript build fails.
  diagnostics?: {
    totalBars: number
    barsSkippedByGuard: number
    barsEvaluated: number
    setupARawTrueCount: number
    setupBFiredStageCount: { armed: number; waitingRevert: number; waitingRealign: number }
    precisionRawTrueCount: number
  }
}

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}
function daysAgoISO(n: number) {
  return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10)
}

// STAGE ADD: real sample-size awareness, not just a caveat I have to
// remember to repeat -- Sniper and Precision have wildly different
// natural firing rates (historically ~75/day vs ~0.35/day), so a
// single global "small sample" threshold would either be too strict
// for Sniper or too loose for Precision. Tiers below are a reasonable
// statistical rule of thumb (variance of a win-rate estimate shrinks
// substantially past ~30), not a precise cutoff.
function sampleTier(n: number): { label: string; color: string } {
  if (n < 10) return { label: `n=${n} -- very small sample`, color: 'var(--bear)' }
  if (n < 30) return { label: `n=${n} -- small sample`, color: 'var(--warn)' }
  return { label: `n=${n} -- reasonable sample`, color: 'var(--bull)' }
}

const OVERRIDE_FIELDS: { key: keyof ConfigOverrides; label: string; step: number }[] = [
  { key: 'maxSLPoints', label: 'Max SL cap (points)', step: 10 },
  { key: 'slBufferPointsFlat', label: 'SL buffer (points)', step: 10 },
  { key: 'minSLPoints', label: 'Min SL (points)', step: 5 },
  { key: 'htfMidRejMinCount', label: 'HTF mid-rej min count (of 6)', step: 1 },
  { key: 'confirmDisplacementPct', label: 'Precision CSOD displacement %', step: 1 },
  { key: 'execCsodDisplacementPct', label: 'Setup A/B CSOD displacement %', step: 1 },
  { key: 'pullbackDispMinPct', label: 'Setup B pullback min %', step: 0.5 },
  { key: 'pullbackDispMaxPct', label: 'Setup B pullback max %', step: 0.5 },
  { key: 'swingPivotLen', label: 'Protected swing pivot length', step: 1 },
]

// STAGE ADD: one-click presets for the variants flagged as highest
// priority to actually test -- each button adds a fully pre-filled,
// still-editable variant directly to the list, no typing required.
// Capped to fit within the backend's 4-config-per-run limit alongside
// Baseline.
const QUICK_VARIANTS: { label: string; name: string; overrides: ConfigOverrides }[] = [
  { label: 'Wider SL cap (1000pts)', name: 'Wider SL cap (1000pts)', overrides: { maxSLPoints: 1000 } },
  { label: 'Looser Precision (1 of 6)', name: 'Looser Precision (1 of 6)', overrides: { htfMidRejMinCount: 1 } },
  { label: 'Looser Setup A/B CSOD (5%)', name: 'Looser Setup A/B CSOD (5%)', overrides: { execCsodDisplacementPct: 5 } },
  { label: 'Wider Setup B pullback', name: 'Wider Setup B pullback (50-85%)', overrides: { pullbackDispMinPct: 50, pullbackDispMaxPct: 85 } },
]

export default function BacktestPage() {
  const [startDate, setStartDate] = useState(daysAgoISO(5))
  const [endDate, setEndDate] = useState(todayISO())
  const [extraConfigs, setExtraConfigs] = useState<ConfigDraft[]>([])
  const [running, setRunning] = useState(false)
  const [runId, setRunId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<ConfigResult[] | null>(null)
  // Research lab: Monte Carlo over each result's per-trade R sequence.
  // Seeded → stable across re-renders; computed once per run result.
  const mcRuns = useMemo<{ name: string; mc: MonteCarloResult | null }[]>(
    () => (results ?? []).map((r) => ({
      name: r.name,
      mc: (r.summary.rSequence ?? []).length >= 10 ? monteCarlo(r.summary.rSequence, { iterations: 2000, seed: 42 }) : null,
    })),
    [results],
  )
  const [meta, setMeta] = useState<BacktestMeta | null>(null)
  const [expandedSignals, setExpandedSignals] = useState<Set<number>>(new Set())

  const atVariantCap = extraConfigs.length >= 3

  function addConfig() {
    setExtraConfigs(prev => [...prev, { id: Date.now(), name: `Variant ${prev.length + 1}`, overrides: {}, isQuickPreset: false }])
  }
  // STAGE ADD: adds a fully pre-filled preset in one click, per the
  // explicit request -- not just an empty form, the actual override
  // values land immediately, still editable afterward like any other
  // variant.
  function addQuickVariant(preset: { name: string; overrides: ConfigOverrides }) {
    setExtraConfigs(prev => [...prev, { id: Date.now(), name: preset.name, overrides: { ...preset.overrides }, isQuickPreset: true }])
  }
  function removeConfig(id: number) {
    setExtraConfigs(prev => prev.filter(c => c.id !== id))
  }
  function updateConfigName(id: number, name: string) {
    setExtraConfigs(prev => prev.map(c => c.id === id ? { ...c, name } : c))
  }
  function updateConfigOverride(id: number, key: keyof ConfigOverrides, value: number) {
    setExtraConfigs(prev => prev.map(c => c.id === id ? { ...c, overrides: { ...c.overrides, [key]: value } } : c))
  }
  function toggleOverrideEnabled(id: number, key: keyof ConfigOverrides) {
    setExtraConfigs(prev => prev.map(c => {
      if (c.id !== id) return c
      const next = { ...c.overrides }
      const isEnabled = key in c.overrides
      if (!isEnabled) {
        // STAGE FIX: real bug found from live output -- this used to
        // fill a newly-checked box with the number input's STEP size
        // (e.g. 0.5 for pullback min/max), not a sensible value. A
        // step of 0.5 became an almost-impossible-to-satisfy 0.5-0.5%
        // pullback window, which is exactly what silently zeroed out
        // every non-Baseline result. Now pulls the REAL backend
        // default straight from DEFAULT_PARAMS (imported directly
        // from the engine, so this can't drift out of sync again).
        next[key] = DEFAULT_PARAMS[key] as number
      } else {
        delete next[key]
      }
      return { ...c, overrides: next }
    }))
  }

  async function run() {
    setRunning(true)
    setError(null)
    setResults(null)
    setMeta(null)
    setRunId(null)
    try {
      const configs = [
        { name: 'Baseline (current live settings)', params: {} },
        ...extraConfigs.map(c => ({ name: c.name, params: c.overrides })),
      ]
      const started = await api<BtRun>('/backtests', {
        method: 'POST',
        body: JSON.stringify({ startDate, endDate, configs }),
      })
      setRunId(started.id)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Request failed.')
      setRunning(false)
    }
  }

  // Async-native: poll the active run until it finishes.
  const qc = useQueryClient()
  const { data: activeRun } = useQuery({
    queryKey: ['backtest-run', runId],
    enabled: !!runId,
    queryFn: () => api<BtRun>(`/backtests/${runId}`),
    staleTime: 0,
    refetchInterval: q => ((q.state.data as BtRun | undefined)?.status === 'running' ? 1000 : false),
  })

  useEffect(() => {
    if (!activeRun) return
    if (activeRun.status === 'done') {
      setResults(activeRun.results ?? null)
      setMeta(activeRun.meta ?? null)
      setRunning(false)
      void qc.invalidateQueries({ queryKey: ['backtest-runs'] })
    } else if (activeRun.status === 'error') {
      setError(activeRun.error ?? 'Backtest run failed.')
      setRunning(false)
    }
  }, [activeRun, qc])

  // Run history (last 20, in-memory on the API).
  const { data: runsData } = useQuery({
    queryKey: ['backtest-runs'],
    queryFn: () => api<{ runs: BtRun[] }>('/backtests'),
    refetchInterval: 10_000,
    staleTime: 5_000,
  })
  const runs = runsData?.runs ?? []

  function toggleSignal(idx: number) {
    setExpandedSignals(prev => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  return (
    <div className="p-6 md:p-8">
      <div className="mb-6">
        <h1 className="text-[26px] font-semibold tracking-[-0.02em] text-[var(--text-1)]">Backtest <span className="text-[var(--text-3)] font-normal">— historical simulation</span></h1>
        <div className="font-mono text-xs text-[var(--text-2)] mt-2">
          Runs the current live Pine logic (or your own parameter variants) against real historical price data. Not the actual Pine script executing -- a hand-ported replica, kept in sync with the live BRUVV script. Treat results as informative, not proven, until cross-checked against real signals.
        </div>
      </div>

      <div className="bg-[var(--bg-panel)] border border-[var(--border)] rounded-xl p-6 mb-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
          <div>
            <div className="text-[9px] text-[var(--text-2)] uppercase tracking-wide mb-1.5 font-mono">Start date</div>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              className="w-full bg-[var(--bg-raised)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--text-1)] font-mono text-sm" />
          </div>
          <div>
            <div className="text-[9px] text-[var(--text-2)] uppercase tracking-wide mb-1.5 font-mono">End date</div>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
              className="w-full bg-[var(--bg-raised)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--text-1)] font-mono text-sm" />
          </div>
        </div>
        <div className="font-mono text-[10px] text-[var(--text-2)] mb-5">
          Longer ranges cost more Twelve Data credits (1-minute data especially) -- keep this short (a few days to ~2 weeks) unless you specifically need more history. Also worth knowing: TradingView&apos;s Bar Replay on a 1-minute chart typically only reaches back a handful of days regardless of plan -- for verifying an older flagged signal, you may need to check it on a coarser timeframe instead.
        </div>

        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="font-mono text-[11px] tracking-widest text-[var(--text-2)] uppercase">
            Configurations to compare
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {QUICK_VARIANTS.map(preset => (
              <button key={preset.label} onClick={() => addQuickVariant(preset)} disabled={atVariantCap}
                title="Adds this variant, pre-filled, directly to the list below -- still editable after"
                className="font-mono text-[10px] px-2.5 py-1.5 rounded border border-[var(--info)] text-[var(--info)] disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[var(--info)]/10">
                + {preset.label}
              </button>
            ))}
            <button onClick={addConfig} disabled={atVariantCap}
              className="font-mono text-[11px] px-3 py-1.5 rounded border border-[var(--accent-blue)] text-[var(--accent-blue)] disabled:opacity-30 disabled:cursor-not-allowed">
              + Add blank variant
            </button>
          </div>
        </div>

        <div className="bg-[var(--bg-raised)] border border-[var(--border)] rounded-lg p-3 mb-3 font-mono text-xs text-[var(--text-2)]">
          Baseline (current live settings) — always included, uses every default from the live script.
        </div>

        {extraConfigs.map(cfg => {
          if (cfg.isQuickPreset) {
            // STAGE ADD: minimal display for quick-added presets --
            // just the name and what it actually changes, no
            // checkbox panel. Per explicit request: "click button,
            // get variant, done" -- the full card was clutter for a
            // preset that's already fully configured.
            const summary = Object.entries(cfg.overrides)
              .map(([k, v]) => `${OVERRIDE_FIELDS.find(f => f.key === k)?.label ?? k}: ${v}`)
              .join(' · ')
            return (
              <div key={cfg.id} className="bg-[var(--bg-raised)] border border-[var(--border)] rounded-lg px-4 py-3 mb-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[var(--text-1)] font-mono text-sm truncate">{cfg.name}</div>
                  <div className="text-[var(--text-2)] font-mono text-[10px] truncate">{summary}</div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <button
                    onClick={() => setExtraConfigs(prev => prev.map(c => c.id === cfg.id ? { ...c, isQuickPreset: false } : c))}
                    className="text-[var(--info)] font-mono text-[10px]" title="Expand to add more settings to this variant">
                    customize further
                  </button>
                  <button onClick={() => removeConfig(cfg.id)} className="text-[var(--bear)] font-mono text-xs">✕</button>
                </div>
              </div>
            )
          }

          return (
            <div key={cfg.id} className="bg-[var(--bg-raised)] border border-[var(--border)] rounded-lg p-4 mb-3">
              <div className="flex items-center justify-between mb-3">
                <input value={cfg.name} onChange={e => updateConfigName(cfg.id, e.target.value)}
                  className="bg-transparent text-[var(--text-1)] font-mono text-sm border-b border-[var(--border)] focus:outline-none focus:border-[var(--accent-blue)] flex-1 mr-3" />
                <button onClick={() => removeConfig(cfg.id)} className="text-[var(--bear)] font-mono text-xs">✕ remove</button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {OVERRIDE_FIELDS.map(field => {
                  const enabled = field.key in cfg.overrides
                  return (
                    <div key={field.key} className="flex items-center gap-2">
                      <input type="checkbox" checked={enabled}
                        onChange={() => toggleOverrideEnabled(cfg.id, field.key)} />
                      <span className="font-mono text-[11px] text-[var(--text-2)] flex-1">{field.label}</span>
                      <input type="number" step={field.step} disabled={!enabled}
                        value={enabled ? (cfg.overrides[field.key] as number) : ''}
                        onChange={e => updateConfigOverride(cfg.id, field.key, parseFloat(e.target.value))}
                        className="w-20 bg-[var(--bg-panel)] border border-[var(--border)] rounded px-2 py-1 text-[var(--text-1)] font-mono text-xs disabled:opacity-30" />
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}

        <button onClick={run} disabled={running}
          className="mt-2 bg-[var(--accent-blue)] text-[var(--bg-app)] font-mono text-sm font-bold px-5 py-2.5 rounded-lg disabled:opacity-50">
          {running ? (activeRun?.progress || 'Running…') : 'Run Backtest'}
        </button>

        {error && <div className="mt-4 font-mono text-xs text-[var(--bear)]">{error}</div>}
      </div>

      {runs.length > 0 && (
        <div className="surface p-4 mb-5">
          <div className="eyebrow mb-3">Run history (last {runs.length})</div>
          <div className="space-y-1">
            {runs.map(r => (
              <div key={r.id} className="flex items-center gap-3 font-mono text-[11px] py-1.5 border-b border-[var(--border)] last:border-0">
                <span className="text-[var(--text-3)] tnum">{r.createdAt.slice(0, 16).replace('T', ' ')}</span>
                <span className="text-[var(--text-2)] tnum">{r.startDate} → {r.endDate}</span>
                <span className={`px-1.5 rounded ${
                  r.status === 'done' ? 'text-[var(--bull)] bg-[var(--bull-bg)]'
                  : r.status === 'error' ? 'text-[var(--bear)] bg-[var(--bear-bg)]'
                  : 'text-[var(--warn)] bg-[var(--warn)]/15'
                }`}>{r.status.toUpperCase()}</span>
                {r.status === 'error' && <span className="text-[var(--bear)] truncate">{r.error}</span>}
                {r.status === 'running' && <span className="text-[var(--text-3)]">{r.progress}</span>}
                {r.status === 'done' && (
                  <button
                    onClick={() => { setError(null); setRunId(r.id) }}
                    className="ml-auto text-[var(--accent-blue)] hover:text-[var(--text-1)] uppercase tracking-wide text-[10px]"
                  >view results</button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {meta && (
        <div className="font-mono text-[10px] text-[var(--text-2)] mb-5">
          Bars fetched: 1m {meta.barsCounts['1m']} · 5m {meta.barsCounts['5m']} · 15m {meta.barsCounts['15m']} · 1h {meta.barsCounts['1h']} · 4h {meta.barsCounts['4h']} · D {meta.barsCounts['D']} · W {meta.barsCounts['W']} · M {meta.barsCounts['M']}
          <span className="ml-3">Twelve Data used: {meta.used}/{meta.limit} today ({meta.creditsUsed} this run)</span>
          {meta.oneMinuteRangeActuallyFetched && (
            <div className="mt-1 text-[var(--warn)]">
              1m data actually covers: {meta.oneMinuteRangeActuallyFetched.earliest} to {meta.oneMinuteRangeActuallyFetched.latest} -- compare against your requested start/end date above.
            </div>
          )}
        </div>
      )}

      {results && (
        <div className={`grid grid-cols-1 ${results.length > 1 ? 'lg:grid-cols-2' : ''} gap-5`}>
          {results.map((r, ri) => (
            <div key={ri} className="bg-[var(--bg-panel)] border border-[var(--border)] rounded-xl p-6">
              <div className="font-bold text-[var(--text-1)] mb-1">{r.name}</div>
              <div className="font-mono text-[10px] text-[var(--border-strong)] mb-4">
                SL cap {r.params.maxSLPoints}pts · HTF mid-rej {r.params.htfMidRejMinCount}/6 · Setup A/B CSOD {r.params.execCsodDisplacementPct}% · pullback {r.params.pullbackDispMinPct}-{r.params.pullbackDispMaxPct}%
              </div>

              <div className="flex items-center gap-6 mb-2 flex-wrap">
                <div>
                  <div className="text-2xl font-bold text-[var(--bull)]">{r.summary.winRate !== null ? r.summary.winRate + '%' : '—'}</div>
                  <div className="font-mono text-[10px] text-[var(--text-2)]">win rate</div>
                </div>
                <div>
                  <div className={`text-2xl font-bold ${r.summary.netPoints > 0 ? 'text-[var(--bull)]' : r.summary.netPoints < 0 ? 'text-[var(--bear)]' : 'text-[var(--text-1)]'}`}>
                    {r.summary.netPoints > 0 ? '+' : ''}{r.summary.netPoints}
                  </div>
                  <div className="font-mono text-[10px] text-[var(--text-2)]">net points</div>
                </div>
                <div>
                  <div className={`text-2xl font-bold ${r.summary.avgPointsPerSignal !== null && r.summary.avgPointsPerSignal > 0 ? 'text-[var(--bull)]' : r.summary.avgPointsPerSignal !== null && r.summary.avgPointsPerSignal < 0 ? 'text-[var(--bear)]' : 'text-[var(--text-1)]'}`}>
                    {r.summary.avgPointsPerSignal !== null ? (r.summary.avgPointsPerSignal > 0 ? '+' : '') + r.summary.avgPointsPerSignal : '—'}
                  </div>
                  <div className="font-mono text-[10px] text-[var(--text-2)]">avg pts / signal</div>
                </div>
                <div className="flex gap-4 font-mono text-xs">
                  <div className="text-center"><div className="text-[var(--bull)] font-bold">{r.summary.wins}</div><div className="text-[9px] text-[var(--text-2)]">wins</div></div>
                  <div className="text-center"><div className="text-[var(--bear)] font-bold">{r.summary.losses}</div><div className="text-[9px] text-[var(--text-2)]">losses</div></div>
                  <div className="text-center"><div className="text-[var(--text-2)] font-bold">{r.summary.stillOpen}</div><div className="text-[9px] text-[var(--text-2)]">open</div></div>
                </div>
              </div>

              {(() => {
                const overallN = r.summary.wins + r.summary.losses
                const tier = sampleTier(overallN)
                return (
                  <div className="font-mono text-[10px] mb-5" style={{ color: tier.color }}>
                    Sample size: {tier.label}
                  </div>
                )
              })()}

              {mcRuns[ri]?.mc && (() => {
                const mc = mcRuns[ri]!.mc!
                return (
                  <div className="mb-4 pb-4 border-b border-[var(--border)]">
                    <div className="font-mono text-[9px] text-[var(--border-strong)] uppercase mb-1.5">
                      Monte Carlo · 2000 seeded paths over this run&apos;s trades
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-xs">
                      <div>
                        <div className="text-[9px] text-[var(--text-2)]">median final</div>
                        <div className={mc.finalR.p50 >= 0 ? 'text-[var(--bull)]' : 'text-[var(--bear)]'}>{mc.finalR.p50.toFixed(1)}R</div>
                      </div>
                      <div>
                        <div className="text-[9px] text-[var(--text-2)]">p5 – p95</div>
                        <div className="text-[var(--text-1)]">{mc.finalR.p5.toFixed(1)}R … {mc.finalR.p95.toFixed(1)}R</div>
                      </div>
                      <div>
                        <div className="text-[9px] text-[var(--text-2)]">max DD (p95)</div>
                        <div className="text-[var(--warn)]">{mc.maxDrawdownR.p95.toFixed(1)}R</div>
                      </div>
                      <div>
                        <div className="text-[9px] text-[var(--text-2)]">ruin rate (≥10R DD)</div>
                        <div className={mc.ruinRate > 0.1 ? 'text-[var(--bear)]' : 'text-[var(--text-1)]'}>{(mc.ruinRate * 100).toFixed(1)}%</div>
                      </div>
                    </div>
                  </div>
                )
              })()}

              <div className="space-y-2 mb-4">
                {Object.entries(r.summary.byType).map(([type, stats]) => {
                  const n = stats.total
                  const tier = sampleTier(n)
                  return (
                    <div key={type} className="font-mono text-xs">
                      <div className="flex justify-between">
                        <span className="text-[var(--text-2)]">{type.replace(/_/g, ' ')} <span className="text-[var(--border-strong)]">· {stats.total}</span></span>
                        <span className="text-[var(--text-1)]">{stats.winRate !== null ? stats.winRate + '%' : '—'}</span>
                      </div>
                      {n > 0 && <div className="text-[9px] mt-0.5" style={{ color: tier.color }}>{tier.label}</div>}
                    </div>
                  )
                })}
              </div>

              {r.summary.byPath && (r.summary.byPath.setup_a?.total > 0 || r.summary.byPath.setup_b?.total > 0) && (
                <div className="space-y-2 mb-4 pt-3 border-t border-[var(--border)]">
                  <div className="font-mono text-[9px] text-[var(--border-strong)] uppercase mb-1">Sniper Confirmation, by path</div>
                  {Object.entries(r.summary.byPath).map(([path, stats]) => {
                    const n = stats.total
                    const tier = sampleTier(n)
                    return (
                      <div key={path} className="font-mono text-xs">
                        <div className="flex justify-between">
                          <span className="text-[var(--text-2)]">{path === 'setup_a' ? 'Setup A (CSOD+BOS)' : 'Setup B (realignment)'} <span className="text-[var(--border-strong)]">· {stats.total}</span></span>
                          <span className="text-[var(--text-1)]">{stats.winRate !== null ? stats.winRate + '%' : '—'}</span>
                        </div>
                        {n > 0 && <div className="text-[9px] mt-0.5" style={{ color: tier.color }}>{tier.label}</div>}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* STAGE ADD: three new breakdowns, per explicit request
                  to make Backtest surface output that actually helps
                  improve Pine, not just an overall number. */}
              {/* STAGE ADD: the piece that turns a zero-signal run
                  from an opaque mystery into a real answer -- shows
                  exactly where the funnel collapsed. Rendered
                  prominently (amber) when zero signals fired, since
                  that's precisely when it matters most. */}
              {r.diagnostics && (
                <div className={`rounded-lg p-3 mb-4 font-mono text-[10px] ${r.summary.total === 0 ? 'bg-[var(--warn)]/10 border border-[var(--warn)]/30 text-[var(--warn)]' : 'bg-[var(--bg-raised)] text-[var(--text-2)]'}`}>
                  <div className="uppercase tracking-wide mb-1.5 font-bold">Why this result (signal funnel)</div>
                  <div>Bars loaded: {r.diagnostics.totalBars} · evaluated: {r.diagnostics.barsEvaluated} · skipped (missing 15m/1m box data): {r.diagnostics.barsSkippedByGuard}</div>
                  <div className="mt-1">Setup A raw condition ever true: {r.diagnostics.setupARawTrueCount} bars</div>
                  <div>Setup B stages -- armed: {r.diagnostics.setupBFiredStageCount.armed} · awaiting pullback: {r.diagnostics.setupBFiredStageCount.waitingRevert} · awaiting realign: {r.diagnostics.setupBFiredStageCount.waitingRealign}</div>
                  <div>Precision raw condition ever true: {r.diagnostics.precisionRawTrueCount} bars</div>
                  {r.summary.total === 0 && (
                    <div className="mt-2 pt-2 border-t border-[var(--warn)]/20">
                      {r.diagnostics.barsEvaluated === 0
                        ? 'All bars were skipped -- the 15m or 1m box chain has no data for this range. Try a longer date range so the box logic has enough history to establish state.'
                        : r.diagnostics.setupARawTrueCount === 0 && r.diagnostics.precisionRawTrueCount === 0
                          ? 'Bars evaluated fine, but no setup condition was ever met in this window -- the gates genuinely never aligned here, not a data problem. A longer or different range would tell you more.'
                          : 'Conditions were met on some bars but no signal fired -- likely the one-shot latch or edge-detection blocking repeats. Worth investigating if this persists.'}
                    </div>
                  )}
                </div>
              )}

              {r.summary.byRRLevel && Object.keys(r.summary.byRRLevel).length > 0 && (
                <div className="space-y-2 mb-4 pt-3 border-t border-[var(--border)]">
                  <div className="font-mono text-[9px] text-[var(--border-strong)] uppercase mb-1">Win rate by R:R level used</div>
                  {Object.entries(r.summary.byRRLevel).map(([rr, stats]) => {
                    const n = stats.total
                    const tier = sampleTier(n)
                    return (
                      <div key={rr} className="font-mono text-xs">
                        <div className="flex justify-between">
                          <span className="text-[var(--text-2)]">{rr} <span className="text-[var(--border-strong)]">· {stats.total}</span></span>
                          <span className="text-[var(--text-1)]">{stats.winRate !== null ? stats.winRate + '%' : '—'}</span>
                        </div>
                        {n > 0 && <div className="text-[9px] mt-0.5" style={{ color: tier.color }}>{tier.label}</div>}
                      </div>
                    )
                  })}
                </div>
              )}

              {r.summary.byGrade && Object.keys(r.summary.byGrade).length > 0 && (
                <div className="space-y-2 mb-4 pt-3 border-t border-[var(--border)]">
                  <div className="font-mono text-[9px] text-[var(--border-strong)] uppercase mb-1">Win rate by grade band</div>
                  {Object.entries(r.summary.byGrade).map(([band, stats]) => {
                    const n = stats.total
                    const tier = sampleTier(n)
                    return (
                      <div key={band} className="font-mono text-xs">
                        <div className="flex justify-between">
                          <span className="text-[var(--text-2)]">{band} <span className="text-[var(--border-strong)]">· {stats.total}</span></span>
                          <span className="text-[var(--text-1)]">{stats.winRate !== null ? stats.winRate + '%' : '—'}</span>
                        </div>
                        {n > 0 && <div className="text-[9px] mt-0.5" style={{ color: tier.color }}>{tier.label}</div>}
                      </div>
                    )
                  })}
                </div>
              )}

              {r.summary.bySession && Object.keys(r.summary.bySession).length > 0 && (
                <div className="space-y-2 mb-4 pt-3 border-t border-[var(--border)]">
                  <div className="font-mono text-[9px] text-[var(--border-strong)] uppercase mb-1">Win rate by session</div>
                  {Object.entries(r.summary.bySession).map(([session, stats]) => {
                    const n = stats.total
                    const tier = sampleTier(n)
                    return (
                      <div key={session} className="font-mono text-xs">
                        <div className="flex justify-between">
                          <span className="text-[var(--text-2)]">{session} <span className="text-[var(--border-strong)]">· {stats.total}</span></span>
                          <span className="text-[var(--text-1)]">{stats.winRate !== null ? stats.winRate + '%' : '—'}</span>
                        </div>
                        {n > 0 && <div className="text-[9px] mt-0.5" style={{ color: tier.color }}>{tier.label}</div>}
                      </div>
                    )
                  })}
                </div>
              )}

              {r.signals.length > 0 && (
                <div className="border-t border-[var(--border)] pt-3 mt-3">
                  <div className="font-mono text-[10px] text-[var(--text-2)] uppercase mb-2">Individual signals ({r.signals.length})</div>
                  <div className="space-y-1.5 max-h-96 overflow-y-auto">
                    {r.signals.map((sig, si) => {
                      const key = ri * 10000 + si
                      const isExp = expandedSignals.has(key)
                      const isWin = sig.outcome === 'tp_hit'
                      return (
                        <div key={si} className="bg-[var(--bg-raised)] rounded p-2 font-mono text-[10px]">
                          <div className="flex justify-between items-center cursor-pointer" onClick={() => toggleSignal(key)}>
                            <span className="text-[var(--text-2)]">
                              {sig.time.slice(0, 16).replace('T', ' ')} · {sig.direction.toUpperCase()} · {sig.signalType}{sig.path ? ` (${sig.path})` : ''}
                            </span>
                            <span className={isWin ? 'text-[var(--bull)]' : sig.outcome === 'stopped_out' ? 'text-[var(--bear)]' : 'text-[var(--text-2)]'}>
                              {sig.outcome.replace(/_/g, ' ')}
                            </span>
                          </div>
                          {isExp && (
                            <div className="mt-1.5 pt-1.5 border-t border-[var(--border)] text-[var(--text-2)] space-y-0.5">
                              <div>Entry {sig.entry.toFixed(2)} · SL {sig.sl.toFixed(2)} · TP {sig.tp.toFixed(2)} · R:R 1:{sig.rrUsed}</div>
                              <div>Grade {sig.gradeValue}/7 · HTF rung {sig.htfRung} · exec {sig.execTf}m</div>
                              {sig.barsToResolve != null && <div>Resolved in {sig.barsToResolve} bars</div>}
                              <div className="text-[var(--accent-blue)] pt-1">
                                Bar Replay: jump to {new Date(sig.time).toISOString().replace('T', ' ').slice(0, 16)} UTC on the {sig.execTf}m chart to verify this against the real chart.
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
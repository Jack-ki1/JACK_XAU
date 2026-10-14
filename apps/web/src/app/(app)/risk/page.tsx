'use client'
/* eslint-disable react-hooks/set-state-in-effect -- localStorage must be read
   after mount (SSR has none) and writes are a side effect, not cascading state. */
// web/app/(app)/risk — v2 C5 Risk Desk: position-size calculator (engine
// positionSize), aggregate exposure vs desk caps, and open-signal book.
// Inputs persist in localStorage; sizing math is the shared engine's.
import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { positionSize, exposureSummary } from '@jack-trade/engine'
import type { SignalRow } from '@jack-trade/shared'
import { api } from '@/lib/apiClient'
import { isDemoMode } from '@/lib/env'
import { demoSignals } from '@/lib/demo'
import { Panel, Segmented, Skeleton } from '@/components/ui/Panel'
import { KpiTile } from '@/components/ui/widgets'

const STORAGE_KEY = 'jacktrade-risk-inputs'
const MAX_OPEN_LOTS = 5
const MAX_RISK_PCT = 5

interface RiskInputs {
  equity: number
  riskPct: number
  entry: string
  sl: string
  direction: 'buy' | 'sell'
  maxLots: number
}

const DEFAULTS: RiskInputs = { equity: 10_000, riskPct: 1, entry: '', sl: '', direction: 'buy', maxLots: 10 }

function loadInputs(): RiskInputs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<RiskInputs>) }
  } catch {
    /* corrupt storage — fall back to defaults */
  }
  return DEFAULTS
}

function num(v: string): number | null {
  const n = Number(v)
  return v.trim() !== '' && Number.isFinite(n) ? n : null
}

export default function RiskPage() {
  const [inputs, setInputs] = useState<RiskInputs>(DEFAULTS)
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    setInputs(loadInputs())
    setLoaded(true)
  }, [])
  useEffect(() => {
    if (loaded) localStorage.setItem(STORAGE_KEY, JSON.stringify(inputs))
  }, [inputs, loaded])

  const { data, isPending } = useQuery({
    queryKey: ['signals', 'risk'],
    queryFn: () => api<{ signals: SignalRow[] }>('/signals?limit=50'),
    staleTime: 30_000,
  })
  const openSignals = (isDemoMode() ? demoSignals : data?.signals ?? []).filter((s) => s.status === 'open')

  const entry = num(inputs.entry)
  const sl = num(inputs.sl)
  const sized = entry != null && sl != null
    ? positionSize({ equity: inputs.equity, riskPct: inputs.riskPct, entry, sl, direction: inputs.direction, maxLots: inputs.maxLots })
    : null

  // Exposure: size every open signal at the current inputs, then sum.
  const positions = openSignals.flatMap((s) => {
    const e = s.entry ?? null
    const stop = s.exits?.sl ?? null
    if (e == null || stop == null) return []
    return [{
      lots: positionSize({ equity: inputs.equity, riskPct: inputs.riskPct, entry: e, sl: stop, direction: s.direction === 'sell' ? 'sell' : 'buy' }).lots,
      direction: (s.direction === 'sell' ? 'sell' : 'buy') as 'buy' | 'sell',
      entry: e,
      sl: stop,
    }]
  })
  const exposure = exposureSummary({ equity: inputs.equity, positions, maxOpenLots: MAX_OPEN_LOTS, maxRiskPct: MAX_RISK_PCT })

  function fillFromSignal(sig: SignalRow) {
    setInputs((p) => ({
      ...p,
      entry: sig.entry != null ? String(sig.entry) : p.entry,
      sl: sig.exits?.sl != null ? String(sig.exits.sl) : p.sl,
      direction: sig.direction === 'sell' ? 'sell' : 'buy',
    }))
  }

  const field = 'h-9 w-full bg-[var(--bg-raised)] border border-[var(--border)] rounded px-2.5 font-mono text-sm text-[var(--text-1)] focus:outline-none focus:border-[var(--accent-blue)]'

  return (
    <div className="p-6 md:p-8 space-y-5">
      <div>
        <h1 className="text-[26px] font-semibold tracking-[-0.02em] text-[var(--text-1)]">Risk <span className="text-[var(--text-3)] font-normal">— sizing &amp; open exposure</span></h1>
        <div className="font-mono text-xs text-[var(--text-2)] mt-2">
          XAUUSD: 1 lot = 100 oz · $1.00 move = $100/lot · sizing rounds lots DOWN so you never over-risk
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">
        <Panel title="Position size">
          <div className="grid grid-cols-2 gap-3">
            <label className="col-span-1">
              <span className="eyebrow">Equity ($)</span>
              <input type="number" min={0} step={100} value={inputs.equity} onChange={(e) => setInputs((p) => ({ ...p, equity: Number(e.target.value) }))} className={`mt-1.5 ${field}`} />
            </label>
            <label className="col-span-1">
              <span className="eyebrow">Risk %</span>
              <input type="number" min={0} max={100} step={0.1} value={inputs.riskPct} onChange={(e) => setInputs((p) => ({ ...p, riskPct: Number(e.target.value) }))} className={`mt-1.5 ${field}`} />
            </label>
            <label className="col-span-1">
              <span className="eyebrow">Entry</span>
              <input type="number" step={0.01} value={inputs.entry} placeholder="2600.00" onChange={(e) => setInputs((p) => ({ ...p, entry: e.target.value }))} className={`mt-1.5 ${field}`} />
            </label>
            <label className="col-span-1">
              <span className="eyebrow">Stop loss</span>
              <input type="number" step={0.01} value={inputs.sl} placeholder="2598.00" onChange={(e) => setInputs((p) => ({ ...p, sl: e.target.value }))} className={`mt-1.5 ${field}`} />
            </label>
            <div className="col-span-1">
              <span className="eyebrow">Direction</span>
              <div className="mt-1.5">
                <Segmented<'buy' | 'sell'>
                  value={inputs.direction}
                  onChange={(v) => setInputs((p) => ({ ...p, direction: v }))}
                  options={[{ value: 'buy', label: 'BUY' }, { value: 'sell', label: 'SELL' }]}
                />
              </div>
            </div>
            <label className="col-span-1">
              <span className="eyebrow">Max lots cap</span>
              <input type="number" min={0.01} step={0.01} value={inputs.maxLots} onChange={(e) => setInputs((p) => ({ ...p, maxLots: Number(e.target.value) }))} className={`mt-1.5 ${field}`} />
            </label>
          </div>

          <div className="mt-4 flex gap-2 flex-wrap">
            {openSignals.slice(0, 3).map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => fillFromSignal(s)}
                className="font-mono text-[10px] px-2.5 py-1 rounded border border-[var(--border)] text-[var(--text-2)] hover:border-[var(--accent-blue)] hover:text-[var(--text-1)]"
              >
                ↑ #{s.id} {s.direction?.toUpperCase()} {s.entry} SL {s.exits?.sl ?? '—'}
              </button>
            ))}
            {openSignals.length === 0 && !isPending && (
              <span className="font-mono text-[11px] text-[var(--text-3)]">No open signals to prefill from.</span>
            )}
          </div>
        </Panel>

        <Panel title="Sizing result">
          {!sized ? (
            <Skeleton className="h-24" />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <KpiTile label="Size" value={`${sized.lots.toFixed(2)} lot`} sub={sized.lots === 0 ? 'below min — no trade' : `cap ${inputs.maxLots}`} />
                <KpiTile label="Planned loss @ SL" value={`$${sized.riskActual.toFixed(2)}`} sub={`${sized.riskPctActual.toFixed(2)}% of equity`} />
                <KpiTile label="Stop distance" value={`${sized.stopPoints} pts`} sub={`$${sized.riskPerLot.toFixed(2)} per lot`} />
                <KpiTile label="Target budget" value={`$${sized.riskAmount.toFixed(2)}`} sub={`${inputs.riskPct}% of $${inputs.equity}`} />
              </div>
              {sized.cappedBy === 'maxLots' && (
                <div className="mt-3 font-mono text-[11px] text-[var(--warn)]">⚠ Capped at {inputs.maxLots} lots — actual risk above target.</div>
              )}
              {sized.warnings.map((w) => (
                <div key={w} className="mt-2 font-mono text-[11px] text-[var(--warn)]">⚠ {w}</div>
              ))}
            </>
          )}
        </Panel>
      </div>

      <Panel
        title={`Open exposure — ${openSignals.length} open signal${openSignals.length === 1 ? '' : 's'} sized at current inputs`}
        right={<span className="font-mono text-[10px] text-[var(--text-3)]">desk caps: {MAX_OPEN_LOTS} lots · {MAX_RISK_PCT}%</span>}
      >
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiTile label="Total lots" value={`${exposure.totalLots.toFixed(2)}`} sub={exposure.limitLotsBreached ? '⚠ over desk cap' : `cap ${MAX_OPEN_LOTS} lots`} />
          <KpiTile label="Aggregate risk" value={`$${exposure.totalRiskAmount.toFixed(2)}`} sub={`${exposure.totalRiskPct.toFixed(2)}% of equity`} />
          <KpiTile label="Net direction" value={`${exposure.netLots >= 0 ? '+' : ''}${exposure.netLots.toFixed(2)} lots`} sub={exposure.netLots > 0 ? 'net long' : exposure.netLots < 0 ? 'net short' : 'flat'} />
          <KpiTile label="Risk vs cap" value={`${exposure.totalRiskPct.toFixed(2)} / ${MAX_RISK_PCT}%`} sub={exposure.limitRiskBreached ? '⚠ over desk cap' : 'within cap'} />
        </div>
        {exposure.warnings.map((w) => (
          <div key={w} className="mt-3 font-mono text-[11px] text-[var(--bear)]">⚠ {w}</div>
        ))}
        {exposure.warnings.length === 0 && (
          <div className="mt-3 font-mono text-[11px] text-[var(--bull)]">✓ Within desk limits.</div>
        )}
      </Panel>
    </div>
  )
}

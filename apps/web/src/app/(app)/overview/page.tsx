'use client'
// web/app/(app)/overview — Phase 5 chart workspace home.
// Data comes from the API through react-query (live via SSE invalidation);
// demo mode (no Supabase) still shows fixture stats, never a blank page.
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { HtfConfluenceEntry } from '@jack-trade/shared'
import { api, type DeskStatus } from '@/lib/apiClient'
import type { SignalRow } from '@jack-trade/shared'
import { isDemoMode } from '@/lib/env'
import { demoStats } from '@/lib/demo'
import ChartWorkspace from '@/components/chart/ChartWorkspace'
import { Panel, Stat, Skeleton } from '@/components/ui/Panel'

const TIMEFRAMES = [
  { key: '15', label: '15min' }, { key: '60', label: '1H' }, { key: '240', label: '4H' },
  { key: 'D', label: 'Daily' }, { key: 'W', label: 'Weekly' }, { key: 'M', label: 'Monthly' },
  { key: '12M', label: 'Year' },
]

export default function OverviewPage() {
  const [selectedTf, setSelectedTf] = useState('15')

  const { data: desk, isPending: deskPending } = useQuery({
    queryKey: ['desk'],
    queryFn: () => api<DeskStatus>('/desk/status'),
  })
  const { data: perf, isPending: perfPending } = useQuery({
    queryKey: ['performance'],
    queryFn: () => api<{ winRate: number | null; netPoints: number }>('/performance'),
  })
  const { data: recent } = useQuery({
    queryKey: ['signals', 'recent'],
    queryFn: () => api<{ signals: SignalRow[] }>('/signals?limit=1'),
    staleTime: 30_000,
  })

  const confluence: HtfConfluenceEntry[] = useMemo(() => {
    if (isDemoMode()) return []
    return recent?.signals?.[0]?.htf_confluence ?? []
  }, [recent])

  const demo = isDemoMode()
  const openCount = demo ? demoStats.open : desk?.openCount ?? null
  const winRate = demo ? demoStats.successRate : perf?.winRate ?? null
  const net = demo ? demoStats.net : perf?.netPoints ?? null
  const staleCount = desk?.staleOpenCount ?? 0

  const selectedState = confluence.find((c) => c.tf === selectedTf)
  const rawState = selectedState?.state
  const hasData = rawState === 'bullish' || rawState === 'bearish'
  const isBullish = rawState === 'bullish'
  const gaugeColor = !hasData ? 'var(--border-strong)' : isBullish ? 'var(--bull)' : 'var(--bear)'
  const gaugeDash = hasData ? '465 0' : '0 465'

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[26px] font-semibold tracking-[-0.02em] text-[var(--text-1)]">Overview</h1>
          <div className="eyebrow mt-1">chart workspace · box-chain bias · live desk status</div>
        </div>
        <div className="font-mono text-[10px] text-[var(--text-3)]">
          last signal: {desk?.lastSignalAt ? new Date(desk.lastSignalAt).toISOString().slice(11, 16) + ' UTC' : '—'}
          {desk?.stream ? ` · stream: ${desk.stream.subscribers > 0 ? 'live' : 'polling'}` : ''}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {deskPending && !demo ? (
          <Skeleton className="h-20" />
        ) : (
          <Stat label="Open Signals" value={openCount ?? '—'} />
        )}
        <Stat
          label="Stale >48h"
          value={staleCount}
          tone={staleCount > 0 ? 'warn' : undefined}
          sub={desk ? `unchecked of ${desk.openCount} open` : undefined}
        />
        {perfPending && !demo ? (
          <Skeleton className="h-20" />
        ) : (
          <Stat label="Win Rate" value={winRate != null ? `${winRate}%` : '—'} tone="bull" />
        )}
        <Stat
          label="Net Points"
          value={net == null ? '—' : `${net > 0 ? '+' : ''}${net}`}
          tone={net == null ? undefined : net > 0 ? 'bull' : net < 0 ? 'bear' : undefined}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 min-w-0">
          <ChartWorkspace />
        </div>

        <div className="space-y-4 min-w-0">
          <Panel title="Market Cycle — box-chain bias">
            <div className="flex flex-col items-center">
              <svg width="150" height="150" viewBox="0 0 180 180">
                <circle cx="90" cy="90" r="74" fill="none" style={{ stroke: 'var(--bg-raised)' }} strokeWidth="12" />
                <circle
                  cx="90" cy="90" r="74" fill="none" stroke={gaugeColor} strokeWidth="12"
                  strokeDasharray={gaugeDash} strokeLinecap="round" transform="rotate(-90 90 90)" opacity="0.9"
                  style={{ transition: 'stroke 0.2s ease' }}
                />
              </svg>
              <div className="text-center -mt-[105px] mb-[75px]">
                <div className="text-lg font-bold tracking-wide" style={{ color: gaugeColor }}>
                  {rawState === 'pending' ? 'PENDING' : !hasData ? '—' : isBullish ? 'BULLISH' : 'BEARISH'}
                </div>
                <div className="eyebrow mt-1">{TIMEFRAMES.find((t) => t.key === selectedTf)?.label} state</div>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {TIMEFRAMES.map((tf) => (
                <button
                  key={tf.key}
                  onClick={() => setSelectedTf(tf.key)}
                  className={`text-[11px] px-2 py-1 rounded border transition-colors ${
                    selectedTf === tf.key
                      ? 'border-[var(--accent-blue-solid)] bg-[var(--accent-blue-solid)] text-[var(--on-accent)]'
                      : 'border-[var(--border)] text-[var(--text-2)] hover:border-[var(--border-strong)]'
                  }`}
                >
                  {tf.label}
                </button>
              ))}
            </div>
            <div className="mt-3 surface-raised p-3 font-mono text-[11px] text-[var(--text-2)] leading-relaxed">
              {!selectedState ? (
                'No data yet for this timeframe — waiting on live signal feed.'
              ) : (
                <>
                  <span style={{ color: gaugeColor }} className="font-semibold">
                    {rawState === 'pending' ? 'Pending' : isBullish ? 'Bullish' : 'Bearish'}
                  </span>
                  {' '}— {TIMEFRAMES.find((t) => t.key === selectedTf)?.label} box-chain state
                  {selectedState.fade_active ? ', price outside box edge' : ''}
                  {selectedState.rejections ? `, ${selectedState.rejections} rejection(s)` : ''}.
                </>
              )}
            </div>
          </Panel>

          <Panel title="Timeframe Boxes">
            {confluence.length === 0 ? (
              <div className="font-mono text-[11px] text-[var(--text-3)]">
                No signal feed yet — boxes fill when TradingView pushes a signal.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {TIMEFRAMES.map((tf) => {
                  const c = confluence.find((x) => x.tf === tf.key)
                  const st = c?.state
                  return (
                    <div key={tf.key} className="surface-raised p-2.5">
                      <div className="eyebrow !text-[9px] mb-1">{tf.label}</div>
                      <div className={`font-mono text-xs font-semibold ${st === 'bullish' ? 'text-[var(--bull)]' : st === 'bearish' ? 'text-[var(--bear)]' : 'text-[var(--text-2)]'}`}>
                        {st === 'bullish' ? 'BULLISH' : st === 'bearish' ? 'BEARISH' : st === 'pending' ? 'PENDING' : '—'}
                      </div>
                      {c?.fade_active && <div className="font-mono text-[9px] text-[var(--info)] mt-0.5">OUTSIDE EDGE</div>}
                    </div>
                  )
                })}
              </div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  )
}

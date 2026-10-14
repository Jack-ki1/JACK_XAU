'use client'
// web/app/(app)/overview — v2 Desk Overview: customisable widget grid.
// Widgets: KPI tiles (net MTD, today P/L, win rate, open signals), chart
// workspace, desk-bias gauge, TF boxes, next-event countdown, signal feed,
// system status strip. Named layouts (Live/Review/Research) persisted;
// home loads the last used layout. Data via react-query + SSE invalidation.
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { HtfConfluenceEntry } from '@jack-trade/shared'
import { api, type DeskStatus, type NotificationItem } from '@/lib/apiClient'
import type { SignalRow } from '@jack-trade/shared'
import { isDemoMode } from '@/lib/env'
import { demoStats } from '@/lib/demo'
import ChartWorkspace from '@/components/chart/ChartWorkspace'
import { Panel, Skeleton } from '@/components/ui/Panel'
import {
  GlassCard, KpiTile, CountdownRing, StatusStrip, PillBadge, type StatusItem,
} from '@/components/ui/widgets'
import { useLayouts, WIDGET_IDS, type WidgetId } from '@/lib/layouts'

const TIMEFRAMES = [
  { key: '15', label: '15min' }, { key: '60', label: '1H' }, { key: '240', label: '4H' },
  { key: 'D', label: 'Daily' }, { key: 'W', label: 'Weekly' }, { key: 'M', label: 'Monthly' },
  { key: '12M', label: 'Year' },
]

interface CalendarResponse { events: { event_time: string; event_name: string; impact: string | null }[] }
interface CreditsResponse { credits: Record<string, { dayUsed: number; dayLimit: number }> }

export default function OverviewPage() {
  const [selectedTf, setSelectedTf] = useState('15')
  // Fixed at mount: keeps the "next event" pick stable across re-renders
  // (the react-query refresh re-runs this component anyway).
  const [now] = useState(() => Date.now())
  const layouts = useLayouts()
  const order = layouts.layouts[layouts.active] ?? WIDGET_IDS.slice()

  const { data: desk, isPending: deskPending } = useQuery({
    queryKey: ['desk'],
    queryFn: () => api<DeskStatus>('/desk/status'),
  })
  const { data: perf } = useQuery({
    queryKey: ['performance'],
    queryFn: () => api<{ winRate: number | null; netPoints: number }>('/performance'),
  })
  const { data: recent } = useQuery({
    queryKey: ['signals', 'recent'],
    queryFn: () => api<{ signals: SignalRow[] }>('/signals?limit=5'),
    staleTime: 30_000,
  })
  const { data: calendar } = useQuery({
    queryKey: ['calendar', 'today'],
    queryFn: () => api<CalendarResponse>('/calendar'),
    staleTime: 10 * 60_000,
  })
  const { data: notifications } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api<{ notifications: NotificationItem[] }>('/notifications?limit=12'),
    staleTime: 30_000,
  })
  const { data: credits } = useQuery({
    queryKey: ['credits'],
    queryFn: () => api<CreditsResponse>('/ops/credits'),
    staleTime: 60_000,
  })

  const confluence: HtfConfluenceEntry[] = useMemo(() => {
    if (isDemoMode()) return []
    return recent?.signals?.[0]?.htf_confluence ?? []
  }, [recent])

  const nextEvent = useMemo(() => {
    const events = calendar?.events ?? []
    return events.find((e) => new Date(e.event_time).getTime() > now && (e.impact ?? '').toLowerCase().includes('high')) ?? null
  }, [calendar, now])

  const demo = isDemoMode()
  const openCount = demo ? demoStats.open : desk?.openCount ?? null
  const winRate = demo ? demoStats.successRate : perf?.winRate ?? null
  const net = demo ? demoStats.net : perf?.netPoints ?? null
  const staleCount = desk?.staleOpenCount ?? 0

  const selectedState = confluence.find((c) => c.tf === selectedTf)
  const rawState = selectedState?.state
  const hasData = rawState === 'bullish' || rawState === 'bearish'
  const isBullish = rawState === 'bullish'
  const biasValue = !hasData ? 50 : isBullish ? 72 : 28

  const tdCredits = credits?.credits?.resolution
  const statusItems: StatusItem[] = [
    { key: 'feed', label: 'Data feed', value: demo ? 'demo' : 'live', tone: demo ? 'warn' : 'ok' },
    { key: 'db', label: 'Supabase', value: demo ? 'demo' : 'configured', tone: demo ? 'warn' : 'ok' },
    { key: 'stream', label: 'Stream', value: desk?.stream?.subscribers ? 'live' : 'polling', tone: desk?.stream?.subscribers ? 'ok' : 'warn' },
    { key: 'jobs', label: 'Jobs', value: desk ? 'ok' : '—', tone: desk ? 'ok' : 'muted' },
    {
      key: 'credits',
      label: 'TD credits',
      value: tdCredits ? `${Math.max(tdCredits.dayLimit - tdCredits.dayUsed, 0)}/${tdCredits.dayLimit}` : '—',
      tone: tdCredits ? (tdCredits.dayUsed / tdCredits.dayLimit > 0.8 ? 'bad' : tdCredits.dayUsed / tdCredits.dayLimit > 0.5 ? 'warn' : 'ok') : 'muted',
    },
  ]

  const widgets: Record<WidgetId, React.ReactNode> = {
    'net-mtd': (
      <KpiTile
        label="Net result (points)"
        value={net == null ? '—' : `${net > 0 ? '+' : ''}${net}`}
        delta={net == null ? null : Math.round(net / 100)}
        deltaUnit="R≈"
        spark={undefined}
        sub="MTD · from resolved signals"
      />
    ),
    'today-pl': (
      <KpiTile
        label="Stale >48h"
        value={staleCount}
        delta={null}
        sub={desk ? `of ${desk.openCount} open — resolver sweep every 10m` : undefined}
      />
    ),
    'win-rate': (
      <KpiTile
        label="Win rate"
        value={winRate != null ? `${winRate}%` : '—'}
        delta={null}
        sub={demo ? 'demo fixture' : 'closed signals · small-sample <30 flagged on Performance'}
      />
    ),
    'open-signals': (
      <KpiTile
        label="Open signals"
        value={openCount ?? '—'}
        delta={null}
        sub={desk?.lastSignalAt ? `last ${new Date(desk.lastSignalAt).toISOString().slice(11, 16)} UTC` : 'no feed yet'}
      />
    ),
    chart: (
      <GlassCard hover={false} className="min-w-0">
        <ChartWorkspace />
      </GlassCard>
    ),
    'bias-gauge': (
      <Panel title="Desk bias — HTF box-chain">
        <div className="flex flex-col items-center gap-3">
          <div className="relative w-[180px] h-[110px]">
            <svg width="180" height="110" viewBox="0 0 180 110" aria-hidden>
              <path d="M20,100 A70,70 0 0 1 160,100" fill="none" stroke="var(--bg-raised)" strokeWidth="12" strokeLinecap="round" />
              <path
                d="M20,100 A70,70 0 0 1 160,100"
                fill="none"
                stroke={hasData ? (isBullish ? 'var(--green-fill)' : 'var(--rose-fill)') : 'var(--border-strong)'}
                strokeWidth="12"
                strokeLinecap="round"
                strokeDasharray={`${(biasValue / 100) * 220} 220`}
                style={{ transition: 'stroke-dasharray 0.3s ease' }}
              />
            </svg>
            <div className="absolute inset-x-0 bottom-0 text-center">
              <div className="tnum text-[24px] font-semibold text-[var(--text-1)] leading-none">{hasData ? biasValue : '—'}</div>
              <div className="eyebrow mt-1">{rawState === 'pending' ? 'pending' : !hasData ? 'no data' : isBullish ? 'bullish' : 'bearish'}</div>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 justify-center">
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf.key}
                type="button"
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
          <div className="surface-raised p-3 font-mono text-[11px] text-[var(--text-2)] leading-relaxed w-full">
            {!selectedState
              ? 'No data yet for this timeframe — waiting on live signal feed.'
              : (
                <>
                  <span className="font-semibold" style={{ color: hasData ? (isBullish ? 'var(--green-text)' : 'var(--rose-text)') : undefined }}>
                    {rawState === 'pending' ? 'Pending' : isBullish ? 'Bullish' : 'Bearish'}
                  </span>
                  {' '}— {TIMEFRAMES.find((t) => t.key === selectedTf)?.label} box-chain
                  {selectedState.fade_active ? ', outside box edge' : ''}
                  {selectedState.rejections ? `, ${selectedState.rejections} rejection(s)` : ''}.
                </>
              )}
          </div>
        </div>
      </Panel>
    ),
    'tf-boxes': (
      <Panel title="Timeframe boxes">
        {confluence.length === 0 ? (
          <div className="font-mono text-[11px] text-[var(--text-3)]">No signal feed yet — boxes fill when TradingView pushes a signal.</div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {TIMEFRAMES.map((tf) => {
              const c = confluence.find((x) => x.tf === tf.key)
              const st = c?.state
              return (
                <div key={tf.key} className="surface-raised p-2.5">
                  <div className="eyebrow !text-[9px] mb-1">{tf.label}</div>
                  <div className={`font-mono text-xs font-semibold ${st === 'bullish' ? 'text-[var(--bull)]' : st === 'bearish' ? 'text-[var(--bear)]' : 'text-[var(--text-2)]'}`}>
                    {st === 'bullish' ? '▲ BULLISH' : st === 'bearish' ? '▼ BEARISH' : st === 'pending' ? 'PENDING' : '—'}
                  </div>
                  {c?.fade_active && <div className="font-mono text-[9px] text-[var(--info)] mt-0.5">OUTSIDE EDGE</div>}
                </div>
              )
            })}
          </div>
        )}
      </Panel>
    ),
    'next-event': (
      <GlassCard className="p-4 flex flex-col items-center gap-2">
        <div className="eyebrow self-start">Next high-impact event</div>
        {nextEvent ? (
          <>
            <CountdownRing
              targetIso={nextEvent.event_time}
              label={nextEvent.event_name.slice(0, 18)}
              totalMs={24 * 3_600_000}
            />
            <div className="font-mono text-[10px] text-[var(--text-2)] text-center">
              {new Date(nextEvent.event_time).toISOString().slice(11, 16)} UTC · {nextEvent.event_name}
            </div>
          </>
        ) : (
          <div className="font-mono text-[11px] text-[var(--text-3)] py-8">No upcoming high-impact events on the calendar.</div>
        )}
      </GlassCard>
    ),
    feed: (
      <Panel title="Signal event feed">
        {(notifications?.notifications ?? []).length === 0 ? (
          <div className="font-mono text-[11px] text-[var(--text-3)]">No events yet.</div>
        ) : (
          <div className="space-y-1.5 max-h-[280px] overflow-y-auto pr-1">
            {(notifications?.notifications ?? []).map((n) => (
              <div key={n.id} className="flex items-start gap-2 text-[12px] surface-raised px-2.5 py-2">
                <PillBadge tone={n.type.includes('news') ? 'orange' : n.type.includes('session') ? 'sky' : 'neutral'}>
                  {n.type.replace(/_/g, ' ')}
                </PillBadge>
                <span className="text-[var(--text-2)] leading-snug min-w-0">{n.message}</span>
                <span className="tnum ml-auto text-[10px] text-[var(--text-3)] shrink-0">
                  {new Date(n.created_at).toISOString().slice(11, 16)}
                </span>
              </div>
            ))}
          </div>
        )}
        {(recent?.signals ?? []).length > 0 && (
          <div className="mt-3 pt-3 border-t border-[var(--border)] space-y-1.5">
            <div className="eyebrow !text-[9px]">Latest signals</div>
            {recent!.signals.map((s) => (
              <div key={s.signal_id} className="flex items-center gap-2 text-[11px] font-mono text-[var(--text-2)]">
                <span className={s.direction === 'buy' ? 'text-[var(--bull)]' : 'text-[var(--bear)]'}>
                  {s.direction === 'buy' ? '▲' : '▼'} {s.direction?.toUpperCase()}
                </span>
                <span>{s.entry}</span>
                <span className="text-[var(--text-3)]">{s.signal_type}</span>
                <span className="ml-auto text-[var(--text-3)]">{new Date(s.created_at).toISOString().slice(5, 16).replace('T', ' ')}</span>
              </div>
            ))}
          </div>
        )}
      </Panel>
    ),
    status: (
      <GlassCard hover={false} className="overflow-hidden">
        <StatusStrip items={statusItems} />
      </GlassCard>
    ),
  }

  return (
    <div
      className="p-4 md:p-6 space-y-4 min-h-full"
      style={{ backgroundImage: 'var(--bg-mesh)', backgroundAttachment: 'fixed' }}
    >
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[26px] font-semibold tracking-[-0.02em] text-[var(--text-1)]">Desk</h1>
          <div className="eyebrow mt-1">widget grid · chart workspace · live status</div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={layouts.active}
            onChange={(e) => layouts.setActive(e.target.value)}
            className="h-8 rounded border border-[var(--border)] bg-[var(--bg-raised)] px-2 text-[11px] text-[var(--text-1)]"
            aria-label="Layout"
          >
            {Object.keys(layouts.layouts).map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) {
                layouts.toggleWidget(layouts.active, e.target.value as WidgetId)
                e.target.value = ''
              }
            }}
            className="h-8 rounded border border-[var(--border)] bg-[var(--bg-raised)] px-2 text-[11px] text-[var(--text-2)]"
            aria-label="Toggle widget"
          >
            <option value="">+ widget…</option>
            {WIDGET_IDS.map((id) => (
              <option key={id} value={id}>
                {order.includes(id) ? `hide ${id}` : `show ${id}`}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => layouts.resetLayout(layouts.active)}
            className="h-8 px-3 rounded border border-[var(--border)] text-[11px] text-[var(--text-2)] hover:text-[var(--text-1)]"
          >
            Reset
          </button>
        </div>
      </div>

      {deskPending && !demo ? (
        <Skeleton className="h-24" />
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        {order.filter((w) => ['net-mtd', 'today-pl', 'win-rate', 'open-signals'].includes(w)).map((w) => (
          <div key={w}>{widgets[w]}</div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {order.includes('chart') && <div className="xl:col-span-2 min-w-0">{widgets.chart}</div>}
        <div className="space-y-4 min-w-0">
          {order.includes('bias-gauge') && widgets['bias-gauge']}
          {order.includes('tf-boxes') && widgets['tf-boxes']}
          {order.includes('next-event') && widgets['next-event']}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {order.includes('feed') && <div className="min-w-0">{widgets.feed}</div>}
        {order.includes('status') && <div className="min-w-0">{widgets.status}</div>}
      </div>
    </div>
  )
}

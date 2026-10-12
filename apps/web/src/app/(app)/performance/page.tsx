// app/(app)/performance/page.tsx
'use client'
import { useQuery } from '@tanstack/react-query'
import { api, type VerdictRow } from '@/lib/apiClient'

const POINT_SIZE = 0.01

function pointsBetween(a: number, b: number) {
  return Math.round(Math.abs(a - b) / POINT_SIZE)
}

interface SignalSnapshot {
  entry?: number | null
  exits?: { sl?: number | null; tp?: number | null }
  final_outcome?: 'tp_hit' | 'stopped_out'
}

function netPointsForSignal(sig: SignalSnapshot): number {
  const entry = sig.entry
  const exits = sig.exits || {}
  if (entry == null) return 0

  if (sig.final_outcome === 'stopped_out' && exits.sl != null) {
    return -pointsBetween(entry, exits.sl)
  }
  if (sig.final_outcome === 'tp_hit' && exits.tp != null) {
    return pointsBetween(entry, exits.tp)
  }
  return 0
}

const TIER_CHAIN = ['15', '60', '240', 'D', 'W', 'M', '12M']
const TIER_LABELS: Record<string, string> = {
  '15': '15min', '60': '1H', '240': '4H',
  'D': 'Daily', 'W': 'Weekly', 'M': 'Monthly', '12M': 'Year',
}

const TYPE_LABEL: Record<string, string> = {
  sniper_confirmation: 'Sniper confirmation entries',
  precision: 'Precision entries',
}

function sessionForDate(dateStr: string) {
  const h = new Date(dateStr).getUTCHours()
  const inLondon = h >= 8 && h < 17
  const inNewYork = h >= 13 && h < 22
  if (inLondon && inNewYork) return 'Overlap'
  if (inLondon) return 'London'
  if (inNewYork) return 'New York'
  return 'Asian'
}

const SESSION_ORDER = ['Asian', 'London', 'New York', 'Overlap']

const MANUAL_CONDITIONS: { key: string; label: string }[] = [
  { key: 'bias_1h', label: '1H directional bias' },
  { key: 'zone_tapped', label: 'Order block zone tapped' },
  { key: 'discount_premium', label: 'Fibonacci discount/premium' },
  { key: 'session_open', label: 'London/NY session open' },
  { key: 'doji_or_rejection', label: '1m doji or rejection candle' },
]

// ══════════════════════════════════════════════════════════
// MOCK DATA for the two new LLM sections below, shaped like what
// the real "analysed_signals" and "news_signals" resolution tables
// will contain. The success rate here is ALWAYS a real computed
// count against real price data (same principle as the rest of this
// page) -- never the LLM reporting its own accuracy. Swap for real
// Supabase queries once those tables exist.
// ══════════════════════════════════════════════════════════
interface LlmResolvedSignal {
  signal_id: string
  model: string
  outcome: 'successful' | 'unsuccessful'
}

// Closed LLM verdict rows via the API (analysed_signals / news_signals).
// Success is always real price resolution — never self-reported by the LLM.
interface LlmResolvedSignal {
  signal_id: string
  model: string
  outcome: 'successful' | 'unsuccessful'
}

function useLlmResolvedSignals(table: 'analysed_signals' | 'news_signals'): LlmResolvedSignal[] {
  const { data } = useQuery({
    queryKey: ['verdicts', table],
    queryFn: () => api<{ verdicts: VerdictRow[] }>(`/verdicts/${table}?status=closed&limit=100`),
    staleTime: 30_000,
  })
  return (data?.verdicts ?? [])
    .filter((r) => r.final_outcome === 'tp_hit' || r.final_outcome === 'stopped_out')
    .map((r) => ({
      signal_id: r.signal_id,
      model: r.llm_model ?? '—',
      outcome: r.final_outcome === 'tp_hit' ? ('successful' as const) : ('unsuccessful' as const),
    }))
}

function LlmSuccessSection({
  title, subtitle, data, accentColor,
}: {
  title: string; subtitle: string; data: LlmResolvedSignal[]; accentColor: string
}) {
  const total = data.length
  const successCount = data.filter(d => d.outcome === 'successful').length
  const pct = total > 0 ? Math.round((successCount / total) * 100) : null

  return (
    <div className="bg-[var(--bg-panel)] border border-[var(--border)] rounded-xl p-6 mt-5">
      <div className="font-mono text-[11px] tracking-widest text-[var(--text-2)] uppercase mb-1">{title}</div>
      <div className="font-mono text-[10px] text-[var(--text-2)] mb-4">{subtitle}</div>

      {total === 0 ? (
        <div className="text-[var(--text-2)] font-mono text-sm">No resolved signals yet for this section.</div>
      ) : (
        <div className="flex items-center gap-6 mb-5">
          <div>
            <div className="text-2xl font-bold" style={{ color: accentColor }}>{pct}%</div>
            <div className="font-mono text-[10px] text-[var(--text-2)]">success rate</div>
          </div>
          <div className="flex gap-6 font-mono text-xs">
            <div className="text-center"><div className="text-[var(--bull)] font-bold">{successCount}</div><div className="text-[9px] text-[var(--text-2)] uppercase mt-1">Successful</div></div>
            <div className="text-center"><div className="text-[var(--bear)] font-bold">{total - successCount}</div><div className="text-[9px] text-[var(--text-2)] uppercase mt-1">Unsuccessful</div></div>
            <div className="text-center"><div className="text-[var(--text-1)] font-bold">{total}</div><div className="text-[9px] text-[var(--text-2)] uppercase mt-1">Total resolved</div></div>
          </div>
        </div>
      )}

      <details className="bg-[var(--bg-raised)] border border-[var(--border)] rounded-lg">
        <summary className="cursor-pointer px-4 py-3 font-mono text-[11px] text-[var(--accent-blue)] uppercase tracking-wide">
          Show individual results ({total})
        </summary>
        <div className="px-4 pb-3 space-y-1.5">
          {total === 0 ? (
            <div className="font-mono text-[11px] text-[var(--text-2)] py-2">Nothing resolved yet.</div>
          ) : data.map((d, i) => (
            <div key={i} className="font-mono text-[11px] flex justify-between items-center py-1.5 border-t border-[var(--border)] first:border-t-0">
              <span className="text-[var(--text-1)]">{d.signal_id}</span>
              <span className={`px-2 py-0.5 rounded ${d.outcome === 'successful' ? 'text-[var(--info)] bg-[var(--info)]/15' : 'text-[var(--bear)] bg-[var(--bear)]/15'}`}>
                {d.outcome.toUpperCase()}
              </span>
            </div>
          ))}
        </div>
      </details>
    </div>
  )
}

type PerformanceSignal = {
  signal_id?: string
  status?: string
  signal_type?: string
  entry?: number | null
  exits?: { sl?: number | null; tp?: number | null }
  final_outcome?: 'tp_hit' | 'stopped_out'
  grade?: { value?: number | null; of?: number | null }
  htf_rung?: string
  created_at?: string
  manual_entry_filter?: Record<string, boolean | undefined>
}

export default function PerformancePage() {
  const analysedSignalsResolved = useLlmResolvedSignals('analysed_signals')
  const newsSignalsResolved = useLlmResolvedSignals('news_signals')

  const { data: signalsResp } = useQuery({
    queryKey: ['signals', 'performance'],
    queryFn: () => api<{ signals: PerformanceSignal[] }>('/signals?limit=1000'),
    staleTime: 30_000,
  })
  const signals = (signalsResp?.signals ?? [])
    .slice()
    .sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''))

  const closed = signals.filter(s => s.status === 'closed')
  const wins = closed.filter(s => s.final_outcome && s.final_outcome !== 'stopped_out').length
  const losses = closed.length - wins
  const successRate = closed.length > 0 ? ((wins / closed.length) * 100).toFixed(1) : null
  const netPoints = closed.reduce((sum, s) => sum + netPointsForSignal(s), 0)

  const byTier = (() => {
    const types = Array.from(new Set(closed.map(s => s.signal_type).filter(Boolean)))
    return types.map(t => {
      const group = closed.filter(s => s.signal_type === t)
      const g = group.filter(s => s.final_outcome && s.final_outcome !== 'stopped_out').length
      return {
        label: TYPE_LABEL[t as string] || (t as string).replace(/_/g, ' '),
        pct: group.length ? Math.round((g / group.length) * 100) : null,
      }
    })
  })()

  const byGrade = (() => {
    const map = new Map<string, PerformanceSignal[]>()
    closed.forEach(s => {
      const gv = s.grade?.value
      if (gv === undefined || gv === null) return
      const key = `${gv}/${s.grade?.of ?? 7}`
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(s)
    })
    return Array.from(map.entries())
      .map(([label, group]) => ({
        label,
        count: group.length,
        pct: group.length ? Math.round((group.filter(s => s.final_outcome && s.final_outcome !== 'stopped_out').length / group.length) * 100) : null
      }))
      .sort((a, b) => b.label.localeCompare(a.label))
  })()

  const byRung = (() => {
    const present = TIER_CHAIN.filter(tier => closed.some(s => s.htf_rung === tier))
    return present.map(tier => {
      const group = closed.filter(s => s.htf_rung === tier)
      const g = group.filter(s => s.final_outcome && s.final_outcome !== 'stopped_out').length
      return {
        label: TIER_LABELS[tier] || tier,
        count: group.length,
        pct: group.length ? Math.round((g / group.length) * 100) : null,
      }
    })
  })()

  const bySession = SESSION_ORDER.map(name => {
    const group = closed.filter(sig => sig.created_at && sessionForDate(sig.created_at) === name)
    const sWins = group.filter(sig => sig.final_outcome && sig.final_outcome !== 'stopped_out').length
    const winPct = group.length ? Math.round((sWins / group.length) * 100) : 0
    const lossPct = group.length ? 100 - winPct : 0
    return { name, count: group.length, winPct, lossPct }
  })

  const byManualCondition = (() => {
    const precisionClosed = closed.filter(s => s.signal_type === 'precision' && s.manual_entry_filter?.applicable === true)
    if (precisionClosed.length === 0) return null

    return MANUAL_CONDITIONS.map(({ key, label }) => {
      const trueGroup = precisionClosed.filter(s => s.manual_entry_filter?.[key] === true)
      const falseGroup = precisionClosed.filter(s => s.manual_entry_filter?.[key] === false)
      const trueWins = trueGroup.filter(s => s.final_outcome && s.final_outcome !== 'stopped_out').length
      const falseWins = falseGroup.filter(s => s.final_outcome && s.final_outcome !== 'stopped_out').length
      return {
        label,
        trueCount: trueGroup.length,
        truePct: trueGroup.length ? Math.round((trueWins / trueGroup.length) * 100) : null,
        falseCount: falseGroup.length,
        falsePct: falseGroup.length ? Math.round((falseWins / falseGroup.length) * 100) : null,
      }
    })
  })()

  return (
    <div className="p-6 md:p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-[var(--text-1)]">Performance <span className="text-[var(--border-strong)] font-medium">— success rate &amp; analytics</span></h1>
        <div className="font-mono text-xs text-[var(--text-2)] mt-2">Track record across every signal logged since engine start</div>
      </div>

      <div className="bg-[var(--bg-panel)] border border-[var(--border)] rounded-xl p-6 mb-5 flex flex-wrap items-center justify-between gap-6">
        <div className="flex items-center gap-5">
          <svg width="90" height="90" viewBox="0 0 90 90">
            <circle cx="45" cy="45" r="38" fill="none" style={{ stroke: 'var(--bg-raised)' }} strokeWidth="9" />
            <circle cx="45" cy="45" r="38" fill="none" style={{ stroke: 'var(--bull)' }} strokeWidth="9"
              strokeDasharray={`${closed.length ? (wins/closed.length)*238.7 : 0} 238.7`} strokeLinecap="round" transform="rotate(-90 45 45)" />
          </svg>
          <div>
            <div className="text-3xl font-bold text-[var(--bull)]">{successRate !== null ? successRate + '%' : '—'}</div>
            <div className="font-mono text-[11px] text-[var(--text-2)]">{closed.length} signals tracked · {wins} successful</div>
          </div>
        </div>
        <div className="flex gap-8 font-mono text-sm">
          <div className="text-center"><div className="text-[var(--bull)] text-xl font-bold">{wins}</div><div className="text-[9px] text-[var(--text-2)] uppercase mt-1">Wins</div></div>
          <div className="text-center"><div className="text-[var(--bear)] text-xl font-bold">{losses}</div><div className="text-[9px] text-[var(--text-2)] uppercase mt-1">Losses</div></div>
          <div className="text-center">
            <div className={`text-xl font-bold ${netPoints > 0 ? 'text-[var(--bull)]' : netPoints < 0 ? 'text-[var(--bear)]' : 'text-[var(--text-1)]'}`}>
              {closed.length === 0 ? '—' : (netPoints > 0 ? '+' : '') + netPoints}
            </div>
            <div className="text-[9px] text-[var(--text-2)] uppercase mt-1">Net Points</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="bg-[var(--bg-panel)] border border-[var(--border)] rounded-xl p-6">
          <div className="font-mono text-[11px] tracking-widest text-[var(--text-2)] uppercase mb-4">By Signal Type</div>
          {byTier.length === 0 ? (
            <div className="text-[var(--text-2)] font-mono text-sm">No closed signals yet.</div>
          ) : byTier.map((t, i) => (
            <div key={i} className="mb-4">
              <div className="flex justify-between font-mono text-sm mb-1.5">
                <span className="text-[var(--text-1)]">{t.label}</span><span className="text-[var(--text-1)]">{t.pct !== null ? t.pct + '%' : '—'}</span>
              </div>
              <div className="h-2 bg-[var(--bg-raised)] rounded-full overflow-hidden">
                <div className="h-full bg-[var(--accent-blue)]" style={{ width: `${t.pct ?? 0}%` }} />
              </div>
            </div>
          ))}
        </div>

        <div className="bg-[var(--bg-panel)] border border-[var(--border)] rounded-xl p-6">
          <div className="font-mono text-[11px] tracking-widest text-[var(--text-2)] uppercase mb-4">By Session</div>
          {bySession.map((s, i) => (
            <div key={i} className="flex items-center gap-3 mb-3 font-mono text-xs">
              <span className="w-16 text-[var(--text-2)]">{s.name.toUpperCase()}</span>
              <div className="flex-1 h-3.5 bg-[var(--bg-raised)] rounded overflow-hidden flex">
                <div className="h-full bg-[var(--bull)]" style={{ width: `${s.winPct}%` }} />
                <div className="h-full bg-[var(--bear)]" style={{ width: `${s.lossPct}%` }} />
              </div>
              <span className="w-16 text-right text-[var(--text-2)]">{s.count ? `${s.winPct}% · ${s.count}` : '—'}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-[var(--bg-panel)] border border-[var(--border)] rounded-xl p-6 mt-5">
        <div className="font-mono text-[11px] tracking-widest text-[var(--text-2)] uppercase mb-4">Performance by Grade</div>
        {byGrade.length === 0 ? (
          <div className="text-[var(--text-2)] font-mono text-sm">No graded signals resolved yet — populates once closed signals carry a grade score.</div>
        ) : (
          byGrade.map((g, i) => (
            <div key={i} className="mb-4">
              <div className="flex justify-between font-mono text-sm mb-1.5">
                <span className="text-[var(--text-1)]">Grade {g.label} <span className="text-[var(--border-strong)]">· {g.count} signals</span></span>
                <span className="text-[var(--text-1)]">{g.pct !== null ? g.pct + '%' : '—'}</span>
              </div>
              <div className="h-2 bg-[var(--bg-raised)] rounded-full overflow-hidden">
                <div className="h-full bg-[var(--accent-blue)]" style={{ width: `${g.pct ?? 0}%` }} />
              </div>
            </div>
          ))
        )}
      </div>

      <div className="bg-[var(--bg-panel)] border border-[var(--border)] rounded-xl p-6 mt-5">
        <div className="font-mono text-[11px] tracking-widest text-[var(--text-2)] uppercase mb-4">Performance by Timeframe — HTF Confluence</div>
        {byRung.length === 0 ? (
          <div className="text-[var(--text-2)] font-mono text-sm">No resolved signals yet — populates once the closed-signal analysis job runs.</div>
        ) : (
          byRung.map((t, i) => (
            <div key={i} className="mb-4">
              <div className="flex justify-between font-mono text-sm mb-1.5">
                <span className="text-[var(--text-1)]">{t.label} <span className="text-[var(--border-strong)]">· {t.count} tracked</span></span>
                <span className="text-[var(--text-1)]">{t.pct !== null ? t.pct + '%' : '—'}</span>
              </div>
              <div className="h-2 bg-[var(--bg-raised)] rounded-full overflow-hidden">
                <div className="h-full bg-[var(--bull)]" style={{ width: `${t.pct ?? 0}%` }} />
              </div>
            </div>
          ))
        )}
      </div>

      <div className="bg-[var(--bg-panel)] border border-[var(--border)] rounded-xl p-6 mt-5">
        <div className="font-mono text-[11px] tracking-widest text-[var(--text-2)] uppercase mb-2">Manual Entry Filter — Win Rate by Condition</div>
        <div className="font-mono text-[10px] text-[var(--text-2)] mb-4">
          Precision signals only. Most informative when the manual entry filter has been toggled off for some period, since that&apos;s when each condition varies between true and false instead of always being true.
        </div>
        {!byManualCondition ? (
          <div className="text-[var(--text-2)] font-mono text-sm">No closed Precision signals with filter data yet.</div>
        ) : (
          <div className="space-y-4">
            {byManualCondition.map((c, i) => (
              <div key={i} className="flex items-center justify-between font-mono text-xs gap-4">
                <span className="text-[var(--text-1)] flex-shrink-0 w-56">{c.label}</span>
                <div className="flex items-center gap-2 flex-1">
                  <span className="text-[var(--bull)] w-24">
                    True: {c.truePct !== null ? c.truePct + '%' : '—'} <span className="text-[var(--border-strong)]">({c.trueCount})</span>
                  </span>
                  <div className="flex-1 h-2 bg-[var(--bg-raised)] rounded-full overflow-hidden">
                    <div className="h-full bg-[var(--bull)]" style={{ width: `${c.truePct ?? 0}%` }} />
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-1">
                  <span className="text-[var(--bear)] w-24">
                    False: {c.falsePct !== null ? c.falsePct + '%' : '—'} <span className="text-[var(--border-strong)]">({c.falseCount})</span>
                  </span>
                  <div className="flex-1 h-2 bg-[var(--bg-raised)] rounded-full overflow-hidden">
                    <div className="h-full bg-[var(--bear)]" style={{ width: `${c.falsePct ?? 0}%` }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════
          LLM Analysis + News Signals success rates. Both are ALWAYS
          computed from real price data via the two resolvers
          (check-analysed-signals, check-news-signals) -- the LLM
          never reports its own accuracy. Now genuinely real, reading
          the analysed_signals/news_signals tables via
          useLlmResolvedSignals above.
          ══════════════════════════════════════════════════════════ */}
      <LlmSuccessSection
        title="LLM Analysis — Analysed Signals Success Rate"
        subtitle="Real win/loss on the LLM's preferred entry/SL/TP, for signals it marked invalid — resolved automatically every 10 minutes against live price data, never self-reported."
        data={analysedSignalsResolved}
        accentColor="var(--accent-blue)"
      />

      <LlmSuccessSection
        title="News Analysed Signals — Success Rate"
        subtitle="Same principle, scoped to signals that fired during a news window and were given a preferred level by the news-analysis model."
        data={newsSignalsResolved}
        accentColor="var(--info)"
      />

      {closed.length === 0 && (
        <div className="mt-5 text-[var(--text-2)] font-mono text-sm">No resolved signals yet — this fills in once the outcome-resolution job is running.</div>
      )}
    </div>
  )
}
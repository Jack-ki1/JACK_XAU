'use client'
import { useEffect, useMemo, useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, type VerdictRow, type SignalRow } from '@/lib/apiClient'

type Verdict = 'valid' | 'invalid'

interface AnalysedSignal {
  rowId: number
  signal_id: string
  symbol: string
  direction: 'buy' | 'sell'
  signal_type: 'sniper_confirmation' | 'precision'
  path: string | null
  entry: number | null
  sl: number | null
  tp: number | null
  rr: number | null
  created_at: string
  llm_model: string
  verdict: Verdict
  llm_entry: number | null
  llm_sl: number | null
  llm_tp: number | null
  llm_rr: number | null
  reasoning: string
  resolution: 'open' | 'successful' | 'unsuccessful'
}

interface OriginalSignalRow {
  signal_id: string
  symbol?: string
  direction?: 'buy' | 'sell'
  signal_type?: 'sniper_confirmation' | 'precision'
  path?: string | null
  entry?: number | null
  exits?: { sl?: number | null; tp?: number | null; rr_selected?: number | null }
  risk?: { tp_rr?: number | null }
  created_at?: string
}

interface AnalysedSignalRow {
  id: number
  signal_id: string
  direction?: 'buy' | 'sell'
  created_at?: string
  llm_model?: string
  verdict: Verdict
  llm_entry?: number | null
  llm_sl?: number | null
  llm_tp?: number | null
  llm_rr?: number | null
  reasoning?: string
  status?: 'open' | 'closed'
  final_outcome?: string
}

const OPENROUTER_DAILY_LIMIT = 1000 // keep in sync with analyseSignal.ts's DAILY_LIMIT (name kept as-is -- see openrouter_usage table note below)

function formatKenyaTime(iso: string) {
  try {
    return new Intl.DateTimeFormat('en-KE', {
      timeZone: 'Africa/Nairobi', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date(iso)) + ' EAT'
  } catch { return '—' }
}

export default function AnalysedSignalsPage() {
  const [enabled, setEnabled] = useState(true)
  const [loaded, setLoaded] = useState(false)
  const [toggling, setToggling] = useState(false)
  const [resolutionFilter, setResolutionFilter] = useState<'all' | 'successful' | 'unsuccessful' | 'open'>('all')

  // Real server-side toggle -- was localStorage-only before, which
  // only affected what one browser displayed rather than what the
  // backend actually did. Now reads/writes the real app_settings row
  // via the toggle-analysed-signals API route.
  const loadToggleState = useCallback(async () => {
    try {
      const s = await api<{ analysed_signals_enabled?: boolean }>('/settings')
      setEnabled(s.analysed_signals_enabled !== false)
    } catch {
      setEnabled(true) // fail open to the default rather than block the page on a network hiccup
    }
    setLoaded(true)
  }, [])

  async function toggleEnabled() {
    const next = !enabled
    setToggling(true)
    setEnabled(next) // optimistic
    try {
      const data = await api<{ analysed_signals_enabled?: boolean; error?: string }>('/settings', {
        method: 'PATCH',
        body: JSON.stringify({ analysed_signals_enabled: next }),
      })
      if (data.error) {
        setEnabled(!next) // revert on failure
      } else {
        setEnabled(data.analysed_signals_enabled ?? next)
      }
    } catch {
      setEnabled(!next) // revert on network failure
    }
    setToggling(false)
  }

  // Data via the API: verdict rows → original signals (by ids) → merged.
  const { data: vResp, error: vErr } = useQuery({
    queryKey: ['verdicts', 'analysed_signals'],
    queryFn: () => api<{ verdicts: VerdictRow[] }>('/verdicts/analysed_signals?limit=50'),
    staleTime: 15_000,
  })
  const verdicts = useMemo(() => vResp?.verdicts ?? [], [vResp])
  const idsKey = verdicts.map((v) => v.signal_id).join(',')

  const { data: origResp } = useQuery({
    queryKey: ['signals', 'byids', 'analysed', idsKey],
    queryFn: () => api<{ signals: SignalRow[] }>(`/signals?ids=${encodeURIComponent(idsKey)}`),
    enabled: idsKey.length > 0,
    staleTime: 30_000,
  })

  const { data: usage } = useQuery({
    queryKey: ['usage', 'analysed'],
    queryFn: () => api<{ used: number }>('/usage/analysed'),
    staleTime: 60_000,
  })
  const quotaUsed = usage?.used ?? 0

  const loadError = vErr
    ? `Could not load analysed signals: ${vErr.message}.`
    : null

  const signals = useMemo<AnalysedSignal[]>(() => {
    const originalsById = new Map<string, OriginalSignalRow>(
      (origResp?.signals ?? []).map((o) => [o.signal_id, o as OriginalSignalRow]),
    )
    return verdicts.map((a) => {
      const orig = originalsById.get(a.signal_id)
      const ar = a as AnalysedSignalRow
      const resolution: AnalysedSignal['resolution'] =
        ar.status !== 'closed' ? 'open' : ar.final_outcome === 'tp_hit' ? 'successful' : 'unsuccessful'
      return {
        rowId: ar.id,
        signal_id: ar.signal_id,
        symbol: orig?.symbol ?? 'XAUUSD',
        direction: (ar.direction ?? orig?.direction ?? 'buy') as 'buy' | 'sell',
        signal_type: orig?.signal_type ?? 'sniper_confirmation',
        path: orig?.path ?? null,
        entry: orig?.entry ?? null,
        sl: orig?.exits?.sl ?? null,
        tp: orig?.exits?.tp ?? null,
        rr: orig?.risk?.tp_rr ?? orig?.exits?.rr_selected ?? null,
        created_at: ar.created_at ?? orig?.created_at ?? new Date().toISOString(),
        llm_model: ar.llm_model ?? 'unknown',
        verdict: ar.verdict,
        llm_entry: ar.llm_entry ?? null,
        llm_sl: ar.llm_sl ?? null,
        llm_tp: ar.llm_tp ?? null,
        llm_rr: ar.llm_rr ?? null,
        reasoning: ar.reasoning ?? '',
        resolution,
      }
    })
  }, [verdicts, origResp])

  // initial toggle-state load (updates after that come from user clicks)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async toggle-state hydration
    void loadToggleState()
  }, [loadToggleState])

  const quotaRemaining = OPENROUTER_DAILY_LIMIT - quotaUsed
  const quotaExhausted = quotaRemaining <= 0

  const filtered = signals.filter(s => resolutionFilter === 'all' || s.resolution === resolutionFilter)
  const resolvedCount = signals.filter(s => s.resolution !== 'open').length
  const successCount = signals.filter(s => s.resolution === 'successful').length

  return (
    <div className="p-6 md:p-8">
      <div className="mb-6">
        <h1 className="text-[26px] font-semibold tracking-[-0.02em] text-[var(--text-1)]">Analysed Signals <span className="text-[var(--text-3)] font-normal">— every signal, LLM-checked</span></h1>
        <div className="font-mono text-xs text-[var(--text-2)] mt-2">
          Every signal from the Signals page is automatically sent to one model for a second opinion — valid confirms the strategy&apos;s own rules were genuinely met, invalid comes with the model&apos;s preferred entry/SL/TP.
        </div>
      </div>

      <div className="bg-[var(--bg-panel)] border border-[var(--border)] rounded-2xl p-4 mb-5 flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-5 flex-wrap">
          <div>
            <div className="font-mono text-[9px] tracking-widest text-[var(--text-2)] uppercase">Analysis tokens today</div>
            <div className={`font-mono text-sm font-bold mt-0.5 ${quotaExhausted ? 'text-[var(--bear)]' : quotaRemaining <= 10 ? 'text-[var(--warn)]' : 'text-[var(--accent-blue)]'}`}>
              {quotaUsed}/{OPENROUTER_DAILY_LIMIT} used
            </div>
          </div>
          <div className="w-px h-8 bg-[var(--border)]" />
          <div>
            <div className="font-mono text-[9px] tracking-widest text-[var(--text-2)] uppercase">Model</div>
            <div className="font-mono text-sm text-[var(--text-1)] mt-0.5">GPT-OSS 120B (Groq)</div>
          </div>
        </div>
        <button
          onClick={toggleEnabled}
          disabled={!loaded || toggling}
          aria-pressed={enabled}
          className="flex items-center gap-2.5 disabled:opacity-50"
        >
          <span className="font-mono text-[10px] text-[var(--text-2)] uppercase tracking-wide">
            {enabled ? 'Analysis on' : 'Analysis off'}
          </span>
          <span className={`w-9 h-5 rounded-full relative transition-colors ${enabled ? 'bg-[var(--accent-blue)]' : 'bg-[var(--border-strong)]'}`}>
            <span className={`w-4 h-4 rounded-full bg-[var(--bg-app)] absolute top-0.5 transition-all ${enabled ? 'right-0.5' : 'left-0.5'}`} />
          </span>
        </button>
      </div>

      {!enabled && (
        <div className="bg-[var(--warn)]/10 border border-[var(--warn)]/25 rounded-2xl px-5 py-4 mono text-xs text-[var(--warn)] mb-5">
          Analysed Signals is paused — new signals will keep appearing on the Signals page as normal, but won&apos;t be sent for LLM analysis until you turn this back on.
        </div>
      )}
      {enabled && quotaExhausted && (
        <div className="bg-[var(--bear)]/10 border border-[var(--bear)]/25 rounded-2xl px-5 py-4 mono text-xs text-[var(--bear)] mb-5">
          Analysis tokens ended for today — resets at 00:00 UTC. New signals will still appear on the Signals page, just without a verdict until the quota resets.
        </div>
      )}

      <div className="flex gap-2 mb-6 flex-wrap">
        {(['all', 'open', 'successful', 'unsuccessful'] as const).map(f => (
          <button key={f} onClick={() => setResolutionFilter(f)}
            className={`font-mono text-[11px] uppercase tracking-wide px-4 py-1.5 rounded ${
              resolutionFilter === f ? 'bg-[var(--accent-blue-solid)] text-[var(--on-accent)] border border-[var(--accent-blue-solid)]' : 'border border-[var(--border)] text-[var(--text-2)]'
            }`}>{f}</button>
        ))}
      </div>

      {loadError && (
        <div className="bg-[var(--bear)]/10 border border-[var(--bear)]/25 rounded-2xl px-5 py-4 mono text-xs text-[var(--bear)] mb-5">
          {loadError}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="bg-[var(--bg-panel)] border border-[var(--border)] border-dashed rounded-2xl p-10 text-center">
          <div className="mono text-[11px] text-[var(--text-2)]">No analysed signals in this view yet — waiting on live signal feed.</div>
        </div>
      ) : (
        <div className="space-y-4 mb-8">
          {filtered.map(sig => {
            const isValid = sig.verdict === 'valid'
            // STAGE ADD: per explicit request -- each card now shows
            // its own real status directly, not just buried in the
            // bottom Resolved section.
            const statusBadge = sig.resolution === 'open'
              ? { label: 'OPEN', color: 'var(--warn)' }
              : sig.resolution === 'successful'
                ? { label: 'TP HIT', color: 'var(--bull)' }
                : { label: 'SL HIT', color: 'var(--bear)' }
            return (
              <div key={sig.rowId} className="bg-[var(--bg-panel)] border border-[var(--border)] rounded-xl overflow-hidden">
                <div className="p-5 flex justify-between items-start flex-wrap gap-3 border-b border-[var(--border)]">
                  <div>
                    <span className="font-bold text-[var(--text-1)] text-base flex items-center gap-2 flex-wrap">
                      {sig.direction === 'buy' ? <span className="text-[var(--bull)]">▲</span> : <span className="text-[var(--bear)]">▼</span>}
                      {sig.direction.toUpperCase()} {sig.symbol}
                      <span className="font-mono text-[10px] px-2 py-0.5 rounded border border-[var(--accent-blue)] text-[var(--accent-blue)]">
                        {sig.signal_type === 'precision' ? 'PRECISION' : 'SNIPER CONFIRMATION'}
                      </span>
                      <span className="font-mono text-[10px] px-2 py-0.5 rounded border font-bold" style={{ borderColor: statusBadge.color, color: statusBadge.color }}>
                        {statusBadge.label}
                      </span>
                    </span>
                    <div className="font-mono text-[10px] text-[var(--text-2)] mt-1.5">{formatKenyaTime(sig.created_at)}</div>
                  </div>
                  <div className="font-mono text-xs text-[var(--text-2)] text-right">
                    <div>Entry <span className="text-[var(--text-1)]">{sig.entry != null ? Number(sig.entry).toFixed(3) : '—'}</span></div>
                    <div>SL <span className="text-[var(--bear)]">{sig.sl != null ? Number(sig.sl).toFixed(3) : '—'}</span> · TP <span className="text-[var(--bull)]">{sig.tp != null ? Number(sig.tp).toFixed(3) : '—'}</span> · R:R <span className="text-[var(--text-1)]">{sig.rr != null ? '1:' + sig.rr : '—'}</span></div>
                  </div>
                </div>

                <div className="p-5 bg-[var(--bg-raised)]">
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-mono text-[10px] tracking-widest text-[var(--text-2)] uppercase">{sig.llm_model} verdict</span>
                    <span className={`font-mono text-[10px] px-3 py-1 rounded border ${isValid ? 'text-[var(--accent-blue)] border-[var(--accent-blue)]' : 'text-[var(--bear)] border-[var(--bear)]'}`}>
                      {isValid ? 'VALID' : 'INVALID'}
                    </span>
                  </div>
                  <div className="text-sm text-[var(--text-1)] leading-relaxed mb-3">{sig.reasoning}</div>
                  {!isValid && sig.llm_entry != null && (
                    <div className="grid grid-cols-3 gap-2.5 mt-3 pt-3 border-t border-[var(--border)]">
                      <div className="bg-[var(--bg-panel)] rounded-lg p-2.5">
                        <div className="text-[9px] text-[var(--text-2)] uppercase tracking-wide mb-1 font-mono">Preferred entry</div>
                        <div className="text-[var(--text-1)] font-mono text-sm">{sig.llm_entry != null ? Number(sig.llm_entry).toFixed(3) : '—'}</div>
                      </div>
                      <div className="bg-[var(--bg-panel)] rounded-lg p-2.5">
                        <div className="text-[9px] text-[var(--text-2)] uppercase tracking-wide mb-1 font-mono">Preferred SL</div>
                        <div className="text-[var(--bear)] font-mono text-sm">{sig.llm_sl != null ? Number(sig.llm_sl).toFixed(3) : '—'}</div>
                      </div>
                      <div className="bg-[var(--bg-panel)] rounded-lg p-2.5">
                        <div className="text-[9px] text-[var(--text-2)] uppercase tracking-wide mb-1 font-mono">Preferred TP · R:R</div>
                        <div className="text-[var(--bull)] font-mono text-sm">{sig.llm_tp != null ? Number(sig.llm_tp).toFixed(3) : '—'} · 1:{sig.llm_rr}</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="pt-6 border-t border-[var(--border)]">
        <div className="mb-3">
          <div className="font-mono text-[10px] tracking-[0.3em] text-[var(--warn)] uppercase mb-1">Deterministic, Not AI-Generated</div>
          <h2 className="text-lg font-bold text-[var(--text-1)]">
            LLM-Preferred Levels — Resolved <span className="text-[var(--text-2)] font-normal text-sm ml-2">— checked against real price data automatically</span>
          </h2>
        </div>
        <div className="font-mono text-[10px] text-[var(--text-2)] mb-4">
          {resolvedCount} of {signals.length} analysed signals resolved so far — {successCount} successful. Whether an LLM&apos;s preferred level actually won or lost is always computed from real market data, never reported by the model itself.
        </div>
        <details className="bg-[var(--bg-panel)] border border-[var(--border)] rounded-xl">
          <summary className="cursor-pointer px-5 py-3.5 font-mono text-xs text-[var(--accent-blue)] uppercase tracking-wide">
            Show all resolved LLM-preferred levels ({resolvedCount})
          </summary>
          <div className="px-5 pb-4 space-y-1.5">
            {signals.filter(s => s.resolution !== 'open').length === 0 ? (
              <div className="font-mono text-[11px] text-[var(--text-2)] py-2">Nothing resolved yet.</div>
            ) : signals.filter(s => s.resolution !== 'open').map(s => (
              <div key={s.rowId} className="font-mono text-[11px] flex justify-between items-center py-1.5 border-t border-[var(--border)] first:border-t-0">
                <span className="text-[var(--text-1)]">{s.signal_id}</span>
                <span className={`px-2 py-0.5 rounded ${s.resolution === 'successful' ? 'text-[var(--info)] bg-[var(--info)]/15' : 'text-[var(--bear)] bg-[var(--bear)]/15'}`}>
                  {s.resolution.toUpperCase()}
                </span>
              </div>
            ))}
          </div>
        </details>
      </div>
    </div>
  )
}
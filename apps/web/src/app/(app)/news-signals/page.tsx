'use client'
/* eslint-disable react-hooks/set-state-in-effect -- initial data load + realtime subscription, same pattern as analysed-signals */
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabaseClient'
import type { CalendarEventRow, SignalRow, VerdictRow } from '@jack-trade/shared'

interface NewsEvent {
  time: string
  currency: string
  event: string
  impact: string
}

interface NewsSignal {
  rowId: number
  signal_id: string
  symbol: string
  direction: 'buy' | 'sell'
  entry: number | null
  sl: number | null
  tp: number | null
  created_at: string
  triggering_event: string
  news_summary: string
  verdict: 'valid' | 'invalid'
  llm_entry: number | null
  llm_sl: number | null
  llm_tp: number | null
  reasoning: string
  resolution: 'open' | 'successful' | 'unsuccessful'
}

function formatKenyaTime(iso: string) {
  try {
    return new Intl.DateTimeFormat('en-KE', {
      timeZone: 'Africa/Nairobi', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date(iso)) + ' EAT'
  } catch { return '—' }
}

export default function NewsSignalsPage() {
  const [activeEvent, setActiveEvent] = useState<{ label: string; time: string } | null>(null)
  const [todayEvents, setTodayEvents] = useState<NewsEvent[]>([])
  const [signals, setSignals] = useState<NewsSignal[]>([])

  const checkNewsWindow = useCallback(async () => {
    try {
      const res = await fetch('/api/news-window-status')
      const data = await res.json()
      setActiveEvent(data.active ? { label: data.event.label, time: data.event.time } : null)
    } catch {
      setActiveEvent(null)
    }
  }, [])

  const loadTodayEvents = useCallback(async () => {
    const startOfDay = new Date(); startOfDay.setUTCHours(0, 0, 0, 0)
    const endOfDay = new Date(); endOfDay.setUTCHours(23, 59, 59, 999)
    const { data } = await supabase
      .from('calendar_events')
      .select('event_time, currency, event_name, impact')
      .gte('event_time', startOfDay.toISOString())
      .lte('event_time', endOfDay.toISOString())
      .order('event_time', { ascending: true })

    setTodayEvents(
      ((data ?? []) as CalendarEventRow[]).map((e) => ({
        time: new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' }).format(new Date(e.event_time)),
        currency: e.currency ?? '',
        event: e.event_name ?? 'Economic event',
        impact: e.impact ?? 'unknown',
      }))
    )
  }, [])

  const loadSignals = useCallback(async () => {
    const { data: news } = await supabase
      .from('news_signals')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)

    if (!news || news.length === 0) {
      setSignals([])
      return
    }

    const newsRows = ((news ?? []) as VerdictRow[])
    const signalIds = newsRows.map((n) => n.signal_id)
    const { data: originals } = await supabase
      .from('signals')
      .select('signal_id, symbol, entry, exits')
      .in('signal_id', signalIds)

    const originalsById = new Map(((originals ?? []) as SignalRow[]).map((o) => [o.signal_id, o]))

    const merged: NewsSignal[] = newsRows.map((n) => {
      const orig = originalsById.get(n.signal_id)
      const resolution: NewsSignal['resolution'] =
        n.status !== 'closed' ? 'open' : n.final_outcome === 'tp_hit' ? 'successful' : 'unsuccessful'

      return {
        rowId: n.id,
        signal_id: n.signal_id,
        symbol: orig?.symbol ?? 'XAUUSD',
        direction: (n.direction ?? 'buy') as 'buy' | 'sell',
        entry: orig?.entry ?? n.llm_entry ?? null,
        sl: orig?.exits?.sl ?? n.llm_sl ?? null,
        tp: orig?.exits?.tp ?? null,
        created_at: n.created_at ?? new Date().toISOString(),
        triggering_event: n.triggering_event ?? '',
        news_summary: n.news_summary ?? '',
        verdict: n.verdict,
        llm_entry: n.llm_entry ?? null,
        llm_sl: n.llm_sl ?? null,
        llm_tp: n.llm_tp ?? null,
        reasoning: n.reasoning ?? '',
        resolution,
      }
    })

    setSignals(merged)
  }, [])

  useEffect(() => {
    checkNewsWindow()
    loadTodayEvents()
    loadSignals()

    const interval = setInterval(checkNewsWindow, 60000)
    const channel = supabase.channel('news-signals-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'news_signals' }, loadSignals)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calendar_events' }, loadTodayEvents)
      .subscribe()
    return () => { supabase.removeChannel(channel); clearInterval(interval) }
  }, [checkNewsWindow, loadTodayEvents, loadSignals])

  const resolvedCount = signals.filter(s => s.resolution !== 'open').length
  const successCount = signals.filter(s => s.resolution === 'successful').length

  return (
    <div className="p-6 md:p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-[var(--text-1)]">News Signals <span className="text-[var(--border-strong)] font-medium">— analysed against live news &amp; calendar</span></h1>
        <div className="font-mono text-xs text-[var(--text-2)] mt-2">
          Only populates during scheduled high-impact news windows. When active, incoming signals are checked against the calendar event and current gold news before appearing here — news content is weighted primary, technical structure secondary.
        </div>
      </div>

      <div className={`rounded-2xl p-5 mb-6 border flex items-center justify-between flex-wrap gap-3 ${
        activeEvent ? 'bg-[var(--info)]/10 border-[var(--info)]/40' : 'bg-[var(--bg-panel)] border-[var(--border)]'
      }`}>
        <div className="flex items-center gap-3">
          <span className={`w-3 h-3 rounded-full flex-shrink-0 ${activeEvent ? 'bg-[var(--info)] animate-pulse' : 'bg-[var(--border-strong)]'}`} />
          <div>
            <div className={`font-mono text-sm font-bold ${activeEvent ? 'text-[var(--info)]' : 'text-[var(--text-2)]'}`}>
              {activeEvent ? 'NEWS TIME ACTIVE' : 'No news window active'}
            </div>
            {activeEvent && (
              <div className="font-mono text-[11px] text-[var(--text-2)] mt-0.5">{activeEvent.label}</div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-[var(--bg-panel)] border border-[var(--border)] rounded-xl p-5 mb-6">
        <div className="font-mono text-[10px] tracking-widest text-[var(--text-2)] uppercase mb-3">Today&apos;s high-impact events (cached, UTC)</div>
        {todayEvents.length === 0 ? (
          <div className="font-mono text-[11px] text-[var(--text-2)]">No cached events yet — waiting on the daily calendar fetch.</div>
        ) : (
          <div className="space-y-2">
            {todayEvents.map((e, i) => (
              <div key={i} className="flex items-center justify-between font-mono text-xs">
                <span className="text-[var(--text-1)]">{e.time} — {e.currency} {e.event}</span>
                <span className={`px-2 py-0.5 rounded text-[10px] ${e.impact.toLowerCase().includes('high') ? 'text-[var(--bear)] bg-[var(--bear)]/10' : 'text-[var(--warn)] bg-[var(--warn)]/10'}`}>
                  {e.impact.toUpperCase()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {signals.length === 0 ? (
        <div className="bg-[var(--bg-panel)] border border-[var(--border)] border-dashed rounded-2xl p-10 text-center mb-8">
          <div className="mono text-[11px] text-[var(--text-2)]">
            {activeEvent ? "News window is active, but no signal has fired yet during it." : "Signals only appear here during an active news window — check back closer to a scheduled event."}
          </div>
        </div>
      ) : (
        <div className="space-y-4 mb-8">
          {signals.map(sig => {
            const isValid = sig.verdict === 'valid'
            return (
              <div key={sig.rowId} className="bg-[var(--bg-panel)] border border-[var(--info)]/30 rounded-xl overflow-hidden">
                <div className="p-5 flex justify-between items-start flex-wrap gap-3 border-b border-[var(--border)]">
                  <div>
                    <span className="font-bold text-[var(--text-1)] text-base flex items-center gap-2 flex-wrap">
                      {sig.direction === 'buy' ? <span className="text-[var(--bull)]">▲</span> : <span className="text-[var(--bear)]">▼</span>}
                      {sig.direction.toUpperCase()} {sig.symbol}
                      <span className="font-mono text-[10px] px-2 py-0.5 rounded border border-[var(--info)] text-[var(--info)]">
                        NEWS WINDOW
                      </span>
                    </span>
                    <div className="font-mono text-[10px] text-[var(--text-2)] mt-1.5">{formatKenyaTime(sig.created_at)} · {sig.triggering_event}</div>
                  </div>
                  <div className="font-mono text-xs text-[var(--text-2)] text-right">
                    <div>Entry <span className="text-[var(--text-1)]">{sig.entry?.toFixed(3) ?? '—'}</span></div>
                    <div>SL <span className="text-[var(--bear)]">{sig.sl?.toFixed(3) ?? '—'}</span> · TP <span className="text-[var(--bull)]">{sig.tp?.toFixed(3) ?? '—'}</span></div>
                  </div>
                </div>

                <div className="p-5 bg-[var(--bg-raised)]">
                  {sig.news_summary && (
                    <>
                      <div className="font-mono text-[9px] text-[var(--text-2)] uppercase tracking-wide mb-1.5">What&apos;s happening</div>
                      <div className="text-sm text-[var(--text-1)] leading-relaxed mb-4 pb-4 border-b border-[var(--border)]">{sig.news_summary}</div>
                    </>
                  )}

                  <div className="flex items-center justify-between mb-3">
                    <span className="font-mono text-[10px] tracking-widest text-[var(--text-2)] uppercase">Verdict</span>
                    <span className={`font-mono text-[10px] px-3 py-1 rounded border ${isValid ? 'text-[var(--accent-blue)] border-[var(--accent-blue)]' : 'text-[var(--bear)] border-[var(--bear)]'}`}>
                      {isValid ? 'VALID' : 'INVALID'}
                    </span>
                  </div>
                  <div className="text-sm text-[var(--text-1)] leading-relaxed">{sig.reasoning}</div>

                  {!isValid && sig.llm_entry != null && (
                    <div className="grid grid-cols-3 gap-2.5 mt-3 pt-3 border-t border-[var(--border)]">
                      <div className="bg-[var(--bg-panel)] rounded-lg p-2.5">
                        <div className="text-[9px] text-[var(--text-2)] uppercase tracking-wide mb-1 font-mono">Preferred entry</div>
                        <div className="text-[var(--text-1)] font-mono text-sm">{sig.llm_entry.toFixed(3)}</div>
                      </div>
                      <div className="bg-[var(--bg-panel)] rounded-lg p-2.5">
                        <div className="text-[9px] text-[var(--text-2)] uppercase tracking-wide mb-1 font-mono">Preferred SL</div>
                        <div className="text-[var(--bear)] font-mono text-sm">{sig.llm_sl?.toFixed(3)}</div>
                      </div>
                      <div className="bg-[var(--bg-panel)] rounded-lg p-2.5">
                        <div className="text-[9px] text-[var(--text-2)] uppercase tracking-wide mb-1 font-mono">Preferred TP</div>
                        <div className="text-[var(--bull)] font-mono text-sm">{sig.llm_tp?.toFixed(3)}</div>
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
            News Signals — Resolved <span className="text-[var(--text-2)] font-normal text-sm ml-2">— checked against real price data automatically</span>
          </h2>
        </div>
        <div className="font-mono text-[10px] text-[var(--text-2)] mb-4">
          {resolvedCount} of {signals.length} news signals resolved so far — {successCount} successful.
        </div>
        <details className="bg-[var(--bg-panel)] border border-[var(--border)] rounded-xl">
          <summary className="cursor-pointer px-5 py-3.5 font-mono text-xs text-[var(--accent-blue)] uppercase tracking-wide">
            Show all resolved news signals ({resolvedCount})
          </summary>
          <div className="px-5 pb-4 space-y-1.5">
            {signals.filter(s => s.resolution !== 'open').length === 0 ? (
              <div className="font-mono text-[11px] text-[var(--text-2)] py-2">No news signals resolved yet.</div>
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
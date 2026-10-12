'use client'
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabaseClient'

const STORAGE_KEYS = {
  patterns: 'jacktrade:closed-patterns',
  patternsError: 'jacktrade:closed-patterns-error',
}

function readStored<T>(key: string): T | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

interface PatternAnalysisResult {
  totalClosed: number
  totalWins: number
  totalLosses: number
  patterns?: string[]
  note?: string
}

function writeStored(key: string, value: unknown) {
  if (typeof window === 'undefined') return
  try {
    if (value === null || value === undefined || value === '') {
      sessionStorage.removeItem(key)
    } else {
      sessionStorage.setItem(key, JSON.stringify(value))
    }
  } catch {
    // sessionStorage unavailable (private browsing, etc) -- page still
    // works normally, just without persistence across navigation
  }
}

interface ResolvedSignal {
  signal_id: string
  outcome: 'tp_hit' | 'stopped_out'
  resolved_at: string
}

function getSession() {
  const h = new Date().getUTCHours()
  const isLondon = h >= 8 && h < 17
  const isNewYork = h >= 13 && h < 22
  if (isLondon && isNewYork) return { name: 'London/NY Overlap', hours: '13:00–17:00' }
  if (isLondon) return { name: 'London', hours: '08:00–17:00' }
  if (isNewYork) return { name: 'New York', hours: '13:00–22:00' }
  return { name: 'Asian', hours: '22:00–08:00' }
}

export default function AnalysisPage() {
  const session = getSession()
  const now = new Date()

  const [resolutionFilter, setResolutionFilter] = useState<'all' | 'tp_hit' | 'stopped_out'>('all')
  const [resolved, setResolved] = useState<ResolvedSignal[]>([])
  const [loadingResolved, setLoadingResolved] = useState(true)

  const [patternsLoading, setPatternsLoading] = useState(false)
  const [patternsError, setPatternsError] = useState<string>(() => readStored<string>(STORAGE_KEYS.patternsError) || '')
  const [patternsResult, setPatternsResult] = useState<PatternAnalysisResult | null>(() => readStored<PatternAnalysisResult>(STORAGE_KEYS.patterns))

  const loadResolved = useCallback(async () => {
    const { data } = await supabase
      .from('signals')
      .select('signal_id, final_outcome, resolved_at')
      .eq('status', 'closed')
      .not('final_outcome', 'is', null)
      .order('resolved_at', { ascending: false })
      .limit(100)

    type ResolvedRow = { signal_id: string; final_outcome: 'tp_hit' | 'stopped_out'; resolved_at: string }

    setResolved(
      (data ?? [])
        .filter((s: ResolvedRow) => s.final_outcome === 'tp_hit' || s.final_outcome === 'stopped_out')
        .map((s: ResolvedRow) => ({ signal_id: s.signal_id, outcome: s.final_outcome, resolved_at: s.resolved_at }))
    )
    setLoadingResolved(false)
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadResolved()
    const channel = supabase.channel('analysis-resolved-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'signals' }, loadResolved)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [loadResolved])

  async function runPatternSummary() {
    setPatternsLoading(true)
    setPatternsError('')
    setPatternsResult(null)
    try {
      const res = await fetch('/api/closed-signal-analysis')
      const data = await res.json()
      if (data.error) {
        setPatternsError(data.error)
        writeStored(STORAGE_KEYS.patternsError, data.error)
        writeStored(STORAGE_KEYS.patterns, null)
      } else {
        const result = data as PatternAnalysisResult
        setPatternsResult(result)
        writeStored(STORAGE_KEYS.patterns, result)
        writeStored(STORAGE_KEYS.patternsError, null)
      }
    } catch {
      const msg = 'Could not reach the pattern analysis service.'
      setPatternsError(msg)
      writeStored(STORAGE_KEYS.patternsError, msg)
      writeStored(STORAGE_KEYS.patterns, null)
    }
    setPatternsLoading(false)
  }

  const filteredResolved = resolved.filter(r => resolutionFilter === 'all' || r.outcome === resolutionFilter)
  const successCount = resolved.filter(r => r.outcome === 'tp_hit').length

  return (
    <div className="p-6 md:p-8 max-w-3xl fade-up">
      <div className="mb-7">
        <div className="mono text-[10px] tracking-[0.3em] text-[var(--info)] uppercase mb-1">Outcome Resolution</div>
        <h1 className="text-2xl font-bold text-[var(--text-1)]">
          Analysis <span className="text-[var(--text-2)] font-normal text-base ml-2">— signal outcomes, resolved automatically</span>
        </h1>
      </div>

      <div className="bg-[var(--bg-panel)] border border-[var(--bg-hover)] rounded-2xl p-4 mb-5 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-4">
          <div>
            <div className="mono text-[9px] tracking-widest text-[var(--text-2)] uppercase">Current Session</div>
            <div className="mono text-sm font-bold text-[var(--info)] mt-0.5">{session.name}</div>
          </div>
          <div className="w-px h-8 bg-[var(--bg-hover)]" />
          <div>
            <div className="mono text-[9px] tracking-widest text-[var(--text-2)] uppercase">UTC Time</div>
            <div className="mono text-sm text-[var(--text-1)] mt-0.5">
              {now.getUTCHours().toString().padStart(2,'0')}:{now.getUTCMinutes().toString().padStart(2,'0')} UTC
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--bull)] blink" />
          <span className="mono text-[10px] text-[var(--bull)]">Live context</span>
        </div>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      <div className="mono text-[10px] text-[var(--text-2)] mb-3">
        Every open signal is checked against real price data automatically every 10 minutes — no button needed. This section is a live view of the results, not a trigger.
      </div>

      <div className="bg-[var(--bg-panel)] border border-[var(--bg-hover)] rounded-2xl p-6 mb-4">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <span className="mono text-[10px] text-[var(--accent-blue)] tracking-widest uppercase">Resolved signals</span>
          <span className="mono text-[10px] text-[var(--text-2)]">{resolved.length} total · {successCount} successful</span>
        </div>

        <div className="flex gap-2 mb-4 flex-wrap">
          {(['all', 'tp_hit', 'stopped_out'] as const).map(f => (
            <button key={f} onClick={() => setResolutionFilter(f)}
              className={`font-mono text-[11px] uppercase tracking-wide px-4 py-1.5 rounded ${
                resolutionFilter === f ? 'bg-[var(--accent-blue-solid)] text-[var(--on-accent)] border border-[var(--accent-blue-solid)]' : 'border border-[var(--border)] text-[var(--text-2)]'
              }`}>{f === 'tp_hit' ? 'successful' : f === 'stopped_out' ? 'unsuccessful' : f}</button>
          ))}
        </div>

        {loadingResolved ? (
          <div className="mono text-[11px] text-[var(--text-2)] py-2">Loading…</div>
        ) : (
          <>
            <select
              className="w-full bg-[var(--bg-raised)] border border-[var(--border)] rounded-lg px-3 py-2.5 font-mono text-xs text-[var(--text-1)] outline-none focus:border-[var(--accent-blue)] mb-3"
              defaultValue=""
              onChange={() => {}}
            >
              <option value="" disabled>Select a resolved signal to view ({filteredResolved.length} listed)</option>
              {filteredResolved.map((r, i) => (
                <option key={i} value={r.signal_id}>
                  {r.signal_id} — {r.outcome === 'tp_hit' ? 'SUCCESSFUL' : 'UNSUCCESSFUL'}
                </option>
              ))}
            </select>

            <div className="space-y-1.5">
              {filteredResolved.length === 0 ? (
                <div className="mono text-[11px] text-[var(--text-2)] py-2">No resolved signals in this view yet — waiting on live signal feed.</div>
              ) : filteredResolved.map((r, i) => (
                <div key={i} className="font-mono text-[11px] flex justify-between items-center py-1.5 border-t border-[var(--border)] first:border-t-0">
                  <span className="text-[var(--text-1)]">{r.signal_id}</span>
                  <span className={`px-2 py-0.5 rounded ${r.outcome === 'tp_hit' ? 'text-[var(--info)] bg-[var(--info)]/15' : 'text-[var(--bear)] bg-[var(--bear)]/15'}`}>
                    {r.outcome === 'tp_hit' ? 'SUCCESSFUL' : 'UNSUCCESSFUL'}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="mt-10 pt-8 border-t border-[var(--bg-hover)]">
        <div className="mb-5">
          <div className="mono text-[10px] tracking-[0.3em] text-[var(--warn)] uppercase mb-1">Deterministic, Not AI-Generated</div>
          <h2 className="text-xl font-bold text-[var(--text-1)]">
            Closed Signal Patterns <span className="text-[var(--text-2)] font-normal text-sm ml-2">— real counts from your actual closed signals</span>
          </h2>
        </div>

        <div className="mono text-[10px] text-[var(--text-2)] mb-3">
          No AI involved in this section on purpose -- every statement below is a real, computed count with its own real sample size shown alongside it. Treat these as patterns worth a closer look, not proof, especially with small sample sizes.
        </div>

        <button onClick={runPatternSummary} disabled={patternsLoading}
          className="flex items-center gap-2.5 px-5 py-3 bg-[var(--warn)] hover:bg-[var(--warn)] disabled:opacity-50 text-[var(--bg-app)] font-semibold text-sm rounded-xl transition-all mb-2">
          {patternsLoading ? (
            <>
              <span className="w-4 h-4 border-2 border-[var(--bg-app)]/30 border-t-[var(--bg-app)] rounded-full inline-block" style={{ animation: 'spin 0.7s linear infinite' }} />
              Computing patterns…
            </>
          ) : (
            <>Find Patterns in Closed Signals</>
          )}
        </button>

        {patternsError && (
          <div className="bg-[var(--bear)]/10 border border-[var(--bear)]/25 rounded-2xl px-5 py-4 mono text-xs text-[var(--bear)] mb-4 mt-3">
            {patternsError}
          </div>
        )}

        {patternsResult && (
          <div className="bg-[var(--bg-panel)] border border-[var(--bg-hover)] rounded-2xl p-6 fade-up mt-3">
            <div className="mono text-[10px] text-[var(--text-2)] mb-4">
              {patternsResult.totalClosed} closed signals total — {patternsResult.totalWins} wins, {patternsResult.totalLosses} losses.
            </div>

            {patternsResult.patterns && patternsResult.patterns.length > 0 ? (
              <div className="space-y-3">
                {patternsResult.patterns.map((p: string, i: number) => (
                  <div key={i} className="flex gap-2.5 text-sm text-[var(--text-1)] leading-relaxed">
                    <span className="text-[var(--warn)] flex-shrink-0">•</span>
                    <span>{p}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mono text-[11px] text-[var(--text-2)]">{patternsResult.note}</div>
            )}
          </div>
        )}

        {!patternsResult && !patternsLoading && !patternsError && (
          <div className="bg-[var(--bg-panel)] border border-[var(--bg-hover)] border-dashed rounded-2xl p-10 text-center mt-3">
            <div className="mono text-[11px] text-[var(--text-2)]">
              Click &quot;Find Patterns in Closed Signals&quot; to check real closed signals for anything worth bringing back for a Pine change.
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
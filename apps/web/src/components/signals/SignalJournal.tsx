'use client'
// web/components/signals/SignalJournal — v2 C8/C9: per-signal journal
// (notes/tags), event timeline, and the ai_runs audit trail. Rendered inside
// the expanded signal row on the blotter. Local draft overrides the fetched
// entry while dirty (no effect-based sync → no render cascades).
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/apiClient'
import { Panel } from '@/components/ui/Panel'

interface SignalEvent { id: number; ts: string; type: string; payload: Record<string, unknown> }
interface AiRun {
  id: number
  prompt_version: string
  model: string
  verdict?: string
  latency_ms?: number | null
  tokens?: number | null
  output?: { verdict?: string; error?: string } | null
  created_at: string
}
interface JournalEntry { notes?: string; tags?: string[]; updated_at?: string }

export default function SignalJournal({ signalId }: { signalId: string }) {
  const qc = useQueryClient()
  const [draft, setDraft] = useState<{ notes: string; tags: string } | null>(null)

  const { data: journalData } = useQuery({
    queryKey: ['journal', signalId],
    queryFn: async () => {
      try {
        return await api<{ entry: JournalEntry }>(`/journal/${encodeURIComponent(signalId)}`)
      } catch {
        return null // 404 = no entry yet
      }
    },
    staleTime: 60_000,
  })
  const { data: eventsData } = useQuery({
    queryKey: ['signal-events', signalId],
    queryFn: () => api<{ events: SignalEvent[] }>(`/signals/${encodeURIComponent(signalId)}/events`),
    staleTime: 30_000,
  })
  const { data: runsData } = useQuery({
    queryKey: ['ai-runs', signalId],
    queryFn: () => api<{ runs: AiRun[] }>(`/ops/ai-runs?signal_id=${encodeURIComponent(signalId)}`),
    staleTime: 60_000,
  })

  const entry = journalData?.entry
  const notes = draft?.notes ?? entry?.notes ?? ''
  const tagsText = draft?.tags ?? (entry?.tags ?? []).join(', ')
  const dirty = draft !== null

  const save = useMutation({
    mutationFn: async () => {
      const tags = (draft?.tags ?? '').split(',').map((t) => t.trim()).filter(Boolean).slice(0, 50)
      await api(`/journal/${encodeURIComponent(signalId)}`, {
        method: 'PUT',
        body: JSON.stringify({ notes: draft?.notes ?? '', tags }),
      })
    },
    onSuccess: () => {
      setDraft(null)
      void qc.invalidateQueries({ queryKey: ['journal', signalId] })
    },
  })

  const events = eventsData?.events ?? []
  const runs = runsData?.runs ?? []

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Panel
        title="Journal"
        right={
          <button
            type="button"
            onClick={() => save.mutate()}
            disabled={!dirty || save.isPending}
            className="h-7 px-3 rounded border border-[var(--border)] text-[11px] text-[var(--text-2)] enabled:hover:text-[var(--text-1)] disabled:opacity-40"
          >
            {save.isPending ? 'Saving…' : dirty ? 'Save' : 'Saved'}
          </button>
        }
      >
        <textarea
          value={notes}
          onChange={(e) => setDraft({ notes: e.target.value, tags: tagsText })}
          rows={5}
          placeholder="What did you see? What would you do differently?"
          className="w-full bg-[var(--bg-raised)] border border-[var(--border)] rounded p-2.5 font-mono text-xs text-[var(--text-1)] placeholder:text-[var(--text-3)] focus:outline-none focus:border-[var(--accent-blue)]"
        />
        <label className="block mt-3">
          <span className="eyebrow">Tags (comma separated)</span>
          <input
            value={tagsText}
            onChange={(e) => setDraft({ notes, tags: e.target.value })}
            placeholder="chased, good-r, news-day"
            className="mt-1.5 w-full h-8 bg-[var(--bg-raised)] border border-[var(--border)] rounded px-2.5 font-mono text-xs text-[var(--text-1)] placeholder:text-[var(--text-3)] focus:outline-none focus:border-[var(--accent-blue)]"
          />
        </label>
        {entry?.updated_at && (
          <div className="mt-2 font-mono text-[10px] text-[var(--text-3)]">
            Updated {new Date(entry.updated_at).toISOString().slice(0, 16).replace('T', ' ')} UTC
          </div>
        )}
        {save.isError && <div className="mt-2 font-mono text-[10px] text-[var(--bear)]">Save failed — is the API running?</div>}
      </Panel>

      <div className="space-y-4 min-w-0">
        <Panel title="Event timeline">
          {events.length === 0 ? (
            <div className="font-mono text-[11px] text-[var(--text-3)]">No state events yet.</div>
          ) : (
            <ul className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
              {events.map((e) => (
                <li key={e.id} className="flex items-baseline gap-2 font-mono text-[11px]">
                  <span className="text-[var(--text-3)] tnum shrink-0">{new Date(e.ts).toISOString().slice(5, 16).replace('T', ' ')}</span>
                  <span className="text-[var(--accent-blue)]">{e.type}</span>
                  {Object.keys(e.payload ?? {}).length > 0 && (
                    <span className="text-[var(--text-3)] truncate">{JSON.stringify(e.payload)}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="AI runs (audit trail)">
          {runs.length === 0 ? (
            <div className="font-mono text-[11px] text-[var(--text-3)]">No LLM runs recorded for this signal.</div>
          ) : (
            <ul className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
              {runs.map((r) => {
                const failed = Boolean(r.output && 'error' in r.output)
                return (
                  <li key={r.id} className="flex items-baseline gap-2 font-mono text-[11px]">
                    <span className="text-[var(--text-3)] tnum shrink-0">{new Date(r.created_at).toISOString().slice(5, 16).replace('T', ' ')}</span>
                    <span className="text-[var(--text-2)]">{r.model}</span>
                    <span className="text-[var(--text-3)]">{r.prompt_version}</span>
                    <span className={failed ? 'text-[var(--bear)]' : r.output?.verdict === 'valid' ? 'text-[var(--bull)]' : 'text-[var(--warn)]'}>
                      {failed ? 'error' : r.output?.verdict ?? r.verdict ?? '—'}
                    </span>
                    <span className="ml-auto text-[var(--text-3)] tnum shrink-0">
                      {r.latency_ms != null ? `${r.latency_ms}ms` : '—'}{r.tokens != null ? ` · ${r.tokens} tok` : ''}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  )
}

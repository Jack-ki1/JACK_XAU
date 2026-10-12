'use client'
// web/components/shell/Providers — react-query + live SSE bridge.
// DeskEvents opens /api/v1/stream (server injects the token); every domain
// event invalidates the affected queries. If SSE drops, degrades to polling.
import { useEffect, useRef } from 'react'
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 15_000, refetchOnWindowFocus: false, retry: 1 },
  },
})

const POLL_FALLBACK_MS = 30_000

function DeskEvents() {
  const qc = useQueryClient()
  const esRef = useRef<EventSource | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let closed = false
    const invalidate = (keys: string[][]) => {
      if (timerRef.current) return
      timerRef.current = setTimeout(() => {
        timerRef.current = null
        for (const k of keys) void qc.invalidateQueries({ queryKey: k })
      }, 300)
    }

    function connect() {
      if (closed) return
      const es = new EventSource('/api/v1/stream')
      esRef.current = es
      es.onopen = () => {
        void qc.invalidateQueries({ queryKey: ['desk'] })
      }
      es.onmessage = (msg) => {
        try {
          const ev = JSON.parse(msg.data) as { kind?: string }
          switch (ev.kind) {
            case 'signal_ingested':
            case 'signal_closed':
              invalidate([['signals'], ['desk']])
              break
            case 'signal_analysed':
              invalidate([['analysed'], ['verdicts'], ['desk']])
              break
            case 'news_window':
            case 'session_change':
            case 'market_status':
            case 'level_break':
              invalidate([['desk'], ['levels']])
              break
            case 'job':
              invalidate([['desk'], ['signals'], ['performance']])
              break
            default:
              invalidate([['desk']])
          }
        } catch {
          /* heartbeat/comment frames */
        }
      }
      es.onerror = () => {
        es.close()
        esRef.current = null
        if (!closed) {
          // polling fallback while SSE is down
          void qc.invalidateQueries({ queryKey: ['desk'] })
          setTimeout(connect, 10_000)
        }
      }
    }

    connect()
    const poll = setInterval(() => void qc.invalidateQueries({ queryKey: ['desk'] }), POLL_FALLBACK_MS)
    return () => {
      closed = true
      clearInterval(poll)
      if (timerRef.current) clearTimeout(timerRef.current)
      esRef.current?.close()
    }
  }, [qc])

  return null
}

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <DeskEvents />
      {children}
    </QueryClientProvider>
  )
}

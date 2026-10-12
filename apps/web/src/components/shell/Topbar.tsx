'use client'
import { useEffect, useState, useRef } from 'react'
import { Bell, Palette, Command } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import { getActiveSession, getMarketStatus, type ActiveSession } from '@jack-trade/engine'
import { useUiStore } from '@/lib/uiStore'

function kenyaTime() {
  return new Intl.DateTimeFormat('en-KE', { timeZone: 'Africa/Nairobi', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date())
}

function formatAgo(ms: number): string {
  const mins = Math.floor(ms / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function stalenessColor(ms: number | null): string {
  if (ms == null) return 'var(--text-3)'
  const hours = ms / 3_600_000
  if (hours < 12) return 'var(--bull)'
  if (hours < 48) return 'var(--warn)'
  return 'var(--bear)'
}

function eatDay(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Nairobi' }).format(new Date(iso))
}

function notifTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const t = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Nairobi', hour: '2-digit', minute: '2-digit', hour12: false }).format(d)
  if (eatDay(iso) === eatDay(now.toISOString())) return `Today, ${t} EAT`
  if (eatDay(iso) === eatDay(new Date(now.getTime() - 86_400_000).toISOString())) return `Yesterday, ${t} EAT`
  const day = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Nairobi', day: '2-digit', month: 'short' }).format(d)
  return `${day}, ${t} EAT`
}

interface Notification { id: number; type: string; message: string; created_at: string }

const TYPE_DOT: Record<string, string> = {
  news_live: 'var(--info)',
  session_upcoming: 'var(--warn)',
  market_status: 'var(--info)',
  price_level_break: 'var(--bear)',
}

export default function Topbar({ onOpenPalette }: { onOpenPalette: () => void }) {
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(() => getActiveSession())
  const [marketStatus, setMarketStatus] = useState<{ open: boolean; detail: string } | null>(() => getMarketStatus())
  const [eatTime, setEatTime] = useState(() => kenyaTime())
  const [lastSignalMs, setLastSignalMs] = useState<number | null>(null)
  const [lastSignalKnown, setLastSignalKnown] = useState(false)
  const [newsWindowActive, setNewsWindowActive] = useState(false)
  const [newsEventLabel, setNewsEventLabel] = useState('')
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [showNotifications, setShowNotifications] = useState(false)
  const [lastSeenNotifId, setLastSeenNotifId] = useState<number | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const cycleTheme = useUiStore((s) => s.cycleTheme)
  const theme = useUiStore((s) => s.theme)

  const loadNotifications = async () => {
    const { data } = await supabase
      .from('notifications').select('id, type, message, created_at')
      .order('created_at', { ascending: false }).limit(20)
    setNotifications(data ?? [])
  }

  useEffect(() => {
    async function checkLastSignal() {
      const { data } = await supabase
        .from('signals').select('created_at')
        .order('created_at', { ascending: false }).limit(1)
      const latest = data?.[0]?.created_at
      if (latest) setLastSignalMs(Date.now() - new Date(latest).getTime())
      setLastSignalKnown(true)
    }
    checkLastSignal()

    async function checkNews() {
      try {
        const res = await fetch('/api/news-window-status')
        const data = await res.json()
        setNewsWindowActive(!!data.active)
        setNewsEventLabel(data.event?.label ?? '')
      } catch { setNewsWindowActive(false); setNewsEventLabel('') }
    }
    checkNews()
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load; refreshed by interval + realtime
    loadNotifications()

    const interval = setInterval(() => {
      setActiveSession(getActiveSession())
      setMarketStatus(getMarketStatus())
      setEatTime(kenyaTime())
      setLastSignalMs((p) => (p == null ? null : p + 30_000))
      checkNews()
      loadNotifications()
    }, 30_000)

    const channel = supabase.channel('shell-notifications')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, loadNotifications)
      .subscribe()

    function onDocClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setShowNotifications(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => {
      clearInterval(interval)
      supabase.removeChannel(channel)
      document.removeEventListener('mousedown', onDocClick)
    }
  }, [])

  function toggleNotifications() {
    setShowNotifications((prev) => {
      const next = !prev
      if (next && notifications.length > 0) setLastSeenNotifId(notifications[0]!.id)
      return next
    })
  }

  const dotColor = stalenessColor(lastSignalMs)
  const hasUnseen = notifications.length > 0 && (lastSeenNotifId === null || notifications[0]!.id > lastSeenNotifId)

  return (
    <header className="sticky top-0 z-40 bg-[var(--bg-panel)] border-b border-[var(--border)]">
      <div className="h-[2px] bg-gradient-to-r from-[var(--accent-gold)] via-[var(--accent-gold)]/50 to-transparent" />
      <div className="flex items-center gap-3 px-3 md:px-4 h-11">
        <div className="flex items-center gap-3 md:gap-4 overflow-x-auto whitespace-nowrap flex-1 min-w-0 font-mono text-[11px]">
          <span className="flex items-center gap-1.5 text-[var(--text-1)] font-semibold shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--bull)] animate-pulse" /> XAUUSD
          </span>
          <span className="text-[var(--text-3)] shrink-0">live price pending</span>
          <span className="text-[var(--text-2)] hidden sm:inline shrink-0 tnum">{eatTime} EAT</span>

          {lastSignalKnown && (
            <span className="flex items-center gap-1.5 shrink-0" title="Time since last signal from TradingView">
              <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: dotColor }} />
              <span className="text-[var(--text-3)]">last signal:</span>
              <span className="font-bold tnum" style={{ color: dotColor }}>
                {lastSignalMs == null ? 'none yet' : formatAgo(lastSignalMs)}
              </span>
            </span>
          )}

          {newsWindowActive && (
            <span
              className="shrink-0 px-2 py-1 rounded border border-[var(--info)] bg-[var(--info)]/15 text-[var(--info)] font-bold"
              title={newsEventLabel}
            >
              NEWS TIME
            </span>
          )}

          {marketStatus && (
            <span
              className="shrink-0 px-2 py-1 rounded border border-[var(--border-strong)] text-[var(--text-2)] font-semibold"
              title={marketStatus.detail}
            >
              {marketStatus.open ? 'MARKET OPEN' : 'MARKET CLOSED'}
            </span>
          )}

          {activeSession && (
            <span
              className="shrink-0 px-2 py-1 rounded border border-[var(--bull)] bg-[var(--bull-bg)] text-[var(--bull)] font-bold"
              title={activeSession.detail}
            >
              <span className="hidden md:inline">SESSION: </span>{activeSession.name}
            </span>
          )}
        </div>

        <button
          onClick={onOpenPalette}
          className="hidden md:flex items-center gap-2 h-7 px-2.5 rounded border border-[var(--border)] text-[var(--text-3)] hover:text-[var(--text-1)] hover:border-[var(--border-strong)] font-mono text-[10px] shrink-0"
          title="Command palette (Ctrl+K)"
        >
          <Command size={12} /> K
        </button>

        <button
          onClick={cycleTheme}
          className="p-1.5 text-[var(--text-3)] hover:text-[var(--text-1)] shrink-0"
          aria-label={`Theme: ${theme}. Click to cycle.`}
          title="Cycle theme (also in command palette)"
        >
          <Palette size={16} />
        </button>

        <div className="relative shrink-0" ref={panelRef}>
          <button onClick={toggleNotifications} className="relative p-1.5 text-[var(--text-3)] hover:text-[var(--text-1)]" aria-label="Notifications">
            <Bell size={16} />
            {hasUnseen && <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-[var(--bear)] animate-pulse" />}
          </button>

          {showNotifications && (
            <div className="fixed right-3 top-14 w-80 max-h-96 overflow-y-auto surface shadow-2xl z-[100]">
              <div className="px-4 py-2.5 border-b border-[var(--border)] eyebrow">Notifications</div>
              {notifications.length === 0 ? (
                <div className="px-4 py-6 text-center font-mono text-[11px] text-[var(--text-3)]">Nothing yet.</div>
              ) : (
                <div className="divide-y divide-[var(--border)]">
                  {notifications.map((n) => (
                    <div key={n.id} className="px-4 py-3 flex items-start gap-2.5">
                      <span
                        className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0"
                        style={{ background: TYPE_DOT[n.type] ?? 'var(--bull)' }}
                      />
                      <div className="min-w-0">
                        <div className="text-[var(--text-1)] text-xs leading-snug">{n.message}</div>
                        <div className="tnum text-[10px] text-[var(--text-3)] mt-1">{notifTime(n.created_at)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  )
}

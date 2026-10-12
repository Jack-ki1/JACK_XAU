'use client'
/* eslint-disable react-hooks/set-state-in-effect -- pathname-driven "mark as seen" sync */
// web/components/shell/Sidebar — token-styled rail (Phase 4), collapsible,
// with unopened-badge logic ported from the v1 sidebar.
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  LayoutGrid, Target, CircleCheck, Newspaper, ChartNoAxesColumn,
  Clock3, Sparkles, Settings, PanelLeftClose, PanelLeftOpen,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { api, type DeskStatus } from '@/lib/apiClient'
import { useUiStore } from '@/lib/uiStore'

const NAV = [
  { href: '/overview', label: 'Overview', Icon: LayoutGrid },
  { href: '/signals', label: 'Signals', Icon: Target },
  { href: '/analysed-signals', label: 'Analysed', Icon: CircleCheck },
  { href: '/news-signals', label: 'News', Icon: Newspaper },
  { href: '/performance', label: 'Performance', Icon: ChartNoAxesColumn },
  { href: '/backtest', label: 'Backtest', Icon: Clock3 },
  { href: '/analysis', label: 'Analysis', Icon: Sparkles },
  { href: '/settings', label: 'Settings', Icon: Settings },
] as const

const STALE_OPEN_HOURS = 48

export default function Sidebar() {
  const pathname = usePathname()
  const collapsed = useUiStore((s) => s.sidebarCollapsed)
  const toggle = useUiStore((s) => s.toggleSidebar)
  const [hasNewSignal, setHasNewSignal] = useState(false)
  const [hasStaleOpen, setHasStaleOpen] = useState(false)
  const [hasNewAnalysed, setHasNewAnalysed] = useState(false)
  const [newsActive, setNewsActive] = useState(false)

  // One desk-status query feeds every badge; DeskEvents (SSE) keeps it fresh.
  const { data: desk } = useQuery({
    queryKey: ['desk'],
    queryFn: () => api<DeskStatus>('/desk/status'),
    staleTime: 10_000,
  })

  useEffect(() => {
    const latest = desk?.lastSignalAt
    const lastSeen = localStorage.getItem('jacktrade_signals_last_seen')
    setHasNewSignal(!!latest && (!lastSeen || new Date(latest) > new Date(lastSeen)))
    const latestA = desk?.lastAnalysedAt
    const lastSeenA = localStorage.getItem('jacktrade_analysed_signals_last_seen')
    setHasNewAnalysed(!!latestA && (!lastSeenA || new Date(latestA) > new Date(lastSeenA)))
    setHasStaleOpen((desk?.staleOpenCount ?? 0) > 0)
    setNewsActive(!!desk?.news?.active)
  }, [desk])

  useEffect(() => {
    if (pathname === '/signals') {
      localStorage.setItem('jacktrade_signals_last_seen', new Date().toISOString())
      setHasNewSignal(false)
    }
    if (pathname === '/analysed-signals') {
      localStorage.setItem('jacktrade_analysed_signals_last_seen', new Date().toISOString())
      setHasNewAnalysed(false)
    }
  }, [pathname])

  const dotFor = (href: string) =>
    (href === '/news-signals' && newsActive) ||
    (href === '/analysed-signals' && hasNewAnalysed) ||
    ((href === '/signals' && hasNewSignal) || (href === '/analysis' && hasStaleOpen))

  return (
    <>
      <nav
        className={`hidden md:flex flex-col sticky top-0 h-screen bg-[var(--bg-panel)] border-r border-[var(--border)] transition-[width] duration-150 ${
          collapsed ? 'w-[64px]' : 'w-[240px]'
        }`}
      >
        <div className="flex items-center gap-2.5 px-3 h-14 border-b border-[var(--border)] shrink-0">
          <div className="w-8 h-8 rounded-full overflow-hidden border border-[var(--accent-blue)]/40 shrink-0">
            <Image src="/logo.png" alt="JACK TRADE" width={32} height={32} className="object-cover" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <div className="text-[var(--text-1)] font-bold text-sm tracking-wide leading-none">JACK TRADE</div>
              <div className="eyebrow mt-1">TRADING DESK</div>
            </div>
          )}
        </div>

        <ul className="flex flex-col gap-0.5 p-2 flex-1 overflow-y-auto">
          {NAV.map(({ href, label, Icon }) => {
            const active = pathname === href
            return (
              <li key={href} className="relative">
                {dotFor(href) && (
                  <span
                    className="absolute top-1.5 left-6 w-2 h-2 rounded-full bg-[var(--info)] animate-pulse z-10"
                    title={href === '/analysis' ? `Open signals older than ${STALE_OPEN_HOURS}h not checked yet` : 'New items'}
                  />
                )}
                <Link
                  href={href}
                  title={collapsed ? label : undefined}
                  className={`flex items-center gap-2.5 px-2.5 h-9 rounded text-[12px] whitespace-nowrap transition-colors ${
                    active
                      ? 'bg-[var(--bg-hover)] text-[var(--text-1)] border-l-2 border-[var(--accent-blue)]'
                      : 'text-[var(--text-2)] hover:text-[var(--text-1)] hover:bg-[var(--bg-hover)] border-l-2 border-transparent'
                  }`}
                >
                  <Icon size={16} strokeWidth={1.6} className="shrink-0" />
                  {!collapsed && label}
                </Link>
              </li>
            )
          })}
        </ul>

        <div className="p-2 border-t border-[var(--border)]">
          <button
            onClick={toggle}
            className="flex items-center gap-2.5 px-2.5 h-8 w-full rounded text-[11px] text-[var(--text-3)] hover:text-[var(--text-1)] hover:bg-[var(--bg-hover)]"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
            {!collapsed && <span>Collapse</span>}
          </button>
          {!collapsed && (
            <div className="tnum mt-2 space-y-1 px-2.5 pb-1 text-[10px] text-[var(--text-3)]">
              <div className="flex justify-between"><span>signal engine</span><span>v6</span></div>
              <div className="flex justify-between"><span>jobs</span><span>api v1</span></div>
            </div>
          )}
        </div>
      </nav>

      {/* Mobile bottom bar */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-[var(--bg-panel)] border-t border-[var(--border)]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <ul className="flex items-stretch justify-between px-1 overflow-x-auto">
          {NAV.map(({ href, label, Icon }) => {
            const active = pathname === href
            return (
              <li key={href} className="flex-1 relative min-w-[64px]">
                {dotFor(href) && (
                  <span className="absolute top-1 right-1/2 translate-x-3 w-2 h-2 rounded-full bg-[var(--info)] animate-pulse z-10" />
                )}
                <Link
                  href={href}
                  className={`flex flex-col items-center justify-center gap-1 py-2.5 text-[9px] font-mono ${
                    active ? 'text-[var(--accent-blue)]' : 'text-[var(--text-3)]'
                  }`}
                >
                  <Icon size={16} strokeWidth={1.6} />
                  {label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
    </>
  )
}

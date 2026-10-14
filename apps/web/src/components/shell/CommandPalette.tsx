'use client'
// web/components/shell/CommandPalette — cmdk ⌘K/Ctrl+K palette (Phase 4).
// Navigate, plus a handful of actions (theme/density/cb toggles).
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Command } from 'cmdk'
import { useUiStore, THEME_ORDER, type ThemeId, type Density } from '@/lib/uiStore'

const ROUTES = [
  { href: '/overview', label: 'Overview' },
  { href: '/signals', label: 'Signals' },
  { href: '/analysed-signals', label: 'Analysed Signals' },
  { href: '/news-signals', label: 'News Signals' },
  { href: '/performance', label: 'Performance' },
  { href: '/risk', label: 'Risk Desk' },
  { href: '/backtest', label: 'Backtest' },
  { href: '/analysis', label: 'Analysis' },
  { href: '/settings', label: 'Settings' },
]

export default function CommandPalette({
  open,
  setOpen,
}: {
  open: boolean
  setOpen: (v: boolean) => void
}) {
  const router = useRouter()
  const theme = useUiStore((s) => s.theme)
  const density = useUiStore((s) => s.density)
  const cbSafe = useUiStore((s) => s.cbSafe)
  const setTheme = useUiStore((s) => s.setTheme)
  const setDensity = useUiStore((s) => s.setDensity)
  const toggleCbSafe = useUiStore((s) => s.toggleCbSafe)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(!open)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, setOpen])

  if (!open) return null

  const go = (href: string) => { setOpen(false); router.push(href) }

  return (
    <div className="fixed inset-0 z-[200]">
      <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
      <div className="relative mx-auto mt-[15vh] w-[min(560px,92vw)]">
        <Command loop className="surface overflow-hidden shadow-2xl">
          <input
            placeholder="Jump to page or run a command…"
            className="w-full bg-transparent px-4 h-11 text-sm text-[var(--text-1)] placeholder:text-[var(--text-3)] outline-none border-b border-[var(--border)]"
          />
          <div className="max-h-[320px] overflow-y-auto p-2">
            <Command.List>
              <Command.Empty className="px-3 py-6 text-center text-xs text-[var(--text-3)]">
                No matches.
              </Command.Empty>

              <Command.Group heading="Pages" className="cmdk-group">
                {ROUTES.map((r) => (
                  <Command.Item
                    key={r.href}
                    value={`page ${r.label}`}
                    onSelect={() => go(r.href)}
                    className="px-3 h-8 rounded text-xs text-[var(--text-2)] cursor-pointer data-[selected=true]:bg-[var(--bg-hover)] data-[selected=true]:text-[var(--text-1)]"
                  >
                    {r.label}
                  </Command.Item>
                ))}
              </Command.Group>

              <Command.Group heading="Appearance" className="cmdk-group">
                {THEME_ORDER.map((t: ThemeId) => (
                  <Command.Item
                    key={t}
                    value={`theme ${t}`}
                    onSelect={() => setTheme(t)}
                    className="px-3 h-8 rounded text-xs text-[var(--text-2)] cursor-pointer data-[selected=true]:bg-[var(--bg-hover)] data-[selected=true]:text-[var(--text-1)]"
                  >
                    Theme: {t}{theme === t ? ' ✓' : ''}
                  </Command.Item>
                ))}
                {(['compact', 'comfortable'] as Density[]).map((d) => (
                  <Command.Item
                    key={d}
                    value={`density ${d}`}
                    onSelect={() => setDensity(d)}
                    className="px-3 h-8 rounded text-xs text-[var(--text-2)] cursor-pointer data-[selected=true]:bg-[var(--bg-hover)] data-[selected=true]:text-[var(--text-1)]"
                  >
                    Density: {d}{density === d ? ' ✓' : ''}
                  </Command.Item>
                ))}
                <Command.Item
                  value="colour blind safety"
                  onSelect={() => { toggleCbSafe(); setOpen(false) }}
                  className="px-3 h-8 rounded text-xs text-[var(--text-2)] cursor-pointer data-[selected=true]:bg-[var(--bg-hover)] data-[selected=true]:text-[var(--text-1)]"
                >
                  Colour-blind safe: {cbSafe ? 'on' : 'off'}
                </Command.Item>
              </Command.Group>
            </Command.List>
          </div>
        </Command>
      </div>
    </div>
  )
}

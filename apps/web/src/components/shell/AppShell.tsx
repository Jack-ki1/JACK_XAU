'use client'
// web/components/shell/AppShell — sidebar + topbar + demo ribbon + palette.
import { useState } from 'react'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import CommandPalette from './CommandPalette'
import DemoRibbon from '../DemoRibbon'

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [paletteOpen, setPaletteOpen] = useState(false)
  return (
    <div className="flex min-h-screen text-[var(--text-1)]">
      {/* Ambient aurora wash — theme-tinted depth behind the whole desk */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          background:
            'radial-gradient(1100px 520px at 78% -14%, color-mix(in srgb, var(--accent-blue) 13%, transparent), transparent 62%),' +
            'radial-gradient(780px 400px at 2% -8%, color-mix(in srgb, var(--accent-gold) 9%, transparent), transparent 58%)',
        }}
      />
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar onOpenPalette={() => setPaletteOpen(true)} />
        <DemoRibbon />
        <main className="flex-1 overflow-auto pb-16 md:pb-0">{children}</main>
      </div>
      <CommandPalette open={paletteOpen} setOpen={setPaletteOpen} />
    </div>
  )
}

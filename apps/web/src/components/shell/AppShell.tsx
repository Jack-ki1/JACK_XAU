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
    <div className="flex min-h-screen bg-[var(--bg-app)] text-[var(--text-1)]">
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

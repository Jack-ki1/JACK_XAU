'use client'
import Sidebar from '@/components/Sidebar'
import Topbar from '@/components/Topbar'
import DemoRibbon from '@/components/DemoRibbon'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-[#05070A]">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar />
        <DemoRibbon />
        <main className="flex-1 overflow-auto pb-20 md:pb-0">
          {children}
        </main>
      </div>
    </div>
  )
}
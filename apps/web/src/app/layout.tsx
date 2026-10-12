// web/app/layout.tsx — root: fonts, metadata, no-FOUC theme bootstrap,
// ThemeApplier sync loop.
import './globals.css'
import type { Metadata } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import ThemeApplier from '@/components/shell/ThemeApplier'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' })
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jbmono', display: 'swap' })

export const metadata: Metadata = {
  title: 'JACK TRADE — XAUUSD Trading Desk',
  description: 'Personal XAUUSD trading dashboard and signal intelligence workspace.',
}

// Sync no-flash bootstrap: mirror of lib/uiStore defaults, runs before paint.
const themeBoot = `try{var s=JSON.parse(localStorage.getItem('jacktrade-ui')||'{}');var u=s.state||{};var d=document.documentElement;d.setAttribute('data-theme',u.theme||'midnight');d.setAttribute('data-density',u.density||'compact');d.setAttribute('data-cb',u.cbSafe?'on':'off')}catch(e){}`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBoot }} />
      </head>
      <body>
        <ThemeApplier />
        {children}
      </body>
    </html>
  )
}

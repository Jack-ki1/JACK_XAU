// web/app/layout.tsx — root: self-hosted Geist fonts, metadata, no-FOUC
// theme bootstrap, ThemeApplier sync loop.
import './globals.css'
import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import ThemeApplier from '@/components/shell/ThemeApplier'
import Providers from '@/components/shell/Providers'

const geistSans = localFont({
  src: '../fonts/Geist-Variable.woff2',
  variable: '--font-geist-sans',
  weight: '100 900',
  display: 'swap',
})

const geistMono = localFont({
  src: '../fonts/GeistMono-Variable.woff2',
  variable: '--font-geist-mono',
  weight: '100 900',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'JACK TRADE — XAUUSD Trading Desk',
  description: 'Personal XAUUSD trading dashboard and signal intelligence workspace.',
}

export const viewport: Viewport = {
  themeColor: '#0b1017',
}

// Sync no-flash bootstrap: mirror of lib/uiStore defaults + v1→v2 theme migration.
const themeBoot = `try{var s=JSON.parse(localStorage.getItem('jacktrade-ui')||'{}');var u=s.state||{};var d=document.documentElement;var t=u.theme==='sunrise'||u.theme==='aurora'||u.theme==='daylight'?u.theme:(u.theme==='midnight'||u.theme==='graphite'?'aurora':'daylight');var c=u.candle==='sky-orange'||u.candle==='mint-coral'||u.candle==='classic'?u.candle:'classic';d.setAttribute('data-theme',t);d.setAttribute('data-candle',c);d.setAttribute('data-density',u.density==='compact'?'compact':'comfortable');d.setAttribute('data-cb',u.cbSafe?'on':'off')}catch(e){d.setAttribute('data-theme','daylight');d.setAttribute('data-candle','classic')}`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBoot }} />
      </head>
      <body>
        <ThemeApplier />
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}

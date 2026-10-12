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

// Sync no-flash bootstrap: mirror of lib/uiStore defaults, runs before paint.
const themeBoot = `try{var s=JSON.parse(localStorage.getItem('jacktrade-ui')||'{}');var u=s.state||{};var d=document.documentElement;d.setAttribute('data-theme',u.theme||'midnight');d.setAttribute('data-density',u.density||'compact');d.setAttribute('data-cb',u.cbSafe?'on':'off')}catch(e){}`

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

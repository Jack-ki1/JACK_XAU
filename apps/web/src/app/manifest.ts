// web/app/manifest — PWA install manifest (v2 C11). Served at /manifest.webmanifest.
import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'JACK TRADE — XAUUSD Trading Desk',
    short_name: 'JACK TRADE',
    description: 'Personal single-user XAUUSD trading desk: signals, risk, backtests.',
    start_url: '/overview',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#0b1017',
    theme_color: '#0b1017',
    categories: ['finance', 'productivity'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}

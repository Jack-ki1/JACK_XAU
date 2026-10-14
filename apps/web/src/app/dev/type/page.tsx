'use client'
// web/app/dev/type — v2 B4 type specimen. Default pairing is the
// self-hosted Geist Sans / Geist Mono already wired in the root layout
// (no Google Fonts at build). Candidate pairings (Plus Jakarta Sans,
// Manrope, Sora) render from system stacks until their woff2 files are
// dropped into src/fonts and loaded via next/font/local — swap them in
// after reviewing this page. All numbers use font-variant-numeric: tabular.
import { useUiStore, THEME_ORDER } from '@/lib/uiStore'

const CANDIDATES = [
  {
    id: 'geist',
    name: 'Geist Sans + Geist Mono (current default)',
    ui: 'var(--font-geist-sans), system-ui, sans-serif',
    mono: 'var(--font-geist-mono), ui-monospace, monospace',
    note: 'Self-hosted variable woff2, already in the bundle. Geometric-neutral, excellent tabular figures in the Mono cut.',
  },
  {
    id: 'jakarta',
    name: 'Plus Jakarta Sans + JetBrains-style mono (candidate)',
    ui: '"Plus Jakarta Sans", "Geist", system-ui, sans-serif',
    mono: 'var(--font-geist-mono), ui-monospace, monospace',
    note: 'Geometric, friendly, slightly rounded — the closest common web font to the TradeVision reference feel. Drop PlusJakarta-Variable.woff2 into src/fonts to activate.',
  },
  {
    id: 'manrope',
    name: 'Manrope + Geist Mono (candidate)',
    ui: 'Manrope, "Geist", system-ui, sans-serif',
    mono: 'var(--font-geist-mono), ui-monospace, monospace',
    note: 'Geometric with a tall x-height; very clean at 13–14px UI sizes. Drop Manrope-Variable.woff2 into src/fonts to activate.',
  },
  {
    id: 'sora',
    name: 'Sora + Geist Mono (candidate)',
    ui: 'Sora, "Geist", system-ui, sans-serif',
    mono: 'var(--font-geist-mono), ui-monospace, monospace',
    note: 'More technical/precise geometry; distinctive for headings, slightly less neutral for dense tables. Drop Sora-Variable.woff2 into src/fonts to activate.',
  },
] as const

const SIZES = [
  { label: 'KPI number', css: 'text-[28px] font-semibold tnum tracking-[-0.02em]' },
  { label: 'Page h1', css: 'text-[26px] font-semibold tracking-[-0.02em]' },
  { label: 'Section h2', css: 'text-[16px] font-semibold' },
  { label: 'Body / UI (base)', css: 'text-[13px]' },
  { label: 'Meta / mono', css: 'font-mono text-[11px]' },
  { label: 'Eyebrow 11px uppercase', css: 'eyebrow' },
] as const

export default function TypeSpecimenPage() {
  const theme = useUiStore((s) => s.theme)
  const setTheme = useUiStore((s) => s.setTheme)
  return (
    <div className="min-h-screen bg-[var(--bg-app)] p-8 space-y-8">
      <header className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-[26px] font-semibold tracking-[-0.02em] text-[var(--text-1)]">Type specimen</h1>
          <p className="font-mono text-[11px] text-[var(--text-2)] mt-1">/dev/type — pick the pairing, then wire it in the root layout</p>
        </div>
        <div className="inline-flex rounded-full border border-[var(--border)] bg-[var(--bg-raised)] p-0.5">
          {THEME_ORDER.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTheme(t)}
              className={`px-3 h-7 rounded-full text-[11px] font-semibold capitalize ${t === theme ? 'bg-[var(--card-solid)] text-[var(--text-1)] shadow-sm' : 'text-[var(--text-2)]'}`}
            >
              {t}
            </button>
          ))}
        </div>
      </header>

      {CANDIDATES.map((c) => (
        <section key={c.id} className="glass p-6 space-y-4">
          <div>
            <div className="eyebrow">{c.name}</div>
            <p className="text-[12px] text-[var(--text-2)] mt-1 max-w-2xl">{c.note}</p>
          </div>
          <div style={{ fontFamily: c.ui }} className="space-y-2">
            {SIZES.map((s) => (
              <div key={s.label} className="flex items-baseline gap-4 flex-wrap">
                <span className="w-40 shrink-0 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--text-3)]">{s.label}</span>
                <span className={`${s.css} text-[var(--text-1)]`}>Gold 3,342.18 · Win rate 62% · +128R MTD</span>
              </div>
            ))}
            <div className="flex items-baseline gap-4">
              <span className="w-40 shrink-0 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--text-3)]">Alphabet</span>
              <span className="text-[15px] text-[var(--text-1)]">ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz 0123456789</span>
            </div>
          </div>
          <div style={{ fontFamily: c.mono }} className="text-[12px] text-[var(--text-2)] tnum">
            MONO 2650.10 → 2656.40 · +630 pts · 1:3.2 · 2026-10-13T09:30:00Z
          </div>
        </section>
      ))}
    </div>
  )
}

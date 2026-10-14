'use client'
import { useUiStore, THEME_ORDER, CANDLE_PRESETS, type ThemeId, type CandlePreset, type Density } from '@/lib/uiStore'
import { Segmented } from '@/components/ui/Panel'

export default function SettingsPage() {
  const theme = useUiStore((s) => s.theme)
  const candle = useUiStore((s) => s.candle)
  const density = useUiStore((s) => s.density)
  const cbSafe = useUiStore((s) => s.cbSafe)
  const setTheme = useUiStore((s) => s.setTheme)
  const setCandle = useUiStore((s) => s.setCandle)
  const setDensity = useUiStore((s) => s.setDensity)
  const toggleCbSafe = useUiStore((s) => s.toggleCbSafe)

  const timeframes = [
    { label: 'Entry timeframe', sub: 'Signals fire here — execution anchor', val: '5 min' },
    { label: 'Bias timeframe', sub: 'Sets directional context', val: '1 hour' },
    { label: 'Target timeframe', sub: 'Structural target reference', val: '4 hour' },
    { label: 'Track boxes from', sub: 'Start date for box formation · 500-day lookback', val: 'Rolling 500d' },
  ]

  return (
    <div className="p-6 md:p-8">
      <div className="mb-6">
        <h1 className="text-[26px] font-semibold tracking-[-0.02em] text-[var(--text-1)]">Settings <span className="text-[var(--text-3)] font-normal">— strategy parameters</span></h1>
        <div className="font-mono text-xs text-[var(--text-2)] mt-2">Mirrors the live signal engine&apos;s inputs — changes here will push through once wired</div>
      </div>

      <div className="surface p-6 max-w-2xl mb-5">
        <div className="eyebrow mb-4">Appearance</div>
        <div className="space-y-4">
          <div className="flex justify-between items-center py-2">
            <div>
              <div className="text-sm text-[var(--text-1)]">Theme</div>
              <div className="font-mono text-[11px] text-[var(--text-2)] mt-1">Colour palette for the whole desk · also in ⌘K</div>
            </div>
            <Segmented<ThemeId>
              value={theme}
              onChange={setTheme}
              options={THEME_ORDER.map((t) => ({ value: t, label: t }))}
            />
          </div>
          <div className="flex justify-between items-center py-2 border-t border-[var(--border)]">
            <div>
              <div className="text-sm text-[var(--text-1)]">Candle preset</div>
              <div className="font-mono text-[11px] text-[var(--text-2)] mt-1">Chart up/down colours · independent of theme · sky-orange is colour-blind safe</div>
            </div>
            <Segmented<CandlePreset>
              value={candle}
              onChange={setCandle}
              options={CANDLE_PRESETS.map((c) => ({ value: c, label: c === 'sky-orange' ? 'Sky/Orange' : c === 'mint-coral' ? 'Mint/Coral' : 'Classic' }))}
            />
          </div>
          <div className="flex justify-between items-center py-2 border-t border-[var(--border)]">
            <div>
              <div className="text-sm text-[var(--text-1)]">Density</div>
              <div className="font-mono text-[11px] text-[var(--text-2)] mt-1">Row height and padding across tables and cards</div>
            </div>
            <Segmented<Density>
              value={density}
              onChange={setDensity}
              options={[{ value: 'compact', label: 'Compact' }, { value: 'comfortable', label: 'Comfortable' }]}
            />
          </div>
          <div className="flex justify-between items-center py-2 border-t border-[var(--border)]">
            <div>
              <div className="text-sm text-[var(--text-1)]">Colour-blind safe</div>
              <div className="font-mono text-[11px] text-[var(--text-2)] mt-1">Direction/P&amp;L shown as blue / orange instead of green / red</div>
            </div>
            <Segmented<'on' | 'off'>
              value={cbSafe ? 'on' : 'off'}
              onChange={(v) => { if ((v === 'on') !== cbSafe) toggleCbSafe() }}
              options={[{ value: 'on', label: 'On' }, { value: 'off', label: 'Off' }]}
            />
          </div>
        </div>
      </div>

      <div className="bg-[var(--bg-panel)] border border-[var(--border)] rounded-xl p-6 max-w-2xl mb-5">
        <div className="font-mono text-[11px] tracking-widest text-[var(--text-2)] uppercase mb-4">Timeframes</div>
        {timeframes.map((r, i) => (
          <div key={i} className={`flex justify-between items-center py-4 ${i !== timeframes.length-1 ? 'border-b border-[var(--border)]' : ''}`}>
            <div>
              <div className="text-sm text-[var(--text-1)]">{r.label}</div>
              <div className="font-mono text-[11px] text-[var(--text-2)] mt-1">{r.sub}</div>
            </div>
            <span className="font-mono text-xs text-[var(--accent-blue)] bg-[var(--bg-raised)] border border-[var(--border)] px-3 py-1.5 rounded">{r.val}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
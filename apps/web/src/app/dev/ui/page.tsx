'use client'
// web/app/dev/ui — v2 B5 component gallery: every widget × 3 themes ×
// candle presets. Approval surface before the system rolls across pages.
import { useUiStore, THEME_ORDER, CANDLE_PRESETS, type ThemeId, type CandlePreset } from '@/lib/uiStore'
import {
  GlassCard, KpiTile, DeltaChip, PillBadge, Sparkline, RangeChips, DonutCard,
  GaugeCard, CountdownRing, StatusStrip, type RangeId,
} from '@/components/ui/widgets'
import { Panel, Stat, SideBadge, Segmented } from '@/components/ui/Panel'
import Button from '@/components/ui/Button'
import { useState } from 'react'

const DEMO_SPARK = [10, 12, 11, 14, 13, 16, 18, 17, 20, 22, 21, 24]

export default function UiGalleryPage() {
  const theme = useUiStore((s) => s.theme)
  const candle = useUiStore((s) => s.candle)
  const setTheme = useUiStore((s) => s.setTheme)
  const setCandle = useUiStore((s) => s.setCandle)
  const [range, setRange] = useState<RangeId>('1M')
  const [soon] = useState(() => new Date(Date.now() + 47 * 60_000 + 12_000).toISOString())

  return (
    <div className="min-h-screen p-6 md:p-8 space-y-6" style={{ background: 'var(--bg-app)', backgroundImage: 'var(--bg-mesh)', backgroundAttachment: 'fixed' }}>
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-[26px] font-semibold tracking-[-0.02em] text-[var(--text-1)]">UI gallery</h1>
          <p className="font-mono text-[11px] text-[var(--text-2)] mt-1">/dev/ui — widgets × themes × candle presets</p>
        </div>
        <div className="flex gap-3 flex-wrap">
          <Segmented<ThemeId> value={theme} onChange={setTheme} options={THEME_ORDER.map((t) => ({ value: t, label: t }))} />
          <Segmented<CandlePreset> value={candle} onChange={setCandle} options={CANDLE_PRESETS.map((c) => ({ value: c, label: c }))} />
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiTile label="Net result MTD" value="+128R" delta={12} deltaUnit="R" spark={DEMO_SPARK} sub="48 trades · 95% CI 48–74%" />
        <KpiTile label="Today P/L" value="+240 pts" delta={-0.4} deltaUnit="R" invertDelta spark={DEMO_SPARK.slice(4)} sub="Daily loss limit 2R remaining" />
        <KpiTile label="Win rate 30d" value="62%" delta={3} deltaUnit="%" spark={DEMO_SPARK} sub="48 trades · small-sample flag off" />
        <KpiTile label="Open signals" value="3" delta={1} spark={undefined} sub="Oldest 4h 12m · live +45 pts" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <GlassCard className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="eyebrow">Equity curve</div>
            <RangeChips value={range} onChange={setRange} />
          </div>
          <Sparkline points={DEMO_SPARK} width={320} height={90} />
          <div className="text-[11px] text-[var(--text-2)]">Drawdown pane + gradient fill ship with the P6 workspace chart.</div>
        </GlassCard>
        <DonutCard
          title="Result by session"
          centreLabel="Trades"
          centreValue={48}
          segments={[
            { label: 'London', value: 22, color: 'var(--sky-fill)' },
            { label: 'New York', value: 18, color: 'var(--orange-fill)' },
            { label: 'Asia', value: 8, color: 'var(--mint-fill)' },
          ]}
        />
        <GaugeCard
          title="Desk bias (HTF box-chain)"
          value={72}
          labelLeft="Bearish"
          labelRight="Bullish"
          footer="Second gauge (risk: news proximity + vol regime) lands with P7 context."
        />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <GlassCard className="p-4 flex flex-col items-center gap-2">
          <div className="eyebrow self-start">Next high-impact event</div>
          <CountdownRing targetIso={soon} label="NFP in" totalMs={3_600_000} />
        </GlassCard>
        <Panel title="Primitives">
          <div className="flex flex-wrap items-center gap-2">
            <Button>Primary</Button>
            <PillBadge tone="sky">London</PillBadge>
            <PillBadge tone="orange">News window</PillBadge>
            <PillBadge tone="green">Valid</PillBadge>
            <PillBadge tone="rose">Invalid</PillBadge>
            <SideBadge side="BUY" />
            <SideBadge side="SELL" />
            <DeltaChip value={4.2} unit="R" />
            <DeltaChip value={-1} />
          </div>
        </Panel>
        <Panel title="Stat cells">
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Expectancy" value="+0.42R" tone="bull" />
            <Stat label="SQN" value="1.8" />
            <Stat label="PF" value="1.6" />
            <Stat label="Max DD" value="−4.2R" tone="bear" />
          </div>
        </Panel>
      </div>

      <GlassCard hover={false} className="overflow-hidden">
        <div className="p-4 pb-2"><div className="eyebrow">Candle swatches (data-candle={candle})</div></div>
        <div className="flex gap-3 px-4 pb-4">
          {['--candle-up', '--candle-down', '--candle-up-strong', '--candle-down-strong'].map((v) => (
            <div key={v} className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-lg border border-[var(--border)]" style={{ background: `var(${v})` }} />
              <span className="font-mono text-[10px] text-[var(--text-2)]">{v}</span>
            </div>
          ))}
        </div>
        <StatusStrip
          items={[
            { key: 'feed', label: 'Data feed', value: 'TwelveData', tone: 'ok' },
            { key: 'db', label: 'Supabase', value: 'connected', tone: 'ok' },
            { key: 'ai', label: 'AI provider', value: 'Groq', tone: 'ok' },
            { key: 'jobs', label: 'Jobs', value: '7/7 ok', tone: 'ok' },
            { key: 'credits', label: 'Credits left', value: '612/800', tone: 'warn' },
          ]}
        />
      </GlassCard>
    </div>
  )
}

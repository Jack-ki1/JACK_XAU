'use client'
// web/components/ui/widgets — v2 §B5 glass widget recipes.
// All charts here are tiny inline SVG (no chart suite): sparkline, donut,
// semi-circular gauge, countdown ring. Numbers are tabular (.tnum).
// Motion: transitions 120–160ms; respect prefers-reduced-motion (global CSS).
import { useEffect, useMemo, useState, type ReactNode } from 'react'

/* ===== GlassCard ===== */
export function GlassCard({
  children,
  className = '',
  hover = true,
  label,
}: {
  children: ReactNode
  className?: string
  hover?: boolean
  label?: string
}) {
  return (
    <section
      className={`glass relative overflow-hidden ${hover ? 'transition-[box-shadow,transform] duration-150 hover:shadow-[0_0_0_1px_var(--border-glow),var(--shadow)] hover:-translate-y-[1px]' : ''} ${className}`}
    >
      {label && <div className="eyebrow px-4 pt-3.5">{label}</div>}
      {children}
    </section>
  )
}

/* ===== DeltaChip ===== */
export function DeltaChip({ value, unit = '', invert = false }: { value: number | null | undefined; unit?: string; invert?: boolean }) {
  if (value == null || !Number.isFinite(value)) return null
  const positive = invert ? value < 0 : value > 0
  const zero = value === 0
  const cls = zero
    ? 'text-[var(--text-2)] bg-[var(--bg-raised)]'
    : positive
      ? 'text-[var(--green-text)] bg-[var(--bull-bg)]'
      : 'text-[var(--rose-text)] bg-[var(--bear-bg)]'
  const sign = zero ? '' : value > 0 ? '+' : '−'
  return (
    <span className={`tnum inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[11px] font-semibold ${cls}`}>
      {sign}
      {Math.abs(value)}
      {unit}
    </span>
  )
}

/* ===== PillBadge ===== */
export function PillBadge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'sky' | 'orange' | 'green' | 'rose' }) {
  const tones: Record<string, string> = {
    neutral: 'bg-[var(--bg-raised)] text-[var(--text-2)] border-[var(--border)]',
    sky: 'bg-[var(--sky-fill)]/12 text-[var(--sky-text)] border-[var(--sky-fill)]/30',
    orange: 'bg-[var(--orange-fill)]/12 text-[var(--orange-text)] border-[var(--orange-fill)]/30',
    green: 'bg-[var(--green-fill)]/12 text-[var(--green-text)] border-[var(--green-fill)]/30',
    rose: 'bg-[var(--rose-fill)]/12 text-[var(--rose-text)] border-[var(--rose-fill)]/30',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-semibold uppercase tracking-[0.06em] ${tones[tone]}`}>
      {children}
    </span>
  )
}

/* ===== Sparkline (SVG) ===== */
export function Sparkline({
  points,
  width = 96,
  height = 28,
  stroke,
}: {
  points: number[]
  width?: number
  height?: number
  stroke?: string
}) {
  const path = useMemo(() => {
    if (points.length < 2) return ''
    const min = Math.min(...points)
    const max = Math.max(...points)
    const span = max - min || 1
    const step = width / (points.length - 1)
    return points
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${(height - 2 - ((p - min) / span) * (height - 4)).toFixed(1)}`)
      .join(' ')
  }, [points, width, height])
  if (!path) return null
  const up = points[points.length - 1]! >= points[0]!
  return (
    <svg width={width} height={height} className="overflow-visible" aria-hidden>
      <path d={path} fill="none" stroke={stroke ?? (up ? 'var(--green-text)' : 'var(--rose-text)')} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}

/* ===== KpiTile ===== */
export function KpiTile({
  label,
  value,
  delta,
  deltaUnit,
  invertDelta,
  spark,
  sub,
}: {
  label: string
  value: ReactNode
  delta?: number | null
  deltaUnit?: string
  invertDelta?: boolean
  spark?: number[]
  sub?: ReactNode
}) {
  return (
    <GlassCard className="p-4 flex flex-col gap-2 min-w-0">
      <div className="eyebrow">{label}</div>
      <div className="flex items-end justify-between gap-2">
        <div className="tnum text-[26px] font-semibold leading-none text-[var(--text-1)]">{value}</div>
        {delta !== undefined && <DeltaChip value={delta} unit={deltaUnit} invert={invertDelta} />}
      </div>
      <div className="flex items-end justify-between gap-2 min-h-[28px]">
        {sub != null ? <div className="tnum text-[11px] text-[var(--text-2)] leading-tight">{sub}</div> : <span />}
        {spark && spark.length > 1 && <Sparkline points={spark} />}
      </div>
    </GlassCard>
  )
}

/* ===== RangeChips ===== */
export const RANGES = ['1D', '1W', '1M', '3M', '1Y'] as const
export type RangeId = (typeof RANGES)[number]

export function RangeChips({ value, onChange }: { value: RangeId; onChange: (r: RangeId) => void }) {
  return (
    <div className="inline-flex rounded-full border border-[var(--border)] bg-[var(--bg-raised)] p-0.5">
      {RANGES.map((r) => (
        <button
          key={r}
          type="button"
          onClick={() => onChange(r)}
          className={`px-2.5 h-6 rounded-full text-[10px] font-semibold tracking-wide transition-colors ${
            r === value ? 'bg-[var(--card-solid)] text-[var(--text-1)] shadow-sm' : 'text-[var(--text-2)] hover:text-[var(--text-1)]'
          }`}
        >
          {r}
        </button>
      ))}
    </div>
  )
}

/* ===== Donut (SVG) with centre total ===== */
export function Donut({
  segments,
  size = 140,
  thickness = 16,
  centreLabel,
  centreValue,
}: {
  segments: { label: string; value: number; color: string }[]
  size?: number
  thickness?: number
  centreLabel?: string
  centreValue?: ReactNode
}) {
  const total = segments.reduce((a, s) => a + Math.max(s.value, 0), 0)
  const r = (size - thickness) / 2
  const c = 2 * Math.PI * r
  let offset = 0
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bg-raised)" strokeWidth={thickness} />
        {total > 0 &&
          segments.map((s) => {
            const frac = Math.max(s.value, 0) / total
            const dash = frac * c
            const el = (
              <circle
                key={s.label}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={thickness}
                strokeDasharray={`${dash} ${c - dash}`}
                strokeDashoffset={-offset}
                strokeLinecap="butt"
              />
            )
            offset += dash
            return el
          })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {centreValue != null && <div className="tnum text-xl font-semibold text-[var(--text-1)] leading-none">{centreValue}</div>}
        {centreLabel && <div className="eyebrow mt-1">{centreLabel}</div>}
      </div>
    </div>
  )
}

export function DonutCard({
  title,
  segments,
  centreLabel,
  centreValue,
  legend,
}: {
  title: string
  segments: { label: string; value: number; color: string }[]
  centreLabel?: string
  centreValue?: ReactNode
  legend?: ReactNode
}) {
  return (
    <GlassCard className="p-4 flex flex-col gap-3">
      <div className="eyebrow">{title}</div>
      <div className="flex items-center gap-4 flex-wrap">
        <Donut segments={segments} centreLabel={centreLabel} centreValue={centreValue} />
        <div className="flex flex-col gap-1.5 min-w-0">{legend ?? segments.map((s) => (
          <div key={s.label} className="flex items-center gap-2 text-[11px] text-[var(--text-2)]">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: s.color }} />
            <span className="truncate">{s.label}</span>
            <span className="tnum ml-auto text-[var(--text-1)]">{s.value}</span>
          </div>
        ))}</div>
      </div>
    </GlassCard>
  )
}

/* ===== Semi-circular gauge (SVG, needle + big number) ===== */
export function Gauge({
  value,
  min = 0,
  max = 100,
  size = 180,
  labelLeft = 'Bear',
  labelRight = 'Bull',
  display,
}: {
  value: number
  min?: number
  max?: number
  size?: number
  labelLeft?: string
  labelRight?: string
  display?: ReactNode
}) {
  const clamped = Math.min(Math.max(value, min), max)
  const frac = (clamped - min) / (max - min || 1)
  const cx = size / 2
  const cy = size / 2 + 10
  const r = size / 2 - 16
  const arc = (from: number, to: number) => {
    const a0 = Math.PI + from * Math.PI
    const a1 = Math.PI + to * Math.PI
    const x0 = cx + r * Math.cos(a0)
    const y0 = cy + r * Math.sin(a0)
    const x1 = cx + r * Math.cos(a1)
    const y1 = cy + r * Math.sin(a1)
    return `M${x0},${y0} A${r},${r} 0 0 1 ${x1},${y1}`
  }
  const needleAngle = Math.PI + frac * Math.PI
  const nx = cx + (r - 14) * Math.cos(needleAngle)
  const ny = cy + (r - 14) * Math.sin(needleAngle)
  return (
    <div className="relative inline-flex flex-col items-center" style={{ width: size }}>
      <svg width={size} height={size * 0.62} aria-hidden>
        <path d={arc(0, 1)} fill="none" stroke="var(--bg-raised)" strokeWidth={10} strokeLinecap="round" />
        <path d={arc(0, frac)} fill="none" stroke="var(--grad-cta)" strokeWidth={10} strokeLinecap="round" style={{ stroke: 'var(--orange-fill)' }} />
        <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="var(--text-1)" strokeWidth={2.5} strokeLinecap="round" />
        <circle cx={cx} cy={cy} r={4} fill="var(--text-1)" />
      </svg>
      <div className="tnum -mt-6 text-[28px] font-semibold text-[var(--text-1)] leading-none">{display ?? Math.round(clamped)}</div>
      <div className="flex justify-between w-full mt-1 text-[10px] text-[var(--text-3)] uppercase tracking-[0.08em]">
        <span>{labelLeft}</span>
        <span>{labelRight}</span>
      </div>
    </div>
  )
}

export function GaugeCard({ title, value, min, max, labelLeft, labelRight, display, footer }: {
  title: string
  value: number
  min?: number
  max?: number
  labelLeft?: string
  labelRight?: string
  display?: ReactNode
  footer?: ReactNode
}) {
  return (
    <GlassCard className="p-4 flex flex-col gap-2 items-start">
      <div className="eyebrow">{title}</div>
      <Gauge value={value} min={min} max={max} labelLeft={labelLeft} labelRight={labelRight} display={display} />
      {footer && <div className="text-[11px] text-[var(--text-2)] w-full">{footer}</div>}
    </GlassCard>
  )
}

/* ===== Countdown ring (HH:MM:SS) ===== */
function splitHms(ms: number): [string, string, string] {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return [String(h).padStart(2, '0'), String(m).padStart(2, '0'), String(sec).padStart(2, '0')]
}

export function CountdownRing({
  targetIso,
  size = 120,
  label,
  totalMs,
}: {
  targetIso: string
  size?: number
  label?: string
  /** Optional total window for the ring fill (e.g. 24h). Defaults to 1h. */
  totalMs?: number
}) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  const target = new Date(targetIso).getTime()
  const remaining = target - now
  const total = totalMs ?? 3_600_000
  const frac = Math.min(Math.max(remaining / total, 0), 1)
  const [h, m, s] = splitHms(remaining)
  const r = size / 2 - 8
  const c = 2 * Math.PI * r
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bg-raised)" strokeWidth={6} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--sky-fill)"
          strokeWidth={6}
          strokeDasharray={`${frac * c} ${c}`}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="tnum text-sm font-semibold text-[var(--text-1)]">
          {h}:{m}:{s}
        </div>
        {label && <div className="eyebrow mt-0.5 text-[9px]">{label}</div>}
      </div>
    </div>
  )
}

/* ===== StatusStrip (footer system status) ===== */
export interface StatusItem {
  key: string
  label: string
  value: ReactNode
  tone?: 'ok' | 'warn' | 'bad' | 'muted'
}

export function StatusStrip({ items }: { items: StatusItem[] }) {
  const dot: Record<string, string> = {
    ok: 'bg-[var(--green-fill)]',
    warn: 'bg-[var(--orange-fill)]',
    bad: 'bg-[var(--rose-fill)]',
    muted: 'bg-[var(--text-3)]',
  }
  return (
    <div className="flex items-center gap-4 flex-wrap px-4 py-2 border-t border-[var(--border)] bg-[var(--card)] backdrop-blur text-[11px]">
      {items.map((it) => (
        <span key={it.key} className="inline-flex items-center gap-1.5 text-[var(--text-2)]">
          <span className={`w-1.5 h-1.5 rounded-full ${dot[it.tone ?? 'muted']}`} aria-hidden />
          <span className="uppercase tracking-[0.06em] text-[10px]">{it.label}</span>
          <span className="tnum text-[var(--text-1)]">{it.value}</span>
        </span>
      ))}
    </div>
  )
}

// web/components/ui/Panel — surface container with optional eyebrow header.
import type { ReactNode } from 'react'

export function Panel({
  title,
  right,
  children,
  className = '',
  bodyClassName = '',
}: {
  title?: ReactNode
  right?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <section className={`surface flex flex-col min-w-0 ${className}`}>
      {(title || right) && (
        <header className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-[var(--border)]">
          <div className="eyebrow">{title}</div>
          {right}
        </header>
      )}
      <div className={`p-4 min-w-0 ${bodyClassName}`}>{children}</div>
    </section>
  )
}

/** Single stat cell: eyebrow + big tabular number + sub line. */
export function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string
  value: ReactNode
  sub?: ReactNode
  tone?: 'bull' | 'bear' | 'warn' | 'muted'
}) {
  const toneClass =
    tone === 'bull' ? 'text-[var(--bull)]'
    : tone === 'bear' ? 'text-[var(--bear)]'
    : tone === 'warn' ? 'text-[var(--warn)]'
    : 'text-[var(--text-1)]'
  return (
    <div className="surface-raised px-4 py-3 min-w-0">
      <div className="eyebrow mb-1.5">{label}</div>
      <div className={`tnum text-lg font-semibold leading-none ${toneClass}`}>{value}</div>
      {sub != null && <div className="tnum mt-1.5 text-[11px] text-[var(--text-2)]">{sub}</div>}
    </div>
  )
}

/** Empty-state placeholder with action slot. */
export function Empty({
  title,
  hint,
  action,
}: {
  title: string
  hint?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
      <div className="text-sm text-[var(--text-2)]">{title}</div>
      {hint && <div className="text-[11px] text-[var(--text-3)] max-w-sm">{hint}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

/** Loading shimmer block. */
export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded bg-[var(--bg-raised)] ${className}`}
      aria-hidden
    />
  )
}

/** Directional badge (BUY/SELL) — bull/bear only, never brand gold. */
export function SideBadge({ side }: { side: string }) {
  const isBuy = side?.toUpperCase().startsWith('B')
  return (
    <span
      className={`tnum inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold tracking-wide ${
        isBuy ? 'bg-[var(--bull-bg)] text-[var(--bull)]' : 'bg-[var(--bear-bg)] text-[var(--bear)]'
      }`}
    >
      {side?.toUpperCase()}
    </span>
  )
}

/** Segmented control (settings / view switches). */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="inline-flex rounded-md border border-[var(--border)] overflow-hidden">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`px-2.5 h-7 text-[11px] font-medium transition-colors ${
            o.value === value
              ? 'bg-[var(--accent-blue-solid)] text-[var(--on-accent)]'
              : 'bg-[var(--bg-raised)] text-[var(--text-2)] hover:text-[var(--text-1)]'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

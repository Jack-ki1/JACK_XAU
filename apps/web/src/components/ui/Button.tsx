'use client'
// web/components/ui/Button — token-styled button. Variants follow §3.4:
// primary = blue (interactive), ghost = neutral, danger = bear only when
// confirming destructive acts, gold = brand accent (rare).
import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'gold'
type Size = 'sm' | 'md'

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-[var(--accent-blue-solid)] text-[var(--on-accent)] hover:opacity-90 hover:-translate-y-px active:translate-y-0 border border-transparent shadow-[0_1px_2px_rgba(0,0,0,0.28)]',
  secondary:
    'bg-[var(--bg-raised)] text-[var(--text-1)] border border-[var(--border-strong)] hover:bg-[var(--bg-hover)]',
  ghost:
    'bg-transparent text-[var(--text-2)] border border-transparent hover:bg-[var(--bg-hover)] hover:text-[var(--text-1)]',
  danger:
    'bg-[var(--bear-bg)] text-[var(--bear)] border border-[var(--bear)] hover:bg-[var(--bear)] hover:text-white',
  gold:
    'bg-[var(--accent-gold)] text-[var(--gold-fg)] hover:opacity-90 hover:-translate-y-px active:translate-y-0 border border-transparent font-semibold shadow-[0_1px_2px_rgba(0,0,0,0.28)]',
}

const SIZES: Record<Size, string> = {
  sm: 'h-7 px-2.5 text-[11px]',
  md: 'h-8 px-3.5 text-xs',
}

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
}

export default function Button({ variant = 'secondary', size = 'md', className = '', ...rest }: Props) {
  return (
    <button
      {...rest}
      className={`inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-all disabled:opacity-50 disabled:pointer-events-none ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
    />
  )
}

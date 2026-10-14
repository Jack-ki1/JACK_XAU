// engine/pipeline — PURE signal state machine (v2 C2.2).
// States model the full lifecycle incl. TP ladder; illegal transitions are
// rejected so bad writes never corrupt stats. Orthogonal flags (analysed,
// stale, news_flagged) are NOT states — they live on the row beside it.
// Projection maps the rich state onto the legacy signals row shape.

export type SignalState =
  | 'created'
  | 'open'
  | 'tp1'
  | 'tp2'
  | 'tp3'
  | 'closed' // terminal: full target ladder complete (or TP hit without ladder)
  | 'stopped'
  | 'expired'
  | 'cancelled'

export const TERMINAL_STATES: readonly SignalState[] = ['closed', 'stopped', 'expired', 'cancelled']

const TRANSITIONS: Record<SignalState, readonly SignalState[]> = {
  created: ['open', 'cancelled', 'expired'],
  // open may jump straight to closed when a single candle takes the whole
  // ladder (no partials observed); otherwise it walks tp1→tp2→tp3.
  open: ['tp1', 'closed', 'stopped', 'expired', 'cancelled'],
  tp1: ['tp2', 'closed', 'stopped', 'expired', 'cancelled'],
  tp2: ['tp3', 'closed', 'stopped', 'expired', 'cancelled'],
  tp3: ['closed', 'stopped', 'expired', 'cancelled'],
  closed: [],
  stopped: [],
  expired: [],
  cancelled: [],
}

export function isTerminal(state: SignalState): boolean {
  return TERMINAL_STATES.includes(state)
}

export function canTransition(from: SignalState, to: SignalState): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false
}

export type TransitionResult =
  | { ok: true; from: SignalState; to: SignalState }
  | { ok: false; from: SignalState; to: SignalState; reason: string }

export function applyTransition(from: SignalState, to: SignalState): TransitionResult {
  if (isTerminal(from)) {
    return { ok: false, from, to, reason: `Signal is terminal (${from}); no further transitions allowed.` }
  }
  if (!canTransition(from, to)) {
    return { ok: false, from, to, reason: `Illegal transition ${from} → ${to}. Allowed: ${TRANSITIONS[from].join(', ')}.` }
  }
  return { ok: true, from, to }
}

/** Ordered walk of ladder states reached when price takes TPs in sequence. */
export function ladderPath(target: 'none' | 'tp1' | 'tp2' | 'tp3'): SignalState[] {
  const full: SignalState[] = ['created', 'open', 'tp1', 'tp2', 'tp3', 'closed']
  if (target === 'none') return ['created', 'open', 'closed']
  const idx = full.indexOf(target)
  return full.slice(0, idx + 1)
}

/** Legacy row projection (signals table shape used by resolvers today). */
export interface RowProjection {
  status: 'open' | 'closed'
  final_outcome: 'tp_hit' | 'stopped_out' | null
  ladder: 'none' | 'tp1' | 'tp2' | 'tp3'
}

export function projectToRow(state: SignalState): RowProjection {
  switch (state) {
    case 'created':
    case 'open':
      return { status: 'open', final_outcome: null, ladder: 'none' }
    case 'tp1':
      return { status: 'open', final_outcome: null, ladder: 'tp1' }
    case 'tp2':
      return { status: 'open', final_outcome: null, ladder: 'tp2' }
    case 'tp3':
      return { status: 'open', final_outcome: null, ladder: 'tp3' }
    case 'closed':
      return { status: 'closed', final_outcome: 'tp_hit', ladder: 'tp3' }
    case 'stopped':
      return { status: 'closed', final_outcome: 'stopped_out', ladder: 'none' }
    case 'expired':
    case 'cancelled':
      return { status: 'closed', final_outcome: null, ladder: 'none' }
  }
}

/** Inverse projection: row → canonical state (migration of legacy rows). */
export function stateFromRow(row: { status: string; final_outcome?: string | null; ladder?: string | null }): SignalState {
  if (row.status === 'open') {
    const l = row.ladder
    if (l === 'tp1' || l === 'tp2' || l === 'tp3') return l
    return 'open'
  }
  if (row.final_outcome === 'tp_hit') return 'closed'
  if (row.final_outcome === 'stopped_out') return 'stopped'
  return 'expired'
}

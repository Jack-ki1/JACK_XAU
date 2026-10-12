// lib/demo.ts (Phase 1) — fixture data for demo mode (no Supabase env).
// Shapes mirror lib/types.ts so swapping fixtures for live rows is trivial.

import type { SignalRow } from './types';

export const DEMO_RIBBON_TEXT = 'Demo data — set NEXT_PUBLIC_SUPABASE_URL to connect live data';

export const demoSignals: SignalRow[] = [
  {
    id: 1,
    signal_id: 'demo-sniper-001',
    symbol: 'XAUUSD',
    direction: 'buy',
    signal_type: 'sniper_confirmation',
    path: 'setup_a',
    entry: 2650.1,
    exits: { sl: 2648.6, tp: 2654.6, rr_selected: 3 },
    risk: { tp_rr: 3 },
    grade: { value: 5, of: 7 },
    htf_rung: '60',
    status: 'open',
    created_at: new Date(Date.now() - 42 * 60000).toISOString(),
  },
  {
    id: 2,
    signal_id: 'demo-precision-002',
    symbol: 'XAUUSD',
    direction: 'sell',
    signal_type: 'precision',
    path: null,
    entry: 2655.4,
    exits: { sl: 2656.9, tp: 2650.9, rr_selected: 3 },
    risk: { tp_rr: 3 },
    grade: { value: 4, of: 7 },
    htf_rung: '15',
    status: 'closed',
    final_outcome: 'tp_hit',
    created_at: new Date(Date.now() - 5 * 3600000).toISOString(),
    resolved_at: new Date(Date.now() - 3 * 3600000).toISOString(),
  },
];

export const demoStats = {
  open: 1,
  today: 2,
  successRate: '50.0',
  net: 300,
};

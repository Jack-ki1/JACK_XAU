// lib/types.ts (Phase 1) — single source of truth for DB row shapes.
// Replaces the ~60 `any` annotations that hid real type bugs.
// These mirror the reverse-engineered schema in docs/DATA_MODEL.md.
// Phase 2 moves this file to packages/shared with zod schemas.

export type Direction = 'buy' | 'sell';
export type SignalType = 'sniper_confirmation' | 'precision';
export type SignalStatus = 'open' | 'closed';
export type FinalOutcome = 'tp_hit' | 'stopped_out';
export type Verdict = 'valid' | 'invalid';

export interface Exits {
  sl?: number | null;
  tp?: number | null;
  tp1?: number | null;
  tp2?: number | null;
  tp3?: number | null;
  rr_selected?: number | null;
}

export interface Risk {
  sl_distance?: number | null;
  tp_distance?: number | null;
  tp_rr?: number | null;
}

export interface Grade {
  value?: number | null;
  of?: number | null;
  basis?: string | null;
}

export interface HtfConfluenceEntry {
  tf: string;
  state?: string | null;
  fade_active?: boolean | null;
  rejections?: number | null;
}

export interface ManualEntryFilter {
  applicable?: boolean;
  bias_1h?: boolean;
  zone_tapped?: boolean;
  discount_premium?: boolean;
  session_open?: boolean;
  doji_or_rejection?: boolean;
  [key: string]: boolean | undefined;
}

export interface WindowInfo {
  upper_breach_count?: number | null;
  upper_open?: boolean | null;
  lower_breach_count?: number | null;
  lower_open?: boolean | null;
}

export interface SignalRow {
  id: number;
  signal_id: string;
  symbol?: string | null;
  direction?: string | null;
  signal_type?: string | null;
  path?: string | null;
  entry?: number | null;
  exits?: Exits | null;
  risk?: Risk | null;
  grade?: Grade | null;
  htf_confluence?: HtfConfluenceEntry[] | null;
  htf_rung?: string | null;
  execution_tf?: string | null;
  manual_entry_filter?: ManualEntryFilter | null;
  window_info?: WindowInfo | null;
  signal_version?: string | null;
  status?: SignalStatus | null;
  final_outcome?: string | null;
  sl_hit?: boolean | null;
  tp_hit?: boolean | null;
  resolved_at?: string | null;
  time_to_resolution?: string | null;
  created_at: string;
  last_checked_at?: string | null;
  ai_reviewed_at?: string | null;
}

export interface VerdictRow {
  id: number;
  signal_id: string;
  direction?: string | null;
  llm_model?: string | null;
  verdict: Verdict;
  llm_entry?: number | null;
  llm_sl?: number | null;
  llm_tp?: number | null;
  llm_rr?: number | null;
  reasoning?: string | null;
  status?: SignalStatus | null;
  final_outcome?: string | null;
  resolved_at?: string | null;
  last_checked_at?: string | null;
  created_at?: string | null;
  triggering_event?: string | null;
  news_summary?: string | null;
}

export interface NotificationRow {
  id: number;
  type: string;
  message: string;
  detail?: string | null;
  created_at: string;
}

export interface CalendarEventRow {
  event_time: string;
  currency?: string | null;
  event_name?: string | null;
  impact?: string | null;
  fetched_for_date?: string | null;
}

export interface TwelveDataBar {
  datetime: string;
  open: string | number;
  high: string | number;
  low: string | number;
  close?: string | number;
}

export interface ResolvedBar {
  time: string;
  open: number;
  high: number;
  low: number;
}

export type Outcome = 'tp_hit' | 'stopped_out' | 'still_open';

export interface RouteResult {
  signal_id: string;
  outcome?: string;
  detail?: string;
  verdict?: Verdict;
}

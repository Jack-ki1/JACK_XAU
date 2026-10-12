// web/lib/apiClient — browser fetch wrapper for the same-origin proxy
// (/api/v1/* → apps/api with server-injected token). All pages read the
// backend through this; no Supabase, no secrets in the bundle.
export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
    this.name = 'ApiError'
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/v1${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    cache: 'no-store',
  })
  let body: unknown = null
  try {
    body = await res.json()
  } catch {
    /* non-JSON error body */
  }
  if (!res.ok) {
    const err = body as { error?: { message?: string } } | null
    throw new ApiError(err?.error?.message ?? `Request failed (${res.status})`, res.status)
  }
  return body as T
}

// ---- shared response shapes ------------------------------------------------

export interface DeskStatus {
  lastSignalAt: string | null
  lastAnalysedAt: string | null
  openCount: number
  staleOpenCount: number
  staleOpenHours: number
  news: { active: boolean; event: { label?: string } | null }
  stream: { subscribers: number }
}

export interface CandlesResponse {
  bars: { time: string; open: number; high: number; low: number; close: number }[]
  tf: string
  source: 'twelvedata' | 'simulated'
}

export interface LevelsResponse {
  date: string
  prevDayHigh: number | null
  prevDayLow: number | null
  prevWeekHigh: number | null
  prevWeekLow: number | null
}

export interface NotificationItem {
  id: number
  type: string
  message: string
  created_at: string
}

// row types come straight from @jack-trade/shared
export type { SignalRow, VerdictRow, NotificationRow } from '@jack-trade/shared'

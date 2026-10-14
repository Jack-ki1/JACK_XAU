// engine/timeModel — PURE day-boundary math (v2 C1.5).
// One configurable boundary drives previous-day/week levels, analysis
// bucketing and backtest day cuts. A mismatch silently corrupts PD/PW
// levels, so this module is the single source and is DST-safe by working
// in UTC instants + a boundary hour offset (default: 00:00 UTC).

export const DEFAULT_DAY_BOUNDARY_UTC_HOUR = 0

/** Epoch ms of the most recent day-boundary at or before `date`. */
export function dayStartMs(date: Date, boundaryHourUtc: number = DEFAULT_DAY_BOUNDARY_UTC_HOUR): number {
  const h = Math.min(Math.max(Math.floor(boundaryHourUtc), 0), 23)
  const d = new Date(date)
  d.setUTCHours(h, 0, 0, 0)
  if (d.getTime() > date.getTime()) d.setUTCDate(d.getUTCDate() - 1)
  return d.getTime()
}

/** Canonical day key (YYYY-MM-DD in boundary time) for bucketing. */
export function dayKey(date: Date, boundaryHourUtc: number = DEFAULT_DAY_BOUNDARY_UTC_HOUR): string {
  return new Date(dayStartMs(date, boundaryHourUtc)).toISOString().slice(0, 10)
}

/** Week start (Monday 00:00 boundary-time) epoch ms. */
export function weekStartMs(date: Date, boundaryHourUtc: number = DEFAULT_DAY_BOUNDARY_UTC_HOUR): number {
  const start = dayStartMs(date, boundaryHourUtc)
  const d = new Date(start)
  const dow = d.getUTCDay() // 0=Sun..6=Sat
  const backToMonday = (dow + 6) % 7
  d.setUTCDate(d.getUTCDate() - backToMonday)
  return d.getTime()
}

/** Parse a boundary setting like "00:00", "17:00", or "17". Null → default. */
export function parseBoundaryHour(raw: string | null | undefined): number {
  if (raw == null || raw === '') return DEFAULT_DAY_BOUNDARY_UTC_HOUR
  const m = /^(\d{1,2})(?::(\d{2}))?$/.exec(raw.trim())
  if (!m) return DEFAULT_DAY_BOUNDARY_UTC_HOUR
  const h = parseInt(m[1], 10)
  return Number.isInteger(h) && h >= 0 && h <= 23 ? h : DEFAULT_DAY_BOUNDARY_UTC_HOUR
}

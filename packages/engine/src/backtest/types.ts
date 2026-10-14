export interface Bar {
  time: string // ISO string, bar OPEN time
  open: number
  high: number
  low: number
  close: number
}

export interface BacktestParams {
  htfMidRejMinCount: number
  confirmDisplacementPct: number
  execCsodDisplacementPct: number
  pullbackDispMinPct: number
  pullbackDispMaxPct: number
  maxSLPoints: number
  slBufferPointsFlat: number
  minSLPoints: number
  sniperRRLevels: number[]
  precisionRRLevels: number[]
  swingPivotLen: number
}

export const DEFAULT_PARAMS: BacktestParams = {
  htfMidRejMinCount: 2,
  confirmDisplacementPct: 15.0,
  execCsodDisplacementPct: 8.0, // STAGE SYNC: was 15.0, BRUVV's real value since Stage 20
  pullbackDispMinPct: 62.5,
  pullbackDispMaxPct: 75.0,
  maxSLPoints: 500,             // STAGE SYNC: hard cap, matches BRUVV Stage 34/35
  slBufferPointsFlat: 150,
  minSLPoints: 50,
  sniperRRLevels: [3, 4, 5, 6, 7, 8, 9, 10],
  precisionRRLevels: [2, 3, 4],
  swingPivotLen: 3,
}

export const POINT_VALUE = 0.01 // flat, matches BRUVV Stage 35's reverted pointValue

export type Timeframe = '1' | '3' | '5' | '15' | '60' | '240' | 'D' | 'W' | 'M' | '12M'

export interface SimulatedSignal {
  time: string
  signalType: 'precision' | 'sniper_confirmation'
  path: 'setup_a' | 'setup_b' | ''
  direction: 'buy' | 'sell'
  execTf: string
  htfRung: string
  entry: number
  sl: number
  tp: number
  rrUsed: number
  gradeValue: number
  outcome: 'tp_hit' | 'stopped_out' | 'still_open'
  resolvedAt: string | null
  barsToResolve: number | null
}

export interface BacktestSummary {
  total: number
  wins: number
  losses: number
  stillOpen: number
  winRate: number | null
  netPoints: number
  avgPointsPerSignal: number | null
  /** v2 honesty layer: win rate CI + sample flag + R-based risk metrics. */
  winRateCI95: { low: number; high: number } | null
  smallSample: boolean
  expectancyR: number | null
  profitFactor: number | null
  sqn: number | null
    avgWinR: number | null
    avgLossR: number | null
    maxConsecutiveLosses: number
    /** v2 research lab: per-trade R, chronological — feeds Monte Carlo/WFO. */
    rSequence: number[]
  byType: Record<string, { total: number; wins: number; winRate: number | null }>
  byPath: Record<string, { total: number; wins: number; winRate: number | null }>
  // STAGE ADD: three genuinely actionable breakdowns, per explicit
  // request to make Backtest surface output that actually helps
  // improve Pine, not just an overall number.
  byRRLevel: Record<string, { total: number; wins: number; winRate: number | null }>
  byGrade: Record<string, { total: number; wins: number; winRate: number | null }>
  bySession: Record<string, { total: number; wins: number; winRate: number | null }>
}

export interface BoxEvent {
  time: string
  state: number
  refHigh: number
  refLow: number
  csod: boolean
  bos: boolean
  rejHighCount: number
  rejLowCount: number
  breakoutDist: number | null
}

export interface BarsByTF {
  '1': Bar[]
  '3': Bar[]
  '5': Bar[]
  '15': Bar[]
  '60': Bar[]
  '240': Bar[]
  'D': Bar[]
  'W': Bar[]
  'M': Bar[]
  '12M': Bar[]
}

export interface BacktestDiagnostics {
  totalBars: number
  barsSkippedByGuard: number
  barsEvaluated: number
  setupARawTrueCount: number
  setupBFiredStageCount: { armed: number; waitingRevert: number; waitingRealign: number }
  precisionRawTrueCount: number
}


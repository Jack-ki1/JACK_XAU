import { POINT_VALUE } from './types';
import type { SimulatedSignal, BacktestSummary } from './types';
import { getActiveSession } from '../sessions';
import { honestTradeStats, rTradesFromOutcomes } from '../honestStats';

export function summarize(signals: SimulatedSignal[]): BacktestSummary {
  const resolved = signals.filter(s => s.outcome !== 'still_open')
  const wins = resolved.filter(s => s.outcome === 'tp_hit').length
  const losses = resolved.filter(s => s.outcome === 'stopped_out').length
  const stillOpen = signals.length - resolved.length

  const pointsBetween = (a: number, b: number) => Math.round(Math.abs(a - b) / POINT_VALUE)
  const netPoints = resolved.reduce((sum, s) => {
    if (s.outcome === 'tp_hit') return sum + pointsBetween(s.entry, s.tp)
    if (s.outcome === 'stopped_out') return sum - pointsBetween(s.entry, s.sl)
    return sum
  }, 0)
  const avgPointsPerSignal = resolved.length ? Math.round((netPoints / resolved.length) * 10) / 10 : null

  const byType: BacktestSummary['byType'] = {}
  for (const key of ['precision', 'sniper_confirmation']) {
    const group = resolved.filter(s => s.signalType === key)
    const gWins = group.filter(s => s.outcome === 'tp_hit').length
    byType[key] = { total: group.length, wins: gWins, winRate: group.length ? Math.round((gWins / group.length) * 1000) / 10 : null }
  }

  const byPath: BacktestSummary['byPath'] = {}
  for (const key of ['setup_a', 'setup_b']) {
    const group = resolved.filter(s => s.path === key)
    const gWins = group.filter(s => s.outcome === 'tp_hit').length
    byPath[key] = { total: group.length, wins: gWins, winRate: group.length ? Math.round((gWins / group.length) * 1000) / 10 : null }
  }

  // STAGE ADD: win rate by the actual R:R ratio each signal used --
  // directly answers "does a specific R:R rung perform worse/better,"
  // genuinely actionable for tuning sniperRRLevels/precisionRRLevels.
  const byRRLevel: BacktestSummary['byRRLevel'] = {}
  const rrLevelsUsed = Array.from(new Set(resolved.map(s => s.rrUsed))).sort((a, b) => a - b)
  for (const rr of rrLevelsUsed) {
    const group = resolved.filter(s => s.rrUsed === rr)
    const gWins = group.filter(s => s.outcome === 'tp_hit').length
    byRRLevel[`1:${rr}`] = { total: group.length, wins: gWins, winRate: group.length ? Math.round((gWins / group.length) * 1000) / 10 : null }
  }

  // STAGE ADD: win rate by grade band -- directly answers "does a
  // stronger HTF-agreement grade actually predict a better outcome,"
  // which is the core premise the grade field is supposed to reflect.
  const byGrade: BacktestSummary['byGrade'] = {}
  const gradeBands: [string, (g: number) => boolean][] = [
    ['0-2 (weak)', g => g <= 2],
    ['3-4 (moderate)', g => g >= 3 && g <= 4],
    ['5-7 (strong)', g => g >= 5],
  ]
  for (const [label, matches] of gradeBands) {
    const group = resolved.filter(s => matches(s.gradeValue))
    const gWins = group.filter(s => s.outcome === 'tp_hit').length
    byGrade[label] = { total: group.length, wins: gWins, winRate: group.length ? Math.round((gWins / group.length) * 1000) / 10 : null }
  }

  // STAGE ADD: win rate by session -- directly answers "does one
  // session genuinely underperform," using the exact same session
  // definition as the rest of the project (imported, not duplicated).
  const bySession: BacktestSummary['bySession'] = {}
  const sessionNames = ['SYDNEY', 'TOKYO/ASIA', 'LONDON', 'NEW YORK', 'LONDON/NY OVERLAP', 'NONE']
  for (const name of sessionNames) {
    const group = resolved.filter(s => {
      const sess = getActiveSession(new Date(s.time))
      return (sess?.name ?? 'NONE') === name
    })
    if (group.length === 0) continue
    const gWins = group.filter(s => s.outcome === 'tp_hit').length
    bySession[name] = { total: group.length, wins: gWins, winRate: group.length ? Math.round((gWins / group.length) * 1000) / 10 : null }
  }

  const rTrades = rTradesFromOutcomes(resolved.map((s) => ({ outcome: s.outcome as 'tp_hit' | 'stopped_out', rrUsed: s.rrUsed })));
  const honest = honestTradeStats(rTrades);

  return {
    total: signals.length,
    wins,
    losses,
    stillOpen,
    winRate: resolved.length ? Math.round((wins / resolved.length) * 1000) / 10 : null,
    netPoints,
    avgPointsPerSignal,
    winRateCI95: honest.ci95,
    smallSample: honest.smallSample,
    expectancyR: honest.expectancyR,
    profitFactor: honest.profitFactor,
    sqn: honest.sqn,
    avgWinR: honest.avgWinR,
    avgLossR: honest.avgLossR,
    maxConsecutiveLosses: honest.maxConsecutiveLosses,
    // v2 research lab: per-trade R in chronological order — feeds the
    // client-side Monte Carlo / walk-forward without another round trip.
    rSequence: rTrades.map((t) => t.r),
    byType,
    byPath,
    byRRLevel,
    byGrade,
    bySession,
  }
}
// @jack-trade/engine — pure trading logic. No I/O, no framework imports.
// Time is always passed in (never Date.now() inside logic) for determinism.
export * from './sessions';
export * from './points';
export * from './levels';
export * from './analysis';
export * from './pipeline';
export * from './honestStats';
export * from './timeModel';
export * from './risk';
export * from './research';
export * as backtest from './backtest';
export { runBacktest, summarize, computeBoxChain, findAtOrBefore, computeProtectedSwing, walkForOutcome, DEFAULT_PARAMS } from './backtest';
export { resolveWithMagnifier } from './backtest/magnifier';
export type { M1Bar, MagnifierInput, MagnifierOptions, MagnifierResult } from './backtest/magnifier';
export type { Bar, BarsByTF, BacktestParams, BacktestSummary, SimulatedSignal, BoxEvent, BacktestDiagnostics, Timeframe } from './backtest';
export type { SignalState, TransitionResult, RowProjection } from './pipeline';
export type { WinRateHonest, HonestTradeStats, RTrade } from './honestStats';

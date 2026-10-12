// @jack-trade/engine — pure trading logic. No I/O, no framework imports.
// Time is always passed in (never Date.now() inside logic) for determinism.
export * from './sessions';
export * from './points';
export * from './levels';
export * from './analysis';
export * as backtest from './backtest';
export { runBacktest, summarize, computeBoxChain, findAtOrBefore, computeProtectedSwing, walkForOutcome, DEFAULT_PARAMS } from './backtest';
export type { Bar, BarsByTF, BacktestParams, BacktestSummary, SimulatedSignal, BoxEvent, BacktestDiagnostics, Timeframe } from './backtest';

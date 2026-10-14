// engine/risk — position sizing + exposure math (pure, deterministic).
// XAUUSD conventions: 1 standard lot = 100 oz, tick = 0.01 → $1 per point
// per lot ($100 per $1.00 move). All inputs passed in; no Date/IO.

export const OZ_PER_LOT = 100;
export const TICK_SIZE = 0.01;
export const POINT_VALUE_PER_LOT = OZ_PER_LOT * TICK_SIZE; // $1.00 / point / lot

export interface SizingInput {
  equity: number;
  riskPct: number; // % of equity to risk, e.g. 1
  entry: number;
  sl: number;
  direction: 'buy' | 'sell' | 'long' | 'short';
  minLots?: number; // default 0.01
  maxLots?: number; // default 10
  lotStep?: number; // default 0.01
}

export interface SizingResult {
  /** equity * riskPct/100 — the intended loss if the SL fills. */
  riskAmount: number;
  /** |entry - sl| expressed in points (0.01 units). */
  stopPoints: number;
  /** Dollar value of one point at one lot. */
  pointValuePerLot: number;
  /** Rounded DOWN to lotStep, capped at maxLots. */
  lots: number;
  /** Actual planned loss at the SL with the rounded lots. */
  riskActual: number;
  riskPctActual: number;
  /** $ value of one lot's full stop distance — handy for display. */
  riskPerLot: number;
  cappedBy: 'none' | 'maxLots' | 'rounding';
  warnings: string[];
}

const LOT_EPS = 1e-9;

export function positionSize(input: SizingInput): SizingResult {
  const { equity, riskPct, entry, sl } = input;
  const minLots = input.minLots ?? 0.01;
  const maxLots = input.maxLots ?? 10;
  const step = input.lotStep ?? 0.01;
  const warnings: string[] = [];

  const riskAmount = equity * (riskPct / 100);
  const stopDist = Math.abs(entry - sl);
  const stopPoints = Math.round(stopDist / TICK_SIZE);
  const riskPerLot = stopPoints * POINT_VALUE_PER_LOT;

  if (!(equity > 0)) {
    return { riskAmount: 0, stopPoints, pointValuePerLot: POINT_VALUE_PER_LOT, lots: 0, riskActual: 0, riskPctActual: 0, riskPerLot, cappedBy: 'none', warnings: ['Equity must be positive.'] };
  }
  if (!(riskPct > 0) || riskPct > 100) {
    warnings.push('Risk % must be between 0 and 100.');
  }
  if (stopPoints <= 0) {
    warnings.push('Stop loss must differ from entry.');
    return { riskAmount, stopPoints: 0, pointValuePerLot: POINT_VALUE_PER_LOT, lots: 0, riskActual: 0, riskPctActual: 0, riskPerLot: 0, cappedBy: 'none', warnings };
  }

  let cappedBy: SizingResult['cappedBy'] = 'none';
  const idealLots = riskAmount / riskPerLot;
  let lots = Math.floor(idealLots / step + LOT_EPS) * step;
  lots = Math.round(lots * 100) / 100; // clean float noise at 0.01 precision

  if (lots < minLots) {
    warnings.push(`Rounded down to 0 lots (below ${minLots} min) — the stop is too wide for this risk budget at this equity.`);
    lots = 0;
    cappedBy = 'rounding';
  } else if (lots > maxLots) {
    lots = maxLots;
    cappedBy = 'maxLots';
    warnings.push(`Capped at maxLots (${maxLots}) — actual risk exceeds the ${riskPct}% target.`);
  } else if (idealLots - lots >= step / 2 && cappedBy === 'none') {
    cappedBy = 'rounding';
  }

  const riskActual = lots * riskPerLot;
  const riskPctActual = (riskActual / equity) * 100;

  if (riskPct > 2) warnings.push(`Risk ${riskPct}% is above the desk's 2% guideline.`);

  return {
    riskAmount: round2(riskAmount),
    stopPoints,
    pointValuePerLot: POINT_VALUE_PER_LOT,
    lots: round2(lots),
    riskActual: round2(riskActual),
    riskPctActual: Math.round(riskPctActual * 100) / 100,
    riskPerLot: round2(riskPerLot),
    cappedBy,
    warnings,
  };
}

export interface ExposureInput {
  equity: number;
  positions: Array<{ lots: number; direction: 'buy' | 'sell' | 'long' | 'short'; entry: number; sl: number }>;
  maxOpenLots?: number;
  maxRiskPct?: number;
}

export interface ExposureResult {
  totalLots: number;
  totalRiskAmount: number;
  totalRiskPct: number;
  netLots: number; // buys - sells
  limitLotsBreached: boolean;
  limitRiskBreached: boolean;
  warnings: string[];
}

/** Aggregate open exposure against desk limits (v2 C5). */
export function exposureSummary(input: ExposureInput): ExposureResult {
  const maxLots = input.maxOpenLots ?? 5;
  const maxRiskPct = input.maxRiskPct ?? 5;
  let totalLots = 0;
  let netLots = 0;
  let totalRiskAmount = 0;
  const warnings: string[] = [];

  for (const p of input.positions) {
    const long = p.direction === 'buy' || p.direction === 'long';
    const dirSign = long ? 1 : -1;
    totalLots += Math.abs(p.lots);
    netLots += dirSign * Math.abs(p.lots);
    const stopPoints = Math.round(Math.abs(p.entry - p.sl) / TICK_SIZE);
    totalRiskAmount += Math.abs(p.lots) * stopPoints * POINT_VALUE_PER_LOT;
    if (stopPoints <= 0) warnings.push('A position has no stop distance — risk counted as 0.');
  }

  const totalRiskPct = input.equity > 0 ? (totalRiskAmount / input.equity) * 100 : 0;
  const limitLotsBreached = totalLots > maxLots;
  const limitRiskBreached = totalRiskPct > maxRiskPct;
  if (limitLotsBreached) warnings.push(`Open lots ${round2(totalLots)} exceed the ${maxLots} lot cap.`);
  if (limitRiskBreached) warnings.push(`Aggregate risk ${round2(totalRiskPct)}% exceeds the ${maxRiskPct}% cap.`);

  return {
    totalLots: round2(totalLots),
    totalRiskAmount: round2(totalRiskAmount),
    totalRiskPct: Math.round(totalRiskPct * 100) / 100,
    netLots: round2(netLots),
    limitLotsBreached,
    limitRiskBreached,
    warnings,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

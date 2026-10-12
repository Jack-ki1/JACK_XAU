import { computeBoxChain, findAtOrBefore } from './boxChain';
import { computeProtectedSwing } from './swings';
import { walkForOutcome, calcSL, pickNearestRR, buildSingleTP } from './simulate';
import { POINT_VALUE } from './types';
import type {
  Bar, BarsByTF, BacktestParams, BacktestDiagnostics, BoxEvent,
  SimulatedSignal, Timeframe,
} from './types';

interface ExecTracker { armed: boolean; bosSeen: boolean }

function updateExecTracker(trk: ExecTracker, csodDispOK: boolean, bosNow: boolean, stateNow: number, wantDir: number) {
  if (stateNow !== wantDir) { trk.armed = false; trk.bosSeen = false }
  if (csodDispOK) { trk.armed = true; trk.bosSeen = false }
  if (trk.armed && bosNow && stateNow === wantDir) trk.bosSeen = true
}

interface SetupBTracker {
  armedDir: number
  waitingRevert: boolean
  waitingRealign: boolean
  usedThisLeg: boolean
}

// STAGE SYNC: removed the DXY parameters and dxyOK check from the
// realign stage -- Stage 36 found BRUVV's real Setup B only requires
// realignCSOD and cycleOK at this stage, not a third DXY-agreement
// condition.
function updateSetupBTracker(
  trk: SetupBTracker,
  st: number, refHigh: number, refLow: number,
  csodX: boolean, bosX: boolean, breakoutDist: number | null, boxRange: number,
  livePrice: number, params: BacktestParams,
  anyExecBuyCSOD: boolean, anyExecSellCSOD: boolean,
  buyFadeCycleOK: boolean, sellFadeCycleOK: boolean
): boolean {
  let fired = false

  if (csodX && trk.usedThisLeg && trk.armedDir !== st) {
    trk.usedThisLeg = false
    trk.armedDir = 0
    trk.waitingRevert = false
    trk.waitingRealign = false
  }

  const minDisp = boxRange > 0 ? boxRange * params.confirmDisplacementPct / 100 : 0
  const dOK = minDisp <= 0 || (breakoutDist != null && breakoutDist >= minDisp)
  if ((csodX || bosX) && dOK && !trk.usedThisLeg) {
    trk.armedDir = st
    trk.waitingRevert = true
    trk.waitingRealign = false
    trk.usedThisLeg = true
  }

  if (trk.waitingRevert && trk.armedDir !== 0) {
    const halfRange = (refHigh - refLow) / 2
    const midpoint = (refHigh + refLow) / 2
    let dPct: number | null = null
    let isValidSetup = false
    if (halfRange > 0) {
      if (trk.armedDir === 1) {
        dPct = (refHigh - livePrice) / halfRange * 100
        isValidSetup = livePrice < refHigh && livePrice > midpoint
      } else if (trk.armedDir === -1) {
        dPct = (livePrice - refLow) / halfRange * 100
        isValidSetup = livePrice > refLow && livePrice < midpoint
      }
    }
    const qualifies = isValidSetup && dPct != null && dPct >= params.pullbackDispMinPct && dPct <= params.pullbackDispMaxPct
    if (qualifies) {
      trk.waitingRevert = false
      trk.waitingRealign = true
    }
  }

  if (trk.waitingRealign && trk.armedDir !== 0) {
    const realignCSOD = trk.armedDir === 1 ? anyExecBuyCSOD : anyExecSellCSOD
    const cycleOK = trk.armedDir === 1 ? buyFadeCycleOK : trk.armedDir === -1 ? sellFadeCycleOK : true
    if (realignCSOD && cycleOK) {
      fired = true
      trk.waitingRealign = false
    }
  }

  return fired
}

function execTfForSetupB(dir: number, trackers: Record<string, ExecTracker>): string {
  if (dir === 1) {
    if (trackers.buy1.armed) return '1'
    if (trackers.buy3.armed) return '3'
    return '5'
  }
  if (trackers.sell1.armed) return '1'
  if (trackers.sell3.armed) return '3'
  return '5'
}

// STAGE FIX: was `SimulatedSignal[]` -- diagnostics were computed in
// full but then silently discarded at the return, so every
// zero-signal run stayed an opaque black box for the caller. Now
// returns both.
export function runBacktest(barsByTF: BarsByTF, params: BacktestParams): { signals: SimulatedSignal[]; diagnostics: BacktestDiagnostics } {
  const chains: Record<Timeframe, BoxEvent[]> = {
    '1': computeBoxChain(barsByTF['1']),
    '3': computeBoxChain(barsByTF['3']),
    '5': computeBoxChain(barsByTF['5']),
    '15': computeBoxChain(barsByTF['15']),
    '60': computeBoxChain(barsByTF['60']),
    '240': computeBoxChain(barsByTF['240']),
    'D': computeBoxChain(barsByTF['D']),
    'W': computeBoxChain(barsByTF['W']),
    'M': computeBoxChain(barsByTF['M']),
    '12M': computeBoxChain(barsByTF['12M']),
  }

  const protSwing5 = computeProtectedSwing(barsByTF['5'], params.swingPivotLen)

  const signals: SimulatedSignal[] = []
  const bars1m = barsByTF['1']

  function grade(dir: number, atIdx: number): number {
    const tiers: Timeframe[] = ['15', '60', '240', 'D', 'W', 'M', '12M']
    return tiers.reduce((acc, tf) => {
      const ev = findAtOrBefore(chains[tf], bars1m[atIdx].time)
      return acc + (ev && ev.state === dir ? 1 : 0)
    }, 0)
  }

  const setupATrackers: Record<string, { usedSell: boolean; usedBuy: boolean; prevRawSell: boolean; prevRawBuy: boolean }> = {}
  const setupBTrackers: Record<string, SetupBTracker> = {}
  for (const tag of ['15', '60', '240', 'D', 'W', 'M', '12M']) {
    setupATrackers[tag] = { usedSell: false, usedBuy: false, prevRawSell: false, prevRawBuy: false }
    setupBTrackers[tag] = { armedDir: 0, waitingRevert: false, waitingRealign: false, usedThisLeg: false }
  }

  const execTrackers: Record<string, ExecTracker> = {
    sell1: { armed: false, bosSeen: false }, sell3: { armed: false, bosSeen: false }, sell5: { armed: false, bosSeen: false },
    buy1: { armed: false, bosSeen: false }, buy3: { armed: false, bosSeen: false }, buy5: { armed: false, bosSeen: false },
  }

  const minSLDistance = params.minSLPoints * POINT_VALUE

  // STAGE ADD: real diagnostics -- previous zero-signal runs were
  // opaque black boxes. This tracks exactly where the funnel goes to
  // zero: how many bars were skipped by the guard clause vs actually
  // evaluated, and how often each setup's RAW condition was ever true
  // (before edge-detection/latching), separately from how many times
  // it actually FIRED -- distinguishing "the condition is never met"
  // from "it's met but something blocks the actual fire."
  const diagnostics = {
    totalBars: bars1m.length,
    barsSkippedByGuard: 0,
    barsEvaluated: 0,
    setupARawTrueCount: 0,
    setupBFiredStageCount: { armed: 0, waitingRevert: 0, waitingRealign: 0 },
    precisionRawTrueCount: 0,
  }

  for (let i = 0; i < bars1m.length; i++) {
    const bar1m = bars1m[i]
    const t = bar1m.time

    const s15 = findAtOrBefore(chains['15'], t)
    const s60 = findAtOrBefore(chains['60'], t)
    const s240 = findAtOrBefore(chains['240'], t)
    const sD = findAtOrBefore(chains['D'], t)
    const sW = findAtOrBefore(chains['W'], t)
    const sM = findAtOrBefore(chains['M'], t)
    const s12M = findAtOrBefore(chains['12M'], t)
    // BUG FIX: chains['1'][i] corresponds EXACTLY to bars1m[i] --
    // same array, same order, same timestamps, built by
    // computeBoxChain(barsByTF['1']) 1:1. findAtOrBefore requires
    // strictly-BEFORE, so searching it for the current bar's own
    // timestamp can never return that bar's own event -- it
    // systematically returns the PREVIOUS bar's state instead (the
    // very first bar returns nothing at all). Confirmed by direct
    // trace before fixing, not assumed. Indexing directly is both
    // correct and cheaper than a binary search that was structurally
    // guaranteed to miss.
    const s1 = chains['1'][i]
    const s3 = findAtOrBefore(chains['3'], t)
    const s5 = findAtOrBefore(chains['5'], t)

    // STAGE FIX: real design flaw, hit twice in practice. This used
    // to require ALL SEVEN higher timeframes to have data before
    // evaluating ANY bar -- so a short date range containing no
    // completed weekly bar (very common: any window under ~2 weeks)
    // meant sW was null on every iteration, skipping every single
    // 1-minute bar and producing a total zero that looked identical
    // to "the strategy found nothing." That's a data-availability
    // limitation being silently reported as a strategy result, which
    // is genuinely misleading.
    //
    // Now: only the timeframes this script actually NEEDS to compute
    // a signal are required. 15m is genuinely required (f_calcSL
    // anchors every stop to it, and the Precision cycle reads it).
    // 1m is required (it's the exec chain). The slower tiers
    // (60/240/D/W/M/12M) only contribute CONFLUENCE -- grade counts
    // and mid-rejection counts -- so a missing one should reduce the
    // available confluence, exactly as it genuinely does, not halt
    // evaluation entirely. Missing tiers are simply excluded from
    // those counts below.
    if (!s15 || !s1) { diagnostics.barsSkippedByGuard++; continue }
    diagnostics.barsEvaluated++

    const protSwing = findAtOrBefore(protSwing5, t)

    // Only include tiers that genuinely have data -- a missing slow
    // timeframe legitimately contributes nothing here rather than
    // blocking the whole evaluation.
    const rejTiers = ([
      { ev: s60, tag: '60' }, { ev: s240, tag: '240' }, { ev: sD, tag: 'D' },
      { ev: sW, tag: 'W' }, { ev: sM, tag: 'M' }, { ev: s12M, tag: '12M' },
    ] as { ev: BoxEvent | null; tag: string }[]).filter((x): x is { ev: BoxEvent; tag: string } => x.ev != null)
    // STAGE FIX: real bug caught by the type checker -- rejTiers holds
    // wrapper objects ({ ev, tag }) since the null-filtering refactor
    // above, but these two lines still treated each item as if it
    // WERE the BoxEvent. Needed .ev to reach the actual data. Worth
    // noting this wasn't only a type error: it would have silently
    // broken the HTF mid-rejection count that gates Precision.
    const midRejSellCount = rejTiers.filter(x => x.ev.rejHighCount >= 2).length
    const midRejBuyCount = rejTiers.filter(x => x.ev.rejLowCount >= 2).length
    const anyHtfMidRejSell = midRejSellCount >= params.htfMidRejMinCount
    const anyHtfMidRejBuy = midRejBuyCount >= params.htfMidRejMinCount

    const cycleDir = precisionCycleDirAt(chains['15'], barsByTF['15'], t)

    // STAGE FIX: null-safe now that slow timeframes can legitimately
    // be absent in a short backtest window. When 4H data genuinely
    // doesn't exist, this gate FAILS OPEN (permits the signal) rather
    // than blocking -- matching the same fail-open convention the
    // live Pine script uses for its DXY filter when that feed is
    // unavailable. Blocking on missing data would silently suppress
    // signals for a reason that has nothing to do with the strategy.
    const sellFadeCycleOK = s240 == null || s240.state === 0 || s240.state === -1 || (s240.state === 1 && s240.rejLowCount > 0)
    const buyFadeCycleOK = s240 == null || s240.state === 0 || s240.state === 1 || (s240.state === -1 && s240.rejHighCount > 0)

    const box1Range = s1.refHigh - s1.refLow
    const box3Range = s3 ? s3.refHigh - s3.refLow : 0
    const box5Range = s5 ? s5.refHigh - s5.refLow : 0
    const minExecDisp1 = box1Range > 0 ? box1Range * params.execCsodDisplacementPct / 100 : 0
    const minExecDisp3 = box3Range > 0 ? box3Range * params.execCsodDisplacementPct / 100 : 0
    const minExecDisp5 = box5Range > 0 ? box5Range * params.execCsodDisplacementPct / 100 : 0

    const sellCsod1Disp = s1.csod && s1.state === -1 && (s1.breakoutDist ?? 0) >= minExecDisp1
    const sellCsod3Disp = !!s3 && s3.csod && s3.state === -1 && (s3.breakoutDist ?? 0) >= minExecDisp3
    const sellCsod5Disp = !!s5 && s5.csod && s5.state === -1 && (s5.breakoutDist ?? 0) >= minExecDisp5
    const buyCsod1Disp = s1.csod && s1.state === 1 && (s1.breakoutDist ?? 0) >= minExecDisp1
    const buyCsod3Disp = !!s3 && s3.csod && s3.state === 1 && (s3.breakoutDist ?? 0) >= minExecDisp3
    const buyCsod5Disp = !!s5 && s5.csod && s5.state === 1 && (s5.breakoutDist ?? 0) >= minExecDisp5

    updateExecTracker(execTrackers.sell1, sellCsod1Disp, s1.bos, s1.state, -1)
    updateExecTracker(execTrackers.sell3, sellCsod3Disp, s3?.bos ?? false, s3?.state ?? 0, -1)
    updateExecTracker(execTrackers.sell5, sellCsod5Disp, s5?.bos ?? false, s5?.state ?? 0, -1)
    updateExecTracker(execTrackers.buy1, buyCsod1Disp, s1.bos, s1.state, 1)
    updateExecTracker(execTrackers.buy3, buyCsod3Disp, s3?.bos ?? false, s3?.state ?? 0, 1)
    updateExecTracker(execTrackers.buy5, buyCsod5Disp, s5?.bos ?? false, s5?.state ?? 0, 1)

    const anyExecSellCSOD = execTrackers.sell1.armed || execTrackers.sell3.armed || execTrackers.sell5.armed
    const anyExecBuyCSOD = execTrackers.buy1.armed || execTrackers.buy3.armed || execTrackers.buy5.armed
    const anyExecSellBOS = execTrackers.sell1.bosSeen || execTrackers.sell3.bosSeen || execTrackers.sell5.bosSeen
    const anyExecBuyBOS = execTrackers.buy1.bosSeen || execTrackers.buy3.bosSeen || execTrackers.buy5.bosSeen

    const minPrecDisp = (box: BoxEvent) => (box.refHigh - box.refLow) * params.confirmDisplacementPct / 100
    const precisionBuyCsod = s1.csod && s1.state === 1 && (s1.breakoutDist ?? 0) >= minPrecDisp(s1)
      || (s3 && s3.csod && s3.state === 1 && (s3.breakoutDist ?? 0) >= minPrecDisp(s3))
      || (s5 && s5.csod && s5.state === 1 && (s5.breakoutDist ?? 0) >= minPrecDisp(s5))
    const precisionSellCsod = s1.csod && s1.state === -1 && (s1.breakoutDist ?? 0) >= minPrecDisp(s1)
      || (s3 && s3.csod && s3.state === -1 && (s3.breakoutDist ?? 0) >= minPrecDisp(s3))
      || (s5 && s5.csod && s5.state === -1 && (s5.breakoutDist ?? 0) >= minPrecDisp(s5))

    // STAGE SYNC: Precision -- 3 conditions only (cycle + HTF mid-rejection
    // + exec CSOD), matching BRUVV's real Stage 36 logic. DXY and the
    // 5-part Manual Entry Filter no longer gate this at all.
    if (cycleDir === 1 && anyHtfMidRejBuy && precisionBuyCsod) {
      diagnostics.precisionRawTrueCount++
      const sl = calcSL('buy', bar1m.close, s15.refHigh, s15.refLow, protSwing?.protHigh ?? null, protSwing?.protLow ?? null, params)
      if (Math.abs(bar1m.close - sl) >= minSLDistance) {
        const candidates = [s60?.refHigh ?? null, s60?.refLow ?? null, s240?.refHigh ?? null, s240?.refLow ?? null, sD?.refHigh ?? null, sD?.refLow ?? null, sW?.refHigh ?? null, sW?.refLow ?? null, sM?.refHigh ?? null, sM?.refLow ?? null, s12M?.refHigh ?? null, s12M?.refLow ?? null, protSwing?.protHigh ?? null, protSwing?.protLow ?? null]
        const rrUsed = pickNearestRR('buy', bar1m.close, sl, candidates, params.precisionRRLevels)
        const tp = buildSingleTP('buy', bar1m.close, sl, rrUsed)
        const { outcome, resolvedAt, barsToResolve } = walkForOutcome(bars1m, i, 'buy', sl, tp)
        signals.push({
          time: t, signalType: 'precision', path: '', direction: 'buy',
          execTf: '1', htfRung: precisionHtfRung(rejTiers, false),
          entry: bar1m.close, sl, tp, rrUsed, gradeValue: grade(1, i),
          outcome, resolvedAt, barsToResolve,
        })
      }
    }

    if (cycleDir === -1 && anyHtfMidRejSell && precisionSellCsod) {
      diagnostics.precisionRawTrueCount++
      const sl = calcSL('sell', bar1m.close, s15.refHigh, s15.refLow, protSwing?.protHigh ?? null, protSwing?.protLow ?? null, params)
      if (Math.abs(bar1m.close - sl) >= minSLDistance) {
        const candidates = [s60?.refHigh ?? null, s60?.refLow ?? null, s240?.refHigh ?? null, s240?.refLow ?? null, sD?.refHigh ?? null, sD?.refLow ?? null, sW?.refHigh ?? null, sW?.refLow ?? null, sM?.refHigh ?? null, sM?.refLow ?? null, s12M?.refHigh ?? null, s12M?.refLow ?? null, protSwing?.protHigh ?? null, protSwing?.protLow ?? null]
        const rrUsed = pickNearestRR('sell', bar1m.close, sl, candidates, params.precisionRRLevels)
        const tp = buildSingleTP('sell', bar1m.close, sl, rrUsed)
        const { outcome, resolvedAt, barsToResolve } = walkForOutcome(bars1m, i, 'sell', sl, tp)
        signals.push({
          time: t, signalType: 'precision', path: '', direction: 'sell',
          execTf: '1', htfRung: precisionHtfRung(rejTiers, true),
          entry: bar1m.close, sl, tp, rrUsed, gradeValue: grade(-1, i),
          outcome, resolvedAt, barsToResolve,
        })
      }
    }

    // STAGE FIX: filter out tiers with no data, now that slow
    // timeframes can legitimately be absent in a short window.
    // A missing tier simply can't produce a signal -- it's excluded
    // rather than crashing on a null access.
    const htfTiers: { ev: BoxEvent; tag: string }[] = ([
      { ev: s15, tag: '15' }, { ev: s60, tag: '60' }, { ev: s240, tag: '240' },
      { ev: sD, tag: 'D' }, { ev: sW, tag: 'W' }, { ev: sM, tag: 'M' }, { ev: s12M, tag: '12M' },
    ] as { ev: BoxEvent | null; tag: string }[]).filter((x): x is { ev: BoxEvent; tag: string } => x.ev != null)

    // STAGE SYNC: Setup A -- 3 conditions only (context/position + BOS
    // + 4H cycle gate). DXY agreement no longer required.
    const setupAFiredThisBar: { tag: string; dir: 'sell' | 'buy'; ev: BoxEvent }[] = []
    for (const { ev, tag } of htfTiers) {
      const trk = setupATrackers[tag]

      if (ev.csod) trk.usedSell = false
      const rawSell = ev.state === -1 && anyExecSellBOS && sellFadeCycleOK
      if (rawSell) diagnostics.setupARawTrueCount++
      const firedSell = rawSell && !trk.usedSell && !trk.prevRawSell
      if (firedSell) trk.usedSell = true
      trk.prevRawSell = rawSell
      if (firedSell) setupAFiredThisBar.push({ tag, dir: 'sell', ev })

      if (ev.csod) trk.usedBuy = false
      const rawBuy = ev.state === 1 && anyExecBuyBOS && buyFadeCycleOK
      if (rawBuy) diagnostics.setupARawTrueCount++
      const firedBuy = rawBuy && !trk.usedBuy && !trk.prevRawBuy
      if (firedBuy) trk.usedBuy = true
      trk.prevRawBuy = rawBuy
      if (firedBuy) setupAFiredThisBar.push({ tag, dir: 'buy', ev })
    }

    if (setupAFiredThisBar.length > 0) {
      const priority: { tag: string; dir: 'sell' | 'buy' }[] = []
      for (const tag of ['15', '60', '240', 'D', 'W', 'M', '12M']) {
        priority.push({ tag, dir: 'sell' })
        priority.push({ tag, dir: 'buy' })
      }
      let selected: { tag: string; dir: 'sell' | 'buy'; ev: BoxEvent } | undefined
      for (const p of priority) {
        selected = setupAFiredThisBar.find(f => f.tag === p.tag && f.dir === p.dir)
        if (selected) break
      }

      if (selected) {
        const dirNum = selected.dir === 'sell' ? -1 : 1
        // STAGE SYNC: ALWAYS anchored to 15m + protected swing now,
        // never the source HTF box's own edges (that's the whole
        // point of Stage 26's unification).
        const sl = calcSL(selected.dir, bar1m.close, s15.refHigh, s15.refLow, protSwing?.protHigh ?? null, protSwing?.protLow ?? null, params)
        if (Math.abs(bar1m.close - sl) >= minSLDistance) {
          const candidates = [s60?.refHigh ?? null, s60?.refLow ?? null, s240?.refHigh ?? null, s240?.refLow ?? null, sD?.refHigh ?? null, sD?.refLow ?? null, sW?.refHigh ?? null, sW?.refLow ?? null, sM?.refHigh ?? null, sM?.refLow ?? null, s12M?.refHigh ?? null, s12M?.refLow ?? null, protSwing?.protHigh ?? null, protSwing?.protLow ?? null]
          const rrUsed = pickNearestRR(selected.dir, bar1m.close, sl, candidates, params.sniperRRLevels)
          const tp = buildSingleTP(selected.dir, bar1m.close, sl, rrUsed)
          const { outcome, resolvedAt, barsToResolve } = walkForOutcome(bars1m, i, selected.dir, sl, tp)
          signals.push({
            time: t, signalType: 'sniper_confirmation', path: 'setup_a', direction: selected.dir,
            execTf: execTfFor(s1, s3, s5, dirNum), htfRung: selected.tag,
            entry: bar1m.close, sl, tp, rrUsed, gradeValue: grade(dirNum, i),
            outcome, resolvedAt, barsToResolve,
          })
        }
      }
    }

    // STAGE SYNC: Setup B's realign stage no longer checks DXY (see
    // updateSetupBTracker above), and its exits now use the SAME
    // unified calcSL as Setup A/Precision, not a separate
    // midpoint-anchored function.
    const setupBFiredThisBar: { tag: string; dir: number; ev: BoxEvent }[] = []
    for (const { ev, tag } of htfTiers) {
      const trk = setupBTrackers[tag]
      const boxRange = ev.refHigh - ev.refLow
      const fired = updateSetupBTracker(
        trk, ev.state, ev.refHigh, ev.refLow, ev.csod, ev.bos, ev.breakoutDist, boxRange,
        bar1m.close, params, anyExecBuyCSOD, anyExecSellCSOD, buyFadeCycleOK, sellFadeCycleOK
      )
      if (trk.armedDir !== 0) diagnostics.setupBFiredStageCount.armed++
      if (trk.waitingRevert) diagnostics.setupBFiredStageCount.waitingRevert++
      if (trk.waitingRealign) diagnostics.setupBFiredStageCount.waitingRealign++
      if (fired) setupBFiredThisBar.push({ tag, dir: trk.armedDir, ev })
    }

    if (setupBFiredThisBar.length > 0) {
      const orderTags = ['15', '60', '240', 'D', 'W', 'M', '12M']
      let selectedB: { tag: string; dir: number; ev: BoxEvent } | undefined
      for (const tag of orderTags) {
        selectedB = setupBFiredThisBar.find(f => f.tag === tag)
        if (selectedB) break
      }

      if (selectedB) {
        const dirTxt: 'buy' | 'sell' = selectedB.dir === 1 ? 'buy' : 'sell'
        const sl = calcSL(dirTxt, bar1m.close, s15.refHigh, s15.refLow, protSwing?.protHigh ?? null, protSwing?.protLow ?? null, params)
        if (Math.abs(bar1m.close - sl) >= minSLDistance) {
          const candidates = [s60?.refHigh ?? null, s60?.refLow ?? null, s240?.refHigh ?? null, s240?.refLow ?? null, sD?.refHigh ?? null, sD?.refLow ?? null, sW?.refHigh ?? null, sW?.refLow ?? null, sM?.refHigh ?? null, sM?.refLow ?? null, s12M?.refHigh ?? null, s12M?.refLow ?? null, protSwing?.protHigh ?? null, protSwing?.protLow ?? null]
          const rrUsed = pickNearestRR(dirTxt, bar1m.close, sl, candidates, params.sniperRRLevels)
          const tp = buildSingleTP(dirTxt, bar1m.close, sl, rrUsed)
          const { outcome, resolvedAt, barsToResolve } = walkForOutcome(bars1m, i, dirTxt, sl, tp)
          signals.push({
            time: t, signalType: 'sniper_confirmation', path: 'setup_b', direction: dirTxt,
            execTf: execTfForSetupB(selectedB.dir, execTrackers), htfRung: selectedB.tag,
            entry: bar1m.close, sl, tp, rrUsed, gradeValue: grade(selectedB.dir, i),
            outcome, resolvedAt, barsToResolve,
          })
        }
      }
    }
  }

  return { signals, diagnostics }
}
function execTfFor(s1: BoxEvent, s3: BoxEvent | null, s5: BoxEvent | null, dir: number): string {
  if (s1.state === dir && s1.bos) return '1'
  if (s3 && s3.state === dir && s3.bos) return '3'
  if (s5 && s5.state === dir && s5.bos) return '5'
  return '1'
}

// STAGE FIX: this used to map rejTiers[idx] to tags[idx]
// positionally, which was correct only while rejTiers ALWAYS had
// exactly 6 entries in fixed order. Now that missing slow timeframes
// are filtered out, those indices no longer line up -- it would
// silently report the wrong timeframe name. Fixed by carrying each
// tier's own tag alongside it rather than relying on position.
function precisionHtfRung(rejTiers: { ev: BoxEvent; tag: string }[], isSell: boolean): string {
  for (const { ev, tag } of rejTiers) {
    const count = isSell ? ev.rejHighCount : ev.rejLowCount
    if (count >= 2) return tag
  }
  return '12M'
}

const cycleCache = new Map<string, number>()
function precisionCycleDirAt(chain15: BoxEvent[], bars15: Bar[], t: string): number {
  const cacheKey = t
  if (cycleCache.has(cacheKey)) return cycleCache.get(cacheKey)!

  let cycleDir = 0
  let wasOutsideLow = false
  let wasOutsideHigh = false

  for (let idx = 0; idx < bars15.length; idx++) {
    const box = chain15[idx]
    if (box.time >= t) break
    if (box.csod) { cycleDir = 0; wasOutsideLow = false; wasOutsideHigh = false }

    // STAGE FIX: real bug found -- explains Precision showing
    // literally 0 across every variant, including the "looser
    // Precision" one (which changed nothing, correctly pointing the
    // blame away from htfMidRejMinCount and at this).
    // The engine had `box.state === 1 &&` / `box.state === -1 &&`
    // guards here that DO NOT exist in the real Pine (whose
    // buyFadeQualified/sellFadeQualified check only the price vs the
    // box edge). Those guards made this logically near-impossible:
    // if close drops below refLow, getBoxChain has ALREADY flipped
    // state to -1 and reset the box, so `state===1 && close<refLow`
    // essentially never co-occurs -- the cycle could never arm, so
    // Precision could never fire. Removed to match Pine.
    const nowOutsideLow = bars15[idx].close < box.refLow
    const nowOutsideHigh = bars15[idx].close > box.refHigh
    const nowInside = bars15[idx].close >= box.refLow && bars15[idx].close <= box.refHigh

    if (wasOutsideLow && nowInside) cycleDir = 1
    if (wasOutsideHigh && nowInside) cycleDir = -1
    wasOutsideLow = nowOutsideLow
    wasOutsideHigh = nowOutsideHigh
  }

  cycleCache.set(cacheKey, cycleDir)
  return cycleDir
}

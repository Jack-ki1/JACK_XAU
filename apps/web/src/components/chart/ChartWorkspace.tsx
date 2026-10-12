'use client'
/* eslint-disable react-hooks/set-state-in-effect -- imperative chart data sync when query results arrive */
// web/components/chart/ChartWorkspace — lightweight-charts candlestick
// workspace: candles from the API (live or labelled simulated), PD/PW
// level price-lines, crosshair OHLC readout, timeframe switch, theme-aware.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  createChart,
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  LineStyle,
} from 'lightweight-charts'
import type { IChartApi, ISeriesApi, IPriceLine, UTCTimestamp } from 'lightweight-charts'
import { api, type CandlesResponse, type LevelsResponse } from '@/lib/apiClient'
import { useUiStore } from '@/lib/uiStore'
import { Segmented } from '@/components/ui/Panel'

const TFS = [
  { value: '5m', label: '5m' },
  { value: '15m', label: '15m' },
  { value: '1h', label: '1H' },
  { value: '4h', label: '4H' },
  { value: '1d', label: '1D' },
] as const
type Tf = (typeof TFS)[number]['value']

function cssVar(el: HTMLElement, name: string): string {
  return getComputedStyle(el).getPropertyValue(name).trim() || '#000'
}

function toTs(time: string): UTCTimestamp {
  return Math.floor(new Date(time.includes('T') ? time : `${time.replace(' ', 'T')}Z`).getTime() / 1000) as UTCTimestamp
}

interface Readout { o?: number; h?: number; l?: number; c?: number; time?: string }

export default function ChartWorkspace() {
  const [tf, setTf] = useState<Tf>('15m')
  const theme = useUiStore((s) => s.theme)
  const cbSafe = useUiStore((s) => s.cbSafe)
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const priceLinesRef = useRef<IPriceLine[]>([])
  const [readout, setReadout] = useState<Readout>({})

  const { data: candles, isPending: candlesPending } = useQuery({
    queryKey: ['candles', tf],
    queryFn: () => api<CandlesResponse>(`/market/candles?tf=${tf}&bars=400`),
  })
  const { data: levels } = useQuery({
    queryKey: ['levels'],
    queryFn: () => api<LevelsResponse>('/levels'),
    staleTime: 5 * 60_000,
  })

  // chart lifecycle: create once, restyle on theme change
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: cssVar(el, '--chart-bg') },
        textColor: cssVar(el, '--text-2'),
        fontFamily: 'var(--font-jbmono), monospace',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: cssVar(el, '--chart-grid') },
        horzLines: { color: cssVar(el, '--chart-grid') },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: cssVar(el, '--border') },
      timeScale: { borderColor: cssVar(el, '--border'), timeVisible: true, secondsVisible: false },
    })
    const series = chart.addSeries(CandlestickSeries, {
      upColor: cbSafe ? '#0072b2' : cssVar(el, '--bull'),
      downColor: cbSafe ? '#e69f00' : cssVar(el, '--bear'),
      borderUpColor: cbSafe ? '#0072b2' : cssVar(el, '--bull'),
      borderDownColor: cbSafe ? '#e69f00' : cssVar(el, '--bear'),
      wickUpColor: cbSafe ? '#0072b2' : cssVar(el, '--bull'),
      wickDownColor: cbSafe ? '#e69f00' : cssVar(el, '--bear'),
    })
    chart.subscribeCrosshairMove((p) => {
      const d = p.seriesData.get(series) as { open?: number; high?: number; low?: number; close?: number } | undefined
      if (d && d.open != null) setReadout({ o: d.open, h: d.high, l: d.low, c: d.close })
      else setReadout((r) => ({ time: r.time }))
    })
    chartRef.current = chart
    seriesRef.current = series
    return () => {
      chart.remove()
      chartRef.current = null
      seriesRef.current = null
    }
  }, [theme, cbSafe])

  // candles → series
  useEffect(() => {
    const s = seriesRef.current
    if (!s || !candles) return
    const data = candles.bars.map((b) => ({
      time: toTs(b.time),
      open: b.open, high: b.high, low: b.low, close: b.close,
    }))
    if (data.length === 0) return
    s.setData(data)
    chartRef.current?.timeScale().fitContent()
    const last = candles.bars[candles.bars.length - 1]
    if (last) setReadout({ o: last.open, h: last.high, l: last.low, c: last.close, time: last.time })
  }, [candles])

  // PD/PW level price-lines
  useEffect(() => {
    const s = seriesRef.current
    if (!s || !levels) return
    for (const pl of priceLinesRef.current) s.removePriceLine(pl)
    priceLinesRef.current = []
    const defs: { key: string; label: string; value: number | null; color: string }[] = [
      { key: 'pdh', label: 'PDH', value: levels.prevDayHigh, color: 'var(--level-pd)' },
      { key: 'pdl', label: 'PDL', value: levels.prevDayLow, color: 'var(--level-pd)' },
      { key: 'pwh', label: 'PWH', value: levels.prevWeekHigh, color: 'var(--level-pw)' },
      { key: 'pwl', label: 'PWL', value: levels.prevWeekLow, color: 'var(--level-pw)' },
    ]
    const el = containerRef.current
    for (const d of defs) {
      if (d.value == null) continue
      priceLinesRef.current.push(
        s.createPriceLine({
          price: d.value,
          color: el ? cssVar(el, d.color.slice(4, -1)) : '#4da3ff',
          lineWidth: 1,
          lineStyle: d.key.startsWith('pw') ? LineStyle.Dashed : LineStyle.Solid,
          axisLabelVisible: true,
          title: d.label,
        }),
      )
    }
  }, [levels, theme])

  const levelRows = useMemo(() => {
    if (!levels) return []
    return [
      ['PDH', levels.prevDayHigh], ['PDL', levels.prevDayLow],
      ['PWH', levels.prevWeekHigh], ['PWL', levels.prevWeekLow],
    ] as [string, number | null][]
  }, [levels])

  const lastClose = readout.c
  const prevClose = readout.o
  const up = lastClose != null && prevClose != null && lastClose >= prevClose

  return (
    <div className="surface flex flex-col min-w-0 min-h-[420px]">
      <header className="flex items-center justify-between gap-3 px-3 py-2 border-b border-[var(--border)] flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <span className="eyebrow">XAUUSD</span>
          <div className="tnum text-[11px] text-[var(--text-2)] flex gap-3">
            {readout.o != null && (
              <>
                <span>O <b style={{ color: up ? 'var(--bull)' : 'var(--bear)' }}>{readout.o.toFixed(2)}</b></span>
                <span>H <b className="text-[var(--text-1)]">{readout.h?.toFixed(2)}</b></span>
                <span>L <b className="text-[var(--text-1)]">{readout.l?.toFixed(2)}</b></span>
                <span>C <b style={{ color: up ? 'var(--bull)' : 'var(--bear)' }}>{lastClose?.toFixed(2)}</b></span>
              </>
            )}
          </div>
          {candles?.source === 'simulated' && (
            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded border border-[var(--warn)] text-[var(--warn)]" title="No provider key — deterministic placeholder data">
              SIMULATED
            </span>
          )}
        </div>
        <Segmented<Tf> value={tf} onChange={setTf} options={TFS.map((t) => ({ ...t }))} />
      </header>

      <div className="relative flex-1 min-h-[360px]">
        <div ref={containerRef} className="absolute inset-0" />
        {candlesPending && (
          <div className="absolute inset-0 grid place-items-center text-[11px] font-mono text-[var(--text-3)] bg-[var(--bg-panel)]/60">
            loading candles…
          </div>
        )}
      </div>

      <footer className="flex items-center gap-4 px-3 py-2 border-t border-[var(--border)] text-[10px] font-mono flex-wrap">
        <span className="eyebrow !text-[9px]">levels {levels?.date ?? '—'}</span>
        {levelRows.map(([k, v]) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className="w-3 h-[2px]" style={{ background: k.startsWith('pw') ? 'var(--level-pw)' : 'var(--level-pd)' }} />
            <span className="text-[var(--text-3)]">{k}</span>
            <span className="tnum text-[var(--text-1)]">{v != null ? v.toFixed(2) : '—'}</span>
          </span>
        ))}
        <span className="ml-auto text-[var(--text-3)]">source: {candles?.source ?? '—'} · {candles?.bars.length ?? 0} bars</span>
      </footer>
    </div>
  )
}

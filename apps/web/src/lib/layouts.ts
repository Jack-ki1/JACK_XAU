'use client'
// web/lib/layouts — named widget layouts for the Desk Overview (v2 B6).
// Layouts control widget visibility + grid order (drag/resize hooks in later
// iteration; order + hide are persisted now). Home route = last used layout.
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export const WIDGET_IDS = [
  'net-mtd',
  'today-pl',
  'win-rate',
  'open-signals',
  'chart',
  'bias-gauge',
  'tf-boxes',
  'next-event',
  'feed',
  'status',
] as const
export type WidgetId = (typeof WIDGET_IDS)[number]

export const LAYOUT_PRESETS: Record<string, WidgetId[]> = {
  Live: ['net-mtd', 'today-pl', 'open-signals', 'next-event', 'chart', 'bias-gauge', 'tf-boxes', 'feed', 'status'],
  Review: ['net-mtd', 'win-rate', 'chart', 'feed', 'tf-boxes', 'status'],
  Research: ['chart', 'tf-boxes', 'bias-gauge', 'win-rate', 'status'],
}

export type LayoutName = keyof typeof LAYOUT_PRESETS | (string & {})

interface LayoutState {
  active: string
  /** Per-layout ordered widget id lists (visibility = membership). */
  layouts: Record<string, WidgetId[]>
  setActive: (name: string) => void
  toggleWidget: (layout: string, id: WidgetId) => void
  moveWidget: (layout: string, id: WidgetId, dir: -1 | 1) => void
  resetLayout: (name: string) => void
}

export const useLayouts = create<LayoutState>()(
  persist(
    (set, get) => ({
      active: 'Live',
      layouts: { ...LAYOUT_PRESETS },
      setActive: (name) => {
        const layouts = get().layouts
        if (!layouts[name]) set(() => ({ active: name, layouts: { ...layouts, [name]: [...(LAYOUT_PRESETS[name] ?? LAYOUT_PRESETS.Live!)] } }))
        else set({ active: name })
      },
      toggleWidget: (layout, id) =>
        set((s) => {
          const current = s.layouts[layout] ?? LAYOUT_PRESETS.Live!
          const next = current.includes(id) ? current.filter((w) => w !== id) : [...current, id]
          return { layouts: { ...s.layouts, [layout]: next } }
        }),
      moveWidget: (layout, id, dir) =>
        set((s) => {
          const current = [...(s.layouts[layout] ?? LAYOUT_PRESETS.Live!)]
          const i = current.indexOf(id)
          const j = i + dir
          if (i < 0 || j < 0 || j >= current.length) return s
          ;[current[i], current[j]] = [current[j]!, current[i]!]
          return { layouts: { ...s.layouts, [layout]: current } }
        }),
      resetLayout: (name) =>
        set((s) => ({
          layouts: { ...s.layouts, [name]: [...(LAYOUT_PRESETS[name] ?? LAYOUT_PRESETS.Live!)] },
        })),
    }),
    { name: 'jacktrade-layouts', storage: createJSONStorage(() => localStorage) },
  ),
)

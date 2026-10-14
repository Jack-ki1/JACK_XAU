'use client'
// web/lib/uiStore — persisted UI preferences (theme, candle preset, density,
// colour-blind mode, sidebar collapse). v2: themes are daylight/sunrise/aurora;
// legacy persisted values (midnight/graphite) migrate to aurora.
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export type ThemeId = 'daylight' | 'sunrise' | 'aurora'
export type CandlePreset = 'classic' | 'sky-orange' | 'mint-coral'
export type Density = 'compact' | 'comfortable'

export const THEME_ORDER: ThemeId[] = ['daylight', 'sunrise', 'aurora']
export const CANDLE_PRESETS: CandlePreset[] = ['classic', 'sky-orange', 'mint-coral']

/** Legacy v1 theme ids → v2. Used on rehydrate and in the no-flash boot script. */
export function migrateTheme(raw: unknown): ThemeId {
  if (raw === 'sunrise' || raw === 'aurora' || raw === 'daylight') return raw
  if (raw === 'midnight' || raw === 'graphite') return 'aurora'
  return 'daylight'
}

export function migrateCandle(raw: unknown): CandlePreset {
  if (raw === 'classic' || raw === 'sky-orange' || raw === 'mint-coral') return raw
  return 'classic'
}

interface UiState {
  theme: ThemeId
  candle: CandlePreset
  density: Density
  cbSafe: boolean
  sidebarCollapsed: boolean
  setTheme: (t: ThemeId) => void
  setCandle: (c: CandlePreset) => void
  setDensity: (d: Density) => void
  toggleCbSafe: () => void
  toggleSidebar: () => void
  /** Cycle theme from the topbar quick-switch. */
  cycleTheme: () => void
}

export const useUiStore = create<UiState>()(
  persist(
    (set, get) => ({
      theme: 'daylight',
      candle: 'classic',
      density: 'comfortable',
      cbSafe: false,
      sidebarCollapsed: false,
      setTheme: (theme) => set({ theme }),
      setCandle: (candle) => set({ candle }),
      setDensity: (density) => set({ density }),
      toggleCbSafe: () => set({ cbSafe: !get().cbSafe }),
      toggleSidebar: () => set({ sidebarCollapsed: !get().sidebarCollapsed }),
      cycleTheme: () => {
        const i = THEME_ORDER.indexOf(get().theme)
        set({ theme: THEME_ORDER[(i + 1) % THEME_ORDER.length]! })
      },
    }),
    {
      name: 'jacktrade-ui',
      storage: createJSONStorage(() => localStorage),
      migrate: (persisted) => {
        const s = (persisted ?? {}) as Partial<UiState>
        return {
          ...s,
          theme: migrateTheme(s.theme),
          candle: migrateCandle(s.candle),
          density: s.density === 'compact' ? 'compact' : 'comfortable',
        } as UiState
      },
    },
  ),
)

export function applyUiAttrs(
  el: HTMLElement,
  ui: Pick<UiState, 'theme' | 'candle' | 'density' | 'cbSafe'>,
): void {
  el.setAttribute('data-theme', ui.theme)
  el.setAttribute('data-candle', ui.candle)
  el.setAttribute('data-density', ui.density)
  el.setAttribute('data-cb', ui.cbSafe ? 'on' : 'off')
}

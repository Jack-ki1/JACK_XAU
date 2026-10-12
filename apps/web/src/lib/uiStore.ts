'use client'
// web/lib/uiStore — persisted UI preferences (theme, density, colour-blind
// mode, sidebar collapse). Phase 4: applied as data-* attrs on <html> by
// <ThemeApplier/>, consumed by tokens.css.
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export type ThemeId = 'midnight' | 'graphite' | 'daylight'
export type Density = 'compact' | 'comfortable'

interface UiState {
  theme: ThemeId
  density: Density
  cbSafe: boolean
  sidebarCollapsed: boolean
  setTheme: (t: ThemeId) => void
  setDensity: (d: Density) => void
  toggleCbSafe: () => void
  toggleSidebar: () => void
  /** Cycle theme from the topbar quick-switch. */
  cycleTheme: () => void
}

export const THEME_ORDER: ThemeId[] = ['midnight', 'graphite', 'daylight']

export const useUiStore = create<UiState>()(
  persist(
    (set, get) => ({
      theme: 'midnight',
      density: 'compact',
      cbSafe: false,
      sidebarCollapsed: false,
      setTheme: (theme) => set({ theme }),
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
    },
  ),
)

export function applyUiAttrs(
  el: HTMLElement,
  ui: Pick<UiState, 'theme' | 'density' | 'cbSafe'>,
): void {
  el.setAttribute('data-theme', ui.theme)
  el.setAttribute('data-density', ui.density)
  el.setAttribute('data-cb', ui.cbSafe ? 'on' : 'off')
}

'use client'
// Applies persisted theme/density/cb attrs to <html> before paint and
// keeps them in sync with the zustand store.
import { useEffect } from 'react'
import { useUiStore, applyUiAttrs } from '@/lib/uiStore'

export default function ThemeApplier() {
  const theme = useUiStore((s) => s.theme)
  const density = useUiStore((s) => s.density)
  const cbSafe = useUiStore((s) => s.cbSafe)

  // First-paint: sync attrs from the rehydrated store.
  useEffect(() => {
    applyUiAttrs(document.documentElement, { theme, density, cbSafe })
  }, [theme, density, cbSafe])

  return null
}

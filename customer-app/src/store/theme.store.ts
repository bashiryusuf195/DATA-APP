import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface ThemeState {
  dark: boolean
  toggle: () => void
  setDark: (v: boolean) => void
  balanceHidden: boolean
  toggleBalanceHidden: () => void
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      dark: false,
      toggle: () => set((s) => ({ dark: !s.dark })),
      setDark: (v: boolean) => set({ dark: v }),
      balanceHidden: false,
      toggleBalanceHidden: () => set((s) => ({ balanceHidden: !s.balanceHidden })),
    }),
    { name: 'vtu-theme' }
  )
)

// Call once on app startup — before React renders — to prevent a flash of the wrong theme.
export function applyPersistedTheme() {
  try {
    const stored = localStorage.getItem('vtu-theme')
    const dark = stored ? (JSON.parse(stored) as { state?: { dark?: boolean } }).state?.dark : false
    document.documentElement.classList.toggle('dark', Boolean(dark))
  } catch { /* ignore parse errors */ }
}

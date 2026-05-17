import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from '@/types'

interface AuthState {
  access_token: string | null
  refresh_token: string | null
  session_id: string | null
  user: User | null
  /** True once the persist middleware has read from localStorage. */
  _hasHydrated: boolean

  setAuth: (params: {
    access_token: string
    refresh_token: string
    session_id: string
    user: User
  }) => void
  setUser: (user: User) => void
  clearAuth: () => void
  isAdmin: () => boolean
  setHasHydrated: (v: boolean) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      access_token:  null,
      refresh_token: null,
      session_id:    null,
      user:          null,
      _hasHydrated:  false,

      setHasHydrated: (v) => set({ _hasHydrated: v }),

      setAuth: ({ access_token, refresh_token, session_id, user }) =>
        set({ access_token, refresh_token, session_id, user }),

      setUser: (user) => set({ user }),

      clearAuth: () =>
        set({ access_token: null, refresh_token: null, session_id: null, user: null }),

      isAdmin: () => {
        const { user } = get()
        if (!user) return false
        if (user.role === 'admin' || user.role === 'super_admin') return true
        return (user.roles ?? []).some((r) => r === 'admin' || r === 'super_admin')
      },
    }),
    {
      name: 'vtu-admin-auth',
      partialize: (s) => ({
        access_token:  s.access_token,
        refresh_token: s.refresh_token,
        session_id:    s.session_id,
        user:          s.user,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true)
      },
    }
  )
)

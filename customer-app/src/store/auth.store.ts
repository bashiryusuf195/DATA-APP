import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from '@/types'

interface AuthState {
  access_token:  string | null
  refresh_token: string | null
  session_id:    string | null
  user:          User | null
  _hasHydrated:  boolean

  setAuth: (params: {
    access_token:  string
    refresh_token: string
    session_id:    string
    user:          User
  }) => void
  setUser:         (user: User)  => void
  clearAuth:       ()            => void
  setHasHydrated:  (v: boolean)  => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
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
    }),
    {
      name: 'vtu-auth',
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

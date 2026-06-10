import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { Capacitor } from '@capacitor/core'
import type { User } from '@/types'
import {
  getStoredTokens,
  saveTokens,
  removeTokens,
  removeAccessToken,
} from '@/lib/secureTokens'

// On native, tokens live in Android Keystore via SecureStorage — not localStorage.
// On web, they stay in Zustand persist (localStorage) as before.
const isNative = Capacitor.isNativePlatform()

interface AuthState {
  access_token:      string | null
  refresh_token:     string | null
  session_id:        string | null
  user:              User | null
  _hasHydrated:      boolean
  biometric_enabled: boolean

  setAuth: (params: {
    access_token:  string
    refresh_token: string
    session_id:    string
    user:          User
  }) => void
  setUser:             (user: User)   => void
  clearAuth:           ()             => void
  setHasHydrated:      (v: boolean)  => void
  setBiometricEnabled: (v: boolean)  => void
  /** Internal: populate tokens from SecureStorage bootstrap without triggering side effects. */
  _setTokens: (access_token: string, refresh_token: string) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      access_token:      null,
      refresh_token:     null,
      session_id:        null,
      user:              null,
      _hasHydrated:      false,
      biometric_enabled: false,

      setHasHydrated: (v) => set({ _hasHydrated: v }),

      _setTokens: (access_token, refresh_token) => set({ access_token, refresh_token }),

      setAuth: ({ access_token, refresh_token, session_id, user }) => {
        set({ access_token, refresh_token, session_id, user })
        // Sync to Keystore on Android; no-op on web.
        saveTokens(access_token, refresh_token)
      },

      setUser: (user) => set({ user }),

      clearAuth: () =>
        set((s) => {
          if (s.biometric_enabled) {
            // Keep refresh_token + session_id + user for biometric re-login.
            // Only the short-lived access_token is removed.
            removeAccessToken()
            return { access_token: null }
          }
          removeTokens()
          return { access_token: null, refresh_token: null, session_id: null, user: null }
        }),

      setBiometricEnabled: (v) => set({ biometric_enabled: v }),
    }),
    {
      name: 'vtu-auth',

      // On native, tokens are persisted to Android Keystore only — keep them
      // out of localStorage to avoid storing sensitive data in plain text.
      // On web, everything including tokens stays in localStorage (no change).
      partialize: (s) => ({
        ...(isNative
          ? {}
          : { access_token: s.access_token, refresh_token: s.refresh_token }),
        session_id:        s.session_id,
        user:              s.user,
        biometric_enabled: s.biometric_enabled,
      }),

      // Async bootstrap: load tokens from SecureStorage after Zustand hydrates
      // non-sensitive fields from localStorage.
      //
      // Migration path for existing users:
      //   Old format stored tokens in localStorage ('vtu-auth').
      //   Zustand merges those old fields into memory on first run, giving us
      //   state.access_token / state.refresh_token here.
      //   We write them to SecureStorage, then the next partialize write
      //   removes them from localStorage automatically.
      onRehydrateStorage: () => async (state) => {
        if (!state) return
        if (isNative) {
          const stored = await getStoredTokens()
          if (stored?.access_token && stored?.refresh_token) {
            // Normal startup: tokens already live in Keystore.
            state._setTokens(stored.access_token, stored.refresh_token)
          } else if (state.access_token && state.refresh_token) {
            // First-run migration: old tokens were in localStorage — move them.
            saveTokens(state.access_token, state.refresh_token)
            // Tokens are already in memory from the old Zustand hydration;
            // no extra set() call needed here.
          }
        }
        state.setHasHydrated(true)
      },
    }
  )
)

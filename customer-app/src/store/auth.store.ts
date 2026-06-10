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
  setUser:             (user: User)  => void
  clearAuth:           ()            => void
  setHasHydrated:      (v: boolean) => void
  setBiometricEnabled: (v: boolean) => void
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

      setAuth: ({ access_token, refresh_token, session_id, user }) => {
        set({ access_token, refresh_token, session_id, user })
        // Persist tokens to Android Keystore; no-op on web.
        // Extra try-catch: saveTokens already guards internally, but this
        // ensures any unexpected error never surfaces to the login caller.
        try { saveTokens(access_token, refresh_token) } catch {}
      },

      setUser: (user) => set({ user }),

      clearAuth: () =>
        set((s) => {
          if (s.biometric_enabled) {
            // Only clear the short-lived access_token.
            // refresh_token + session_id + user are preserved for biometric re-login.
            try { removeAccessToken() } catch {}
            return { access_token: null }
          }
          try { removeTokens() } catch {}
          return { access_token: null, refresh_token: null, session_id: null, user: null }
        }),

      setBiometricEnabled: (v) => set({ biometric_enabled: v }),
    }),
    {
      name: 'vtu-auth',

      // On native, tokens are stored in Android Keystore only — exclude them
      // from localStorage. On web, everything stays in localStorage (no change).
      partialize: (s) => ({
        ...(isNative
          ? {}
          : { access_token: s.access_token, refresh_token: s.refresh_token }),
        session_id:        s.session_id,
        user:              s.user,
        biometric_enabled: s.biometric_enabled,
      }),

      // onRehydrateStorage MUST return a synchronous function — Zustand does
      // not await async callbacks. On native we launch a self-contained async
      // IIFE and hold _hasHydrated=false until it completes, so the app never
      // renders with missing tokens. On web we set _hasHydrated immediately.
      onRehydrateStorage: () => (state) => {
        if (!isNative) {
          state?.setHasHydrated(true)
          return
        }

        // Native path: load tokens from Keystore before unblocking the UI.
        // useAuthStore.setState is used (not state.xxx) because the IIFE runs
        // after the onRehydrateStorage callback returns, at which point the
        // store is fully initialised.
        ;(async () => {
          try {
            const stored = await getStoredTokens()
            if (stored?.access_token && stored?.refresh_token) {
              // Normal startup: tokens already in Keystore.
              useAuthStore.setState({
                access_token:  stored.access_token,
                refresh_token: stored.refresh_token,
              })
            } else if (state?.access_token && state?.refresh_token) {
              // First-run migration: old tokens were in localStorage — write
              // them to Keystore. They're already in memory from Zustand
              // hydration, so no extra setState needed here.
              try { saveTokens(state.access_token, state.refresh_token) } catch {}
            }
          } catch {
            // SecureStorage failure — tokens stay null, user sees login page.
          } finally {
            // Always unblock the UI, even if Keystore failed.
            useAuthStore.setState({ _hasHydrated: true })
          }
        })()
      },
    }
  )
)

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
  access_token:        string | null
  refresh_token:       string | null
  session_id:          string | null
  user:                User | null
  _hasHydrated:        boolean
  biometric_enabled:   boolean
  // Client-generated UUID stored in Keystore alongside device_secret.
  // Used to identify the device on biometric login — not a secret itself.
  biometric_device_id: string | null

  setAuth: (params: {
    access_token:  string
    refresh_token: string
    session_id:    string
    user:          User
  }) => void
  setUser:               (user: User)    => void
  clearAuth:             ()              => void
  setHasHydrated:        (v: boolean)   => void
  setBiometricEnabled:   (v: boolean)   => void
  setBiometricDeviceId:  (id: string | null) => void
  disableBiometric:      ()              => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      access_token:        null,
      refresh_token:       null,
      session_id:          null,
      user:                null,
      _hasHydrated:        false,
      biometric_enabled:   false,
      biometric_device_id: null,

      setHasHydrated: (v) => set({ _hasHydrated: v }),

      setAuth: ({ access_token, refresh_token, session_id, user }) => {
        set({ access_token, refresh_token, session_id, user })
        try { saveTokens(access_token, refresh_token) } catch {}
      },

      setUser: (user) => set({ user }),

      // On logout, always clear session tokens — biometric re-login no longer
      // relies on refresh_token, so there is no need to preserve it.
      // biometric_enabled and biometric_device_id are kept so the login page
      // knows to show the biometric button and which device to use.
      clearAuth: () => {
        try { removeAccessToken() } catch {}
        return set({ access_token: null, refresh_token: null, session_id: null, user: null })
      },

      setBiometricEnabled:  (v)  => set({ biometric_enabled: v }),
      setBiometricDeviceId: (id) => set({ biometric_device_id: id }),

      // Called when biometric enrolment is revoked or device_secret is missing.
      disableBiometric: () =>
        set({ biometric_enabled: false, biometric_device_id: null }),
    }),
    {
      name: 'vtu-auth',

      // On native: tokens are in Android Keystore — exclude from localStorage.
      // biometric_device_id is non-secret and persisted to localStorage so it
      // survives app restarts without a Keystore read.
      partialize: (s) => ({
        ...(isNative
          ? {}
          : { access_token: s.access_token, refresh_token: s.refresh_token }),
        session_id:          s.session_id,
        user:                s.user,
        biometric_enabled:   s.biometric_enabled,
        biometric_device_id: s.biometric_device_id,
      }),

      onRehydrateStorage: () => (state) => {
        if (!isNative) {
          state?.setHasHydrated(true)
          return
        }

        // Native: load tokens from Keystore before unblocking the UI.
        ;(async () => {
          try {
            const stored = await getStoredTokens()
            if (stored?.access_token && stored?.refresh_token) {
              useAuthStore.setState({
                access_token:  stored.access_token,
                refresh_token: stored.refresh_token,
              })
            } else if (state?.access_token && state?.refresh_token) {
              // First-run migration: persist old localStorage tokens to Keystore.
              try { saveTokens(state.access_token, state.refresh_token) } catch {}
            }
          } catch {
            // SecureStorage failure — tokens stay null, user sees login page.
          } finally {
            useAuthStore.setState({ _hasHydrated: true })
          }
        })()
      },
    }
  )
)

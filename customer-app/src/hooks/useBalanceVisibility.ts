import { useThemeStore } from '@/store/theme.store'
import { useAuthStore } from '@/store/auth.store'
import { authApi } from '@/api/auth.api'

export function useBalanceVisibility() {
  const hidden          = useThemeStore((s) => s.balanceHidden)
  const setBalanceHidden = useThemeStore((s) => s.setBalanceHidden)
  const user            = useAuthStore((s) => s.user)
  const setUser         = useAuthStore((s) => s.setUser)

  const toggle = () => {
    const next = !hidden
    setBalanceHidden(next)
    if (user) {
      authApi.updatePreferences({ balance_hidden: next })
        .then(() => {
          // Keep the user store in sync so future me() calls start correct
          setUser({ ...user, preferences: { ...user.preferences, balance_hidden: next } })
        })
        .catch(() => { /* keep local state — don't revert the user's choice */ })
    }
  }

  return { hidden, toggle }
}

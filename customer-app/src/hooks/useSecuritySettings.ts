import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Capacitor } from '@capacitor/core'
import { securitySettingsApi } from '@/api/security-settings.api'
import { useAuthStore } from '@/store/auth.store'

const QUERY_KEY = ['security-settings'] as const

/**
 * Returns the user's security settings and a mutation to update them.
 * `biometricPurchaseEnabled` is only ever true on native platforms where
 * biometric login is already enabled — false everywhere else.
 */
export function useSecuritySettings() {
  const qc               = useQueryClient()
  const biometricEnabled = useAuthStore((s) => s.biometric_enabled)
  const isNative         = Capacitor.isNativePlatform()

  const { data, isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn:  securitySettingsApi.get,
    staleTime: 60_000,
    enabled:  isNative && biometricEnabled,
  })

  const mutation = useMutation({
    mutationFn: securitySettingsApi.update,
    onSuccess: (updated) => qc.setQueryData(QUERY_KEY, updated),
  })

  return {
    biometricPurchaseEnabled:
      isNative && biometricEnabled && (data?.biometric_purchase_enabled ?? false),
    isLoading,
    update:     mutation.mutate,
    isUpdating: mutation.isPending,
  }
}

import { useQuery } from '@tanstack/react-query'
import { supportApi } from '@/api/support.api'

export function useSupportConfig() {
  return useQuery({
    queryKey:  ['support-config'],
    queryFn:   supportApi.getConfig,
    staleTime: 5 * 60_000,
    retry:     1,
  })
}

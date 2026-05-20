import { useQuery } from '@tanstack/react-query'
import { servicesApi } from '@/api/services.api'

export function useServices() {
  return useQuery({
    queryKey: ['services'],
    queryFn:  servicesApi.list,
    staleTime: 5 * 60_000,
  })
}

export function useServicePlans(serviceType: string, enabled = true) {
  return useQuery({
    queryKey: ['service-plans', serviceType],
    queryFn:  () => servicesApi.getPlans(serviceType),
    staleTime: 5 * 60_000,
    enabled: enabled && !!serviceType,
  })
}

import { useQuery } from '@tanstack/react-query'
import { serviceStatusApi } from '@/api/service-status.api'

export function useServiceStatus() {
  return useQuery({
    queryKey:             ['service-status'],
    queryFn:              serviceStatusApi.getAll,
    staleTime:            60_000,
    refetchOnWindowFocus: true,
  })
}

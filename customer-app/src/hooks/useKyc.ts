import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { kycApi } from '@/api/kyc.api'

export const KYC_STATUS_KEY = ['kyc-status'] as const

export function useKycStatus() {
  return useQuery({
    queryKey: KYC_STATUS_KEY,
    queryFn:  kycApi.getStatus,
    staleTime: 60_000,
  })
}

export function useSubmitNin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (nin: string) => kycApi.submitNin(nin),
    onSuccess:  () => qc.invalidateQueries({ queryKey: KYC_STATUS_KEY }),
  })
}

export function useSubmitBvn() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (bvn: string) => kycApi.submitBvn(bvn),
    onSuccess:  () => qc.invalidateQueries({ queryKey: KYC_STATUS_KEY }),
  })
}

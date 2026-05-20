import { apiClient } from './client'
import type { KycStatus, KycVerificationRecord, ApiResponse } from '@/types'

export const kycApi = {
  getStatus: (): Promise<KycStatus> =>
    apiClient
      .get<ApiResponse<KycStatus>>('/kyc/status')
      .then((r) => r.data.data),

  submitNin: (nin: string): Promise<KycVerificationRecord> =>
    apiClient
      .post<ApiResponse<KycVerificationRecord>>('/kyc/submit-nin', { nin })
      .then((r) => r.data.data),

  submitBvn: (bvn: string): Promise<KycVerificationRecord> =>
    apiClient
      .post<ApiResponse<KycVerificationRecord>>('/kyc/submit-bvn', { bvn })
      .then((r) => r.data.data),
}

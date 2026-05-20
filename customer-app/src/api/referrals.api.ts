import { apiClient } from './client'
import type { ReferralSummary, ApiResponse } from '@/types'

export const referralsApi = {
  getMyReferrals: (): Promise<ReferralSummary> =>
    apiClient
      .get<ApiResponse<ReferralSummary>>('/referrals/me')
      .then((r) => r.data.data),
}

import { apiClient } from './client'
import type { ReferralSummary, ApiResponse } from '@/types'

export interface PublicReferralSettings {
  is_enabled:            boolean
  reward_type:           'fixed' | 'percentage'
  reward_value:          number
  reward_recipient:      'referrer' | 'both'
  referred_reward_value: number | null
  reward_trigger:        'signup' | 'first_funding' | 'first_purchase'
}

export const referralsApi = {
  getMyReferrals: (): Promise<ReferralSummary> =>
    apiClient
      .get<ApiResponse<ReferralSummary>>('/referrals/me')
      .then((r) => r.data.data),

  getPublicSettings: (): Promise<PublicReferralSettings> =>
    apiClient
      .get<ApiResponse<PublicReferralSettings>>('/referrals/public-settings')
      .then((r) => r.data.data),
}

import { apiClient } from './client'
import type { ReferralSettings, ReferralReward, ReferralSummary } from '@/types'

export const referralApi = {
  getSettings: (): Promise<ReferralSettings | null> =>
    apiClient
      .get<{ success: boolean; data: ReferralSettings | null }>('/admin/referrals/settings')
      .then((r) => r.data.data),

  updateSettings: (body: Partial<ReferralSettings>): Promise<ReferralSettings> =>
    apiClient
      .patch<{ success: boolean; data: ReferralSettings }>('/admin/referrals/settings', body)
      .then((r) => r.data.data),

  getSummary: (): Promise<ReferralSummary> =>
    apiClient
      .get<{ success: boolean; data: ReferralSummary }>('/admin/referrals/summary')
      .then((r) => r.data.data),

  listRewards: (params?: {
    page?: number
    limit?: number
    status?: string
  }): Promise<{ data: ReferralReward[]; total: number; page: number; limit: number }> =>
    apiClient
      .get<{ success: boolean; data: ReferralReward[]; total: number; page: number; limit: number }>(
        '/admin/referrals/rewards',
        { params }
      )
      .then((r) => ({ data: r.data.data, total: r.data.total, page: r.data.page, limit: r.data.limit })),
}

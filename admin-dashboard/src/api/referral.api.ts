import { apiClient } from './client'
import type { ReferralSettings, ReferralReward, ReferralSummary } from '@/types'

const NUM_FIELDS = [
  'reward_value',
  'min_amount',
  'max_reward_cap',
  'referred_reward_value',
  'required_referral_count',
] as const

function sanitizeReferralPayload(body: Partial<ReferralSettings>): Partial<ReferralSettings> {
  const out: Partial<ReferralSettings> = { ...body }
  for (const key of NUM_FIELDS) {
    const v = body[key]
    if (v === null || v === undefined || v === ('' as unknown)) {
      (out as Record<string, unknown>)[key] = null
    } else {
      const n = Number(v)
      ;(out as Record<string, unknown>)[key] = isNaN(n) ? null : n
    }
  }
  return out
}

export const referralApi = {
  getSettings: (): Promise<ReferralSettings | null> =>
    apiClient
      .get<{ success: boolean; data: ReferralSettings | null }>('/admin/referrals/settings')
      .then((r) => r.data.data),

  updateSettings: (body: Partial<ReferralSettings>): Promise<ReferralSettings> => {
    const payload = sanitizeReferralPayload(body)
    console.log('[REFERRAL-API-PAYLOAD]', payload)
    return apiClient
      .patch<{ success: boolean; data: ReferralSettings }>('/admin/referrals/settings', payload)
      .then((r) => r.data.data)
  },

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

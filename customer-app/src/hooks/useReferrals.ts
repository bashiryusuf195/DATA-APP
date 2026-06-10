import { useQuery } from '@tanstack/react-query'
import { referralsApi, type PublicReferralSettings } from '@/api/referrals.api'

const FALLBACK: PublicReferralSettings = {
  is_enabled:            true,
  reward_type:           'fixed',
  reward_value:          200,
  reward_recipient:      'referrer',
  referred_reward_value: null,
  reward_trigger:        'signup',
}

export function useReferralSettings() {
  return useQuery<PublicReferralSettings>({
    queryKey: ['referral-public-settings'],
    queryFn: async () => {
      try {
        return await referralsApi.getPublicSettings()
      } catch {
        return FALLBACK
      }
    },
    staleTime: 10 * 60 * 1000,
  })
}

import { apiClient } from './client'

export interface OnboardingSlide {
  title: string
  description: string
  icon: string
  gradient: [string, string]
}

export interface LandingFeature {
  icon: string
  title: string
  description: string
}

export interface HowItWorksStep {
  step: number
  title: string
  description: string
}

export interface LandingContent {
  app_name: string
  hero_title: string
  hero_subtitle: string
  hero_cta_primary: string
  hero_cta_secondary: string
  features: LandingFeature[]
  how_it_works: HowItWorksStep[]
}

export interface SupportContact {
  type: 'whatsapp' | 'email' | 'phone'
  label: string
  value: string
  href: string
}

export interface SupportFaq {
  q: string
  a: string
}

export interface SupportContent {
  hero_subtitle: string
  contacts: SupportContact[]
  faqs: SupportFaq[]
}

export interface AppContent {
  landing: LandingContent | null
  onboarding: OnboardingSlide[]
  support: SupportContent | null
}

// Returned whenever the /public/content endpoint is unavailable (404, network
// error, etc.).  Individual pages supply their own UI-level defaults on top of
// this so the app always renders correctly.
export const DEFAULT_APP_CONTENT: AppContent = {
  landing:    null,
  onboarding: [],
  support:    null,
}

export interface SitePage {
  slug:         string
  title:        string
  content:      string
  is_published: boolean
  version:      number
  updated_at:   string
}

export const contentApi = {
  // Never throws — returns DEFAULT_APP_CONTENT on any error so pages always
  // receive a value from React Query and can fall back to their local defaults.
  getAppContent: async (): Promise<AppContent> => {
    try {
      const res = await apiClient.get<AppContent>('/public/content')
      return res.data ?? DEFAULT_APP_CONTENT
    } catch {
      return DEFAULT_APP_CONTENT
    }
  },

  // Returns null on any error so legal pages can fall back to hardcoded content.
  getSitePage: async (slug: string): Promise<SitePage | null> => {
    try {
      const res = await apiClient.get<{ success: boolean; data: SitePage }>(`/content/${slug}`)
      return res.data?.data ?? null
    } catch {
      return null
    }
  },
}

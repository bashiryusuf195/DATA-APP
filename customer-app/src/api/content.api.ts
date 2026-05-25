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

export const contentApi = {
  getAppContent: (): Promise<AppContent> =>
    apiClient.get('/public/content').then((r) => r.data),
}

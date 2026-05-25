import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Phone, Wifi, Zap, Tv, Shield, Wallet, ArrowRight,
} from 'lucide-react'
import { contentApi, type OnboardingSlide } from '@/api/content.api'
import { cn } from '@/utils/cn'

const ONBOARDING_KEY = 'smshikasub_onboarded'

const ICON_MAP: Record<string, React.FC<{ className?: string }>> = {
  Phone, Wifi, Zap, Tv, Shield, Wallet,
}

const DEFAULTS: OnboardingSlide[] = [
  {
    title: 'All Your VTU Services',
    description:
      'Manage your wallet, track transactions and enjoy reliable VTU services for data, airtime, cable and electricity all in one app.',
    icon: 'Wallet',
    gradient: ['#3535D9', '#6366F1'],
  },
  {
    title: 'Pay Cable & Electricity Bills',
    description:
      'Renew your DSTV, GOTV, Startimes and pay electricity bills in a few taps, with fast and secure payments.',
    icon: 'Zap',
    gradient: ['#7C3AED', '#A78BFA'],
  },
  {
    title: 'Buy Data & Airtime',
    description:
      'Top up your data and airtime instantly on all major networks at the best rates, anytime, anywhere.',
    icon: 'Wifi',
    gradient: ['#059669', '#34D399'],
  },
]

function SlideIcon({ slide }: { slide: OnboardingSlide }) {
  const Icon = ICON_MAP[slide.icon] ?? Wallet
  const [from, to] = slide.gradient
  return (
    <div className="flex items-center justify-center flex-1 relative">
      {/* Concentric decorative circles */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="rounded-full border border-white/5" style={{ width: 320, height: 320 }} />
      </div>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="rounded-full border border-white/5" style={{ width: 240, height: 240 }} />
      </div>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="rounded-full border border-white/5" style={{ width: 160, height: 160 }} />
      </div>

      {/* Hero icon */}
      <div
        className="relative z-10 h-36 w-36 rounded-[2.5rem] flex items-center justify-center shadow-2xl"
        style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}
      >
        <Icon className="h-20 w-20 text-white" />
      </div>

      {/* Floating accent dots */}
      <div className="absolute top-1/4 left-1/4 h-2.5 w-2.5 rounded-full bg-pink-400/70" />
      <div className="absolute top-1/3 right-1/4 h-4 w-4 rounded-full bg-yellow-400/50" />
      <div className="absolute bottom-1/3 left-1/3 h-3 w-3 rounded-full bg-white/30" />
      <div className="absolute bottom-1/4 right-1/3 h-2 w-2 rounded-full bg-blue-400/60" />
    </div>
  )
}

export function OnboardingPage() {
  const navigate   = useNavigate()
  const [index, setIndex] = useState(0)

  const { data: content } = useQuery({
    queryKey: ['app-content'],
    queryFn:  contentApi.getAppContent,
    staleTime: 0,
    retry: false,
  })

  const slides: OnboardingSlide[] = content?.onboarding?.length
    ? content.onboarding
    : DEFAULTS

  const current = slides[index]

  useEffect(() => {
    if (localStorage.getItem(ONBOARDING_KEY)) {
      navigate('/login', { replace: true })
    }
  }, [navigate])

  const finish = () => {
    localStorage.setItem(ONBOARDING_KEY, '1')
    navigate('/login', { replace: true })
  }

  const next = () => {
    if (index < slides.length - 1) {
      setIndex((i) => i + 1)
    } else {
      finish()
    }
  }

  if (!current) return null

  return (
    <div className="fixed inset-0 bg-[#0A0D14] flex flex-col overflow-hidden">
      {/* Skip */}
      <div className="flex justify-end pt-safe px-6 pt-4">
        <button
          onClick={finish}
          className="flex items-center gap-1 text-sm font-semibold text-white/60 hover:text-white transition-colors px-3 py-1.5 rounded-xl hover:bg-white/10"
        >
          Skip
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Illustration */}
      <SlideIcon slide={current} />

      {/* Bottom content */}
      <div className="px-8 pb-safe flex flex-col items-center gap-6 pb-12">
        {/* Text */}
        <div className="text-center">
          <h1 className="text-3xl font-black text-white leading-tight mb-3">
            {current.title}
          </h1>
          <p className="text-base text-white/50 leading-relaxed max-w-xs">
            {current.description}
          </p>
        </div>

        {/* Progress dots */}
        <div className="flex items-center gap-2">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => setIndex(i)}
              className={cn(
                'rounded-full transition-all duration-300',
                i === index
                  ? 'h-2.5 w-8 bg-[#A3E635]'
                  : 'h-2.5 w-2.5 bg-white/20 hover:bg-white/40'
              )}
            />
          ))}
        </div>

        {/* Next / arrow button */}
        <button
          onClick={next}
          className="relative h-16 w-16 rounded-full border-2 border-white/20 flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
        >
          <div className="h-12 w-12 rounded-full bg-[#A3E635] flex items-center justify-center shadow-lg">
            <ArrowRight className="h-5 w-5 text-black font-bold" />
          </div>
        </button>
      </div>
    </div>
  )
}

export { ONBOARDING_KEY }

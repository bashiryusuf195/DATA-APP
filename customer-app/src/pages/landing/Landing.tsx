import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Phone, Wifi, Zap, Tv, Shield, Wallet,
  ArrowRight, CheckCircle, Sun, Moon, Menu, X,
} from 'lucide-react'
import { useState } from 'react'
import { useAuthStore } from '@/store/auth.store'
import { useThemeStore } from '@/store/theme.store'
import { contentApi, type LandingContent, type LandingFeature, type HowItWorksStep } from '@/api/content.api'
import { cn } from '@/utils/cn'

const ICON_MAP: Record<string, React.FC<{ className?: string }>> = {
  Phone, Wifi, Zap, Tv, Shield, Wallet,
}

const FEATURE_COLORS = [
  { bg: 'bg-emerald-50 dark:bg-emerald-500/10', text: 'text-emerald-600 dark:text-emerald-400', border: 'border-emerald-200 dark:border-emerald-500/20' },
  { bg: 'bg-blue-50   dark:bg-blue-500/10',    text: 'text-blue-600   dark:text-blue-400',    border: 'border-blue-200   dark:border-blue-500/20'    },
  { bg: 'bg-amber-50  dark:bg-amber-500/10',   text: 'text-amber-600  dark:text-amber-400',   border: 'border-amber-200  dark:border-amber-500/20'   },
  { bg: 'bg-purple-50 dark:bg-purple-500/10',  text: 'text-purple-600 dark:text-purple-400',  border: 'border-purple-200 dark:border-purple-500/20'  },
  { bg: 'bg-rose-50   dark:bg-rose-500/10',    text: 'text-rose-600   dark:text-rose-400',    border: 'border-rose-200   dark:border-rose-500/20'    },
  { bg: 'bg-brand-50  dark:bg-brand-500/10',   text: 'text-brand-600  dark:text-brand-400',   border: 'border-brand-200  dark:border-brand-500/20'   },
]

const DEFAULT_CONTENT: LandingContent = {
  app_name: 'Hive Data',
  hero_title: 'All Your VTU Services in One Place',
  hero_subtitle:
    'Top up airtime, buy data, pay electricity and cable TV bills instantly. Fast, secure, and always available.',
  hero_cta_primary: 'Get Started Free',
  hero_cta_secondary: 'Login',
  features: [
    { icon: 'Phone',  title: 'Airtime Top-up',   description: 'Instant airtime for MTN, Airtel, Glo and 9mobile at the best rates.' },
    { icon: 'Wifi',   title: 'Data Bundles',      description: 'Affordable data plans for all networks — daily, weekly or monthly.' },
    { icon: 'Zap',    title: 'Electricity Bills', description: 'Pay all DISCOs with a meter token delivered in seconds.' },
    { icon: 'Tv',     title: 'Cable TV',          description: 'Renew DSTV, GOTV and Startimes without leaving the app.' },
    { icon: 'Shield', title: 'Exam PINs',         description: 'Scratch cards for WAEC, NECO, JAMB and other examinations.' },
    { icon: 'Wallet', title: 'Secure Wallet',     description: 'Fund once and transact anywhere, anytime, instantly.' },
  ],
  how_it_works: [
    { step: 1, title: 'Create an account',  description: 'Sign up in under 2 minutes with just your email address.' },
    { step: 2, title: 'Fund your wallet',   description: 'Transfer to your dedicated bank account or pay with a card.' },
    { step: 3, title: 'Enjoy services',     description: 'Purchase any VTU service instantly at competitive rates.' },
  ],
}

function FeatureCard({ feature, index }: { feature: LandingFeature; index: number }) {
  const Icon  = ICON_MAP[feature.icon] ?? Wallet
  const color = FEATURE_COLORS[index % FEATURE_COLORS.length]
  return (
    <div className={cn(
      'rounded-2xl border p-6 transition-colors',
      'bg-white dark:bg-white/[0.03] hover:bg-gray-50 dark:hover:bg-white/[0.06]',
      color.border,
    )}>
      <div className={cn('h-12 w-12 rounded-xl flex items-center justify-center mb-4', color.bg)}>
        <Icon className={cn('h-6 w-6', color.text)} />
      </div>
      <h3 className="text-base font-bold text-gray-900 dark:text-white mb-2">{feature.title}</h3>
      <p className="text-sm text-gray-500 dark:text-white/50 leading-relaxed">{feature.description}</p>
    </div>
  )
}

function StepCard({ step }: { step: HowItWorksStep }) {
  return (
    <div className="flex gap-4 items-start">
      <div className="h-10 w-10 rounded-full bg-brand-600 flex items-center justify-center shrink-0 shadow-brand">
        <span className="text-sm font-black text-white">{step.step}</span>
      </div>
      <div>
        <p className="font-bold text-gray-900 dark:text-white mb-1">{step.title}</p>
        <p className="text-sm text-gray-500 dark:text-white/50 leading-relaxed">{step.description}</p>
      </div>
    </div>
  )
}

export function LandingPage() {
  const navigate = useNavigate()
  const token    = useAuthStore((s) => s.access_token)
  const { dark, toggle: toggleDark } = useThemeStore()
  const [menuOpen, setMenuOpen] = useState(false)

  const { data: content } = useQuery({
    queryKey: ['app-content'],
    queryFn:  contentApi.getAppContent,
    staleTime: 0,
    retry:    false,
  })

  const c: LandingContent = content?.landing ?? DEFAULT_CONTENT
  const appName = c.app_name

  if (token) {
    navigate('/dashboard', { replace: true })
    return null
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#070B12] text-gray-900 dark:text-white font-sans transition-colors duration-200">

      {/* ── Navbar ─────────────────────────────────────────────────────────── */}
      <nav className="fixed top-0 inset-x-0 z-50 border-b border-gray-200 dark:border-white/5 bg-white/90 dark:bg-[#070B12]/90 backdrop-blur-md transition-colors duration-200">
        <div className="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-brand-600 flex items-center justify-center shadow-brand">
              <Zap className="h-5 w-5 text-white" />
            </div>
            <span className="text-base font-black tracking-tight text-gray-900 dark:text-white">{appName}</span>
          </Link>

          {/* Desktop nav links */}
          <div className="hidden md:flex items-center gap-6">
            <a href="#features"     className="text-sm text-gray-500 dark:text-white/60 hover:text-gray-900 dark:hover:text-white transition-colors">Features</a>
            <a href="#how-it-works" className="text-sm text-gray-500 dark:text-white/60 hover:text-gray-900 dark:hover:text-white transition-colors">How it works</a>
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-3">
            <button
              onClick={toggleDark}
              className="p-2 rounded-xl text-gray-400 dark:text-white/50 hover:text-gray-700 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
              aria-label="Toggle theme"
            >
              {dark ? <Sun className="h-4.5 w-4.5" /> : <Moon className="h-4.5 w-4.5" />}
            </button>
            <Link
              to="/login"
              className="hidden md:block text-sm font-semibold text-gray-600 dark:text-white/70 hover:text-gray-900 dark:hover:text-white px-4 py-2 rounded-xl hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
            >
              {c.hero_cta_secondary}
            </Link>
            <Link
              to="/register"
              className="hidden md:flex items-center gap-1.5 text-sm font-semibold bg-brand-600 hover:bg-brand-500 text-white px-4 py-2 rounded-xl transition-colors shadow-brand"
            >
              {c.hero_cta_primary}
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="md:hidden p-2 rounded-xl text-gray-400 dark:text-white/50 hover:text-gray-700 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
            >
              {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Mobile dropdown */}
        {menuOpen && (
          <div className="md:hidden border-t border-gray-200 dark:border-white/5 bg-white dark:bg-[#0D1117] px-5 py-4 flex flex-col gap-3">
            <a href="#features"     onClick={() => setMenuOpen(false)} className="text-sm text-gray-600 dark:text-white/70 py-2">Features</a>
            <a href="#how-it-works" onClick={() => setMenuOpen(false)} className="text-sm text-gray-600 dark:text-white/70 py-2">How it works</a>
            <div className="flex gap-3 pt-2">
              <Link to="/login"    className="flex-1 text-center py-2.5 rounded-xl border border-gray-300 dark:border-white/20 text-sm font-semibold text-gray-800 dark:text-white">
                {c.hero_cta_secondary}
              </Link>
              <Link to="/register" className="flex-1 text-center py-2.5 rounded-xl bg-brand-600 text-sm font-semibold text-white">
                {c.hero_cta_primary}
              </Link>
            </div>
          </div>
        )}
      </nav>

      {/* ── Hero ─────────────────────────────────────────────────────────────── */}
      <section className="pt-32 pb-24 px-5 text-center relative overflow-hidden">
        <div className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 h-[500px] w-[700px] rounded-full bg-brand-600/10 blur-[120px]" />

        <div className="relative max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 bg-brand-600/10 border border-brand-500/30 text-brand-600 dark:text-brand-400 text-xs font-semibold px-4 py-2 rounded-full mb-6">
            <CheckCircle className="h-3.5 w-3.5" />
            Fast · Secure · Reliable
          </div>

          <h1 className="text-4xl md:text-6xl font-black leading-[1.1] tracking-tight text-gray-900 dark:text-white mb-6">
            {c.hero_title}
          </h1>
          <p className="text-lg text-gray-500 dark:text-white/50 max-w-xl mx-auto leading-relaxed mb-10">
            {c.hero_subtitle}
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              to="/register"
              className="flex items-center gap-2 bg-brand-600 hover:bg-brand-500 text-white font-bold px-8 py-4 rounded-2xl text-base shadow-brand transition-colors"
            >
              {c.hero_cta_primary}
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/login"
              className="flex items-center gap-2 border border-gray-300 dark:border-white/20 hover:border-gray-400 dark:hover:border-white/40 text-gray-800 dark:text-white font-semibold px-8 py-4 rounded-2xl text-base transition-colors"
            >
              {c.hero_cta_secondary}
            </Link>
          </div>
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────────────────────── */}
      <section id="features" className="py-20 px-5 max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-2xl md:text-4xl font-black text-gray-900 dark:text-white mb-3">Everything you need</h2>
          <p className="text-gray-400 dark:text-white/40 max-w-md mx-auto">
            One wallet. All the services you need, day or night.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {c.features.map((f, i) => <FeatureCard key={i} feature={f} index={i} />)}
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────────────────── */}
      <section id="how-it-works" className="py-20 px-5 relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-brand-600/5 to-transparent" />
        <div className="max-w-2xl mx-auto relative">
          <div className="text-center mb-12">
            <h2 className="text-2xl md:text-4xl font-black text-gray-900 dark:text-white mb-3">Get started in minutes</h2>
            <p className="text-gray-400 dark:text-white/40">Three simple steps to access all services.</p>
          </div>
          <div className="flex flex-col gap-8">
            {c.how_it_works.map((s) => <StepCard key={s.step} step={s} />)}
          </div>
        </div>
      </section>

      {/* ── CTA banner ──────────────────────────────────────────────────────── */}
      <section className="py-20 px-5">
        <div className="max-w-2xl mx-auto text-center bg-gradient-to-br from-brand-600/10 dark:from-brand-600/20 to-purple-600/5 dark:to-purple-600/10 border border-brand-200 dark:border-brand-500/20 rounded-3xl p-12">
          <h2 className="text-2xl md:text-4xl font-black text-gray-900 dark:text-white mb-4">Ready to get started?</h2>
          <p className="text-gray-500 dark:text-white/50 mb-8 leading-relaxed">
            Join thousands of Nigerians enjoying fast and affordable VTU services every day.
          </p>
          <Link
            to="/register"
            className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-500 text-white font-bold px-10 py-4 rounded-2xl text-base shadow-brand transition-colors"
          >
            Create free account
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <footer className="border-t border-gray-200 dark:border-white/5 py-10 px-5">
        <div className="max-w-6xl mx-auto flex flex-col items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-brand-600 flex items-center justify-center">
              <Zap className="h-4 w-4 text-white" />
            </div>
            <span className="font-black text-sm text-gray-900 dark:text-white">{appName}</span>
          </div>
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-2">
            <Link to="/about"           className="text-xs text-gray-400 dark:text-white/40 hover:text-gray-700 dark:hover:text-white transition-colors">About</Link>
            <Link to="/contact"         className="text-xs text-gray-400 dark:text-white/40 hover:text-gray-700 dark:hover:text-white transition-colors">Contact</Link>
            <Link to="/privacy-policy"  className="text-xs text-gray-400 dark:text-white/40 hover:text-gray-700 dark:hover:text-white transition-colors">Privacy Policy</Link>
            <Link to="/terms-of-service" className="text-xs text-gray-400 dark:text-white/40 hover:text-gray-700 dark:hover:text-white transition-colors">Terms of Service</Link>
            <Link to="/refund-policy"   className="text-xs text-gray-400 dark:text-white/40 hover:text-gray-700 dark:hover:text-white transition-colors">Refund Policy</Link>
            <span className="text-gray-200 dark:text-white/10 select-none">|</span>
            <Link to="/login"    className="text-xs text-gray-400 dark:text-white/40 hover:text-gray-700 dark:hover:text-white transition-colors">Login</Link>
            <Link to="/register" className="text-xs text-gray-400 dark:text-white/40 hover:text-gray-700 dark:hover:text-white transition-colors">Sign up</Link>
          </div>
          <p className="text-xs text-gray-400 dark:text-white/30">
            &copy; {new Date().getFullYear()} {appName}. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  )
}

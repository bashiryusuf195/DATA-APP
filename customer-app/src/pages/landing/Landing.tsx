import { Link, Navigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Phone, Wifi, Zap, Tv, Shield, Wallet,
  ArrowRight, CheckCircle, Sun, Moon, Menu, X,
  Clock, Lock, UserCheck, CreditCard, ShoppingBag,
  Bell, Headphones, Activity,
} from 'lucide-react'
import { useState } from 'react'
import { useAuthStore } from '@/store/auth.store'
import { useThemeStore } from '@/store/theme.store'
import { contentApi, type LandingContent, type LandingFeature, type HowItWorksStep } from '@/api/content.api'
import { cn } from '@/utils/cn'

// ── Icon registry (used by CMS-driven feature cards) ─────────────────────────

const ICON_MAP: Record<string, React.FC<{ className?: string }>> = {
  Phone, Wifi, Zap, Tv, Shield, Wallet, UserCheck,
}

// ── Static data ───────────────────────────────────────────────────────────────

const TRUST_BADGES = [
  { icon: Lock,        label: 'Secure wallet' },
  { icon: Zap,         label: 'Instant delivery' },
  { icon: Clock,       label: '24/7 access' },
]

const TRUST_FEATURES = [
  {
    icon: Wallet,
    title: 'Secure wallet',
    description: 'Your funds are protected with bank-grade encryption and two-factor authentication.',
  },
  {
    icon: Clock,
    title: 'Full transaction history',
    description: 'Every purchase is logged, searchable, and downloadable as a PDF receipt.',
  },
  {
    icon: Bell,
    title: 'Real-time notifications',
    description: 'Instant push alerts for every payment, top-up, and account activity.',
  },
  {
    icon: Headphones,
    title: '24/7 customer support',
    description: 'Our team is always available to help you resolve any issue quickly.',
  },
  {
    icon: Activity,
    title: 'Service uptime monitoring',
    description: 'We continuously monitor all service providers to guarantee reliability.',
  },
]

const SERVICE_COLORS = [
  { bg: 'bg-emerald-500/10 dark:bg-emerald-500/12', icon: 'text-emerald-600 dark:text-emerald-400', border: 'border-emerald-200 dark:border-emerald-500/20', glow: 'group-hover:shadow-[0_8px_28px_rgba(16,185,129,0.15)] dark:group-hover:shadow-[0_8px_28px_rgba(16,185,129,0.12)]' },
  { bg: 'bg-blue-500/10 dark:bg-blue-500/12',       icon: 'text-blue-600 dark:text-blue-400',       border: 'border-blue-200 dark:border-blue-500/20',       glow: 'group-hover:shadow-[0_8px_28px_rgba(59,130,246,0.15)] dark:group-hover:shadow-[0_8px_28px_rgba(59,130,246,0.12)]' },
  { bg: 'bg-amber-500/10 dark:bg-amber-500/12',     icon: 'text-amber-600 dark:text-amber-400',     border: 'border-amber-200 dark:border-amber-500/20',     glow: 'group-hover:shadow-[0_8px_28px_rgba(245,158,11,0.15)] dark:group-hover:shadow-[0_8px_28px_rgba(245,158,11,0.12)]' },
  { bg: 'bg-purple-500/10 dark:bg-purple-500/12',   icon: 'text-purple-600 dark:text-purple-400',   border: 'border-purple-200 dark:border-purple-500/20',   glow: 'group-hover:shadow-[0_8px_28px_rgba(168,85,247,0.15)] dark:group-hover:shadow-[0_8px_28px_rgba(168,85,247,0.12)]' },
  { bg: 'bg-rose-500/10 dark:bg-rose-500/12',       icon: 'text-rose-600 dark:text-rose-400',       border: 'border-rose-200 dark:border-rose-500/20',       glow: 'group-hover:shadow-[0_8px_28px_rgba(244,63,94,0.15)] dark:group-hover:shadow-[0_8px_28px_rgba(244,63,94,0.12)]' },
  { bg: 'bg-brand-500/10 dark:bg-brand-500/12',     icon: 'text-brand-600 dark:text-brand-400',     border: 'border-brand-200 dark:border-brand-500/20',     glow: 'group-hover:shadow-[0_8px_28px_rgba(53,53,217,0.15)] dark:group-hover:shadow-[0_8px_28px_rgba(53,53,217,0.12)]' },
  { bg: 'bg-teal-500/10 dark:bg-teal-500/12',       icon: 'text-teal-600 dark:text-teal-400',       border: 'border-teal-200 dark:border-teal-500/20',       glow: 'group-hover:shadow-[0_8px_28px_rgba(20,184,166,0.15)] dark:group-hover:shadow-[0_8px_28px_rgba(20,184,166,0.12)]' },
]

const STATS = [
  { value: '10K+',   label: 'Active Users' },
  { value: '₦500M+', label: 'Processed' },
  { value: '7',      label: 'Services' },
  { value: '99.9%',  label: 'Uptime' },
]

const STEP_META = [
  { icon: UserCheck,   bg: 'bg-brand-600/10 dark:bg-brand-600/15',     color: 'text-brand-600 dark:text-brand-400'   },
  { icon: CreditCard,  bg: 'bg-emerald-500/10 dark:bg-emerald-500/15', color: 'text-emerald-600 dark:text-emerald-400' },
  { icon: ShoppingBag, bg: 'bg-purple-500/10 dark:bg-purple-500/15',   color: 'text-purple-600 dark:text-purple-400' },
]

const DEFAULT_CONTENT: LandingContent = {
  app_name: 'Hive Data',
  hero_title: 'Fast VTU Payments, Built for Everyday Nigerians',
  hero_subtitle:
    'Buy airtime, data, electricity, cable TV, exam PINs, and verify your identity — all from one secure wallet. Instant delivery, guaranteed.',
  hero_cta_primary: 'Create Free Account',
  hero_cta_secondary: 'Sign In',
  features: [
    { icon: 'Phone',     title: 'Airtime Top-up',          description: 'Instant airtime for MTN, Airtel, Glo and 9mobile at the best rates.' },
    { icon: 'Wifi',      title: 'Data Bundles',             description: 'Affordable data plans for all networks — daily, weekly or monthly.' },
    { icon: 'Zap',       title: 'Electricity Bills',        description: 'Pay all DISCOs with a meter token delivered in seconds.' },
    { icon: 'Tv',        title: 'Cable TV',                 description: 'Renew DSTV, GOTV and Startimes without leaving the app.' },
    { icon: 'Shield',    title: 'Exam PINs',                description: 'Scratch cards for WAEC, NECO, JAMB and other examinations.' },
    { icon: 'Wallet',    title: 'Secure Wallet',            description: 'Fund once and transact anywhere, anytime, instantly.' },
    { icon: 'UserCheck', title: 'Identity Verification',    description: 'Verify your BVN and NIN to unlock higher wallet limits and benefits.' },
  ],
  how_it_works: [
    { step: 1, title: 'Create an account',  description: 'Sign up in under 2 minutes with just your email address.' },
    { step: 2, title: 'Fund your wallet',   description: 'Transfer to your dedicated bank account or pay with a card.' },
    { step: 3, title: 'Buy services',       description: 'Purchase any VTU service instantly at competitive rates.' },
  ],
}

// ── App phone mockup ──────────────────────────────────────────────────────────

function AppMockup() {
  const MOCK_SERVICES = [
    { icon: Phone,  label: 'Airtime', color: 'bg-emerald-500/20 text-emerald-400' },
    { icon: Wifi,   label: 'Data',    color: 'bg-blue-500/20 text-blue-400'       },
    { icon: Zap,    label: 'Elec.',   color: 'bg-amber-500/20 text-amber-400'     },
    { icon: Tv,     label: 'Cable',   color: 'bg-purple-500/20 text-purple-400'   },
  ]
  const MOCK_TXN = [
    { icon: Phone, label: 'Airtime Top-up',   sub: 'MTN · Just now',  amount: '-₦500',   color: 'bg-emerald-500/20 text-emerald-400' },
    { icon: Wifi,  label: '10GB Data Bundle', sub: 'Airtel · 2m ago', amount: '-₦3,500', color: 'bg-blue-500/20 text-blue-400'       },
  ]

  return (
    <div className="relative mx-auto w-[270px]">
      {/* Ambient glow */}
      <div className="pointer-events-none absolute -inset-10 rounded-full bg-brand-600/20 dark:bg-brand-600/35 blur-3xl" />

      {/* Phone shell */}
      <div className="relative rounded-[2.8rem] bg-gray-900/90 p-[10px] shadow-[0_40px_80px_-10px_rgba(0,0,0,0.55)] ring-1 ring-white/10">
        {/* Side buttons */}
        <div className="absolute -right-[3px] top-20 h-8 w-[3px] rounded-full bg-gray-700" />
        <div className="absolute -left-[3px] top-16 h-6 w-[3px] rounded-full bg-gray-700" />
        <div className="absolute -left-[3px] top-24 h-10 w-[3px] rounded-full bg-gray-700" />

        {/* Screen */}
        <div className="rounded-[2.3rem] overflow-hidden bg-[#0A0D14]">
          {/* Notch */}
          <div className="relative flex justify-center pt-3 pb-1 bg-[#0A0D14]">
            <div className="h-[22px] w-[90px] rounded-full bg-[#0A0D14] border border-white/5 flex items-center justify-center gap-1.5">
              <div className="h-1.5 w-1.5 rounded-full bg-gray-600" />
              <div className="h-2 w-2 rounded-full bg-gray-700" />
            </div>
          </div>

          {/* Status row */}
          <div className="flex justify-between items-center px-5 py-1">
            <span className="text-[10px] text-white/50 font-medium tabular-nums">9:41</span>
            <div className="flex items-center gap-1">
              {[2, 3, 4, 5].map((h) => (
                <div key={h} className={cn('w-[3px] rounded-sm bg-white/50', h === 2 ? 'h-[6px]' : h === 3 ? 'h-[8px]' : h === 4 ? 'h-[10px]' : 'h-[12px]')} />
              ))}
              <div className="ml-1 h-3 w-5 rounded-sm border border-white/40 flex items-center px-0.5">
                <div className="h-1.5 w-3 rounded-sm bg-white/70" />
              </div>
            </div>
          </div>

          {/* Greeting */}
          <div className="px-5 pt-2 pb-3">
            <p className="text-[10px] text-white/40 mb-0.5">Good morning 👋</p>
            <p className="text-sm font-bold text-white">Welcome back</p>
          </div>

          {/* Wallet balance card */}
          <div className="mx-4 rounded-2xl p-4 bg-gradient-to-br from-brand-700 via-brand-600 to-purple-700 shadow-brand relative overflow-hidden">
            <div className="pointer-events-none absolute -right-4 -top-4 h-20 w-20 rounded-full bg-white/5" />
            <div className="pointer-events-none absolute -right-1 -bottom-5 h-16 w-16 rounded-full bg-white/5" />
            <p className="text-[9px] text-white/60 uppercase tracking-widest mb-1">Wallet Balance</p>
            <p className="text-[22px] font-black text-white leading-none mb-3">
              ₦24,500<span className="text-sm font-normal opacity-70">.00</span>
            </p>
            <div className="flex gap-2">
              <div className="flex-1 bg-white/15 rounded-xl py-1.5 text-center">
                <p className="text-[10px] text-white font-bold">+ Fund</p>
              </div>
              <div className="flex-1 bg-white/15 rounded-xl py-1.5 text-center">
                <p className="text-[10px] text-white font-bold">History</p>
              </div>
            </div>
          </div>

          {/* Quick services */}
          <div className="px-4 pt-4 pb-2">
            <p className="text-[9px] text-white/35 uppercase tracking-widest mb-3">Quick Services</p>
            <div className="grid grid-cols-4 gap-2">
              {MOCK_SERVICES.map(({ icon: Icon, label, color }) => (
                <div key={label} className="flex flex-col items-center gap-1.5">
                  <div className={cn('h-10 w-10 rounded-xl flex items-center justify-center', color)}>
                    <Icon className="h-[18px] w-[18px]" />
                  </div>
                  <span className="text-[9px] text-white/50">{label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="mx-4 my-3 h-px bg-white/5" />

          {/* Recent transactions */}
          <div className="px-4 pb-5">
            <p className="text-[9px] text-white/35 uppercase tracking-widest mb-2">Recent</p>
            <div className="space-y-2">
              {MOCK_TXN.map(({ icon: Icon, label, sub, amount, color }) => (
                <div key={label} className="flex items-center gap-2.5 bg-white/[0.04] rounded-xl p-2.5">
                  <div className={cn('h-8 w-8 rounded-lg flex items-center justify-center shrink-0', color)}>
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-semibold text-white truncate">{label}</p>
                    <p className="text-[9px] text-white/35">{sub}</p>
                  </div>
                  <p className="text-[10px] font-bold text-red-400 shrink-0">{amount}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Floating card — top right */}
      <div className="absolute -top-3 -right-8 flex items-center gap-2 bg-white dark:bg-[#1C2230] border border-gray-100 dark:border-white/10 rounded-2xl px-3 py-2 shadow-[0_8px_24px_rgba(0,0,0,0.18)]">
        <div className="h-7 w-7 rounded-full bg-emerald-500/15 flex items-center justify-center shrink-0">
          <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
        </div>
        <div>
          <p className="text-[10px] font-bold text-gray-900 dark:text-white whitespace-nowrap">₦5,000 Added!</p>
          <p className="text-[9px] text-gray-400 dark:text-white/40">Instant · Just now</p>
        </div>
      </div>

      {/* Notification badge on card */}
      <div className="absolute top-12 right-0 h-5 w-5 rounded-full bg-red-500 flex items-center justify-center shadow-lg">
        <span className="text-[9px] text-white font-black">3</span>
      </div>

      {/* Floating card — bottom left */}
      <div className="absolute -bottom-3 -left-8 flex items-center gap-2 bg-white dark:bg-[#1C2230] border border-gray-100 dark:border-white/10 rounded-2xl px-3 py-2 shadow-[0_8px_24px_rgba(0,0,0,0.18)]">
        <div className="h-7 w-7 rounded-full bg-brand-600/15 flex items-center justify-center shrink-0">
          <Wifi className="h-3.5 w-3.5 text-brand-400" />
        </div>
        <div>
          <p className="text-[10px] font-bold text-gray-900 dark:text-white whitespace-nowrap">Data Activated</p>
          <p className="text-[9px] text-gray-400 dark:text-white/40">MTN 10GB · Active</p>
        </div>
      </div>
    </div>
  )
}

// ── Service card ──────────────────────────────────────────────────────────────

function ServiceCard({ feature, index }: { feature: LandingFeature; index: number }) {
  const Icon  = ICON_MAP[feature.icon] ?? Wallet
  const color = SERVICE_COLORS[index % SERVICE_COLORS.length]
  return (
    <div className={cn(
      'group relative rounded-2xl border p-6 transition-all duration-200 motion-reduce:transition-none motion-reduce:transform-none cursor-default',
      'bg-white dark:bg-white/[0.03]',
      'hover:bg-gray-50 dark:hover:bg-white/[0.06]',
      'hover:-translate-y-1',
      color.border,
      color.glow,
    )}>
      <div className={cn('h-12 w-12 rounded-xl flex items-center justify-center mb-4 transition-transform duration-200 motion-reduce:transition-none group-hover:scale-110', color.bg)}>
        <Icon className={cn('h-6 w-6', color.icon)} />
      </div>
      <h3 className="text-[15px] font-bold text-gray-900 dark:text-white mb-1.5">{feature.title}</h3>
      <p className="text-sm text-gray-500 dark:text-white/45 leading-relaxed">{feature.description}</p>
    </div>
  )
}

// ── How it works step card ────────────────────────────────────────────────────

function StepCard({ step }: { step: HowItWorksStep }) {
  const meta = STEP_META[(step.step - 1) % STEP_META.length]
  const Icon = meta.icon
  return (
    <div className={cn(
      'group relative rounded-2xl border border-gray-200 dark:border-white/[0.08] p-6 text-center',
      'bg-white dark:bg-white/[0.03]',
      'hover:bg-gray-50 dark:hover:bg-white/[0.06]',
      'hover:-translate-y-1 hover:shadow-[0_8px_28px_rgba(0,0,0,0.10)] dark:hover:shadow-[0_8px_28px_rgba(0,0,0,0.35)]',
      'transition-all duration-200 motion-reduce:transition-none motion-reduce:transform-none',
    )}>
      {/* Step badge */}
      <div className="relative inline-flex mb-5">
        <div className={cn('h-14 w-14 rounded-2xl flex items-center justify-center transition-transform duration-200 motion-reduce:transition-none group-hover:scale-105', meta.bg)}>
          <Icon className={cn('h-7 w-7', meta.color)} />
        </div>
        <div className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-brand-600 flex items-center justify-center text-white text-[11px] font-black shadow-brand">
          {step.step}
        </div>
      </div>
      <p className="font-bold text-gray-900 dark:text-white mb-2">{step.title}</p>
      <p className="text-sm text-gray-500 dark:text-white/45 leading-relaxed">{step.description}</p>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function LandingPage() {
  const token = useAuthStore((s) => s.access_token)
  const { dark, toggle: toggleDark } = useThemeStore()
  const [menuOpen, setMenuOpen] = useState(false)

  const { data: content } = useQuery({
    queryKey:  ['app-content'],
    queryFn:   contentApi.getAppContent,
    staleTime: 5 * 60_000,
    retry:     false,
  })

  const c: LandingContent = content?.landing ?? DEFAULT_CONTENT
  const appName = c.app_name
  const isDefaultTitle = c.hero_title === DEFAULT_CONTENT.hero_title

  if (token) return <Navigate to="/dashboard" replace />

  return (
    <div className="min-h-screen overflow-x-hidden bg-white dark:bg-[#070B12] text-gray-900 dark:text-white font-sans transition-colors duration-200">

      {/* ── Navbar ─────────────────────────────────────────────────────────── */}
      <nav className="fixed top-0 inset-x-0 z-50 border-b border-gray-200 dark:border-white/[0.06] bg-white/90 dark:bg-[#070B12]/90 backdrop-blur-md transition-colors duration-200">
        <div className="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center group">
            <img
              src="/logo-horizontal.png"
              alt={appName}
              className="h-8 object-contain motion-reduce:transition-none"
              style={{ filter: dark ? 'brightness(0) invert(1)' : undefined }}
            />
          </Link>

          <div className="hidden md:flex items-center gap-6">
            <a href="#features"     className="text-sm text-gray-500 dark:text-white/55 hover:text-gray-900 dark:hover:text-white transition-colors">Features</a>
            <a href="#how-it-works" className="text-sm text-gray-500 dark:text-white/55 hover:text-gray-900 dark:hover:text-white transition-colors">How it works</a>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={toggleDark}
              className="p-2 rounded-xl text-gray-400 dark:text-white/45 hover:text-gray-700 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
              aria-label="Toggle theme"
            >
              {dark ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
            </button>
            <Link
              to="/login"
              className="hidden md:block text-sm font-semibold text-gray-600 dark:text-white/65 hover:text-gray-900 dark:hover:text-white px-4 py-2 rounded-xl hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
            >
              {c.hero_cta_secondary}
            </Link>
            <Link
              to="/register"
              className="hidden md:flex items-center gap-1.5 text-sm font-bold bg-brand-600 hover:bg-brand-500 text-white px-4 py-2 rounded-xl transition-all motion-reduce:transition-none shadow-brand hover:shadow-[0_4px_20px_rgba(53,53,217,0.45)] hover:-translate-y-px"
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

        {menuOpen && (
          <div className="md:hidden border-t border-gray-200 dark:border-white/[0.06] bg-white dark:bg-[#0D1117] px-5 py-4 flex flex-col gap-2">
            <a href="#features"     onClick={() => setMenuOpen(false)} className="text-sm text-gray-600 dark:text-white/65 py-2.5 border-b border-gray-100 dark:border-white/5">Features</a>
            <a href="#how-it-works" onClick={() => setMenuOpen(false)} className="text-sm text-gray-600 dark:text-white/65 py-2.5 border-b border-gray-100 dark:border-white/5">How it works</a>
            <div className="flex gap-3 pt-3">
              <Link to="/login"    className="flex-1 text-center py-3 rounded-xl border border-gray-200 dark:border-white/20 text-sm font-semibold text-gray-800 dark:text-white hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                {c.hero_cta_secondary}
              </Link>
              <Link to="/register" className="flex-1 text-center py-3 rounded-xl bg-brand-600 hover:bg-brand-500 text-sm font-bold text-white shadow-brand transition-colors">
                {c.hero_cta_primary}
              </Link>
            </div>
          </div>
        )}
      </nav>

      {/* ── Hero ─────────────────────────────────────────────────────────────── */}
      <section className="relative pt-28 pb-20 md:pt-36 md:pb-28 px-5">
        {/* Mobile gradient header tint */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute top-0 inset-x-0 h-64 bg-gradient-to-b from-brand-600/[0.06] to-transparent sm:hidden" />
          <div className="absolute top-0 left-1/2 -translate-x-1/2 h-[600px] w-[900px] rounded-full bg-brand-600/10 dark:bg-brand-600/20 blur-[130px]" />
          <div className="absolute -top-20 right-0 translate-x-1/3 h-[400px] w-[500px] rounded-full bg-purple-600/8 dark:bg-purple-600/15 blur-[110px]" />
          <div className="absolute bottom-0 left-0 -translate-x-1/4 h-[300px] w-[450px] rounded-full bg-brand-400/5 dark:bg-brand-400/10 blur-[90px]" />
        </div>

        <div className="relative max-w-6xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-14 lg:gap-8 items-center">

            {/* Left: copy */}
            <div className="text-center lg:text-left order-2 lg:order-1">
              {/* Pill badge */}
              <div className="inline-flex items-center gap-2 bg-brand-600/10 border border-brand-500/25 text-brand-600 dark:text-brand-400 text-xs font-bold px-4 py-1.5 rounded-full mb-7">
                <CheckCircle className="h-3.5 w-3.5" />
                Fast · Secure · Reliable
              </div>

              {/* Headline */}
              <h1 className="text-4xl sm:text-5xl lg:text-[3.5rem] xl:text-[4rem] font-black leading-[1.08] tracking-tight text-gray-900 dark:text-white mb-5">
                {isDefaultTitle ? (
                  <>
                    Fast VTU Payments,{' '}
                    <span className="whitespace-nowrap">Built for Everyday</span>{' '}
                    <span className="relative inline-block">
                      <span className="relative z-10 text-brand-600 dark:text-brand-400">Nigerians</span>
                      <span className="pointer-events-none absolute -inset-1 -bottom-1 rounded-lg bg-brand-600/12 dark:bg-brand-600/20 blur-sm" />
                    </span>
                  </>
                ) : (
                  c.hero_title
                )}
              </h1>

              {/* Subtitle */}
              <p className="text-base md:text-[17px] text-gray-500 dark:text-white/50 max-w-lg mx-auto lg:mx-0 leading-relaxed mb-9">
                {c.hero_subtitle}
              </p>

              {/* CTA buttons */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center lg:justify-start gap-3 mb-8">
                <Link
                  to="/register"
                  className="flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-500 text-white font-bold px-8 py-4 rounded-2xl text-base shadow-brand transition-all motion-reduce:transition-none hover:shadow-[0_6px_24px_rgba(53,53,217,0.50)] hover:-translate-y-0.5 active:translate-y-0"
                >
                  {c.hero_cta_primary}
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  to="/login"
                  className="flex items-center justify-center gap-2 border border-gray-300 dark:border-white/20 hover:border-gray-400 dark:hover:border-white/40 bg-white dark:bg-white/[0.03] hover:bg-gray-50 dark:hover:bg-white/[0.07] text-gray-800 dark:text-white font-semibold px-8 py-4 rounded-2xl text-base transition-all motion-reduce:transition-none hover:-translate-y-0.5 active:translate-y-0"
                >
                  {c.hero_cta_secondary}
                </Link>
              </div>

              {/* Trust row */}
              <div className="flex flex-wrap items-center justify-center lg:justify-start gap-2">
                {TRUST_BADGES.map(({ icon: Icon, label }) => (
                  <div
                    key={label}
                    className="flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-white/50 bg-gray-50 dark:bg-white/[0.04] border border-gray-200 dark:border-white/[0.08] px-3 py-1.5 rounded-full"
                  >
                    <Icon className="h-3 w-3 text-brand-500 dark:text-brand-400 shrink-0" />
                    {label}
                  </div>
                ))}
              </div>
            </div>

            {/* Right: phone mockup */}
            <div className="flex justify-center items-center order-1 lg:order-2 pt-6 lg:pt-0">
              <AppMockup />
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats bar ────────────────────────────────────────────────────────── */}
      <div className="px-5 pb-6">
        <div className="max-w-3xl mx-auto">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-px rounded-2xl overflow-hidden border border-gray-200 dark:border-white/[0.08] bg-gray-200 dark:bg-white/[0.08]">
            {STATS.map(({ value, label }) => (
              <div key={label} className="bg-white dark:bg-[#0D1117] px-5 py-4 text-center">
                <p className="text-xl sm:text-2xl font-black text-brand-600 dark:text-brand-400 leading-none mb-1">{value}</p>
                <p className="text-[11px] text-gray-400 dark:text-white/40 font-medium">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Services ─────────────────────────────────────────────────────────── */}
      <section id="features" className="py-20 px-5">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-xs font-bold text-brand-600 dark:text-brand-400 uppercase tracking-widest mb-3">Services</p>
            <h2 className="text-2xl md:text-4xl font-black text-gray-900 dark:text-white mb-3">Everything you need, in one app</h2>
            <p className="text-gray-400 dark:text-white/40 max-w-md mx-auto text-sm leading-relaxed">
              One wallet. Seven services. All of Nigeria covered.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {c.features.map((f, i) => <ServiceCard key={i} feature={f} index={i} />)}
          </div>
        </div>
      </section>

      {/* ── Why customers trust Hive Data ────────────────────────────────────── */}
      <section className="py-20 px-5 relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[600px] w-[800px] rounded-full bg-brand-600/5 dark:bg-brand-600/10 blur-[140px]" />
        </div>
        <div className="relative max-w-6xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">

            {/* Left: heading */}
            <div>
              <p className="text-xs font-bold text-brand-600 dark:text-brand-400 uppercase tracking-widest mb-3">Trust &amp; Security</p>
              <h2 className="text-2xl md:text-4xl font-black text-gray-900 dark:text-white mb-4 leading-tight">
                Why customers trust{' '}
                <span className="text-brand-600 dark:text-brand-400">Hive Data</span>
              </h2>
              <p className="text-gray-500 dark:text-white/45 leading-relaxed mb-8 max-w-md">
                We've built every feature with your security and convenience in mind — so you can transact confidently, every day.
              </p>
              <Link
                to="/register"
                className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-500 text-white font-bold px-6 py-3 rounded-xl text-sm shadow-brand transition-all motion-reduce:transition-none hover:-translate-y-0.5 hover:shadow-[0_6px_24px_rgba(53,53,217,0.45)]"
              >
                Get started free
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            {/* Right: bullet list */}
            <div className="space-y-4">
              {TRUST_FEATURES.map(({ icon: Icon, title, description }) => (
                <div
                  key={title}
                  className="flex items-start gap-4 rounded-2xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.03] px-5 py-4 hover:bg-gray-50 dark:hover:bg-white/[0.06] hover:border-brand-200 dark:hover:border-brand-500/25 transition-all duration-200 motion-reduce:transition-none group"
                >
                  <div className="h-9 w-9 rounded-xl bg-brand-600/10 dark:bg-brand-600/15 flex items-center justify-center shrink-0 transition-transform duration-200 motion-reduce:transition-none group-hover:scale-110">
                    <Icon className="h-4.5 w-4.5 text-brand-600 dark:text-brand-400" />
                  </div>
                  <div>
                    <p className="font-bold text-sm text-gray-900 dark:text-white mb-0.5">{title}</p>
                    <p className="text-xs text-gray-500 dark:text-white/45 leading-relaxed">{description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────────────────── */}
      <section id="how-it-works" className="py-20 px-5">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-xs font-bold text-brand-600 dark:text-brand-400 uppercase tracking-widest mb-3">Get started</p>
            <h2 className="text-2xl md:text-4xl font-black text-gray-900 dark:text-white mb-3">Up and running in minutes</h2>
            <p className="text-gray-400 dark:text-white/40 text-sm">Three simple steps to access all services.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {c.how_it_works.map((s) => <StepCard key={s.step} step={s} />)}
          </div>
        </div>
      </section>

      {/* ── CTA banner ───────────────────────────────────────────────────────── */}
      <section className="py-20 px-5">
        <div className="max-w-3xl mx-auto">
          <div className="relative rounded-3xl overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-brand-600 to-purple-700" />
            <div className="pointer-events-none absolute -top-8 -right-8 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
            <div className="pointer-events-none absolute -bottom-8 -left-8 h-48 w-48 rounded-full bg-purple-400/20 blur-2xl" />
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.06]"
              style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '24px 24px' }}
            />
            <div className="relative text-center px-8 py-14 md:py-16">
              <p className="text-xs font-bold text-white/70 uppercase tracking-widest mb-4">Join thousands of Nigerians</p>
              <h2 className="text-2xl md:text-4xl font-black text-white mb-4 leading-tight">
                Ready to simplify your<br className="hidden sm:block" /> digital payments?
              </h2>
              <p className="text-white/70 mb-8 leading-relaxed max-w-md mx-auto text-sm md:text-base">
                Create your Hive Data account and start buying services instantly.
              </p>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3">
                <Link
                  to="/register"
                  className="flex items-center justify-center gap-2 bg-white hover:bg-gray-50 text-brand-700 font-bold px-8 py-4 rounded-2xl text-base transition-all motion-reduce:transition-none hover:-translate-y-0.5 hover:shadow-xl active:translate-y-0"
                >
                  Create Free Account
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  to="/login"
                  className="flex items-center justify-center gap-2 border-2 border-white/40 hover:border-white/70 text-white font-semibold px-8 py-4 rounded-2xl text-base transition-all motion-reduce:transition-none hover:-translate-y-0.5 hover:bg-white/10 active:translate-y-0"
                >
                  Sign in instead
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────────── */}
      <footer className="border-t border-gray-200 dark:border-white/[0.06] py-12 px-5">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col items-center gap-6">
            {/* Logo */}
            <img
              src="/logo-horizontal.png"
              alt={appName}
              className="h-7 object-contain"
              style={{ filter: dark ? 'brightness(0) invert(1)' : undefined }}
            />

            {/* Nav links */}
            <div className="flex flex-wrap justify-center gap-x-6 gap-y-2">
              <Link to="/about"            className="text-xs text-gray-400 dark:text-white/35 hover:text-gray-700 dark:hover:text-white transition-colors">About</Link>
              <Link to="/contact"          className="text-xs text-gray-400 dark:text-white/35 hover:text-gray-700 dark:hover:text-white transition-colors">Contact</Link>
              <Link to="/privacy-policy"   className="text-xs text-gray-400 dark:text-white/35 hover:text-gray-700 dark:hover:text-white transition-colors">Privacy Policy</Link>
              <Link to="/terms-of-service" className="text-xs text-gray-400 dark:text-white/35 hover:text-gray-700 dark:hover:text-white transition-colors">Terms of Service</Link>
              <Link to="/refund-policy"    className="text-xs text-gray-400 dark:text-white/35 hover:text-gray-700 dark:hover:text-white transition-colors">Refund Policy</Link>
              <span className="text-gray-200 dark:text-white/10 select-none">|</span>
              <Link to="/login"            className="text-xs text-gray-400 dark:text-white/35 hover:text-gray-700 dark:hover:text-white transition-colors">Login</Link>
              <Link to="/register"         className="text-xs text-gray-400 dark:text-white/35 hover:text-gray-700 dark:hover:text-white transition-colors">Sign up</Link>
            </div>

            <div className="w-full max-w-xs h-px bg-gray-200 dark:bg-white/[0.06]" />

            <p className="text-xs text-gray-400 dark:text-white/25 text-center">
              &copy; {new Date().getFullYear()} {appName}. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}

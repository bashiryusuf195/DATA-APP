import { useRef, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  Copy, CheckCheck, RefreshCw, Building2, ArrowRight,
  Landmark, ChevronLeft, ChevronRight, Zap, CheckCircle2,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { isAxiosError } from 'axios'
import {
  useDedicatedAccount, useSquadAccount,
  useInitializeFunding, useFundingConfig,
} from '@/hooks/useWallet'
import type { FundingCardConfig } from '@/hooks/useWallet'
import { useQueryClient } from '@tanstack/react-query'
import { AmountInput } from '@/components/shared/AmountInput'
import { Skeleton } from '@/components/ui'
import { cn } from '@/utils/cn'
import type { TransferAccount } from '@/types'

// ── Dedicated Account Card ────────────────────────────────────────────────────

function DedicatedAccountCard() {
  const qc                   = useQueryClient()
  const { data: dva,       isLoading: dvaLoading    } = useDedicatedAccount()
  const { data: squadData, isLoading: squadLoading  } = useSquadAccount()
  const [copiedKey, setCopied] = useState<'dva' | 'squad' | null>(null)

  const squadAccount = squadData?.account ?? null

  const copy = (key: 'dva' | 'squad') => {
    const text = key === 'dva' ? dva?.account_number : squadAccount?.virtual_account_number
    if (!text) return
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key)
      setTimeout(() => setCopied(null), 2000)
      toast.success('Account number copied!')
    })
  }

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['wallet-dedicated-account'] })
    void qc.invalidateQueries({ queryKey: ['wallet-squad-account'] })
  }

  const isLoading = dvaLoading || squadLoading
  const hasAny    = !!(dva || squadAccount)

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <p className="text-sm font-bold text-ink">Dedicated Account</p>
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
            Permanent
          </span>
        </div>
        <button
          onClick={refresh}
          className="p-1 rounded-lg hover:bg-surface-2 transition-colors"
          title="Refresh accounts"
          aria-label="Refresh dedicated accounts"
        >
          <RefreshCw className="h-3.5 w-3.5 text-ink-faint" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 space-y-3">
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex justify-between">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-32" />
              </div>
            ))}
          </div>
        ) : !hasAny ? (
          <div className="flex flex-col items-center justify-center py-4 gap-2 text-center">
            <div className="h-10 w-10 rounded-full bg-surface-2 flex items-center justify-center">
              <Building2 className="h-5 w-5 text-ink-faint" />
            </div>
            <p className="text-xs text-ink-muted">Dedicated account not available yet.</p>
            <Link to="/profile/edit" className="text-xs font-semibold text-brand-600 hover:underline">
              Complete profile →
            </Link>
          </div>
        ) : (
          <>
            {dva && (
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                    Paystack
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-ink-faint">Bank</span>
                  <span className="font-semibold text-ink">{dva.bank_name}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-ink-faint">Name</span>
                  <span className="font-semibold text-ink truncate max-w-[55%] text-right">{dva.account_name}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-ink-faint">Account No.</span>
                  <button
                    onClick={() => copy('dva')}
                    className="flex items-center gap-1.5 font-bold text-brand-600 hover:text-brand-700 transition-colors"
                  >
                    <span className="font-mono text-sm tracking-wider">{dva.account_number}</span>
                    {copiedKey === 'dva'
                      ? <CheckCheck className="h-3.5 w-3.5 text-success" />
                      : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
            )}

            {dva && squadAccount && (
              <div className="border-t border-border" />
            )}

            {squadAccount && (
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-400 border border-violet-200 dark:border-violet-800">
                    Squad
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-ink-faint">Bank</span>
                  <span className="font-semibold text-ink">{squadAccount.bank_name}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-ink-faint">Name</span>
                  <span className="font-semibold text-ink truncate max-w-[55%] text-right">{squadAccount.account_name}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-ink-faint">Account No.</span>
                  <button
                    onClick={() => copy('squad')}
                    className="flex items-center gap-1.5 font-bold text-violet-600 hover:text-violet-700 transition-colors"
                  >
                    <span className="font-mono text-sm tracking-wider">{squadAccount.virtual_account_number}</span>
                    {copiedKey === 'squad'
                      ? <CheckCheck className="h-3.5 w-3.5 text-success" />
                      : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <p className="text-[10px] text-ink-faint mt-3 leading-relaxed">
        Transfer any amount to credit instantly — no expiry.
      </p>
    </div>
  )
}

// ── Quick Transfer Card ───────────────────────────────────────────────────────

type QtPhase = 'idle' | 'result'

function QuickTransferCard() {
  const [amount, setAmount]             = useState('')
  const [amountError, setAmountError]   = useState('')
  const [phase, setPhase]               = useState<QtPhase>('idle')
  const [transferAccount, setTransfer]  = useState<TransferAccount | null>(null)
  const [copiedTransfer, setCopied]     = useState(false)

  const initFunding = useInitializeFunding()

  const handleGenerate = async () => {
    const amt = parseFloat(amount)
    if (!amt || amt < 100) { setAmountError('Minimum is ₦100'); return }
    if (amt > 5_000_000)   { setAmountError('Maximum is ₦5,000,000'); return }
    setAmountError('')
    try {
      const res = await initFunding.mutateAsync({ amount: amt, key: crypto.randomUUID(), method: 'bank_transfer' })
      if (res.transfer_account) {
        setTransfer(res.transfer_account)
        setPhase('result')
      } else {
        // Gateway returned a redirect URL (e.g. Squad) — fall through to full page
        window.location.href = `/wallet/fund`
      }
    } catch (err) {
      toast.error(isAxiosError(err) ? (err.response?.data?.error ?? 'Could not generate account.') : 'Something went wrong.')
    }
  }

  const copy = () => {
    if (!transferAccount?.account_number) return
    navigator.clipboard.writeText(transferAccount.account_number).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      toast.success('Account number copied!')
    })
  }

  const reset = () => {
    setPhase('idle')
    setAmount('')
    setTransfer(null)
    setCopied(false)
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <p className="text-sm font-bold text-ink">Quick Bank Transfer</p>
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-brand-50 dark:bg-brand-950/40 text-brand-600 dark:text-brand-400 border border-brand-200 dark:border-brand-800">
          Amount Based
        </span>
      </div>

      {phase === 'idle' ? (
        <>
          <p className="text-xs text-ink-faint mb-3">
            Generate a one-time account for a specific amount. Wallet credited automatically.
          </p>
          <div className="flex-1 space-y-3">
            <AmountInput value={amount} onChange={setAmount} error={amountError} />
            <button
              onClick={handleGenerate}
              disabled={initFunding.isPending}
              className={cn(
                'w-full py-2.5 rounded-2xl text-white text-sm font-bold transition-all flex items-center justify-center gap-2',
                initFunding.isPending
                  ? 'bg-brand-400 cursor-not-allowed'
                  : 'bg-brand-600 hover:bg-brand-700 shadow-brand active:scale-[0.98]'
              )}
            >
              {initFunding.isPending ? (
                <>
                  <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  Generating…
                </>
              ) : (
                <>
                  <Landmark className="h-4 w-4" />
                  Get Transfer Account
                </>
              )}
            </button>
          </div>
          <p className="text-[10px] text-ink-faint mt-3 leading-relaxed">
            This account expires after the transfer. Do not reuse it.
          </p>
        </>
      ) : transferAccount ? (
        <>
          <div className="flex-1 space-y-2 text-sm">
            <div className="flex items-center gap-1.5 mb-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-success" />
              <span className="text-xs font-semibold text-success">Account generated</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-ink-faint">Bank</span>
              <span className="font-semibold text-ink">{transferAccount.bank_name}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-ink-faint">Name</span>
              <span className="font-semibold text-ink truncate max-w-[55%] text-right">{transferAccount.account_name}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-ink-faint">Account No.</span>
              <button
                onClick={copy}
                className="flex items-center gap-1.5 font-bold text-brand-600 hover:text-brand-700 transition-colors"
              >
                <span className="font-mono text-sm tracking-wider">{transferAccount.account_number}</span>
                {copiedTransfer
                  ? <CheckCheck className="h-3.5 w-3.5 text-success" />
                  : <Copy className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>

          <div className="mt-3 flex gap-2">
            <button
              onClick={copy}
              className={cn(
                'flex-1 py-2 rounded-2xl text-sm font-bold transition-all flex items-center justify-center gap-1.5',
                copiedTransfer
                  ? 'bg-success/10 text-success'
                  : 'bg-brand-600 text-white hover:bg-brand-700 shadow-brand active:scale-[0.98]'
              )}
            >
              {copiedTransfer ? <><CheckCheck className="h-3.5 w-3.5" /> Copied!</> : <><Copy className="h-3.5 w-3.5" /> Copy</>}
            </button>
            <button
              onClick={reset}
              className="px-3 py-2 rounded-2xl text-sm font-medium text-ink-muted bg-surface-2 hover:bg-surface-3 transition-colors"
            >
              New
            </button>
          </div>

          <Link to="/wallet/fund" className="flex items-center justify-center gap-1 text-[10px] text-ink-faint hover:text-brand-600 transition-colors mt-2">
            Verify transfer status <ArrowRight className="h-3 w-3" />
          </Link>
        </>
      ) : null}
    </div>
  )
}

// ── Card renderer ─────────────────────────────────────────────────────────────

function renderCard(cfg: FundingCardConfig) {
  switch (cfg.type) {
    case 'dedicated_account': return <DedicatedAccountCard />
    case 'quick_transfer':    return <QuickTransferCard />
    default:                  return null
  }
}

function cardLabel(type: FundingCardConfig['type']): string {
  switch (type) {
    case 'dedicated_account': return 'Dedicated Account'
    case 'quick_transfer':    return 'Quick Bank Transfer'
    default:                  return type
  }
}

// ── Carousel shell ────────────────────────────────────────────────────────────

export function FundingCarousel() {
  const { data: config } = useFundingConfig()

  const trackRef = useRef<HTMLDivElement>(null)
  const [activeIndex, setActiveIndex] = useState(0)

  // Ordered, enabled cards — exactly what the server says
  const cards = (config?.cards ?? []).filter(c => c.enabled)

  const scrollTo = useCallback((idx: number) => {
    if (!trackRef.current) return
    trackRef.current.scrollTo({ left: idx * trackRef.current.clientWidth, behavior: 'smooth' })
  }, [])

  const handleScroll = () => {
    if (!trackRef.current) return
    const idx = Math.round(trackRef.current.scrollLeft / trackRef.current.clientWidth)
    setActiveIndex(idx)
  }

  const canPrev = activeIndex > 0
  const canNext = activeIndex < cards.length - 1

  return (
    <div className="relative">
      {/* Desktop arrow — prev */}
      {canPrev && (
        <button
          onClick={() => scrollTo(activeIndex - 1)}
          className="hidden md:flex absolute -left-3 top-1/2 -translate-y-1/2 z-10 h-7 w-7 items-center justify-center rounded-full bg-surface-1 border border-border shadow-card hover:bg-surface-2 transition-colors"
          aria-label="Previous funding method"
        >
          <ChevronLeft className="h-4 w-4 text-ink-muted" />
        </button>
      )}

      {/* Desktop arrow — next */}
      {canNext && (
        <button
          onClick={() => scrollTo(activeIndex + 1)}
          className="hidden md:flex absolute -right-3 top-1/2 -translate-y-1/2 z-10 h-7 w-7 items-center justify-center rounded-full bg-surface-1 border border-border shadow-card hover:bg-surface-2 transition-colors"
          aria-label="Next funding method"
        >
          <ChevronRight className="h-4 w-4 text-ink-muted" />
        </button>
      )}

      {/* Track */}
      <div
        ref={trackRef}
        onScroll={handleScroll}
        className="flex overflow-x-auto scrollbar-none snap-x snap-mandatory scroll-smooth"
        style={{ WebkitOverflowScrolling: 'touch' }}
        aria-label="Funding methods"
      >
        {cards.map((cfg) => (
          <div
            key={cfg.type}
            className="shrink-0 w-full snap-start"
            aria-label={cardLabel(cfg.type)}
          >
            <div className="bg-surface-1 rounded-3xl p-4 shadow-card border border-border min-h-[180px] dashboard-shine-card">
              {renderCard(cfg)}
            </div>
          </div>
        ))}
      </div>

      {/* Dot indicators */}
      {cards.length > 1 && (
        <div className="flex items-center justify-center gap-1.5 mt-2.5" aria-label="Funding method indicators" role="tablist">
          {cards.map((_, idx) => (
            <button
              key={idx}
              onClick={() => scrollTo(idx)}
              role="tab"
              aria-selected={idx === activeIndex}
              aria-label={`Go to card ${idx + 1}`}
              className={cn(
                'rounded-full transition-all duration-200',
                idx === activeIndex
                  ? 'w-4 h-1.5 bg-brand-600'
                  : 'w-1.5 h-1.5 bg-border hover:bg-ink-faint'
              )}
            />
          ))}
        </div>
      )}

      {/* Swipe hint — mobile only */}
      {cards.length > 1 && activeIndex === 0 && (
        <p className="md:hidden text-center text-[10px] text-ink-faint mt-1 flex items-center justify-center gap-1">
          <Zap className="h-2.5 w-2.5" />
          Swipe for more funding options
        </p>
      )}
    </div>
  )
}

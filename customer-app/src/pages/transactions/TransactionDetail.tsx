import { useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Copy, Check, Zap, Download, Loader2, ShieldCheck,
  Share2, CheckCircle2, XCircle, Clock, Search, RefreshCw,
  ArrowDownLeft,
} from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import { Share } from '@capacitor/share'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { cn } from '@/utils/cn'
import { useTransaction } from '@/hooks/useTransactions'
import { ErrorMessage } from '@/components/shared/ErrorMessage'
import { fmtCurrency, fmtDateTime, normalizeTransactionStatus } from '@/utils/format'
import { transactionsApi } from '@/api/transactions.api'
import { isAxiosError } from 'axios'
import toast from 'react-hot-toast'
import type { Transaction } from '@/types'
import { TYPE_ICON, TYPE_LABEL, TYPE_BG, TYPE_COLOR } from '@/components/shared/TransactionCard'

// ─── Tiny helpers ─────────────────────────────────────────────────────────────

function s(v: unknown): string { return typeof v === 'string' ? v.trim() : '' }
function n(v: unknown): number | undefined {
  if (v == null) return undefined
  const x = Number(v)
  return isNaN(x) ? undefined : x
}

// ─── UI status ────────────────────────────────────────────────────────────────

type UIStatus = 'success' | 'failed' | 'pending' | 'review' | 'refunded'

function getUIStatus(raw: string): UIStatus {
  if (raw === 'refunded' || raw === 'reversed') return 'refunded'
  return normalizeTransactionStatus(raw)
}

// ─── Status display config ────────────────────────────────────────────────────

interface StatusCfg {
  heroBg:    string
  dotBg:     string
  dotRing:   string
  StatusIcon: React.FC<{ className?: string }>
  iconBg:    string
  iconCls:   string
  label:     string
  pillBg:    string
  pillText:  string
  pillRing:  string
}

const STATUS_CFG: Record<UIStatus, StatusCfg> = {
  success: {
    heroBg:    'from-emerald-50 dark:from-emerald-950/30',
    dotBg:     'bg-success',
    dotRing:   'ring-success/30',
    StatusIcon: CheckCircle2,
    iconBg:    'bg-success/10',
    iconCls:   'text-success',
    label:     'Successful',
    pillBg:    'bg-success/10 dark:bg-success/20',
    pillText:  'text-success',
    pillRing:  'ring-success/20',
  },
  failed: {
    heroBg:    'from-red-50/60 dark:from-red-950/20',
    dotBg:     'bg-danger',
    dotRing:   'ring-danger/30',
    StatusIcon: XCircle,
    iconBg:    'bg-danger/10',
    iconCls:   'text-danger',
    label:     'Failed',
    pillBg:    'bg-danger/10 dark:bg-danger/20',
    pillText:  'text-danger',
    pillRing:  'ring-danger/20',
  },
  pending: {
    heroBg:    'from-amber-50 dark:from-amber-950/20',
    dotBg:     'bg-amber-400',
    dotRing:   'ring-amber-400/30',
    StatusIcon: Clock,
    iconBg:    'bg-amber-400/10',
    iconCls:   'text-amber-500',
    label:     'Processing',
    pillBg:    'bg-amber-400/10 dark:bg-amber-400/20',
    pillText:  'text-amber-600 dark:text-amber-400',
    pillRing:  'ring-amber-400/20',
  },
  review: {
    heroBg:    'from-blue-50/60 dark:from-blue-950/20',
    dotBg:     'bg-blue-400',
    dotRing:   'ring-blue-400/30',
    StatusIcon: Search,
    iconBg:    'bg-blue-400/10',
    iconCls:   'text-blue-500',
    label:     'Under Review',
    pillBg:    'bg-blue-400/10 dark:bg-blue-400/20',
    pillText:  'text-blue-600 dark:text-blue-400',
    pillRing:  'ring-blue-400/20',
  },
  refunded: {
    heroBg:    'from-slate-100 dark:from-slate-900/30',
    dotBg:     'bg-slate-400',
    dotRing:   'ring-slate-400/30',
    StatusIcon: RefreshCw,
    iconBg:    'bg-slate-400/10',
    iconCls:   'text-slate-500',
    label:     'Refunded',
    pillBg:    'bg-slate-100 dark:bg-slate-800',
    pillText:  'text-slate-600 dark:text-slate-400',
    pillRing:  'ring-slate-200 dark:ring-slate-700',
  },
}

// ─── Amount display ───────────────────────────────────────────────────────────

function getAmountDisplay(tx: Transaction, uiStatus: UIStatus): { prefix: string; cls: string } {
  if (uiStatus === 'failed')   return { prefix: '', cls: 'text-ink-muted' }
  if (uiStatus === 'pending')  return { prefix: '', cls: 'text-ink' }
  if (uiStatus === 'review')   return { prefix: '', cls: 'text-ink' }
  if (uiStatus === 'refunded') return { prefix: '+', cls: 'text-success' }
  // success
  const isCredit = tx.type === 'wallet_funding'
  return isCredit
    ? { prefix: '+', cls: 'text-success' }
    : { prefix: '−', cls: 'text-danger' }
}

// ─── Field extractors ─────────────────────────────────────────────────────────

function getRecipient(tx: Transaction): string | null {
  const pr = tx.metadata?.provider_response as Record<string, unknown> | undefined
  switch (tx.type) {
    case 'airtime':
    case 'data':
    case 'transfer':
      return tx.phone ?? null
    case 'electricity':
      return s(pr?.meter_number) || tx.phone || null
    case 'cable_tv':
      return s(pr?.smartcard_number ?? pr?.iucNumber ?? pr?.iuc_number) || tx.phone || null
    case 'wallet_funding':
      return null
    default:
      return tx.phone ?? null
  }
}

function getProvider(tx: Transaction): string | null {
  const meta = (tx.metadata ?? {}) as Record<string, unknown>
  const pr   = meta.provider_response as Record<string, unknown> | undefined
  const raw  = s(meta.provider) || s(pr?.provider) || s(meta.service_id)
  if (!raw) return null
  const pretty: Record<string, string> = {
    vtpass: 'VTPass', VTPASS: 'VTPass',
    paystack: 'Paystack', squad: 'Squad',
    flutterwave: 'Flutterwave',
  }
  return pretty[raw] ?? pretty[raw.toLowerCase()] ?? raw
}

// ─── Detail row ───────────────────────────────────────────────────────────────

function DetailRow({
  label, value, mono, last,
}: {
  label: string
  value: React.ReactNode
  mono?: boolean
  last?: boolean
}) {
  return (
    <div className={cn(
      'flex items-start justify-between gap-4 px-5 py-3.5',
      !last && 'border-b border-border',
    )}>
      <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint shrink-0 pt-0.5 min-w-[90px]">
        {label}
      </span>
      <span className={cn(
        'text-sm text-ink text-right break-all leading-snug',
        mono && 'font-mono text-xs',
      )}>
        {value}
      </span>
    </div>
  )
}

// ─── Copy button ──────────────────────────────────────────────────────────────

function CopyBtn({ text, className }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false)
  const handle = useCallback(async () => {
    try { await navigator.clipboard.writeText(text) } catch { return }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [text])
  return (
    <button
      onClick={handle}
      title="Copy"
      className={cn(
        'p-1.5 rounded-lg transition-colors shrink-0',
        copied
          ? 'bg-success/10 text-success'
          : 'bg-surface-2 text-ink-muted hover:text-ink hover:bg-border',
        className,
      )}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  )
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="rounded-3xl bg-surface-1 border border-border p-8 flex flex-col items-center gap-3">
        <div className="relative mb-1">
          <div className="h-16 w-16 rounded-2xl bg-surface-2" />
          <div className="absolute -bottom-1.5 -right-1.5 h-6 w-6 rounded-full bg-surface-2 ring-2 ring-surface-1" />
        </div>
        <div className="h-10 w-36 bg-surface-2 rounded-xl" />
        <div className="h-6 w-24 bg-surface-2 rounded-full" />
        <div className="h-4 w-32 bg-surface-2 rounded" />
      </div>
      <div className="rounded-3xl bg-surface-1 border border-border overflow-hidden">
        {[...Array(6)].map((_, i) => (
          <div key={i} className={cn('flex justify-between px-5 py-3.5', i < 5 && 'border-b border-border')}>
            <div className="h-3 w-16 bg-surface-2 rounded" />
            <div className="h-3 w-28 bg-surface-2 rounded" />
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Service-specific cards ───────────────────────────────────────────────────

function ServiceCard({
  tx,
  isDownloading,
  onDownload,
}: {
  tx: Transaction
  isDownloading: boolean
  onDownload: (ref: string) => void
}) {
  const meta = (tx.metadata ?? {}) as Record<string, unknown>
  const pr   = meta.provider_response as Record<string, unknown> | undefined

  // ── Electricity token ──────────────────────────────────────────────────────
  if (tx.type === 'electricity') {
    const token    = s(pr?.token)
    const units    = pr?.units
    const customer = s(pr?.customer_name)
    const meter    = s(pr?.meter_number)
    const address  = s(pr?.address)
    const orderId  = s(pr?.provider_order_id)
    if (!token) return null

    return (
      <div className="rounded-3xl bg-surface-1 border border-border overflow-hidden print:break-inside-avoid">
        <div className="px-5 py-3.5 bg-amber-50/60 dark:bg-amber-950/20 border-b border-border flex items-center gap-2.5">
          <div className="h-7 w-7 rounded-lg bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center shrink-0">
            <Zap className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          </div>
          <p className="text-sm font-semibold text-ink">Electricity Token</p>
        </div>
        <div className="p-5 space-y-3">
          {/* Token box */}
          <div className="rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 p-4">
            <p className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold uppercase tracking-widest mb-2">
              Token
            </p>
            <div className="flex items-center justify-between gap-3">
              <p className="font-mono text-base font-bold text-amber-800 dark:text-amber-200 tracking-widest break-all leading-snug">
                {token}
              </p>
              <CopyBtn text={token} className="!bg-amber-100 dark:!bg-amber-900/40 !text-amber-600 dark:!text-amber-400 hover:!bg-amber-200" />
            </div>
            {units != null && (
              <span className="mt-2 inline-block rounded-full bg-amber-100 dark:bg-amber-900/40 border border-amber-300 dark:border-amber-700 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
                {String(units)} units
              </span>
            )}
          </div>
          {/* Customer details */}
          {(customer || meter || address || orderId) && (
            <div className="rounded-2xl border border-border overflow-hidden">
              {customer && <DetailRow label="Customer" value={customer} />}
              {meter    && <DetailRow label="Meter No." value={meter} mono />}
              {address  && <DetailRow label="Address"  value={address} />}
              {orderId  && <DetailRow label="Order ID" value={orderId} mono last={!address && !meter && !customer} />}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Cable TV ───────────────────────────────────────────────────────────────
  if (tx.type === 'cable_tv') {
    const pkg      = s(pr?.package ?? pr?.Package ?? pr?.Bouquet ?? pr?.bouquet)
    const customer = s(pr?.Customer_Name ?? pr?.customer_name)
    const due      = s(pr?.Due_Date ?? pr?.due_date)
    if (!pkg && !customer) return null

    return (
      <div className="rounded-3xl bg-surface-1 border border-border overflow-hidden print:break-inside-avoid">
        <div className="px-5 py-3.5 bg-purple-50/60 dark:bg-purple-950/20 border-b border-border flex items-center gap-2.5">
          <div className="h-7 w-7 rounded-lg bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center shrink-0">
            {/* Tv icon inline */}
            <svg className="h-4 w-4 text-purple-600 dark:text-purple-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="7" width="20" height="15" rx="2" ry="2"/>
              <polyline points="17 2 12 7 7 2"/>
            </svg>
          </div>
          <p className="text-sm font-semibold text-ink">Subscription Details</p>
        </div>
        <div className="overflow-hidden">
          {customer && <DetailRow label="Customer" value={customer} />}
          {pkg      && <DetailRow label="Package"  value={pkg} />}
          {due      && <DetailRow label="Due Date" value={due} last={!customer && !pkg} />}
        </div>
      </div>
    )
  }

  // ── Exam PINs ──────────────────────────────────────────────────────────────
  if (tx.type === 'exam_pin') {
    type CardEntry = { pin?: string; Pin?: string; serial?: string; Serial?: string }
    const cards    = (pr?.carddetails ?? pr?.pins) as CardEntry[] | undefined
    const hasSerial = cards?.some(c => !!(c.Serial ?? c.serial))

    // WAEC: has serial numbers
    if (cards && cards.length > 0 && hasSerial) {
      return (
        <div className="rounded-3xl bg-surface-1 border border-border overflow-hidden print:break-inside-avoid">
          <div className="px-5 py-3.5 bg-blue-50/60 dark:bg-blue-950/20 border-b border-border flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-lg bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center shrink-0">
              <ShieldCheck className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </div>
            <p className="text-sm font-semibold text-ink">WAEC PIN{cards.length > 1 ? 's' : ''}</p>
          </div>
          <div className="p-5 space-y-3">
            {cards.map((card, i) => {
              const pin    = s(card.Pin ?? card.pin)
              const serial = s(card.Serial ?? card.serial)
              return (
                <div key={i} className="rounded-2xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/40 p-4 space-y-2">
                  {pin && (
                    <div>
                      <p className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold uppercase tracking-widest mb-1">PIN</p>
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-mono text-sm font-bold text-blue-800 dark:text-blue-200 tracking-widest break-all">{pin}</p>
                        <CopyBtn text={pin} className="!bg-blue-100 dark:!bg-blue-900/40 !text-blue-600 dark:!text-blue-400 hover:!bg-blue-200" />
                      </div>
                    </div>
                  )}
                  {serial && (
                    <div>
                      <p className="text-[10px] text-blue-500 dark:text-blue-500 font-semibold uppercase tracking-widest mb-1">Serial</p>
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-mono text-xs text-blue-700 dark:text-blue-300">{serial}</p>
                        <CopyBtn text={serial} className="!bg-blue-100 dark:!bg-blue-900/40 !text-blue-600 dark:!text-blue-400 hover:!bg-blue-200" />
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )
    }

    // JAMB: root pin + profile code
    const jambPin  = s(pr?.pin ?? pr?.Pin)
    const profCode = s(pr?.profile_code ?? pr?.ProfileCode)
    if (jambPin || profCode) {
      return (
        <div className="rounded-3xl bg-surface-1 border border-border overflow-hidden print:break-inside-avoid">
          <div className="px-5 py-3.5 bg-emerald-50/60 dark:bg-emerald-950/20 border-b border-border flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center shrink-0">
              <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <p className="text-sm font-semibold text-ink">JAMB Details</p>
          </div>
          <div className="p-5 space-y-3">
            {jambPin && (
              <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40 p-4">
                <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold uppercase tracking-widest mb-1.5">PIN</p>
                <div className="flex items-center justify-between gap-2">
                  <p className="font-mono text-sm font-bold text-emerald-800 dark:text-emerald-200 tracking-widest break-all">{jambPin}</p>
                  <CopyBtn text={jambPin} className="!bg-emerald-100 dark:!bg-emerald-900/40 !text-emerald-600 dark:!text-emerald-400 hover:!bg-emerald-200" />
                </div>
              </div>
            )}
            {profCode && (
              <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40 p-4">
                <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold uppercase tracking-widest mb-1.5">Profile Code</p>
                <div className="flex items-center justify-between gap-2">
                  <p className="font-mono text-xs text-emerald-800 dark:text-emerald-200">{profCode}</p>
                  <CopyBtn text={profCode} className="!bg-emerald-100 dark:!bg-emerald-900/40 !text-emerald-600 dark:!text-emerald-400 hover:!bg-emerald-200" />
                </div>
              </div>
            )}
          </div>
        </div>
      )
    }
  }

  // ── Identity verification ──────────────────────────────────────────────────
  if (tx.type === 'identity_verification') {
    const rd         = (meta.report_data ?? {}) as Record<string, unknown>
    const pd         = ((pr as Record<string, unknown> | undefined)?.data ?? {}) as Record<string, unknown>
    const firstName  = s(rd.first_name  ?? pd.first_name)
    const lastName   = s(rd.last_name   ?? pd.last_name)
    const middleName = s(rd.middle_name ?? pd.middle_name)
    const dob        = s(rd.date_of_birth ?? pd.date_of_birth)
    const gender     = s(rd.gender ?? pd.gender)
    const fullName   = [firstName, middleName, lastName].filter(Boolean).join(' ')
    const idType     = s(rd.id_type).toUpperCase() || 'ID'
    const idNum      = s(rd.id_number ?? pd.nin ?? pd.bvn)

    const hasData = fullName || dob || gender || idNum

    if (!hasData && getUIStatus(tx.status) !== 'success') return null

    return (
      <div className="rounded-3xl bg-surface-1 border border-border overflow-hidden print:break-inside-avoid">
        <div className="px-5 py-3.5 bg-indigo-50/60 dark:bg-indigo-950/20 border-b border-border flex items-center gap-2.5">
          <div className="h-7 w-7 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center shrink-0">
            <ShieldCheck className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
          </div>
          <p className="text-sm font-semibold text-ink">Verification Result</p>
        </div>
        {hasData && (
          <div className="overflow-hidden">
            {fullName && <DetailRow label="Full Name" value={<span className="font-semibold">{fullName}</span>} />}
            {dob      && <DetailRow label="Date of Birth" value={dob} />}
            {gender   && <DetailRow label="Gender"  value={<span className="capitalize">{gender}</span>} />}
            {idNum    && <DetailRow label={idType}  value={idNum} mono last />}
          </div>
        )}
        <div className="p-4">
          <button
            onClick={() => onDownload(tx.reference)}
            disabled={isDownloading}
            className="flex items-center justify-center gap-2 w-full py-2.5 rounded-2xl border-2 border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300 text-sm font-semibold hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isDownloading
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Download className="h-4 w-4" />}
            {isDownloading ? 'Downloading…' : 'Download Report'}
          </button>
        </div>
      </div>
    )
  }

  return null
}

// ─── Action bar ───────────────────────────────────────────────────────────────

function ActionBar({ tx }: { tx: Transaction }) {
  const [copiedRef,    setCopiedRef]    = useState(false)
  const [downloading,  setDownloading]  = useState(false)

  const handleCopyRef = useCallback(async () => {
    try { await navigator.clipboard.writeText(tx.reference) } catch { return }
    setCopiedRef(true)
    toast.success('Reference copied')
    setTimeout(() => setCopiedRef(false), 2000)
  }, [tx.reference])

  const handleShare = useCallback(async () => {
    const uiStatus = getUIStatus(tx.status)
    const cfg = STATUS_CFG[uiStatus]
    const text = [
      'Hive Data Transaction Receipt',
      '',
      `Service: ${TYPE_LABEL[tx.type] ?? tx.type}`,
      `Amount: ${fmtCurrency(tx.amount)}`,
      `Status: ${cfg.label}`,
      `Reference: ${tx.reference}`,
      `Date: ${fmtDateTime(tx.created_at)}`,
      '',
      'Support: support@hivedata.ng',
      'App: app.hivedata.ng',
    ].join('\n')

    if (Capacitor.isNativePlatform()) {
      try {
        await Share.share({ title: 'Transaction Receipt', text, dialogTitle: 'Share Receipt' })
      } catch { /* user cancelled */ }
      return
    }

    if (navigator.share) {
      try {
        await navigator.share({ title: 'Transaction Receipt', text })
        return
      } catch { /* user cancelled or share unavailable */ }
    }
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Receipt copied to clipboard')
    } catch {
      toast.error('Could not share receipt')
    }
  }, [tx])

  const handleDownload = useCallback(async () => {
    setDownloading(true)
    try {
      if (Capacitor.isNativePlatform()) {
        console.log('[Receipt] Fetching PDF for reference:', tx.reference)
        const { blob, filename } = await transactionsApi.fetchReceiptBlob(tx.reference)
        console.log('[Receipt] PDF fetched ok, size:', blob.size, 'bytes')

        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload  = () => resolve((reader.result as string).split(',')[1])
          reader.onerror = (e) => { console.error('[Receipt] FileReader error:', e); reject(e) }
          reader.readAsDataURL(blob)
        })
        console.log('[Receipt] Base64 encoded, length:', base64.length)

        const writeResult = await Filesystem.writeFile({
          path: filename,
          data: base64,
          directory: Directory.Cache,
        })
        console.log('[Receipt] Written to cache, uri:', writeResult.uri)

        await Share.share({
          title: 'Transaction Receipt',
          files: [writeResult.uri],
          dialogTitle: 'Save or Share Receipt',
        })
      } else {
        await transactionsApi.downloadReceipt(tx.reference)
      }
    } catch (err) {
      console.error('[Receipt] Download error:', err)
      const msg = err instanceof Error ? err.message : 'Could not generate receipt. Please try again.'
      toast.error(msg)
    } finally {
      setDownloading(false)
    }
  }, [tx.reference])

  const btn = 'flex-1 flex flex-col items-center justify-center gap-1.5 py-3.5 px-3 rounded-2xl bg-surface-2 hover:bg-border transition-colors text-ink-muted hover:text-ink disabled:opacity-50 disabled:cursor-not-allowed'

  return (
    <div className="rounded-3xl bg-surface-1 border border-border p-4">
      <div className="flex gap-3">
        <button onClick={handleCopyRef} className={btn} title="Copy reference">
          {copiedRef
            ? <Check className="h-5 w-5 text-success" />
            : <Copy className="h-5 w-5" />}
          <span className="text-[11px] font-semibold">{copiedRef ? 'Copied!' : 'Copy Ref'}</span>
        </button>

        <button onClick={handleShare} className={btn} title="Share receipt">
          <Share2 className="h-5 w-5" />
          <span className="text-[11px] font-semibold">Share</span>
        </button>

        <button
          onClick={handleDownload}
          disabled={downloading}
          className={btn}
          title="Download PDF receipt"
        >
          {downloading
            ? <Loader2 className="h-5 w-5 animate-spin" />
            : <Download className="h-5 w-5" />}
          <span className="text-[11px] font-semibold">
            {downloading ? 'Generating…' : 'Receipt PDF'}
          </span>
        </button>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function TransactionDetailPage() {
  const { reference } = useParams<{ reference: string }>()
  const navigate      = useNavigate()
  const { data: tx, isLoading, error, refetch } = useTransaction(reference ?? '')
  const [isDownloading, setIsDownloading] = useState(false)

  const handleReportDownload = useCallback(async (ref: string) => {
    setIsDownloading(true)
    try {
      await transactionsApi.downloadReport(ref)
    } catch (err) {
      if (isAxiosError(err) && err.response?.status === 422) {
        toast.error('Report is not available yet. Please try again later.')
      } else {
        toast.error('Could not download report. Please try again.')
      }
    } finally {
      setIsDownloading(false)
    }
  }, [])

  return (
    <div className="pt-2 pb-12 lg:max-w-lg lg:mx-auto">
      {/* Back button */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink mb-4 print:hidden"
      >
        <ArrowLeft className="h-4 w-4" />
        Transactions
      </button>

      {/* Print header (hidden on screen) */}
      <div className="hidden print:flex items-center gap-2 mb-6">
        <div className="h-7 w-7 rounded-lg bg-brand-600 flex items-center justify-center">
          <ArrowDownLeft className="h-4 w-4 text-white" />
        </div>
        <p className="text-base font-bold text-ink">Hive Data — Receipt</p>
      </div>

      {isLoading ? (
        <LoadingSkeleton />
      ) : error ? (
        <ErrorMessage error={error} onRetry={refetch} />
      ) : tx ? (
        <ReceiptContent
          tx={tx}
          isDownloading={isDownloading}
          onDownload={handleReportDownload}
        />
      ) : null}
    </div>
  )
}

// ─── Receipt layout ───────────────────────────────────────────────────────────

function ReceiptContent({
  tx,
  isDownloading,
  onDownload,
}: {
  tx: Transaction
  isDownloading: boolean
  onDownload: (ref: string) => void
}) {
  const uiStatus = getUIStatus(tx.status)
  const cfg      = STATUS_CFG[uiStatus]
  const amount   = getAmountDisplay(tx, uiStatus)
  const Icon     = TYPE_ICON[tx.type] ?? ArrowDownLeft
  const StatusIcon = cfg.StatusIcon
  const recipient  = getRecipient(tx)
  const provider   = getProvider(tx)
  const meta       = (tx.metadata ?? {}) as Record<string, unknown>
  const balBefore  = n(meta.balance_before ?? meta.previous_balance)
  const balAfter   = n(meta.balance_after  ?? meta.new_balance)

  return (
    <div className="space-y-3">

      {/* ── Hero card ────────────────────────────────────────────────────── */}
      <div className={cn(
        'rounded-3xl bg-gradient-to-b to-surface-1 border border-border overflow-hidden',
        cfg.heroBg,
      )}>
        <div className="flex flex-col items-center text-center pt-8 pb-6 px-6">

          {/* Service icon + status badge */}
          <div className="relative mb-4">
            <div className={cn(
              'h-16 w-16 rounded-2xl flex items-center justify-center shadow-sm',
              TYPE_BG[tx.type] ?? 'bg-surface-2',
            )}>
              <Icon className={cn('h-7 w-7', TYPE_COLOR[tx.type] ?? 'text-ink-muted')} />
            </div>
            {/* Status dot */}
            <div className={cn(
              'absolute -bottom-1 -right-1 h-6 w-6 rounded-full',
              'flex items-center justify-center',
              'ring-2 ring-surface-1',
              cfg.dotBg,
            )}>
              <StatusIcon className="h-3 w-3 text-white" />
            </div>
          </div>

          {/* Service label */}
          <p className="text-xs font-semibold text-ink-faint uppercase tracking-widest mb-2">
            {TYPE_LABEL[tx.type] ?? tx.type.replace(/_/g, ' ')}
          </p>

          {/* Amount */}
          <p className={cn('text-4xl font-black tracking-tight mb-3', amount.cls)}>
            {amount.prefix}{fmtCurrency(tx.amount, tx.currency)}
          </p>

          {/* Status pill */}
          <div className={cn(
            'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ring-1',
            cfg.pillBg, cfg.pillText, cfg.pillRing,
          )}>
            <span className={cn('h-1.5 w-1.5 rounded-full', cfg.dotBg)} />
            {cfg.label}
          </div>

          {/* Date */}
          <p className="text-xs text-ink-faint mt-2.5">
            {fmtDateTime(tx.created_at)}
          </p>
        </div>

        {/* Dashed divider — "receipt tear" */}
        <div className="relative px-0 -mb-px">
          <div className="border-t border-dashed border-border" />
          <div className="absolute -left-3 top-1/2 -translate-y-1/2 h-6 w-6 rounded-full bg-surface-0 border border-border" />
          <div className="absolute -right-3 top-1/2 -translate-y-1/2 h-6 w-6 rounded-full bg-surface-0 border border-border" />
        </div>

        {/* Details rows embedded in hero card */}
        <div className="divide-y divide-border">
          <DetailRow label="Service" value={tx.description || (TYPE_LABEL[tx.type] ?? '—')} />

          {recipient && (
            <DetailRow label="Recipient" value={recipient} />
          )}

          <DetailRow
            label="Reference"
            value={
              <span className="inline-flex items-center gap-1.5">
                <span className="font-mono text-xs text-ink-muted">{tx.reference}</span>
                <CopyBtn text={tx.reference} />
              </span>
            }
          />

          {provider && (
            <DetailRow label="Provider" value={provider} />
          )}

          {balBefore != null && (
            <DetailRow label="Prev Balance" value={
              <span className="text-ink-muted">{fmtCurrency(balBefore, tx.currency)}</span>
            } />
          )}

          {balAfter != null && (
            <DetailRow label="New Balance" value={
              <span className="font-semibold">{fmtCurrency(balAfter, tx.currency)}</span>
            } last={true} />
          )}
        </div>
      </div>

      {/* ── Service-specific card ─────────────────────────────────────── */}
      <ServiceCard
        tx={tx}
        isDownloading={isDownloading}
        onDownload={onDownload}
      />

      {/* ── Action bar ───────────────────────────────────────────────── */}
      <ActionBar tx={tx} />

    </div>
  )
}

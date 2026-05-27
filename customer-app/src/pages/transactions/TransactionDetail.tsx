import { useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Copy, Check, Zap, Download, Loader2, ShieldCheck } from 'lucide-react'
import { useTransaction } from '@/hooks/useTransactions'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { ErrorMessage } from '@/components/shared/ErrorMessage'
import { Skeleton, Card } from '@/components/ui'
import { fmtCurrency, fmtDateTime, normalizeTransactionStatus } from '@/utils/format'
import { apiClient } from '@/api/client'
import { isAxiosError } from 'axios'
import toast from 'react-hot-toast'

export function TransactionDetailPage() {
  const { reference } = useParams<{ reference: string }>()
  const navigate = useNavigate()
  const { data: tx, isLoading, error, refetch } = useTransaction(reference ?? '')
  const [isDownloading, setIsDownloading] = useState(false)

  const handleReportDownload = useCallback(async (ref: string) => {
    setIsDownloading(true)
    try {
      const resp = await apiClient.get(
        `/transactions/identity-verification/${ref}/report`,
        { responseType: 'blob' },
      )
      const blob   = new Blob([resp.data as BlobPart], { type: 'application/pdf' })
      const objUrl = URL.createObjectURL(blob)
      const a      = document.createElement('a')
      a.href       = objUrl
      a.download   = `verification-${ref}.pdf`
      a.click()
      URL.revokeObjectURL(objUrl)
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
    <div className="space-y-4 pt-2">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Transactions
      </button>

      {isLoading ? (
        <Card>
          <div className="space-y-3">
            <Skeleton className="h-6 w-32" />
            {[...Array(5)].map((_, i) => <div key={i} className="flex justify-between"><Skeleton className="h-4 w-24" /><Skeleton className="h-4 w-28" /></div>)}
          </div>
        </Card>
      ) : error ? (
        <ErrorMessage error={error} onRetry={refetch} />
      ) : tx ? (
        <>
          <Card>
            <div className="flex items-center justify-between mb-5">
              <p className="text-base font-semibold text-ink capitalize">{tx.type.replace(/_/g, ' ')}</p>
              <StatusBadge status={tx.status} />
            </div>
            <div className="divide-y divide-border rounded-xl border border-border overflow-hidden">
              {[
                { label: 'Amount',    value: fmtCurrency(tx.amount) },
                { label: 'Reference', value: <span className="font-mono text-xs">{tx.reference}</span> },
                { label: 'Date',      value: fmtDateTime(tx.created_at) },
                { label: 'Description', value: tx.description },
                ...(tx.phone ? [{ label: 'Phone', value: tx.phone }] : []),
              ].map(({ label, value }) => (
                <div key={label} className="flex items-start justify-between px-4 py-3 gap-4">
                  <span className="text-xs text-ink-muted shrink-0">{label}</span>
                  <span className="text-sm text-ink text-right">{value}</span>
                </div>
              ))}
            </div>
          </Card>

          <ElectricityTokenCard metadata={tx.metadata} />

          {tx.type === 'identity_verification' && normalizeTransactionStatus(tx.status) === 'success' && (
            <IdentityReportCard
              reference={tx.reference}
              isDownloading={isDownloading}
              onDownload={handleReportDownload}
            />
          )}
        </>
      ) : null}
    </div>
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard API unavailable */ }
  }, [text])
  return (
    <button
      onClick={handleCopy}
      className="p-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 transition-colors"
      title="Copy token"
    >
      {copied
        ? <Check className="h-4 w-4 text-amber-500" />
        : <Copy className="h-4 w-4 text-amber-500" />}
    </button>
  )
}

function ElectricityTokenCard({ metadata }: { metadata?: Record<string, unknown> }) {
  const provResp = metadata?.provider_response as Record<string, unknown> | undefined
  const token    = provResp?.token         as string | undefined
  const units    = provResp?.units         as string | number | undefined
  const customer = provResp?.customer_name as string | undefined
  const meter    = provResp?.meter_number  as string | undefined
  const address  = provResp?.address       as string | undefined
  const orderId  = provResp?.provider_order_id as string | undefined

  if (!token) return null

  return (
    <Card>
      <div className="flex items-center gap-2 mb-4">
        <div className="h-8 w-8 rounded-lg bg-amber-50 flex items-center justify-center">
          <Zap className="h-4 w-4 text-amber-600" />
        </div>
        <p className="text-sm font-semibold text-ink">Electricity Token</p>
      </div>

      <div className="rounded-xl bg-amber-50 border border-amber-200 p-4">
        <p className="text-[10px] text-amber-600 font-semibold uppercase tracking-widest mb-1.5">Token</p>
        <div className="flex items-center justify-between gap-3">
          <p className="font-mono text-base font-bold text-amber-800 tracking-widest break-all leading-snug">
            {token}
          </p>
          <CopyButton text={token} />
        </div>
        {units != null && (
          <div className="mt-2">
            <span className="inline-block rounded-full bg-amber-100 border border-amber-300 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
              {units} units
            </span>
          </div>
        )}
      </div>

      {(customer || meter || address || orderId) && (
        <div className="mt-3 divide-y divide-border rounded-xl border border-border overflow-hidden">
          {customer && (
            <div className="flex items-start justify-between px-4 py-3 gap-4">
              <span className="text-xs text-ink-muted shrink-0">Customer</span>
              <span className="text-sm text-ink text-right">{customer}</span>
            </div>
          )}
          {meter && (
            <div className="flex items-start justify-between px-4 py-3 gap-4">
              <span className="text-xs text-ink-muted shrink-0">Meter</span>
              <span className="text-sm font-mono text-ink text-right">{meter}</span>
            </div>
          )}
          {address && (
            <div className="flex items-start justify-between px-4 py-3 gap-4">
              <span className="text-xs text-ink-muted shrink-0">Address</span>
              <span className="text-sm text-ink text-right">{address}</span>
            </div>
          )}
          {orderId && (
            <div className="flex items-start justify-between px-4 py-3 gap-4">
              <span className="text-xs text-ink-muted shrink-0">Order ID</span>
              <span className="text-sm font-mono text-xs text-ink-muted text-right">{orderId}</span>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}

function IdentityReportCard({
  reference,
  isDownloading,
  onDownload,
}: {
  reference: string
  isDownloading: boolean
  onDownload: (ref: string) => void
}) {
  return (
    <Card>
      <div className="flex items-center gap-2 mb-4">
        <div className="h-8 w-8 rounded-lg bg-indigo-50 flex items-center justify-center">
          <ShieldCheck className="h-4 w-4 text-indigo-600" />
        </div>
        <p className="text-sm font-semibold text-ink">Identity Verification Report</p>
      </div>
      <button
        onClick={() => onDownload(reference)}
        disabled={isDownloading}
        className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border-2 border-indigo-300 text-indigo-700 text-sm font-semibold hover:bg-indigo-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isDownloading
          ? <Loader2 className="h-4 w-4 animate-spin" />
          : <Download className="h-4 w-4" />}
        {isDownloading ? 'Downloading…' : 'Download Report'}
      </button>
    </Card>
  )
}

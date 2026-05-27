import { Modal, Button } from '@/components/ui'
import { CheckCircle2, XCircle, Clock, RefreshCw, Home, History, Loader2, Search, Copy, Check, Download, ShieldCheck } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useState, useCallback } from 'react'
import { fmtCurrency, normalizeTransactionStatus } from '@/utils/format'
import { apiClient } from '@/api/client'
import { isAxiosError } from 'axios'
import type { Transaction } from '@/types'

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard API unavailable
    }
  }, [text])
  return (
    <button
      onClick={handleCopy}
      className="ml-2 p-1 rounded hover:bg-black/10 transition-colors"
      title="Copy"
    >
      {copied
        ? <Check className="h-3.5 w-3.5 text-green-600" />
        : <Copy className="h-3.5 w-3.5 text-ink-faint" />}
    </button>
  )
}

interface ResultModalProps {
  open: boolean
  transaction: Transaction | null
  isPolling?: boolean
  onClose: () => void
  onRetry?: () => void
}

export function ResultModal({ open, transaction, isPolling = false, onClose, onRetry }: ResultModalProps) {
  const navigate = useNavigate()
  const [isDownloading, setIsDownloading] = useState(false)

  const handleReportDownload = useCallback(async () => {
    if (!transaction) return
    setIsDownloading(true)
    try {
      const resp = await apiClient.get(
        `/transactions/identity-verification/${transaction.reference}/report`,
        { responseType: 'blob' },
      )
      const blob   = new Blob([resp.data as BlobPart], { type: 'application/pdf' })
      const objUrl = URL.createObjectURL(blob)
      const a      = document.createElement('a')
      a.href       = objUrl
      a.download   = `verification-${transaction.reference}.pdf`
      a.click()
      URL.revokeObjectURL(objUrl)
    } catch (err) {
      // 422 = not ready yet; other errors are transient — both silently swallowed
      // so the modal stays open and the user can retry.
      if (!isAxiosError(err)) console.error('Report download error', err)
    } finally {
      setIsDownloading(false)
    }
  }, [transaction])

  const uiStatus  = normalizeTransactionStatus(transaction?.status)
  const isSuccess = uiStatus === 'success'
  const isPending = uiStatus === 'pending'
  const isReview  = uiStatus === 'review'
  // Polling timed out without a final status — user needs to check history
  const isTimedOut = isPending && !isPolling

  return (
    <Modal open={open} locked size="sm">
      <div className="flex flex-col items-center text-center py-2">
        {isSuccess ? (
          <div className="h-16 w-16 rounded-full bg-success-light flex items-center justify-center mb-4">
            <CheckCircle2 className="h-8 w-8 text-success" />
          </div>
        ) : isReview ? (
          <div className="h-16 w-16 rounded-full bg-blue-50 flex items-center justify-center mb-4">
            <Search className="h-8 w-8 text-blue-500" />
          </div>
        ) : isPending ? (
          <div className="h-16 w-16 rounded-full bg-amber-50 flex items-center justify-center mb-4">
            {isPolling ? (
              <Loader2 className="h-8 w-8 text-amber-500 animate-spin" />
            ) : (
              <Clock className="h-8 w-8 text-amber-500" />
            )}
          </div>
        ) : (
          <div className="h-16 w-16 rounded-full bg-danger-light flex items-center justify-center mb-4">
            <XCircle className="h-8 w-8 text-danger" />
          </div>
        )}

        <p className="text-lg font-bold text-ink mb-1">
          {isSuccess
            ? 'Transaction Successful'
            : isReview
              ? 'Transaction Under Review'
              : isPolling
                ? 'Processing Transaction…'
                : isPending
                  ? 'Still Processing'
                  : 'Transaction Failed'}
        </p>

        {transaction && (
          <p className="text-sm text-ink-muted mb-1">
            {fmtCurrency(transaction.amount)}
          </p>
        )}

        {transaction && (
          <p className="text-xs text-ink-faint font-mono mb-6">
            Ref: {transaction.reference}
          </p>
        )}

        {!isSuccess && !isPending && !isReview && !!transaction?.metadata?.message && (
          <p className="text-xs text-danger-400 mb-4">
            {String(transaction.metadata.message)}
          </p>
        )}

        {isSuccess && (() => {
          const provResp = transaction?.metadata?.provider_response as Record<string, unknown> | undefined
          const token = provResp?.token as string | undefined
          const units = provResp?.units as string | number | undefined
          if (token) {
            return (
              <div className="w-full mb-4 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-left">
                <p className="text-xs font-medium text-amber-700 mb-1">Electricity Token</p>
                <p className="text-sm font-mono font-bold text-amber-900 tracking-widest break-all">{token}</p>
                {units != null && (
                  <p className="text-xs text-amber-700 mt-1">{units} units</p>
                )}
              </div>
            )
          }
          const cablePackage = (provResp?.package ?? provResp?.Package ?? provResp?.Bouquet ?? provResp?.bouquet) as string | undefined
          const cableCustomer = (provResp?.Customer_Name ?? provResp?.customer_name) as string | undefined
          const cableDue = (provResp?.Due_Date ?? provResp?.due_date) as string | undefined
          if (cablePackage || cableCustomer) {
            return (
              <div className="w-full mb-4 rounded-xl bg-purple-50 border border-purple-200 px-4 py-3 text-left space-y-1">
                {cableCustomer && (
                  <div className="flex justify-between text-xs">
                    <span className="text-purple-700 font-medium">Customer</span>
                    <span className="text-purple-900">{cableCustomer}</span>
                  </div>
                )}
                {cablePackage && (
                  <div className="flex justify-between text-xs">
                    <span className="text-purple-700 font-medium">Package</span>
                    <span className="text-purple-900">{cablePackage}</span>
                  </div>
                )}
                {cableDue && (
                  <div className="flex justify-between text-xs">
                    <span className="text-purple-700 font-medium">Due Date</span>
                    <span className="text-purple-900">{cableDue}</span>
                  </div>
                )}
              </div>
            )
          }

          // WAEC: carddetails with serial numbers distinguish it from JAMB
          type CardEntry = { pin?: string; Pin?: string; serial?: string; Serial?: string }
          const examCards = (provResp?.carddetails ?? provResp?.pins) as CardEntry[] | undefined
          const hasSerial = examCards?.some(c => !!(c.Serial ?? c.serial))
          if (examCards && examCards.length > 0 && hasSerial) {
            return (
              <div className="w-full mb-4 rounded-xl bg-blue-50 border border-blue-200 px-4 py-3 text-left space-y-3">
                <p className="text-xs font-semibold text-blue-700">WAEC PIN{examCards.length > 1 ? 's' : ''}</p>
                {examCards.map((card, i) => {
                  const pin    = card.Pin    ?? card.pin    ?? ''
                  const serial = card.Serial ?? card.serial ?? ''
                  return (
                    <div key={i} className="space-y-1">
                      {pin && (
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-[10px] text-blue-600 font-medium uppercase tracking-wide">PIN</p>
                            <p className="text-sm font-mono font-bold text-blue-900 tracking-widest">{pin}</p>
                          </div>
                          <CopyButton text={pin} />
                        </div>
                      )}
                      {serial && (
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-[10px] text-blue-600 font-medium uppercase tracking-wide">Serial</p>
                            <p className="text-xs font-mono text-blue-800">{serial}</p>
                          </div>
                          <CopyButton text={serial} />
                        </div>
                      )}
                      {i < examCards.length - 1 && <hr className="border-blue-200" />}
                    </div>
                  )
                })}
              </div>
            )
          }

          // JAMB: root pin (entries in carddetails have no serial numbers)
          const jambPin         = (provResp?.pin ?? provResp?.Pin) as string | undefined
          const jambProfileCode = (provResp?.profile_code ?? provResp?.ProfileCode) as string | undefined
          if (jambPin || jambProfileCode) {
            return (
              <div className="w-full mb-4 rounded-xl bg-green-50 border border-green-200 px-4 py-3 text-left space-y-2">
                <p className="text-xs font-semibold text-green-700">JAMB Details</p>
                {jambPin && (
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[10px] text-green-600 font-medium uppercase tracking-wide">PIN</p>
                      <p className="text-sm font-mono font-bold text-green-900 tracking-widest">{jambPin}</p>
                    </div>
                    <CopyButton text={jambPin} />
                  </div>
                )}
                {jambProfileCode && (
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[10px] text-green-600 font-medium uppercase tracking-wide">Profile Code</p>
                      <p className="text-xs font-mono text-green-800">{jambProfileCode}</p>
                    </div>
                    <CopyButton text={jambProfileCode} />
                  </div>
                )}
              </div>
            )
          }

          // Identity verification result
          if (transaction?.type === 'identity_verification') {
            const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
            const txMeta     = (transaction.metadata ?? {}) as Record<string, unknown>
            const rd         = (txMeta.report_data ?? {}) as Record<string, unknown>
            const pd         = ((provResp as Record<string, unknown> | undefined)?.data ?? {}) as Record<string, unknown>
            const firstName  = s(rd.first_name  ?? pd.first_name)
            const lastName   = s(rd.last_name   ?? pd.last_name)
            const middleName = s(rd.middle_name ?? pd.middle_name)
            const dob        = s(rd.date_of_birth ?? pd.date_of_birth)
            const gender     = s(rd.gender ?? pd.gender)
            const fullName   = [firstName, middleName, lastName].filter(Boolean).join(' ')
            const idType     = (s(rd.id_type).toUpperCase() || 'ID')
            const idNum      = s(rd.id_number ?? pd.nin ?? pd.bvn)
            return (
              <div className="w-full mb-4 space-y-3">
                <div className="rounded-xl bg-indigo-50 border border-indigo-200 px-4 py-3 text-left space-y-2">
                  <div className="flex items-center gap-2 mb-1">
                    <ShieldCheck className="h-4 w-4 text-indigo-600" />
                    <p className="text-xs font-semibold text-indigo-700">Verification Result</p>
                  </div>
                  {fullName && (
                    <div className="flex justify-between text-xs">
                      <span className="text-indigo-600 font-medium">Full Name</span>
                      <span className="text-indigo-900 font-semibold">{fullName}</span>
                    </div>
                  )}
                  {dob && (
                    <div className="flex justify-between text-xs">
                      <span className="text-indigo-600 font-medium">Date of Birth</span>
                      <span className="text-indigo-900">{dob}</span>
                    </div>
                  )}
                  {gender && (
                    <div className="flex justify-between text-xs">
                      <span className="text-indigo-600 font-medium">Gender</span>
                      <span className="text-indigo-900 capitalize">{gender}</span>
                    </div>
                  )}
                  {idNum && (
                    <div className="flex justify-between text-xs">
                      <span className="text-indigo-600 font-medium">{idType || 'ID'}</span>
                      <span className="text-indigo-900 font-mono">{idNum}</span>
                    </div>
                  )}
                </div>
                <button
                  onClick={handleReportDownload}
                  disabled={isDownloading}
                  className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border-2 border-indigo-300 text-indigo-700 text-sm font-semibold hover:bg-indigo-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isDownloading
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <Download className="h-4 w-4" />}
                  {isDownloading ? 'Downloading…' : 'Download Report'}
                </button>
              </div>
            )
          }

          return null
        })()}

        {isPolling && (
          <p className="text-xs text-ink-muted mb-4">
            Waiting for confirmation. This usually takes a few seconds…
          </p>
        )}

        {isTimedOut && (
          <p className="text-xs text-ink-muted mb-4">
            Your transaction is still being confirmed. Check Transaction History shortly.
          </p>
        )}

        {isReview && (
          <p className="text-xs text-ink-muted mb-4">
            We couldn't confirm your transaction automatically. Our team is reviewing it and you'll be notified of the outcome.
          </p>
        )}

        <div className="flex gap-3 w-full">
          {!isSuccess && !isPending && !isReview && onRetry && (
            <Button variant="outline" fullWidth onClick={onRetry} icon={<RefreshCw className="h-4 w-4" />}>
              Try Again
            </Button>
          )}
          {(isTimedOut || isReview) && (
            <Button
              variant="outline"
              fullWidth
              onClick={() => { onClose(); navigate('/transactions') }}
              icon={<History className="h-4 w-4" />}
            >
              View History
            </Button>
          )}
          <Button
            variant={isSuccess ? 'primary' : 'secondary'}
            fullWidth
            disabled={isPolling}
            onClick={() => { onClose(); navigate('/dashboard') }}
            icon={<Home className="h-4 w-4" />}
          >
            Home
          </Button>
        </div>
      </div>
    </Modal>
  )
}

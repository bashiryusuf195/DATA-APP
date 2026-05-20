import { Modal, Button } from '@/components/ui'
import { CheckCircle2, XCircle, Clock, RefreshCw, Home, History, Loader2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { fmtCurrency, normalizeTransactionStatus } from '@/utils/format'
import type { Transaction } from '@/types'

interface ResultModalProps {
  open: boolean
  transaction: Transaction | null
  isPolling?: boolean
  onClose: () => void
  onRetry?: () => void
}

export function ResultModal({ open, transaction, isPolling = false, onClose, onRetry }: ResultModalProps) {
  const navigate = useNavigate()

  const uiStatus = normalizeTransactionStatus(transaction?.status)
  const isSuccess = uiStatus === 'success'
  const isPending = uiStatus === 'pending'
  // Polling timed out without a final status — user needs to check history
  const isTimedOut = isPending && !isPolling

  return (
    <Modal open={open} locked size="sm">
      <div className="flex flex-col items-center text-center py-2">
        {isSuccess ? (
          <div className="h-16 w-16 rounded-full bg-success-light flex items-center justify-center mb-4">
            <CheckCircle2 className="h-8 w-8 text-success" />
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

        {!isSuccess && !isPending && !!transaction?.metadata?.message && (
          <p className="text-xs text-danger-400 mb-4">
            {String(transaction.metadata.message)}
          </p>
        )}

        {isPolling && (
          <p className="text-xs text-ink-muted mb-4">
            Waiting for confirmation. This usually takes a few seconds…
          </p>
        )}

        {isTimedOut && (
          <p className="text-xs text-ink-muted mb-4">
            Your transaction is still being processed. Check Transaction History for the final status.
          </p>
        )}

        <div className="flex gap-3 w-full">
          {!isSuccess && !isPending && onRetry && (
            <Button variant="outline" fullWidth onClick={onRetry} icon={<RefreshCw className="h-4 w-4" />}>
              Try Again
            </Button>
          )}
          {isTimedOut && (
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

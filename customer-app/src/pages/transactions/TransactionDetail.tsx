import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useTransaction } from '@/hooks/useTransactions'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { ErrorMessage } from '@/components/shared/ErrorMessage'
import { Skeleton, Card } from '@/components/ui'
import { fmtCurrency, fmtDateTime } from '@/utils/format'

export function TransactionDetailPage() {
  const { reference } = useParams<{ reference: string }>()
  const navigate = useNavigate()
  const { data: tx, isLoading, error, refetch } = useTransaction(reference ?? '')

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
      ) : null}
    </div>
  )
}

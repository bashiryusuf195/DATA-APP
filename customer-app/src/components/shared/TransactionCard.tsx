import { Link } from 'react-router-dom'
import {
  Phone, Wifi, Zap, Tv, FileText, ShieldCheck,
  ArrowDownLeft, ArrowUpRight,
} from 'lucide-react'
import { cn } from '@/utils/cn'
import { fmtCurrency, fmtRelativeTime } from '@/utils/format'
import { StatusBadge } from './StatusBadge'
import type { Transaction } from '@/types'

const TYPE_ICON: Record<string, React.FC<{ className?: string }>> = {
  airtime:               Phone,
  data:                  Wifi,
  electricity:           Zap,
  cable_tv:              Tv,
  exam_pin:              FileText,
  identity_verification: ShieldCheck,
  wallet_funding:        ArrowDownLeft,
  transfer:              ArrowUpRight,
}

const TYPE_LABEL: Record<string, string> = {
  airtime:               'Airtime',
  data:                  'Data',
  electricity:           'Electricity',
  cable_tv:              'Cable TV',
  exam_pin:              'Exam PIN',
  identity_verification: 'Identity',
  wallet_funding:        'Funding',
  transfer:              'Transfer',
}

interface TransactionCardProps {
  tx: Transaction
  compact?: boolean
}

export function TransactionCard({ tx, compact = false }: TransactionCardProps) {
  const Icon = TYPE_ICON[tx.type] ?? ArrowUpRight
  const isCredit = tx.type === 'wallet_funding'

  return (
    <Link
      to={`/transactions/${tx.reference}`}
      className="flex items-center gap-3.5 py-3.5 px-4 hover:bg-surface-2 rounded-xl transition-colors group"
    >
      {/* Icon */}
      <div className="h-10 w-10 rounded-xl bg-brand-50 flex items-center justify-center shrink-0">
        <Icon className="h-4.5 w-4.5 text-brand-600" />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-ink truncate">
          {TYPE_LABEL[tx.type] ?? tx.type}
        </p>
        <p className="text-xs text-ink-muted truncate mt-0.5">
          {tx.description}
        </p>
      </div>

      {/* Amount + status */}
      <div className="text-right shrink-0">
        <p className={cn(
          'text-sm font-semibold',
          isCredit ? 'text-success' : 'text-ink'
        )}>
          {isCredit ? '+' : '-'}{fmtCurrency(tx.amount)}
        </p>
        {!compact && (
          <p className="text-[10px] text-ink-faint mt-0.5">{fmtRelativeTime(tx.created_at)}</p>
        )}
        {compact && <StatusBadge status={tx.status} />}
      </div>
    </Link>
  )
}

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
  wallet_funding:        'Wallet Funding',
  transfer:              'Transfer',
}

// Icon bg color per service type
const TYPE_BG: Record<string, string> = {
  airtime:               'bg-emerald-100',
  data:                  'bg-blue-100',
  electricity:           'bg-amber-100',
  cable_tv:              'bg-purple-100',
  exam_pin:              'bg-rose-100',
  identity_verification: 'bg-brand-100',
  wallet_funding:        'bg-teal-100',
  transfer:              'bg-surface-2',
}

const TYPE_COLOR: Record<string, string> = {
  airtime:               'text-emerald-600',
  data:                  'text-blue-600',
  electricity:           'text-amber-600',
  cable_tv:              'text-purple-600',
  exam_pin:              'text-rose-600',
  identity_verification: 'text-brand-600',
  wallet_funding:        'text-teal-600',
  transfer:              'text-ink-muted',
}

interface TransactionCardProps {
  tx: Transaction
  compact?: boolean
}

export function TransactionCard({ tx, compact = false }: TransactionCardProps) {
  const Icon     = TYPE_ICON[tx.type]  ?? ArrowUpRight
  const iconBg   = TYPE_BG[tx.type]   ?? 'bg-surface-2'
  const iconClr  = TYPE_COLOR[tx.type] ?? 'text-ink-muted'
  const isCredit = tx.type === 'wallet_funding'

  return (
    <Link
      to={`/transactions/${tx.reference}`}
      className="flex items-center gap-3.5 py-3.5 px-4 hover:bg-surface-2/70 transition-colors"
    >
      {/* Circular icon */}
      <div className={cn('h-10 w-10 rounded-full flex items-center justify-center shrink-0', iconBg)}>
        <Icon className={cn('h-4.5 w-4.5', iconClr)} />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-ink truncate">
          {TYPE_LABEL[tx.type] ?? tx.type}
        </p>
        <p className="text-xs text-ink-faint truncate mt-0.5">
          {tx.description}
        </p>
      </div>

      {/* Amount + time/status */}
      <div className="text-right shrink-0">
        <p className={cn(
          'text-sm font-bold',
          isCredit ? 'text-success' : 'text-danger'
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

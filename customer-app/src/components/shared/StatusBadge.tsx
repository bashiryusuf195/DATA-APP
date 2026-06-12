import { Badge } from '@/components/ui'
import type { TransactionStatus } from '@/types'

const STATUS_MAP: Record<TransactionStatus, { label: string; variant: 'success' | 'warning' | 'danger' | 'muted' | 'info' }> = {
  successful:      { label: 'Success',      variant: 'success' },
  success:         { label: 'Success',      variant: 'success' }, // legacy
  pending:         { label: 'Pending',      variant: 'warning' },
  processing:      { label: 'Processing',   variant: 'info' },
  failed:          { label: 'Failed',       variant: 'danger' },
  cancelled:       { label: 'Cancelled',    variant: 'muted' },
  reversed:        { label: 'Reversed',     variant: 'muted' },
  requires_review: { label: 'Under Review', variant: 'warning' },
}

export function StatusBadge({ status }: { status: TransactionStatus }) {
  const { label, variant } = STATUS_MAP[status] ?? { label: status, variant: 'muted' as const }
  return <Badge variant={variant}>{label}</Badge>
}

import { Badge } from '@/components/ui'
import type { TransactionStatus, FundingStatus, ProviderHealthStatus } from '@/types'

export function TransactionStatusBadge({ status }: { status: TransactionStatus }) {
  const map: Record<TransactionStatus, { label: string; variant: 'success' | 'warning' | 'danger' | 'info' | 'neutral' }> = {
    successful: { label: 'Successful', variant: 'success' },
    pending:    { label: 'Pending',    variant: 'warning' },
    processing: { label: 'Processing', variant: 'info' },
    failed:     { label: 'Failed',     variant: 'danger' },
    refunded:   { label: 'Refunded',   variant: 'neutral' },
  }
  const { label, variant } = map[status] ?? { label: status, variant: 'neutral' as const }
  return <Badge variant={variant} dot>{label}</Badge>
}

export function FundingStatusBadge({ status }: { status: FundingStatus }) {
  const map: Record<FundingStatus, { label: string; variant: 'success' | 'warning' | 'danger' | 'neutral' }> = {
    successful: { label: 'Funded',    variant: 'success' },
    pending:    { label: 'Pending',   variant: 'warning' },
    failed:     { label: 'Failed',    variant: 'danger' },
    abandoned:  { label: 'Abandoned', variant: 'neutral' },
  }
  const { label, variant } = map[status] ?? { label: status, variant: 'neutral' as const }
  return <Badge variant={variant} dot>{label}</Badge>
}

export function ProviderHealthBadge({ status }: { status: ProviderHealthStatus }) {
  const map: Record<ProviderHealthStatus, { label: string; variant: 'success' | 'warning' | 'danger' }> = {
    healthy:   { label: 'Healthy',   variant: 'success' },
    degraded:  { label: 'Degraded',  variant: 'warning' },
    unhealthy: { label: 'Unhealthy', variant: 'danger' },
  }
  const { label, variant } = map[status] ?? { label: status, variant: 'danger' as const }
  return <Badge variant={variant} dot>{label}</Badge>
}

export function CircuitBadge({ open }: { open: boolean }) {
  return open
    ? <Badge variant="danger" dot>Circuit Open</Badge>
    : <Badge variant="success" dot>Circuit Closed</Badge>
}

export function BoolBadge({ value, trueLabel = 'Yes', falseLabel = 'No' }: { value: boolean; trueLabel?: string; falseLabel?: string }) {
  return value
    ? <Badge variant="success">{trueLabel}</Badge>
    : <Badge variant="neutral">{falseLabel}</Badge>
}

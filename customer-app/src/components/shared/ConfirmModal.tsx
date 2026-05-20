import { Modal, Button } from '@/components/ui'
import { AlertTriangle } from 'lucide-react'
import type { ReactNode } from 'react'

interface ConfirmRow {
  label: string
  value: ReactNode
}

interface ConfirmModalProps {
  open: boolean
  title?: string
  rows: ConfirmRow[]
  confirmLabel?: string
  onConfirm: () => void
  onCancel: () => void
  loading?: boolean
}

export function ConfirmModal({
  open,
  title = 'Confirm Purchase',
  rows,
  confirmLabel = 'Pay Now',
  onConfirm,
  onCancel,
  loading = false,
}: ConfirmModalProps) {
  return (
    <Modal open={open} title={title} onClose={onCancel} locked={loading}>
      {/* Warning banner */}
      <div className="flex items-start gap-2.5 p-3 rounded-xl bg-warning-light mb-4">
        <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
        <p className="text-xs text-warning font-medium">
          This transaction cannot be undone. Please review the details carefully.
        </p>
      </div>

      {/* Summary rows */}
      <div className="divide-y divide-border rounded-xl border border-border overflow-hidden mb-5">
        {rows.map(({ label, value }) => (
          <div key={label} className="flex items-center justify-between px-4 py-3">
            <span className="text-xs text-ink-muted">{label}</span>
            <span className="text-sm font-medium text-ink">{value}</span>
          </div>
        ))}
      </div>

      <div className="flex gap-3">
        <Button variant="outline" fullWidth onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
        <Button variant="primary" fullWidth loading={loading} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  )
}

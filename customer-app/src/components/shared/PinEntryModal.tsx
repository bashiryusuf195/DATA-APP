import { useState, useEffect } from 'react'
import { Lock, AlertCircle, Fingerprint } from 'lucide-react'
import { Modal, Button } from '@/components/ui'
import { PinPad } from '@/components/shared/PinPad'

interface PinEntryModalProps {
  open:     boolean
  loading?: boolean
  error?:   string | null
  /** True when the user arrived here after a biometric attempt failed/was cancelled. */
  biometricFallback?: boolean
  onSubmit: (pin: string) => void
  onCancel: () => void
}

function pinErrorLabel(error: string): string {
  if (error.includes('not set') || error.includes('NOT_SET'))
    return 'You have not set a transaction PIN yet. Please set one in Settings → Transaction PIN.'
  if (error.includes('locked') || error.includes('LOCKED'))
    return error
  if (error.includes('Incorrect') || error.includes('INVALID'))
    return 'Incorrect PIN. Please try again.'
  return error
}

export function PinEntryModal({
  open,
  loading = false,
  error,
  biometricFallback = false,
  onSubmit,
  onCancel,
}: PinEntryModalProps) {
  const [pin, setPin] = useState('')

  useEffect(() => {
    if (open) setPin('')
  }, [open])

  const isValid = /^\d{4}$|^\d{6}$/.test(pin)

  const handleSubmit = () => {
    if (!isValid || loading) return
    onSubmit(pin)
  }

  return (
    <Modal open={open} title="Transaction PIN" onClose={!loading ? onCancel : undefined} locked={loading} size="sm">
      <div className="space-y-5">
        <div className="flex flex-col items-center gap-2 py-1">
          <div className="h-12 w-12 rounded-2xl bg-brand-50 dark:bg-brand-950/40 flex items-center justify-center mb-1">
            <Lock className="h-6 w-6 text-brand-600" />
          </div>
          <p className="text-sm text-ink-muted text-center">
            Enter your 4 or 6 digit PIN to authorise this transaction.
          </p>
        </div>

        {biometricFallback && !error && (
          <div className="flex items-start gap-2 rounded-xl bg-surface-2 border border-border px-3 py-2.5">
            <Fingerprint className="h-4 w-4 text-ink-faint shrink-0 mt-0.5" />
            <p className="text-xs text-ink-muted">
              Biometric verification was not completed. Enter your PIN to continue.
            </p>
          </div>
        )}

        <PinPad value={pin} onChange={setPin} maxLength={6} disabled={loading} />

        {error && (
          <div className="flex items-start gap-2 rounded-xl bg-danger/10 border border-danger/20 px-3 py-2.5">
            <AlertCircle className="h-4 w-4 text-danger shrink-0 mt-0.5" />
            <p className="text-xs text-danger">{pinErrorLabel(error)}</p>
          </div>
        )}

        <div className="flex gap-3">
          <Button
            type="button"
            variant="outline"
            fullWidth
            onClick={onCancel}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            fullWidth
            loading={loading}
            disabled={!isValid}
            onClick={handleSubmit}
          >
            Confirm
          </Button>
        </div>
      </div>
    </Modal>
  )
}

import { useState } from 'react'
import { ShieldCheck, AlertCircle, ArrowLeft } from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import { Modal, Button } from '@/components/ui'
import { PinPad } from '@/components/shared/PinPad'
import { pinApi } from '@/api/pin.api'

interface PinSetupModalProps {
  onSuccess: () => void
  onDismiss: () => void
}

const WEAK = new Set([
  '0000','1111','2222','3333','4444','5555','6666','7777','8888','9999',
  '1234','2345','3456','4567','5678','6789','0987','9876','1212','0101',
  '000000','111111','222222','333333','444444','555555','666666','777777',
  '888888','999999','123456','234567','345678','456789','987654','876543',
])

const isValidLength = (p: string) => /^\d{4}$|^\d{6}$/.test(p)

export function PinSetupModal({ onSuccess, onDismiss }: PinSetupModalProps) {
  const [step,    setStep]    = useState<'set' | 'confirm'>('set')
  const [pin,     setPin]     = useState('')
  const [confirm, setConfirm] = useState('')
  const [err,     setErr]     = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: () => pinApi.setup(pin),
    onSuccess,
    onError: (e: Error) => setErr(e.message),
  })

  // ── Step 1: enter new PIN ────────────────────────────────────────────────────

  const goToConfirm = () => {
    if (!isValidLength(pin))  { setErr('PIN must be exactly 4 or 6 digits.'); return }
    if (WEAK.has(pin))        { setErr('This PIN is too easy to guess. Choose a less predictable combination.'); return }
    setErr(null)
    setConfirm('')
    setStep('confirm')
  }

  // ── Step 2: confirm PIN ──────────────────────────────────────────────────────

  const handleSubmit = () => {
    if (!isValidLength(confirm))  { setErr('PIN must be exactly 4 or 6 digits.'); return }
    if (confirm !== pin)          { setErr('PINs do not match. Please try again.'); return }
    setErr(null)
    mutation.mutate()
  }

  // ── Reset to step 1 ──────────────────────────────────────────────────────────

  const backToSet = () => {
    setStep('set')
    setConfirm('')
    setErr(null)
  }

  // ── Common ────────────────────────────────────────────────────────────────────

  const isLoading = mutation.isPending

  return (
    <Modal
      open
      title="Secure Your Account"
      size="sm"
      locked={isLoading}
    >
      <div className="space-y-5">
        {/* Icon + description */}
        <div className="flex flex-col items-center gap-2 pb-1">
          <div className="h-14 w-14 rounded-2xl bg-brand-50 dark:bg-brand-950/40 flex items-center justify-center">
            <ShieldCheck className="h-7 w-7 text-brand-600" />
          </div>
          <p className="text-sm text-ink-muted text-center leading-relaxed">
            {step === 'set'
              ? 'Create a 4 or 6 digit PIN. You\'ll need it every time you make a purchase.'
              : 'Re-enter your PIN to confirm.'}
          </p>
        </div>

        {/* Step label */}
        <p className="text-xs font-semibold text-center text-ink-faint">
          {step === 'set' ? 'NEW PIN' : 'CONFIRM PIN'}
        </p>

        {/* PinPad */}
        {step === 'set' ? (
          <PinPad
            value={pin}
            onChange={(v) => { setPin(v); setErr(null) }}
            maxLength={6}
            disabled={isLoading}
          />
        ) : (
          <PinPad
            value={confirm}
            onChange={(v) => { setConfirm(v); setErr(null) }}
            maxLength={pin.length as 4 | 6}
            disabled={isLoading}
          />
        )}

        {/* Error */}
        {err && (
          <div className="flex items-start gap-2 rounded-xl bg-danger/10 border border-danger/20 px-3 py-2.5">
            <AlertCircle className="h-4 w-4 text-danger shrink-0 mt-0.5" />
            <p className="text-xs text-danger">{err}</p>
          </div>
        )}

        {/* CTA buttons */}
        {step === 'set' ? (
          <>
            <Button
              type="button"
              fullWidth
              size="lg"
              disabled={pin.length < 4}
              onClick={goToConfirm}
            >
              Continue
            </Button>
            <p className="text-center text-xs text-ink-faint">
              You won't be able to make purchases without a PIN.{' '}
              <button
                type="button"
                className="underline hover:text-ink-muted transition-colors"
                onClick={onDismiss}
              >
                Set up later
              </button>
            </p>
          </>
        ) : (
          <div className="flex gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={backToSet}
              disabled={isLoading}
              icon={<ArrowLeft className="h-4 w-4" />}
            >
              Back
            </Button>
            <Button
              type="button"
              fullWidth
              size="lg"
              loading={isLoading}
              disabled={confirm.length < 4}
              onClick={handleSubmit}
            >
              Set Transaction PIN
            </Button>
          </div>
        )}
      </div>
    </Modal>
  )
}

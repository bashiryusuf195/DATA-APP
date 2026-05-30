import { useState } from 'react'
import { ShieldCheck, AlertCircle } from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import { Modal, Button, Input } from '@/components/ui'
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

export function PinSetupModal({ onSuccess, onDismiss }: PinSetupModalProps) {
  const [pin, setPin]         = useState('')
  const [confirm, setConfirm] = useState('')
  const [err, setErr]         = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: () => pinApi.setup(pin),
    onSuccess,
    onError: (e: Error) => setErr(e.message),
  })

  const validate = (): string | null => {
    if (!/^\d{4}$|^\d{6}$/.test(pin))    return 'PIN must be exactly 4 or 6 digits.'
    if (WEAK.has(pin))                    return 'This PIN is too easy to guess. Choose a less predictable combination.'
    if (pin !== confirm)                  return 'PINs do not match.'
    return null
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const msg = validate()
    if (msg) { setErr(msg); return }
    setErr(null)
    mutation.mutate()
  }

  return (
    <Modal
      open
      title="Secure Your Account"
      size="sm"
      locked={mutation.isPending}
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="flex flex-col items-center gap-2 pb-1">
          <div className="h-14 w-14 rounded-2xl bg-brand-50 flex items-center justify-center">
            <ShieldCheck className="h-7 w-7 text-brand-600" />
          </div>
          <p className="text-sm text-ink-muted text-center leading-relaxed">
            Set a 4 or 6 digit transaction PIN. You'll need it every time you make a purchase.
          </p>
        </div>

        <Input
          label="New PIN"
          type="password"
          inputMode="numeric"
          maxLength={6}
          value={pin}
          onChange={(e) => { setPin(e.target.value.replace(/\D/g, '').slice(0, 6)); setErr(null) }}
          placeholder="••••"
          disabled={mutation.isPending}
          className="text-center text-xl tracking-widest"
          autoFocus
        />

        <Input
          label="Confirm PIN"
          type="password"
          inputMode="numeric"
          maxLength={6}
          value={confirm}
          onChange={(e) => { setConfirm(e.target.value.replace(/\D/g, '').slice(0, 6)); setErr(null) }}
          placeholder="••••"
          disabled={mutation.isPending}
          className="text-center text-xl tracking-widest"
        />

        {err && (
          <div className="flex items-start gap-2 rounded-xl bg-danger/10 border border-danger/20 px-3 py-2.5">
            <AlertCircle className="h-4 w-4 text-danger shrink-0 mt-0.5" />
            <p className="text-xs text-danger">{err}</p>
          </div>
        )}

        <Button
          type="submit"
          fullWidth
          size="lg"
          loading={mutation.isPending}
          disabled={pin.length < 4 || confirm.length < 4}
        >
          Set Transaction PIN
        </Button>

        <p className="text-center text-xs text-ink-faint">
          You won't be able to make purchases without a PIN.{' '}
          <button
            type="button"
            className="underline hover:text-ink-muted transition-colors"
            onClick={onDismiss}
            disabled={mutation.isPending}
          >
            Set up later
          </button>
        </p>
      </form>
    </Modal>
  )
}

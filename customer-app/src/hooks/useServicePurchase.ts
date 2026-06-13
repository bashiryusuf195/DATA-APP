import { useState, useRef, useEffect, useCallback } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import type { Transaction } from '@/types'
import { WALLET_BALANCE_KEY } from './useWallet'
import { normalizeTransactionStatus } from '@/utils/format'
import { transactionsApi } from '@/api/transactions.api'
import { performNativeBiometric } from '@/hooks/useBiometricAuth'

// 'authorizing' = native biometric prompt is showing (OS-level, no app UI)
type Phase = 'idle' | 'confirm' | 'authorizing' | 'pin' | 'submitting' | 'done'

// Axios error enriched with machine-readable code from the backend
type ApiError = Error & { code?: string }

const POLL_INTERVAL_MS  = 2000
const POLL_MAX_ATTEMPTS = 15

const PIN_CODES = new Set([
  'TRANSACTION_PIN_REQUIRED',
  'TRANSACTION_PIN_NOT_SET',
  'TRANSACTION_PIN_LOCKED',
  'INVALID_TRANSACTION_PIN',
])

function pinErrMessage(code: string, fallback: string): string {
  switch (code) {
    case 'TRANSACTION_PIN_REQUIRED':
      return 'Enter your transaction PIN to authorise this purchase.'
    case 'TRANSACTION_PIN_NOT_SET':
      return 'You have not set a transaction PIN. Go to Settings → Transaction PIN to create one.'
    case 'TRANSACTION_PIN_LOCKED':
      return fallback  // already contains retry-in-X-minutes info from backend
    case 'INVALID_TRANSACTION_PIN':
      return 'Incorrect PIN. Please try again.'
    default:
      return fallback
  }
}

export interface ServicePurchaseOptions {
  /** When true, the confirm button triggers a native biometric prompt instead of the PIN modal. */
  biometricPurchaseEnabled?: boolean
}

export function useServicePurchase<T>(
  mutationFn: (data: T) => Promise<Transaction>,
  options?: ServicePurchaseOptions,
) {
  const biometricEnabled = options?.biometricPurchaseEnabled ?? false
  const qc = useQueryClient()

  const [phase, setPhase]                 = useState<Phase>('idle')
  const [pending, setPending]             = useState<T | null>(null)
  const [result, setResult]               = useState<Transaction | null>(null)
  const [isPolling, setIsPolling]         = useState(false)
  const [pinError, setPinError]           = useState<string | null>(null)
  // Tracks whether a biometric attempt failed so the PIN modal shows a fallback note
  const [biometricFailed, setBiometricFailed] = useState(false)

  const pollTimerRef  = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollCountRef  = useRef(0)
  const pollAmountRef = useRef(0)
  const toastFiredRef = useRef(false)

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current !== null) {
      clearInterval(pollTimerRef.current)
      pollTimerRef.current = null
    }
    setIsPolling(false)
    pollCountRef.current = 0
  }, [])

  useEffect(() => () => stopPolling(), [stopPolling])

  const startPolling = useCallback((reference: string) => {
    setIsPolling(true)
    pollCountRef.current = 0

    pollTimerRef.current = setInterval(async () => {
      pollCountRef.current += 1
      try {
        const polledTx = await transactionsApi.get(reference)
        const status   = normalizeTransactionStatus(polledTx.status)

        if (status === 'success' || status === 'failed' || status === 'review') {
          stopPolling()
          const amount = parseFloat(String(polledTx.amount ?? 0)) || pollAmountRef.current
          setResult({ ...polledTx, amount })
          qc.invalidateQueries({ queryKey: WALLET_BALANCE_KEY })
          qc.invalidateQueries({ queryKey: ['transactions'] })
          if (!toastFiredRef.current) {
            toastFiredRef.current = true
            if (status === 'success') toast.success('Transaction successful!')
            else if (status === 'review') toast('Transaction is under review. We\'ll notify you.', { icon: '🔍' })
            else toast.error('Transaction failed.')
          }
        } else if (pollCountRef.current >= POLL_MAX_ATTEMPTS) {
          stopPolling()
          qc.invalidateQueries({ queryKey: ['transactions'] })
        }
      } catch {
        if (pollCountRef.current >= POLL_MAX_ATTEMPTS) stopPolling()
      }
    }, POLL_INTERVAL_MS)
  }, [qc, stopPolling])

  const mutation = useMutation({
    mutationFn,
    onSuccess: (tx, variables) => {
      const inputAmount = (variables as { amount?: number }).amount
      const txAmount    = typeof tx.amount === 'number' ? tx.amount : parseFloat(String(tx.amount ?? 0))
      const amount      = txAmount > 0 ? txAmount : (inputAmount ?? 0)

      setResult({ ...tx, amount })
      setPhase('done')

      const uiStatus = normalizeTransactionStatus(tx.status)
      if (uiStatus === 'success') {
        qc.invalidateQueries({ queryKey: WALLET_BALANCE_KEY })
        qc.invalidateQueries({ queryKey: ['transactions'] })
        if (!toastFiredRef.current) { toastFiredRef.current = true; toast.success('Transaction successful!') }
      } else if (uiStatus === 'failed') {
        qc.invalidateQueries({ queryKey: WALLET_BALANCE_KEY })
        qc.invalidateQueries({ queryKey: ['transactions'] })
        if (!toastFiredRef.current) { toastFiredRef.current = true; toast.error('Transaction failed.') }
      } else if (uiStatus === 'review') {
        qc.invalidateQueries({ queryKey: ['transactions'] })
        if (!toastFiredRef.current) { toastFiredRef.current = true; toast('Transaction is under review. We\'ll notify you.', { icon: '🔍' }) }
      } else {
        pollAmountRef.current = amount
        startPolling(tx.reference)
      }
    },
    onError: (err: ApiError) => {
      if (err.code && PIN_CODES.has(err.code)) {
        setPinError(pinErrMessage(err.code, err.message ?? 'PIN error. Please try again.'))
        setPhase('pin')
      } else {
        setPhase('idle')
        toast.error(err.message ?? 'Transaction failed. Please try again.')
      }
    },
  })

  // ── Phase transitions ────────────────────────────────────────────────────────

  /** Step 1: user finishes the form — show review modal */
  const requestConfirm = (data: T) => {
    setPending(data)
    setPinError(null)
    setBiometricFailed(false)
    setPhase('confirm')
  }

  /**
   * Step 2: user clicks "Confirm Purchase" / "Enter PIN".
   * When biometric purchase is enabled, triggers the native biometric prompt first.
   * On biometric success the purchase is submitted immediately (no PIN needed).
   * On failure or cancellation the PIN modal is shown as the fallback.
   */
  const goToAuthorize = useCallback(async () => {
    if (!pending) return
    setPinError(null)
    setBiometricFailed(false)

    if (biometricEnabled) {
      setPhase('authorizing')
      const result = await performNativeBiometric('Confirm this purchase')
      if (result === 'success') {
        toastFiredRef.current = false
        setPhase('submitting')
        mutation.mutate({ ...pending, biometric_purchase: true } as T)
      } else {
        // 'cancelled' or 'failed' — fall back to PIN
        setBiometricFailed(result === 'failed')
        setPhase('pin')
      }
    } else {
      setPhase('pin')
    }
  }, [biometricEnabled, pending, mutation])

  /** Step 3 (PIN path): user submits PIN — append it and fire the request */
  const confirmWithPin = useCallback((pin: string) => {
    if (!pending) return
    toastFiredRef.current = false
    setPhase('submitting')
    mutation.mutate({
      ...pending,
      transaction_pin: pin,
      ...(biometricFailed && { biometric_fallback: true }),
    } as T)
  }, [pending, biometricFailed, mutation])

  /** Back from PIN modal to review modal */
  const backToConfirm = () => {
    setPinError(null)
    setBiometricFailed(false)
    setPhase('confirm')
  }

  /** Legacy alias kept so existing call-sites that use goToPin still compile. */
  const goToPin = () => {
    if (!pending) return
    setPinError(null)
    setPhase('pin')
  }

  const cancel = () => {
    setPhase('idle')
    setPending(null)
    setPinError(null)
    setBiometricFailed(false)
  }

  const reset = () => {
    stopPolling()
    toastFiredRef.current = false
    setPhase('idle')
    setPending(null)
    setResult(null)
    setPinError(null)
    setBiometricFailed(false)
  }

  return {
    phase,
    result,
    pending,
    isPolling,
    pinError,
    biometricFailed,
    requestConfirm,
    goToAuthorize,
    goToPin,
    confirmWithPin,
    backToConfirm,
    cancel,
    reset,
    isLoading: mutation.isPending,
  }
}

import { useState, useRef, useEffect, useCallback } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import type { Transaction } from '@/types'
import { WALLET_BALANCE_KEY } from './useWallet'
import { normalizeTransactionStatus } from '@/utils/format'
import { transactionsApi } from '@/api/transactions.api'

type Phase = 'idle' | 'confirm' | 'submitting' | 'done'

const POLL_INTERVAL_MS  = 2000  // poll every 2 seconds
const POLL_MAX_ATTEMPTS = 15    // 15 × 2 s = 30 seconds max

export function useServicePurchase<T>(
  mutationFn: (data: T) => Promise<Transaction>
) {
  const qc = useQueryClient()
  const [phase, setPhase]         = useState<Phase>('idle')
  const [pending, setPending]     = useState<T | null>(null)
  const [result, setResult]       = useState<Transaction | null>(null)
  const [isPolling, setIsPolling] = useState(false)

  // Refs are stable across renders — safe to use inside setInterval callbacks.
  const pollTimerRef  = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollCountRef  = useRef(0)
  const pollAmountRef = useRef(0) // preserves amount across poll ticks

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current !== null) {
      clearInterval(pollTimerRef.current)
      pollTimerRef.current = null
    }
    setIsPolling(false)
    pollCountRef.current = 0
  }, [])

  // Cancel polling if the component using this hook unmounts mid-flight.
  useEffect(() => () => stopPolling(), [stopPolling])

  const startPolling = useCallback((reference: string) => {
    setIsPolling(true)
    pollCountRef.current = 0

    pollTimerRef.current = setInterval(async () => {
      pollCountRef.current += 1

      try {
        const polledTx = await transactionsApi.get(reference)
        const status = normalizeTransactionStatus(polledTx.status)

        if (status === 'success' || status === 'failed') {
          stopPolling()
          const amount =
            parseFloat(String(polledTx.amount ?? 0)) || pollAmountRef.current
          setResult({ ...polledTx, amount })
          qc.invalidateQueries({ queryKey: WALLET_BALANCE_KEY })
          qc.invalidateQueries({ queryKey: ['transactions'] })
          if (status === 'success') {
            toast.success('Transaction successful!')
          } else {
            toast.error('Transaction failed.')
          }
        } else if (pollCountRef.current >= POLL_MAX_ATTEMPTS) {
          // 30 s elapsed — stop polling silently; modal shows "Check Status" button.
          stopPolling()
          qc.invalidateQueries({ queryKey: ['transactions'] })
        }
      } catch {
        // Swallow transient network errors; count toward the timeout.
        if (pollCountRef.current >= POLL_MAX_ATTEMPTS) stopPolling()
      }
    }, POLL_INTERVAL_MS)
  }, [qc, stopPolling])

  const mutation = useMutation({
    mutationFn,
    onSuccess: (tx, variables) => {
      const inputAmount = (variables as { amount?: number }).amount
      const txAmount = typeof tx.amount === 'number' ? tx.amount : parseFloat(String(tx.amount ?? 0))
      const amount = txAmount > 0 ? txAmount : (inputAmount ?? 0)

      setResult({ ...tx, amount })
      setPhase('done')

      const uiStatus = normalizeTransactionStatus(tx.status)
      if (uiStatus === 'success') {
        qc.invalidateQueries({ queryKey: WALLET_BALANCE_KEY })
        qc.invalidateQueries({ queryKey: ['transactions'] })
        toast.success('Transaction successful!')
      } else if (uiStatus === 'failed') {
        qc.invalidateQueries({ queryKey: WALLET_BALANCE_KEY })
        qc.invalidateQueries({ queryKey: ['transactions'] })
        toast.error('Transaction failed.')
      } else {
        // pending / processing — poll for final status
        pollAmountRef.current = amount
        startPolling(tx.reference)
      }
    },
    onError: (err: Error) => {
      setPhase('idle')
      toast.error(err.message ?? 'Transaction failed. Please try again.')
    },
  })

  const requestConfirm = (data: T) => {
    setPending(data)
    setPhase('confirm')
  }

  const confirm = () => {
    if (!pending) return
    setPhase('submitting')
    mutation.mutate(pending)
  }

  const cancel = () => {
    setPhase('idle')
    setPending(null)
  }

  const reset = () => {
    stopPolling()
    setPhase('idle')
    setPending(null)
    setResult(null)
  }

  return {
    phase,
    result,
    pending,
    isPolling,
    requestConfirm,
    confirm,
    cancel,
    reset,
    isLoading: mutation.isPending,
  }
}

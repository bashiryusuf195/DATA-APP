import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import type { Transaction } from '@/types'
import { WALLET_BALANCE_KEY } from './useWallet'

type Phase = 'idle' | 'confirm' | 'submitting' | 'done'

export function useServicePurchase<T>(
  mutationFn: (data: T) => Promise<Transaction>
) {
  const qc = useQueryClient()
  const [phase, setPhase]           = useState<Phase>('idle')
  const [pending, setPending]       = useState<T | null>(null)
  const [result, setResult]         = useState<Transaction | null>(null)

  const mutation = useMutation({
    mutationFn,
    onSuccess: (tx, variables) => {
      // amount may be 0 if normalization failed; fall back to the submitted input amount
      const inputAmount = (variables as { amount?: number }).amount
      const txAmount = typeof tx.amount === 'number' ? tx.amount : parseFloat(String(tx.amount ?? 0))
      const amount = txAmount > 0 ? txAmount : (inputAmount ?? 0)
      setResult({ ...tx, amount })
      setPhase('done')
      qc.invalidateQueries({ queryKey: WALLET_BALANCE_KEY })
      qc.invalidateQueries({ queryKey: ['transactions'] })
      if (tx.status === 'success') {
        toast.success('Transaction successful!')
      } else if (tx.status === 'failed') {
        toast.error('Transaction failed.')
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
    setPhase('idle')
    setPending(null)
    setResult(null)
  }

  return {
    phase,
    result,
    pending,
    requestConfirm,
    confirm,
    cancel,
    reset,
    isLoading: mutation.isPending,
  }
}

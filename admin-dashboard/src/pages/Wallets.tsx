import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { walletApi } from '@/api/wallet.api'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataTable } from '@/components/shared/DataTable'
import { StatCard } from '@/components/shared/StatCard'
import { Pagination } from '@/components/shared/Pagination'
import { ErrorMessage } from '@/components/shared/ErrorMessage'
import { Button, Badge, Card } from '@/components/ui'
import { SkeletonCard, SkeletonTable } from '@/components/ui/Skeleton'
import { fmtCurrency, fmtDate } from '@/utils/format'
import { RefreshCw, Wallet, ArrowUpRight, ArrowDownLeft } from 'lucide-react'
import { ENDPOINTS } from '@/config/endpoints'
import type { LedgerEntry } from '@/types'

export function WalletPage() {
  const [page, setPage] = useState(1)
  const limit = 25

  const { data: balance, isLoading: balLoading, error: balError, refetch: refetchBal } = useQuery({
    queryKey: ['wallet-balance'],
    queryFn: walletApi.balance,
  })

  const ledgerEnabled = ENDPOINTS.walletLedger.status === 'available'

  const { data: ledgerData, isLoading: ledLoading, error: ledError, refetch: refetchLed } = useQuery({
    queryKey: ['wallet-ledger', { page, limit }],
    queryFn: () => walletApi.ledger({ page, limit }),
    enabled: ledgerEnabled,
  })

  const ledgerRows: LedgerEntry[] = ledgerData?.data ?? []
  const total = ledgerData?.total ?? ledgerRows.length

  // Balance error is fatal for this page; ledger error is handled inline.
  if (balError) {
    return (
      <ErrorMessage
        error={balError}
        onRetry={() => { void refetchBal(); void refetchLed() }}
        endpoint={ENDPOINTS.walletBalance.path}
      />
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Wallet Monitor"
        subtitle="Admin wallet balance and ledger entries"
        actions={
          <Button variant="secondary" size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />}
            onClick={() => { void refetchBal(); void refetchLed() }}>Refresh</Button>
        }
      />

      {/* Balance cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {balLoading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : balance ? (
          <>
            <StatCard
              title="Ledger Balance"
              value={fmtCurrency(balance.ledger_balance, balance.currency)}
              subtitle={`Wallet ID: ${balance.wallet_id.slice(0, 12)}…`}
              icon={<Wallet className="h-4 w-4" />}
              variant="accent"
            />
            <StatCard
              title="Available Balance"
              value={fmtCurrency(balance.available_balance, balance.currency)}
              subtitle={balance.currency}
              icon={<Wallet className="h-4 w-4" />}
              variant="success"
            />
          </>
        ) : (
          <Card className="col-span-2">
            <p className="text-sm text-ink-faint text-center py-4">
              No wallet found for this account.
            </p>
          </Card>
        )}
      </div>

      {/* Ledger */}
      <Card padding="none">
        <div className="px-5 py-4 border-b border-border">
          <h3 className="text-sm font-semibold text-ink">Ledger Entries</h3>
        </div>
        {!ledgerEnabled ? (
          <ErrorMessage
            statusOverride={404}
            endpoint={ENDPOINTS.walletLedger.path}
            inline
          />
        ) : ledError ? (
          <ErrorMessage
            error={ledError}
            onRetry={() => void refetchLed()}
            endpoint={ENDPOINTS.walletLedger.path}
            inline
          />
        ) : ledLoading ? (
          <div className="p-5"><SkeletonTable rows={8} /></div>
        ) : (
          <>
            <DataTable
              data={ledgerRows}
              rowKey={(e) => e.id}
              columns={[
                {
                  key: 'direction',
                  header: 'Type',
                  render: (e) =>
                    e.direction === 'credit' ? (
                      <Badge variant="success">
                        <ArrowDownLeft className="h-3 w-3 mr-1" />Credit
                      </Badge>
                    ) : (
                      <Badge variant="danger">
                        <ArrowUpRight className="h-3 w-3 mr-1" />Debit
                      </Badge>
                    ),
                },
                {
                  key: 'amount',
                  header: 'Amount',
                  align: 'right',
                  render: (e) => (
                    <span className={`font-semibold ${e.direction === 'credit' ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {e.direction === 'credit' ? '+' : '−'}{fmtCurrency(e.amount)}
                    </span>
                  ),
                },
                {
                  key: 'description',
                  header: 'Description',
                  render: (e) => <span className="text-sm text-ink-muted">{e.description ?? '—'}</span>,
                },
                {
                  key: 'type',
                  header: 'Ref Type',
                  render: (e) => <Badge variant="neutral" size="sm">{e.reference_type ?? '—'}</Badge>,
                },
                {
                  key: 'date',
                  header: 'Date',
                  render: (e) => <span className="text-xs text-ink-faint">{fmtDate(e.created_at)}</span>,
                },
              ]}
            />
            <div className="px-4 pb-4">
              <Pagination page={page} limit={limit} total={total} onPage={setPage} />
            </div>
          </>
        )}
      </Card>
    </div>
  )
}

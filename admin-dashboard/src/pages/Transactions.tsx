import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { transactionsApi } from '@/api/transactions.api'
import { attemptsApi } from '@/api/attempts.api'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataTable } from '@/components/shared/DataTable'
import { TransactionStatusBadge } from '@/components/shared/StatusBadge'
import { Pagination } from '@/components/shared/Pagination'
import { Drawer } from '@/components/shared/Drawer'
import { ErrorMessage } from '@/components/shared/ErrorMessage'
import { Button, Input, Select, Badge, Card } from '@/components/ui'
import { SkeletonTable } from '@/components/ui/Skeleton'
import { fmtCurrency, fmtDate, truncate } from '@/utils/format'
import type { Transaction, ProviderAttempt } from '@/types'
import { Search, RefreshCw, X, Copy, Check, RotateCcw, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'

import { useDebounce } from '@/hooks/useDebounce'
import { ENDPOINTS } from '@/config/endpoints'

const STATUS_OPTIONS = [
  { value: 'pending',          label: 'Pending' },
  { value: 'processing',       label: 'Processing' },
  { value: 'successful',       label: 'Successful' },
  { value: 'failed',           label: 'Failed' },
  { value: 'refunded',         label: 'Refunded' },
  { value: 'requires_review',  label: 'Needs Review' },
]

const SERVICE_OPTIONS = [
  { value: 'airtime',     label: 'Airtime' },
  { value: 'data',        label: 'Data' },
  { value: 'electricity', label: 'Electricity' },
  { value: 'cable_tv',    label: 'Cable TV' },
]

const RETRYABLE = new Set(['failed', 'requires_review', 'processing', 'pending'])

export function TransactionsPage() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [serviceType, setServiceType] = useState('')
  const [selected, setSelected] = useState<Transaction | null>(null)
  const [confirmRetry, setConfirmRetry] = useState(false)

  const qc = useQueryClient()

  const retryMutation = useMutation({
    mutationFn: (reference: string) => transactionsApi.retry(reference),
    onSuccess: (result) => {
      toast.success(result.message ?? 'Transaction re-queued.')
      setConfirmRetry(false)
      // Refresh the list and clear the drawer after a short delay so the
      // user can see the status flip back to "pending".
      setTimeout(() => {
        void qc.invalidateQueries({ queryKey: ['admin-transactions'] })
        setSelected(null)
      }, 1500)
    },
    onError: (err: Error) => {
      toast.error(err.message ?? 'Could not retry transaction.')
      setConfirmRetry(false)
    },
  })

  const debouncedSearch = useDebounce(search)
  const limit = 20

  const { data: attemptsData } = useQuery({
    queryKey: ['provider-attempts', selected?.reference],
    queryFn:  () => attemptsApi.list({ transaction_reference: selected!.reference, limit: 20 }),
    enabled:  !!selected,
    staleTime: 30_000,
  })
  const attempts: ProviderAttempt[] = attemptsData?.data ?? []

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin-transactions', { page, limit, status, service_type: serviceType, reference: debouncedSearch }],
    queryFn: () =>
      transactionsApi.list({
        page,
        limit,
        ...(status ? { status } : {}),
        ...(serviceType ? { service_type: serviceType } : {}),
        ...(debouncedSearch ? { reference: debouncedSearch } : {}),
      }),
    staleTime: 0,
    refetchOnWindowFocus: true,
  })

  const rows: Transaction[] = data && 'data' in data ? data.data : []
  const total = data && 'total' in data ? (data.total ?? rows.length) : rows.length

  const clearFilters = () => { setSearch(''); setStatus(''); setServiceType(''); setPage(1) }
  const hasFilters = search || status || serviceType

  if (error) return <ErrorMessage error={error} onRetry={() => void refetch()} endpoint={ENDPOINTS.transactions.path} />

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Transactions"
        subtitle="All platform transactions with filtering"
        actions={
          <Button variant="secondary" size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />}
            onClick={() => void refetch()}>Refresh</Button>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-64">
          <Input
            placeholder="Search by reference…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            prefix={<Search className="h-3.5 w-3.5" />}
          />
        </div>
        <div className="w-40">
          <Select
            value={status}
            onChange={(e) => { setStatus(e.target.value); setPage(1) }}
            options={STATUS_OPTIONS}
            placeholder="All statuses"
          />
        </div>
        <div className="w-40">
          <Select
            value={serviceType}
            onChange={(e) => { setServiceType(e.target.value); setPage(1) }}
            options={SERVICE_OPTIONS}
            placeholder="All services"
          />
        </div>
        {hasFilters && (
          <Button variant="ghost" size="sm" icon={<X className="h-3.5 w-3.5" />} onClick={clearFilters}>
            Clear
          </Button>
        )}
      </div>

      <Card padding="none">
        {isLoading ? (
          <div className="p-5"><SkeletonTable rows={10} /></div>
        ) : (
          <>
            <DataTable
              data={rows}
              rowKey={(t) => t.id}
              onRowClick={setSelected}
              columns={[
                {
                  key: 'reference',
                  header: 'Reference',
                  render: (t) => (
                    <span className="font-mono text-xs text-ink">{truncate(t.reference, 26)}</span>
                  ),
                },
                {
                  key: 'service',
                  header: 'Service',
                  render: (t) => <Badge variant="neutral">{t.service_type}</Badge>,
                },
                {
                  key: 'amount',
                  header: 'Amount',
                  align: 'right',
                  render: (t) => (
                    <span className="font-semibold text-ink">{fmtCurrency(t.amount)}</span>
                  ),
                },
                {
                  key: 'status',
                  header: 'Status',
                  render: (t) => <TransactionStatusBadge status={t.status} />,
                },
                {
                  key: 'provider',
                  header: 'Provider',
                  render: (t) => (
                    <span className="text-xs text-ink-muted font-mono">{t.provider ?? '—'}</span>
                  ),
                },
                {
                  key: 'date',
                  header: 'Date',
                  render: (t) => <span className="text-xs text-ink-faint">{fmtDate(t.created_at)}</span>,
                },
              ]}
            />
            <div className="px-4 pb-4">
              <Pagination page={page} limit={limit} total={total} onPage={setPage} />
            </div>
          </>
        )}
      </Card>

      {/* Detail drawer */}
      <Drawer
        open={!!selected}
        onClose={() => { setSelected(null); setConfirmRetry(false) }}
        title="Transaction Detail"
        subtitle={selected?.reference ?? ''}
      >
        {selected && (
          <div className="space-y-4 text-sm">
            <Row label="Reference"      value={<span className="font-mono text-xs">{selected.reference}</span>} />
            <Row label="Status"         value={<TransactionStatusBadge status={selected.status} />} />
            <Row label="Service"        value={<Badge variant="neutral">{selected.service_type}</Badge>} />
            <Row label="Amount"         value={<span className="font-semibold">{fmtCurrency(selected.amount)}</span>} />
            <Row label="Provider"       value={selected.provider ?? '—'} />
            <Row label="Provider Ref"   value={<span className="font-mono text-xs">{selected.provider_reference ?? '—'}</span>} />
            <Row label="Created"        value={fmtDate(selected.created_at)} />
            <Row label="Updated"        value={fmtDate(selected.updated_at)} />
            {(() => {
              const exec = selected.metadata?.execution as Record<string, unknown> | undefined
              if (!exec?.repaired) return null
              const repairedAt = exec.repaired_at ? fmtDate(String(exec.repaired_at)) : null
              return (
                <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3">
                  <p className="text-xs text-emerald-400 font-medium mb-1">Transaction Repaired</p>
                  <p className="text-xs text-emerald-300">
                    This transaction was repaired by admin reconciliation.
                    {repairedAt ? ` Repaired at: ${repairedAt}` : ''}
                  </p>
                </div>
              )
            })()}

            {selected.failure_reason && (
              <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 p-3">
                <p className="text-xs text-rose-400 font-medium mb-1">Failure Reason</p>
                <p className="text-xs text-rose-300">{selected.failure_reason}</p>
              </div>
            )}

            {/* ── Retry / Repair ──────────────────────────────────────────── */}
            {RETRYABLE.has(selected.status) && (
              <div className="pt-1">
                {!confirmRetry ? (
                  <button
                    onClick={() => setConfirmRetry(true)}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-400 text-xs font-semibold hover:bg-amber-500/20 transition-colors"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Retry / Repair Transaction
                  </button>
                ) : (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 space-y-3">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                      <p className="text-xs text-amber-300 leading-relaxed">
                        This will reset the transaction to <span className="font-bold">pending</span> and
                        re-submit it to the provider queue. The wallet balance is unchanged — no double-charge.
                        Only use this if the transaction is genuinely stuck or failed.
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setConfirmRetry(false)}
                        disabled={retryMutation.isPending}
                        className="flex-1 py-2 rounded-lg border border-white/10 text-xs text-ink-muted hover:text-ink transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => retryMutation.mutate(selected.reference)}
                        disabled={retryMutation.isPending}
                        className="flex-1 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black text-xs font-bold transition-colors flex items-center justify-center gap-1.5"
                      >
                        {retryMutation.isPending ? (
                          <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Retrying…</>
                        ) : (
                          <><RotateCcw className="h-3.5 w-3.5" /> Confirm Retry</>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {attempts.length > 0 && (
              <div>
                <p className="text-xs text-ink-faint font-medium mb-2">Provider Attempts</p>
                <div className="space-y-2">
                  {attempts.map((a) => (
                    <ProviderAttemptCard key={a.id} attempt={a} />
                  ))}
                </div>
              </div>
            )}

            {selected.metadata && (
              <ServiceMetadataBlock metadata={selected.metadata} />
            )}
          </div>
        )}
      </Drawer>
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-xs text-ink-faint w-28 shrink-0">{label}</span>
      <span className="text-sm text-ink text-right">{value}</span>
    </div>
  )
}

function ProviderAttemptCard({ attempt: a }: { attempt: ProviderAttempt }) {
  const r = a.response_payload ?? {}
  const isPending = !a.success && a.error_classification === 'PENDING'
  const hasProviderDetail = Boolean(r['status'] || r['statuscode'] || r['message'] || r['order_id'] || r['orderstatus'])

  const borderClass = a.success
    ? 'border-emerald-500/20 bg-emerald-500/5'
    : isPending
      ? 'border-amber-500/20 bg-amber-500/5'
      : 'border-rose-500/20 bg-rose-500/5'

  const statusLabel = a.success ? 'Success' : isPending ? 'Processing' : 'Failed'
  const statusColor = a.success ? 'text-emerald-400' : isPending ? 'text-amber-400' : 'text-rose-400'

  return (
    <div className={`rounded-lg border p-3 text-xs ${borderClass}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="font-mono font-medium text-ink">{a.provider_code}</span>
        <span className={statusColor}>
          #{a.attempt_number} · {statusLabel}
          {a.latency_ms != null && ` · ${a.latency_ms}ms`}
        </span>
      </div>

      {a.error_message && !isPending && (
        <p className="text-rose-300 mt-1">{a.error_message}</p>
      )}

      {isPending && a.error_message && (
        <p className="text-amber-300 mt-1">{a.error_message}</p>
      )}

      {hasProviderDetail && (
        <div className={`mt-2 space-y-0.5 text-ink-muted border-t pt-2 ${isPending ? 'border-amber-500/10' : 'border-rose-500/10'}`}>
          {r['status']      != null && <p><span className="text-ink-faint">Provider status:</span> {String(r['status'])}</p>}
          {r['orderstatus'] != null && <p><span className="text-ink-faint">Order status:</span> {String(r['orderstatus'])}</p>}
          {r['statuscode']  != null && <p><span className="text-ink-faint">Status code:</span> {String(r['statuscode'])}</p>}
          {r['message']     != null && <p><span className="text-ink-faint">Message:</span> {String(r['message'])}</p>}
          {r['order_id']    != null && <p><span className="text-ink-faint">Order ID:</span> <span className="font-mono">{String(r['order_id'])}</span></p>}
          {r['requestid']   != null && <p><span className="text-ink-faint">Request ID:</span> <span className="font-mono">{String(r['requestid'])}</span></p>}
        </div>
      )}
    </div>
  )
}

function AdminCopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard API unavailable */ }
  }, [text])
  return (
    <button onClick={handleCopy} className="ml-1.5 p-0.5 rounded hover:bg-white/10" title="Copy">
      {copied
        ? <Check className="h-3 w-3 text-emerald-400" />
        : <Copy className="h-3 w-3 text-ink-faint" />}
    </button>
  )
}

function ServiceMetadataBlock({ metadata }: { metadata: Record<string, unknown> }) {
  const provResp = metadata.provider_response as Record<string, unknown> | undefined

  // ── Electricity token ──────────────────────────────────────────────────────
  const token = provResp?.token as string | undefined
  const units = provResp?.units as string | number | undefined

  // ── Cable TV ───────────────────────────────────────────────────────────────
  const cableCustomer = (provResp?.Customer_Name ?? provResp?.customer_name) as string | undefined
  const cablePackage  = (provResp?.package ?? provResp?.Package ?? provResp?.Bouquet ?? provResp?.bouquet) as string | undefined
  const cableDue      = (provResp?.Due_Date ?? provResp?.due_date) as string | undefined

  // ── WAEC / JAMB ────────────────────────────────────────────────────────────
  type CardEntry = { pin?: string; Pin?: string; serial?: string; Serial?: string }
  const examCards = (provResp?.carddetails ?? provResp?.pins) as CardEntry[] | undefined
  const hasSerial = examCards?.some(c => !!(c.Serial ?? c.serial))
  const jambPin         = (provResp?.pin ?? provResp?.Pin) as string | undefined
  const jambProfileCode = (provResp?.profile_code ?? provResp?.ProfileCode) as string | undefined

  const hasServiceBlock =
    token ||
    cableCustomer || cablePackage ||
    (examCards?.length && hasSerial) ||
    jambPin || jambProfileCode

  return (
    <div className="space-y-3">
      {/* Electricity */}
      {token && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
          <p className="text-xs text-amber-400 font-medium mb-2">Electricity Token</p>
          <div className="flex items-center justify-between">
            <p className="text-xs font-mono font-bold text-amber-300 tracking-widest break-all">{token}</p>
            <AdminCopyButton text={token} />
          </div>
          {units != null && (
            <p className="text-xs text-amber-400 mt-1">{units} units</p>
          )}
        </div>
      )}

      {/* Cable TV */}
      {(cableCustomer || cablePackage) && (
        <div className="rounded-lg border border-purple-500/20 bg-purple-500/5 p-3 space-y-1.5">
          <p className="text-xs text-purple-400 font-medium mb-1">Cable TV Details</p>
          {cableCustomer && (
            <div className="flex justify-between text-xs">
              <span className="text-ink-faint">Customer</span>
              <span className="text-ink">{cableCustomer}</span>
            </div>
          )}
          {cablePackage && (
            <div className="flex justify-between text-xs">
              <span className="text-ink-faint">Package</span>
              <span className="text-ink">{cablePackage}</span>
            </div>
          )}
          {cableDue && (
            <div className="flex justify-between text-xs">
              <span className="text-ink-faint">Due Date</span>
              <span className="text-ink">{cableDue}</span>
            </div>
          )}
        </div>
      )}

      {/* WAEC */}
      {examCards && examCards.length > 0 && hasSerial && (
        <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-3 space-y-3">
          <p className="text-xs text-blue-400 font-medium">WAEC PIN{examCards.length > 1 ? 's' : ''}</p>
          {examCards.map((card, i) => {
            const pin    = card.Pin    ?? card.pin    ?? ''
            const serial = card.Serial ?? card.serial ?? ''
            return (
              <div key={i} className="space-y-1">
                {pin && (
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[10px] text-blue-500 uppercase tracking-wide">PIN</p>
                      <p className="text-xs font-mono font-bold text-blue-300 tracking-widest">{pin}</p>
                    </div>
                    <AdminCopyButton text={pin} />
                  </div>
                )}
                {serial && (
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[10px] text-blue-500 uppercase tracking-wide">Serial</p>
                      <p className="text-xs font-mono text-blue-400">{serial}</p>
                    </div>
                    <AdminCopyButton text={serial} />
                  </div>
                )}
                {i < examCards.length - 1 && <hr className="border-blue-500/10" />}
              </div>
            )
          })}
        </div>
      )}

      {/* JAMB */}
      {(jambPin || jambProfileCode) && !(examCards?.length && hasSerial) && (
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 space-y-2">
          <p className="text-xs text-emerald-400 font-medium">JAMB Details</p>
          {jambPin && (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] text-emerald-500 uppercase tracking-wide">PIN</p>
                <p className="text-xs font-mono font-bold text-emerald-300 tracking-widest">{jambPin}</p>
              </div>
              <AdminCopyButton text={jambPin} />
            </div>
          )}
          {jambProfileCode && (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] text-emerald-500 uppercase tracking-wide">Profile Code</p>
                <p className="text-xs font-mono text-emerald-400">{jambProfileCode}</p>
              </div>
              <AdminCopyButton text={jambProfileCode} />
            </div>
          )}
        </div>
      )}

      {/* Raw metadata fallback */}
      <div>
        {hasServiceBlock && (
          <p className="text-xs text-ink-faint font-medium mb-2">Raw Metadata</p>
        )}
        {!hasServiceBlock && (
          <p className="text-xs text-ink-faint font-medium mb-2">Metadata</p>
        )}
        <pre className="text-xs bg-surface-2 rounded-lg p-3 overflow-auto max-h-64 text-ink-muted">
          {JSON.stringify(metadata, null, 2)}
        </pre>
      </div>
    </div>
  )
}

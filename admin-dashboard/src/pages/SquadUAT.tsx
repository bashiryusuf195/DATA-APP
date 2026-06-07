// TEMPORARY PAGE — Remove after Squad Static Virtual Account UAT approval.
// All calls target Squad sandbox via /api/v1/admin/squad-uat/*.
// No production wallet impact.

import { useState, useCallback, type ReactNode } from 'react'
import axios from 'axios'
import { cn } from '@/utils/cn'
import { apiClient } from '@/api/client'
import { PageHeader } from '@/components/shared/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { AlertTriangle, Copy, Check, Terminal, Play } from 'lucide-react'

// ── Utilities ─────────────────────────────────────────────────────────────────

function errMsg(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const d = err.response?.data
    return d?.error ?? d?.message ?? err.message ?? 'Request failed'
  }
  if (err instanceof Error) return err.message
  return 'Unknown error'
}

// Remove keys whose value is an empty string so optional Zod fields aren't rejected.
function compact<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== '' && v !== null && v !== undefined)
  ) as Partial<T>
}

function fmtJson(v: unknown): string {
  return JSON.stringify(v, null, 2)
}

// ── Per-card state ────────────────────────────────────────────────────────────

interface CardState {
  loading: boolean
  response: unknown
  error: string | null
  copied: boolean
}

function useCardState() {
  const [state, setState] = useState<CardState>({
    loading: false, response: null, error: null, copied: false,
  })

  const run = useCallback(async (fn: () => Promise<unknown>) => {
    setState(s => ({ ...s, loading: true, error: null, response: null }))
    try {
      const result = await fn()
      setState(s => ({ ...s, loading: false, response: result }))
    } catch (err) {
      setState(s => ({ ...s, loading: false, error: errMsg(err) }))
    }
  }, [])

  const copy = useCallback(() => {
    if (state.response == null) return
    void navigator.clipboard.writeText(fmtJson(state.response)).then(() => {
      setState(s => ({ ...s, copied: true }))
      setTimeout(() => setState(s => ({ ...s, copied: false })), 2000)
    })
  }, [state.response])

  return { ...state, run, copy }
}

// ── Shared UI pieces ──────────────────────────────────────────────────────────

function MethodBadge({ method }: { method: 'GET' | 'POST' }) {
  return (
    <span className={cn(
      'text-xs font-mono font-bold px-1.5 py-0.5 rounded',
      method === 'POST'
        ? 'bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/20'
        : 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/20'
    )}>
      {method}
    </span>
  )
}

interface ScenarioCardProps {
  scenario: number
  title: string
  method: 'GET' | 'POST'
  endpoint: string
  loading: boolean
  response: unknown
  error: string | null
  copied: boolean
  onCopy: () => void
  onExecute: () => void
  children: ReactNode
}

function ScenarioCard({
  scenario, title, method, endpoint,
  loading, response, error, copied,
  onCopy, onExecute, children,
}: ScenarioCardProps) {
  const hasResult = response != null || error != null

  return (
    <Card padding="lg">
      {/* Header */}
      <div className="flex items-start gap-3 mb-5">
        <span className="flex items-center justify-center h-7 w-7 rounded-full bg-accent/10 text-accent text-xs font-bold shrink-0 mt-0.5 select-none">
          {scenario}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-ink">{title}</h3>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <MethodBadge method={method} />
            <span className="text-xs font-mono text-ink-faint truncate">{endpoint}</span>
          </div>
        </div>
      </div>

      {/* Form fields */}
      <div className="space-y-3">{children}</div>

      {/* Execute */}
      <div className="mt-4">
        <Button
          variant="primary"
          size="sm"
          loading={loading}
          icon={!loading ? <Play className="h-3.5 w-3.5" /> : undefined}
          onClick={onExecute}
        >
          Execute
        </Button>
      </div>

      {/* Response panel */}
      {hasResult && (
        <div className="mt-5 border-t border-border pt-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-ink-muted flex items-center gap-1.5">
              <Terminal className="h-3.5 w-3.5" />
              Response
            </span>
            {response != null && (
              <Button
                size="xs"
                variant="ghost"
                onClick={onCopy}
                icon={copied
                  ? <Check className="h-3 w-3 text-emerald-400" />
                  : <Copy className="h-3 w-3" />}
              >
                {copied ? 'Copied' : 'Copy JSON'}
              </Button>
            )}
          </div>
          {error != null ? (
            <pre className="text-xs rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-words max-h-80 bg-rose-950/30 border border-rose-800/40 text-rose-300">
              {error}
            </pre>
          ) : (
            <pre className="text-xs rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-words max-h-80 bg-surface-2 border border-border text-emerald-300">
              {fmtJson(response)}
            </pre>
          )}
        </div>
      )}
    </Card>
  )
}

// ── Field grid helper ─────────────────────────────────────────────────────────

function FieldGrid({ children, cols = 2 }: { children: ReactNode; cols?: 1 | 2 }) {
  return (
    <div className={cn('grid gap-3', cols === 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1')}>
      {children}
    </div>
  )
}

// ── Scenario 1: Create Individual Virtual Account ─────────────────────────────

function Scenario1() {
  const { loading, response, error, copied, run, copy } = useCardState()
  const [f, setF] = useState({
    customer_identifier: '', first_name: '', last_name: '',
    mobile_num: '', email: '', bvn: '', dob: '',
    address: '', gender: '', beneficiary_account: '',
  })
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF(prev => ({ ...prev, [k]: e.target.value }))

  return (
    <ScenarioCard
      scenario={1} title="Create Individual Virtual Account"
      method="POST" endpoint="/admin/squad-uat/individual-account"
      loading={loading} response={response} error={error} copied={copied}
      onCopy={copy}
      onExecute={() => run(() =>
        apiClient.post('/api/v1/admin/squad-uat/individual-account', compact(f)).then(r => r.data)
      )}
    >
      <FieldGrid>
        <Input label="Customer Identifier *" placeholder="uat-test-001" value={f.customer_identifier} onChange={set('customer_identifier')} />
        <Input label="Email *" type="email" placeholder="user@example.com" value={f.email} onChange={set('email')} />
        <Input label="First Name *" placeholder="Amina" value={f.first_name} onChange={set('first_name')} />
        <Input label="Last Name *" placeholder="Bello" value={f.last_name} onChange={set('last_name')} />
        <Input label="Mobile Number *" placeholder="08012345678" value={f.mobile_num} onChange={set('mobile_num')} />
        <Input label="BVN (11 digits)" placeholder="22212345678" value={f.bvn} onChange={set('bvn')} />
        <Input label="Date of Birth (MM/DD/YYYY)" placeholder="01/15/1990" value={f.dob} onChange={set('dob')} />
        <Select
          label="Gender"
          value={f.gender}
          onChange={set('gender')}
          options={[{ value: '1', label: 'Male' }, { value: '2', label: 'Female' }]}
          placeholder="— select —"
        />
        <Input label="Address" placeholder="12 Adeola Odeku Street, Lagos" value={f.address} onChange={set('address')} />
        <Input label="Beneficiary Account" placeholder="0123456789 (falls back to env)" value={f.beneficiary_account} onChange={set('beneficiary_account')} />
      </FieldGrid>
    </ScenarioCard>
  )
}

// ── Scenario 2: Create Business Virtual Account ───────────────────────────────

function Scenario2() {
  const { loading, response, error, copied, run, copy } = useCardState()
  const [f, setF] = useState({
    customer_identifier: '', business_name: '', mobile_num: '',
    bvn: '', bank_code: '', beneficiary_account: '',
  })
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF(prev => ({ ...prev, [k]: e.target.value }))

  return (
    <ScenarioCard
      scenario={2} title="Create Business Virtual Account"
      method="POST" endpoint="/admin/squad-uat/business-account"
      loading={loading} response={response} error={error} copied={copied}
      onCopy={copy}
      onExecute={() => run(() =>
        apiClient.post('/api/v1/admin/squad-uat/business-account', compact(f)).then(r => r.data)
      )}
    >
      <FieldGrid>
        <Input label="Customer Identifier *" placeholder="uat-biz-001" value={f.customer_identifier} onChange={set('customer_identifier')} />
        <Input label="Business Name *" placeholder="Acme Ltd" value={f.business_name} onChange={set('business_name')} />
        <Input label="Mobile Number *" placeholder="08012345678" value={f.mobile_num} onChange={set('mobile_num')} />
        <Input label="BVN (11 digits) *" placeholder="22212345678" value={f.bvn} onChange={set('bvn')} />
        <Input label="Bank Code" placeholder="058" value={f.bank_code} onChange={set('bank_code')} />
        <Input label="Beneficiary Account" placeholder="0123456789 (falls back to env)" value={f.beneficiary_account} onChange={set('beneficiary_account')} />
      </FieldGrid>
    </ScenarioCard>
  )
}

// ── Scenario 3: Simulate Bank Transfer ───────────────────────────────────────

function Scenario3() {
  const { loading, response, error, copied, run, copy } = useCardState()
  const [f, setF] = useState({
    virtual_account_number: '', amount: '', payment_date: '', bank_code: '',
  })
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF(prev => ({ ...prev, [k]: e.target.value }))

  return (
    <ScenarioCard
      scenario={3} title="Simulate Bank Transfer (Sandbox Only)"
      method="POST" endpoint="/admin/squad-uat/simulate-payment"
      loading={loading} response={response} error={error} copied={copied}
      onCopy={copy}
      onExecute={() => run(() => {
        const body = compact({
          virtual_account_number: f.virtual_account_number,
          amount: f.amount ? Number(f.amount) : undefined,
          payment_date: f.payment_date,
          bank_code: f.bank_code,
        })
        return apiClient.post('/api/v1/admin/squad-uat/simulate-payment', body).then(r => r.data)
      })}
    >
      <FieldGrid>
        <Input label="Virtual Account Number *" placeholder="0123456789" value={f.virtual_account_number} onChange={set('virtual_account_number')} />
        <Input label="Amount (NGN) *" type="number" placeholder="5000" value={f.amount} onChange={set('amount')} hint="e.g. 5000 = ₦5,000" />
        <Input label="Payment Date" placeholder="2024-01-15" value={f.payment_date} onChange={set('payment_date')} hint="Optional ISO date" />
        <Input label="Bank Code" placeholder="058" value={f.bank_code} onChange={set('bank_code')} />
      </FieldGrid>
      <p className="text-xs text-ink-faint mt-1">
        Squad will send a <code className="text-amber-400">virtual-account.credit</code> webhook to your registered webhook URL after processing.
      </p>
    </ScenarioCard>
  )
}

// ── Scenario 4: Customer Virtual Account Transactions ─────────────────────────

function Scenario4() {
  const { loading, response, error, copied, run, copy } = useCardState()
  const [f, setF] = useState({
    customerIdentifier: '', page: '', perPage: '', startDate: '', endDate: '',
  })
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF(prev => ({ ...prev, [k]: e.target.value }))

  return (
    <ScenarioCard
      scenario={4} title="Customer Virtual Account Transactions"
      method="GET" endpoint="/admin/squad-uat/customer-transactions/:customerIdentifier"
      loading={loading} response={response} error={error} copied={copied}
      onCopy={copy}
      onExecute={() => run(() => {
        const { customerIdentifier, ...q } = f
        const params = compact({ page: q.page || undefined, perPage: q.perPage || undefined, startDate: q.startDate, endDate: q.endDate })
        return apiClient.get(`/api/v1/admin/squad-uat/customer-transactions/${encodeURIComponent(customerIdentifier)}`, { params }).then(r => r.data)
      })}
    >
      <FieldGrid cols={1}>
        <Input label="Customer Identifier *" placeholder="uat-test-001" value={f.customerIdentifier} onChange={set('customerIdentifier')} />
      </FieldGrid>
      <FieldGrid>
        <Input label="Page" type="number" placeholder="1" value={f.page} onChange={set('page')} />
        <Input label="Per Page" type="number" placeholder="20" value={f.perPage} onChange={set('perPage')} />
        <Input label="Start Date (YYYY-MM-DD)" placeholder="2024-01-01" value={f.startDate} onChange={set('startDate')} />
        <Input label="End Date (YYYY-MM-DD)" placeholder="2024-12-31" value={f.endDate} onChange={set('endDate')} />
      </FieldGrid>
    </ScenarioCard>
  )
}

// ── Scenario 5: Merchant Virtual Account Transactions ─────────────────────────

function Scenario5() {
  const { loading, response, error, copied, run, copy } = useCardState()
  const [f, setF] = useState({
    page: '', perPage: '', startDate: '', endDate: '', virtual_account_number: '',
  })
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF(prev => ({ ...prev, [k]: e.target.value }))

  return (
    <ScenarioCard
      scenario={5} title="Merchant Virtual Account Transactions"
      method="GET" endpoint="/admin/squad-uat/merchant-transactions"
      loading={loading} response={response} error={error} copied={copied}
      onCopy={copy}
      onExecute={() => run(() => {
        const params = compact(f)
        return apiClient.get('/api/v1/admin/squad-uat/merchant-transactions', { params }).then(r => r.data)
      })}
    >
      <FieldGrid>
        <Input label="Virtual Account Number" placeholder="0123456789 (optional filter)" value={f.virtual_account_number} onChange={set('virtual_account_number')} />
        <div />
        <Input label="Page" type="number" placeholder="1" value={f.page} onChange={set('page')} />
        <Input label="Per Page" type="number" placeholder="20" value={f.perPage} onChange={set('perPage')} />
        <Input label="Start Date (YYYY-MM-DD)" placeholder="2024-01-01" value={f.startDate} onChange={set('startDate')} />
        <Input label="End Date (YYYY-MM-DD)" placeholder="2024-12-31" value={f.endDate} onChange={set('endDate')} />
      </FieldGrid>
    </ScenarioCard>
  )
}

// ── Scenario 6: Retrieve VA by Account Number (NUBAN) ────────────────────────

function Scenario6() {
  const { loading, response, error, copied, run, copy } = useCardState()
  const [num, setNum] = useState('')

  return (
    <ScenarioCard
      scenario={6} title="Retrieve Virtual Account by Account Number (NUBAN)"
      method="GET" endpoint="/admin/squad-uat/account-number/:virtualAccountNumber"
      loading={loading} response={response} error={error} copied={copied}
      onCopy={copy}
      onExecute={() => run(() =>
        apiClient.get(`/api/v1/admin/squad-uat/account-number/${encodeURIComponent(num)}`).then(r => r.data)
      )}
    >
      <FieldGrid cols={1}>
        <Input label="Virtual Account Number (NUBAN) *" placeholder="0123456789" value={num} onChange={e => setNum(e.target.value)} />
      </FieldGrid>
    </ScenarioCard>
  )
}

// ── Scenario 7: Retrieve VA by Customer Identifier ───────────────────────────

function Scenario7() {
  const { loading, response, error, copied, run, copy } = useCardState()
  const [id, setId] = useState('')

  return (
    <ScenarioCard
      scenario={7} title="Retrieve Virtual Account by Customer Identifier"
      method="GET" endpoint="/admin/squad-uat/customer/:customerIdentifier"
      loading={loading} response={response} error={error} copied={copied}
      onCopy={copy}
      onExecute={() => run(() =>
        apiClient.get(`/api/v1/admin/squad-uat/customer/${encodeURIComponent(id)}`).then(r => r.data)
      )}
    >
      <FieldGrid cols={1}>
        <Input label="Customer Identifier *" placeholder="uat-test-001" value={id} onChange={e => setId(e.target.value)} />
      </FieldGrid>
    </ScenarioCard>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function SquadUATPage() {
  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Squad UAT"
        subtitle="Static Virtual Account user acceptance testing — sandbox environment only"
      />

      {/* Temporary page banner */}
      <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
        <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
        <div className="text-xs text-amber-300 leading-relaxed">
          <span className="font-semibold">Temporary page.</span>{' '}
          All calls hit Squad's <span className="font-mono">sandbox</span> environment via{' '}
          <span className="font-mono">/api/v1/admin/squad-uat/*</span>.
          No production wallets are affected. Remove this page and route after UAT sign-off.
        </div>
      </div>

      {/* Scenario cards */}
      <div className="space-y-4">
        <Scenario1 />
        <Scenario2 />
        <Scenario3 />
        <Scenario4 />
        <Scenario5 />
        <Scenario6 />
        <Scenario7 />
      </div>
    </div>
  )
}

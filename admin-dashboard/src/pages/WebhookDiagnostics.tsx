import { useQuery } from '@tanstack/react-query'
import { webhooksApi } from '@/api/webhooks.api'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatCard } from '@/components/shared/StatCard'
import { ErrorMessage } from '@/components/shared/ErrorMessage'
import { Button, Badge, Card, CardHeader } from '@/components/ui'
import { SkeletonCard } from '@/components/ui/Skeleton'
import { fmtDate, fmtRelative } from '@/utils/format'
import {
  RefreshCw, CheckCircle2, XCircle, Clock, Webhook,
  AlertTriangle, ExternalLink, Copy, BookOpen,
} from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { ENDPOINTS } from '@/config/endpoints'
import toast from 'react-hot-toast'

// ── Helpers ───────────────────────────────────────────────────────────────────

function copyToClipboard(text: string) {
  void navigator.clipboard.writeText(text).then(() => toast.success('Copied to clipboard'))
}

function SigBadge({ valid }: { valid: boolean }) {
  return valid ? (
    <span className="inline-flex items-center gap-1 text-emerald-400 text-sm font-medium">
      <CheckCircle2 className="h-4 w-4" /> Valid
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-rose-400 text-sm font-medium">
      <XCircle className="h-4 w-4" /> Invalid
    </span>
  )
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-border last:border-0">
      <span className="text-xs text-ink-faint w-36 shrink-0 pt-0.5">{label}</span>
      <span className="text-sm text-ink text-right">{value}</span>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function WebhookDiagnosticsPage() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['webhook-diagnostics'],
    queryFn:  webhooksApi.diagnostics,
    refetchInterval: 30_000,
  })

  const baseUrl  = window.location.origin.includes('localhost')
    ? 'https://<your-ngrok-url>'
    : window.location.origin
  const fullUrl  = `${baseUrl}${data?.webhook_url_path ?? '/webhooks/paystack'}`
  const pathOnly = data?.webhook_url_path ?? '/webhooks/paystack'

  const failedToday = (data?.total_today ?? 0) - (data?.processed_today ?? 0) - (data?.invalid_sig_today ?? 0)

  if (error) return (
    <ErrorMessage
      error={error}
      onRetry={() => void refetch()}
      endpoint={ENDPOINTS.webhookDiagnostics.path}
    />
  )

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Webhook Diagnostics"
        subtitle="Paystack webhook endpoint health, latest activity, and error summary"
        actions={
          <Button
            variant="secondary"
            size="sm"
            icon={<RefreshCw className="h-3.5 w-3.5" />}
            onClick={() => void refetch()}
          >
            Refresh
          </Button>
        }
      />

      {/* ── Endpoint card ──────────────────────────────────────────────────── */}
      <Card>
        <CardHeader
          title="Webhook Endpoint"
          subtitle="Configure this URL in your Paystack dashboard"
        />
        <div className="space-y-3">
          {/* POST badge + path */}
          <div className="flex items-center gap-3 bg-surface-2 rounded-lg px-4 py-3">
            <Badge variant="info">POST</Badge>
            <code className="text-sm font-mono text-ink flex-1">{pathOnly}</code>
          </div>

          {/* Full URL with copy */}
          <div>
            <p className="text-xs text-ink-faint mb-1.5">Full URL (replace ngrok URL each session)</p>
            <div className="flex items-center gap-2 bg-surface-2 rounded-lg px-4 py-2.5">
              <code className="text-xs font-mono text-ink-muted flex-1 break-all">{fullUrl}</code>
              <Button
                variant="secondary"
                size="sm"
                icon={<Copy className="h-3 w-3" />}
                onClick={() => copyToClipboard(fullUrl)}
              >
                Copy
              </Button>
            </div>
          </div>

          {/* ngrok quick-start */}
          <div className="flex items-start gap-2.5 rounded-lg bg-accent/5 border border-accent/20 px-4 py-3 text-xs text-ink-faint leading-relaxed">
            <BookOpen className="h-3.5 w-3.5 text-accent shrink-0 mt-0.5" />
            <div>
              <span className="text-accent font-medium">Local testing with ngrok — </span>
              run{' '}
              <code className="bg-surface-2 px-1 py-0.5 rounded text-ink">ngrok http 3000</code>,
              copy the HTTPS forwarding URL, append{' '}
              <code className="bg-surface-2 px-1 py-0.5 rounded text-ink">/webhooks/paystack</code>,
              and paste it into{' '}
              <a
                href="https://dashboard.paystack.com/#/settings/developer"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent underline inline-flex items-center gap-0.5"
              >
                Paystack Settings <ExternalLink className="h-3 w-3" />
              </a>
              . See <code className="bg-surface-2 px-1 py-0.5 rounded text-ink">docs/webhook-testing.md</code> for a full curl test command.
            </div>
          </div>
        </div>
      </Card>

      {/* ── Stats ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <StatCard
              title="Total Events"
              value={data?.total_events ?? 0}
              icon={<Webhook className="h-4 w-4" />}
              variant="accent"
            />
            <StatCard
              title="Today"
              value={data?.total_today ?? 0}
              icon={<Clock className="h-4 w-4" />}
              variant="default"
            />
            <StatCard
              title="Processed Today"
              value={data?.processed_today ?? 0}
              icon={<CheckCircle2 className="h-4 w-4" />}
              variant="success"
            />
            <StatCard
              title="Failed Today"
              value={(data?.invalid_sig_today ?? 0) + Math.max(0, failedToday)}
              icon={<AlertTriangle className="h-4 w-4" />}
              variant={(data?.invalid_sig_today ?? 0) + Math.max(0, failedToday) > 0 ? 'danger' : 'success'}
            />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* ── Last webhook received ───────────────────────────────────────── */}
        <Card>
          <CardHeader title="Last Webhook Received" />
          {isLoading ? (
            <SkeletonCard />
          ) : data?.last_event ? (
            <div>
              <InfoRow label="Received"   value={<span>{fmtDate(data.last_event.created_at)} <span className="text-xs text-ink-faint">({fmtRelative(data.last_event.created_at)})</span></span>} />
              <InfoRow label="Event Type" value={<span className="font-mono text-xs">{data.last_event.event_type ?? '—'}</span>} />
              <InfoRow label="Signature"  value={<SigBadge valid={data.last_event.signature_valid} />} />
              <InfoRow label="Status"     value={
                data.last_event.processed
                  ? <Badge variant="success" size="sm">processed</Badge>
                  : <Badge variant="info"    size="sm">pending</Badge>
              } />
              {data.last_event.transaction_reference && (
                <InfoRow label="Reference" value={
                  <span className="font-mono text-xs text-ink-muted break-all">
                    {data.last_event.transaction_reference}
                  </span>
                } />
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 py-6 text-ink-faint">
              <Clock className="h-4 w-4 shrink-0" />
              <span className="text-sm">No Paystack webhooks received yet.</span>
            </div>
          )}
        </Card>

        {/* ── Last signature failure ──────────────────────────────────────── */}
        <Card>
          <CardHeader title="Last Signature Verification" />
          {isLoading ? (
            <SkeletonCard />
          ) : data?.last_invalid_signature ? (
            <div>
              <div className="flex items-center gap-2 mb-3 rounded-lg bg-rose-500/10 border border-rose-500/20 px-3 py-2.5">
                <XCircle className="h-4 w-4 text-rose-400 shrink-0" />
                <p className="text-xs text-rose-300">
                  A webhook was received with an invalid signature. It was stored but not processed.
                </p>
              </div>
              <InfoRow label="Received" value={<span>{fmtDate(data.last_invalid_signature.created_at)} <span className="text-xs text-ink-faint">({fmtRelative(data.last_invalid_signature.created_at)})</span></span>} />
              <InfoRow label="Event Type" value={<span className="font-mono text-xs">{data.last_invalid_signature.event_type ?? '—'}</span>} />
              <InfoRow label="Signature"  value={<SigBadge valid={false} />} />
              <p className="text-xs text-ink-faint mt-3">
                Check that <code className="bg-surface-2 px-1 rounded">PAYSTACK_SECRET_KEY</code> in{' '}
                <code className="bg-surface-2 px-1 rounded">.env</code> matches your Paystack dashboard key.
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-2 py-6 text-emerald-400">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span className="text-sm">All received webhooks had valid signatures.</span>
            </div>
          )}
        </Card>
      </div>

      {/* ── Last processing error ─────────────────────────────────────────── */}
      <Card>
        <CardHeader
          title="Last Processing Error"
          subtitle="Most recent permanently failed job in the paystack-webhooks queue"
        />
        {isLoading ? (
          <SkeletonCard />
        ) : data?.last_processing_error ? (
          <div className="space-y-3">
            <div className="flex items-start gap-2 rounded-lg bg-rose-500/10 border border-rose-500/20 px-3 py-2.5">
              <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
              <p className="text-xs text-rose-300 break-words">{data.last_processing_error.error_message}</p>
            </div>
            <InfoRow label="Failed At" value={<span>{fmtDate(data.last_processing_error.failed_at)} <span className="text-xs text-ink-faint">({fmtRelative(data.last_processing_error.failed_at)})</span></span>} />
            {data.last_processing_error.reference && (
              <InfoRow label="Reference" value={
                <span className="font-mono text-xs text-ink-muted">
                  {data.last_processing_error.reference}
                </span>
              } />
            )}
            <NavLink
              to="/operations/failed-deliveries"
              className="inline-flex items-center gap-1.5 text-xs text-accent hover:underline mt-1"
            >
              View all failed deliveries <ExternalLink className="h-3 w-3" />
            </NavLink>
          </div>
        ) : (
          <div className="flex items-center gap-2 py-6 text-emerald-400">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span className="text-sm">No processing errors recorded in the webhook queue.</span>
          </div>
        )}
      </Card>

      {/* ── Footer link ───────────────────────────────────────────────────── */}
      <div className="flex justify-end">
        <NavLink
          to="/operations/webhooks"
          className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline"
        >
          View all webhook logs <ExternalLink className="h-3.5 w-3.5" />
        </NavLink>
      </div>
    </div>
  )
}

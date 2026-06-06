import { Link } from 'react-router-dom'
import { CheckCircle, XCircle, Clock, AlertTriangle } from 'lucide-react'
import { CmsPageContent } from './CmsPageContent'

const EFFECTIVE_DATE = 'June 2025'

function PolicyCard({
  icon: Icon,
  iconClass,
  title,
  children,
}: {
  icon: React.FC<{ className?: string }>
  iconClass: string
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="bg-surface-1 border border-border rounded-xl p-5 space-y-3">
      <div className="flex items-center gap-3">
        <Icon className={`h-5 w-5 shrink-0 ${iconClass}`} />
        <h3 className="text-sm font-bold text-ink">{title}</h3>
      </div>
      <div className="text-sm text-ink-muted leading-relaxed space-y-2 pl-8">
        {children}
      </div>
    </div>
  )
}

export function RefundPolicyPage() {
  return (
    <CmsPageContent slug="refund-policy">
    <div className="space-y-10">

      <div className="space-y-3 pt-4">
        <h1 className="text-3xl md:text-4xl font-black tracking-tight text-ink">
          Refund Policy
        </h1>
        <p className="text-sm text-ink-faint">Effective: {EFFECTIVE_DATE}</p>
        <p className="text-base text-ink-muted leading-relaxed max-w-xl">
          We strive to deliver every service successfully. When something goes wrong, this policy
          explains when and how you are entitled to a refund.
        </p>
      </div>

      {/* Summary cards */}
      <div className="space-y-3">
        <PolicyCard icon={CheckCircle} iconClass="text-emerald-500" title="Successfully delivered services — not refundable">
          <p>
            If a service has been successfully delivered to the details you provided — airtime credited,
            electricity token issued, cable TV renewed, data activated, exam PIN generated or identity
            verified — the transaction is considered complete and is not eligible for a refund.
          </p>
          <p>
            This applies even if you entered incorrect details (wrong phone number, wrong meter number,
            wrong smartcard number, etc.). Please review all details carefully before confirming.
          </p>
        </PolicyCard>

        <PolicyCard icon={XCircle} iconClass="text-red-500" title="Failed transactions — wallet credit after confirmation">
          <p>
            If a transaction is debited from your wallet but the service is confirmed as undelivered
            or failed by the service provider, the full amount will be credited back to your Hive Data
            wallet.
          </p>
          <p>Refunds for confirmed failed transactions are typically processed within:</p>
          <ul className="list-disc list-inside marker:text-brand-400 space-y-1">
            <li>Automatically within a few minutes for most services where our system detects the failure.</li>
            <li>Up to 24 hours if the failure is reported manually and requires verification.</li>
          </ul>
          <p>
            Wallet credits, not bank transfers, are issued. Hive Data wallet balances cannot be
            withdrawn to a bank account.
          </p>
        </PolicyCard>

        <PolicyCard icon={AlertTriangle} iconClass="text-amber-500" title="Disputed transactions — manual review">
          <p>
            In some cases, a provider may report a transaction as successful while the service
            was not received (for example, an electricity token that was issued but never delivered
            by SMS). These cases require manual investigation.
          </p>
          <p>To raise a dispute:</p>
          <ul className="list-disc list-inside marker:text-amber-400 space-y-1">
            <li>Contact us at <a href="mailto:customercare@hivedata.ng" className="text-brand-600 dark:text-brand-400 hover:underline">customercare@hivedata.ng</a></li>
            <li>Include your transaction reference number (from your transaction history)</li>
            <li>Describe the issue clearly</li>
          </ul>
          <p>
            We will liaise with the relevant provider and respond within 2–5 business days.
            If the dispute is resolved in your favour, the amount will be credited to your wallet.
          </p>
        </PolicyCard>

        <PolicyCard icon={Clock} iconClass="text-blue-500" title="Pending transactions">
          <p>
            Transactions may briefly show as "Pending" while awaiting a response from the service
            provider. Pending transactions are usually resolved within a few minutes. Do not attempt
            to repeat the same purchase while a transaction is still pending, as this may result
            in a double charge.
          </p>
          <p>
            If a transaction remains pending for more than 30 minutes, contact our support team
            with the transaction reference number.
          </p>
        </PolicyCard>
      </div>

      {/* Service-specific notes */}
      <section className="bg-surface-1 border border-border rounded-2xl p-7 space-y-4">
        <h2 className="text-base font-bold text-ink">Service-specific notes</h2>
        <div className="space-y-4 text-sm text-ink-muted leading-relaxed">
          <div>
            <p className="font-medium text-ink mb-1">Airtime and data</p>
            <p>Delivery is near-instant. If not received within 5 minutes and the network is not experiencing a known outage, contact support.</p>
          </div>
          <div>
            <p className="font-medium text-ink mb-1">Electricity tokens</p>
            <p>Tokens are delivered via SMS to the phone number registered on the meter. If the SMS is not received, the token may still be retrieved from your transaction detail page. Contact support if the token is absent.</p>
          </div>
          <div>
            <p className="font-medium text-ink mb-1">Cable TV</p>
            <p>Subscription renewals are usually active within a few minutes. Provider-side delays do occasionally occur, especially around payment dates.</p>
          </div>
          <div>
            <p className="font-medium text-ink mb-1">Exam PINs</p>
            <p>PINs are generated and displayed on-screen and stored in your transaction history. A PIN that has been generated and displayed is considered delivered and is not refundable.</p>
          </div>
          <div>
            <p className="font-medium text-ink mb-1">Identity verification</p>
            <p>Verification charges apply regardless of whether the record is found, as the query itself consumes a provider API call. Refunds are not available for verification attempts.</p>
          </div>
        </div>
      </section>

      {/* Contact prompt */}
      <div className="text-center pt-2 space-y-3">
        <p className="text-sm text-ink-faint">Need to raise a dispute or report a failed transaction?</p>
        <Link
          to="/contact"
          className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-500 text-white font-semibold px-6 py-3 rounded-xl text-sm transition-colors shadow-brand"
        >
          Contact support
        </Link>
      </div>
    </div>
    </CmsPageContent>
  )
}

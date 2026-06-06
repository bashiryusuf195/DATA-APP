import { Mail, Globe, MessageCircle, Clock } from 'lucide-react'

function ContactCard({
  icon: Icon,
  label,
  value,
  href,
  note,
}: {
  icon: React.FC<{ className?: string }>
  label: string
  value: string
  href?: string
  note?: string
}) {
  return (
    <div className="flex gap-4 items-start bg-white dark:bg-white/[0.03] border border-gray-200 dark:border-white/8 rounded-xl p-5">
      <div className="h-10 w-10 rounded-xl bg-brand-50 dark:bg-brand-500/10 flex items-center justify-center shrink-0">
        <Icon className="h-5 w-5 text-brand-600 dark:text-brand-400" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-gray-400 dark:text-white/40 uppercase tracking-wide mb-1">{label}</p>
        {href ? (
          <a
            href={href}
            target={href.startsWith('http') ? '_blank' : undefined}
            rel="noopener noreferrer"
            className="text-sm font-semibold text-brand-600 dark:text-brand-400 hover:underline break-all"
          >
            {value}
          </a>
        ) : (
          <p className="text-sm font-semibold text-gray-900 dark:text-white">{value}</p>
        )}
        {note && <p className="text-xs text-gray-400 dark:text-white/40 mt-1 leading-relaxed">{note}</p>}
      </div>
    </div>
  )
}

export function ContactPage() {
  return (
    <div className="space-y-10">

      <div className="space-y-2 pt-4">
        <h1 className="text-3xl md:text-4xl font-black tracking-tight text-gray-900 dark:text-white">
          Contact Us
        </h1>
        <p className="text-base text-gray-500 dark:text-white/50 leading-relaxed max-w-xl">
          We are here to help. Reach our support team through any of the channels below and
          we will get back to you as quickly as possible.
        </p>
      </div>

      {/* Contact channels */}
      <section className="space-y-3">
        <ContactCard
          icon={Mail}
          label="Email support"
          value="customercare@hivedata.ng"
          href="mailto:customercare@hivedata.ng"
          note="For transaction disputes, account issues and general enquiries."
        />
        <ContactCard
          icon={Globe}
          label="Website"
          value="hivedata.ng"
          href="https://hivedata.ng"
          note="Visit our main website for updates and announcements."
        />
        <ContactCard
          icon={Clock}
          label="Support hours"
          value="Monday – Saturday, 8 am – 8 pm WAT"
          note="Response times may be longer on public holidays."
        />
      </section>

      {/* What to include in email */}
      <section className="bg-white dark:bg-white/[0.03] border border-gray-200 dark:border-white/8 rounded-2xl p-7 space-y-4">
        <h2 className="text-base font-bold text-gray-900 dark:text-white">
          When emailing about a transaction
        </h2>
        <p className="text-sm text-gray-500 dark:text-white/55 leading-relaxed">
          To speed up your request, please include the following in your email:
        </p>
        <ul className="space-y-2 text-sm text-gray-500 dark:text-white/55 leading-relaxed list-disc list-inside marker:text-brand-500">
          <li>Your registered email address</li>
          <li>The transaction reference number (visible in your transaction history)</li>
          <li>A brief description of the issue (e.g. "Airtime was not delivered", "Meter token not received")</li>
          <li>The date and time of the transaction</li>
        </ul>
      </section>

      {/* Common issues */}
      <section className="space-y-4">
        <h2 className="text-base font-bold text-gray-900 dark:text-white">Common issues & quick answers</h2>
        <div className="space-y-3">
          {[
            {
              q: 'My airtime or data was not delivered',
              a: 'Check your transaction history first. If the status shows "Successful" but the service was not delivered, email us with the reference. Confirmed failures are refunded to your wallet.'
            },
            {
              q: 'I entered the wrong phone number or meter number',
              a: 'Unfortunately, once a service has been successfully delivered to the number or meter you provided, it cannot be reversed. Always double-check details before confirming.'
            },
            {
              q: 'My wallet was debited but the transaction is still "Pending"',
              a: 'Pending transactions are usually resolved within a few minutes. If it is still pending after 30 minutes, contact us with the reference number.'
            },
            {
              q: 'I want a refund',
              a: 'Please read our Refund Policy for full details. Failed and undelivered transactions qualify for a wallet credit after confirmation.'
            },
          ].map(({ q, a }) => (
            <div
              key={q}
              className="bg-white dark:bg-white/[0.03] border border-gray-200 dark:border-white/8 rounded-xl p-5 space-y-2"
            >
              <div className="flex gap-2 items-start">
                <MessageCircle className="h-4 w-4 text-brand-500 mt-0.5 shrink-0" />
                <p className="text-sm font-semibold text-gray-900 dark:text-white">{q}</p>
              </div>
              <p className="text-sm text-gray-500 dark:text-white/50 leading-relaxed pl-6">{a}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

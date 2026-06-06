import { Link } from 'react-router-dom'
import { Zap, Phone, Wifi, Tv, Shield, CreditCard, FileText, UserCheck } from 'lucide-react'

const SERVICES = [
  { icon: Phone,     label: 'Airtime Top-up',          desc: 'Instant recharge for MTN, Airtel, Glo and 9mobile.' },
  { icon: Wifi,      label: 'Data Bundles',             desc: 'Affordable daily, weekly and monthly data plans for all networks.' },
  { icon: Zap,       label: 'Electricity Bills',        desc: 'Prepaid and postpaid meter token payments for all DISCOs.' },
  { icon: Tv,        label: 'Cable TV',                 desc: 'DSTV, GOTV and Startimes subscription renewals.' },
  { icon: FileText,  label: 'Exam PINs',                desc: 'WAEC, NECO, JAMB and other examination scratch cards.' },
  { icon: UserCheck, label: 'Identity Verification',    desc: 'NIN and BVN verification for KYC compliance.' },
  { icon: CreditCard,label: 'Wallet Funding',           desc: 'Fund your wallet by bank transfer or card payment.' },
  { icon: Shield,    label: 'Secure Transactions',      desc: 'Every transaction is PIN-protected and encrypted end-to-end.' },
]

export function AboutPage() {
  return (
    <div className="space-y-12">

      {/* Hero */}
      <div className="text-center space-y-4 pt-4">
        <div className="inline-flex h-14 w-14 rounded-2xl bg-brand-600 items-center justify-center shadow-brand mx-auto">
          <Zap className="h-7 w-7 text-white" />
        </div>
        <h1 className="text-3xl md:text-4xl font-black tracking-tight text-ink">
          About Hive Data
        </h1>
        <p className="text-base text-ink-muted max-w-xl mx-auto leading-relaxed">
          Hive Data is a Nigerian digital utility payment platform designed to make everyday
          bill payments fast, simple and accessible to everyone.
        </p>
      </div>

      {/* Mission */}
      <section className="bg-surface-1 border border-border rounded-2xl p-7 space-y-3">
        <h2 className="text-lg font-bold text-ink">Our Mission</h2>
        <p className="text-sm text-ink-muted leading-relaxed">
          Millions of Nigerians spend time and money travelling to agents or recharge card sellers
          for basic utility payments. Hive Data removes that friction. We build reliable, affordable
          infrastructure so you can top up airtime, settle electricity bills, renew your cable TV
          subscription and more — in seconds, from any device, any time of day.
        </p>
        <p className="text-sm text-ink-muted leading-relaxed">
          Our goal is a platform that is transparent about pricing, honest about service availability,
          and quick to resolve problems when they arise.
        </p>
      </section>

      {/* Services */}
      <section className="space-y-5">
        <h2 className="text-lg font-bold text-ink">What we offer</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {SERVICES.map(({ icon: Icon, label, desc }) => (
            <div
              key={label}
              className="flex gap-3 items-start bg-surface-1 border border-border rounded-xl p-4"
            >
              <div className="h-9 w-9 rounded-lg bg-brand-50 dark:bg-brand-500/10 flex items-center justify-center shrink-0">
                <Icon className="h-4.5 w-4.5 text-brand-600 dark:text-brand-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-ink">{label}</p>
                <p className="text-xs text-ink-faint mt-0.5 leading-relaxed">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Values */}
      <section className="bg-surface-1 border border-border rounded-2xl p-7 space-y-4">
        <h2 className="text-lg font-bold text-ink">Our values</h2>
        <ul className="space-y-3 text-sm text-ink-muted leading-relaxed">
          <li><span className="font-semibold text-ink">Reliability</span> — We work with multiple service providers and route requests intelligently to maximise uptime.</li>
          <li><span className="font-semibold text-ink">Transparency</span> — Prices and service charges are shown before you confirm any transaction.</li>
          <li><span className="font-semibold text-ink">Security</span> — Your wallet is PIN-protected. Sensitive identity data (BVN, NIN) is encrypted and never shared with third parties except where required by law or for direct service delivery.</li>
          <li><span className="font-semibold text-ink">Accountability</span> — Failed transactions are investigated and resolved. Confirmed failures are automatically refunded to your wallet.</li>
        </ul>
      </section>

      {/* CTA */}
      <div className="text-center pt-2">
        <p className="text-sm text-ink-faint mb-4">Have questions or need support?</p>
        <Link
          to="/contact"
          className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-500 text-white font-semibold px-6 py-3 rounded-xl text-sm transition-colors shadow-brand"
        >
          Contact us
        </Link>
      </div>
    </div>
  )
}

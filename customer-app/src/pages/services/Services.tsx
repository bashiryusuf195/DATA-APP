import { Link } from 'react-router-dom'
import { Phone, Wifi, Zap, Tv, FileText, ShieldCheck } from 'lucide-react'

const SERVICES = [
  { to: '/services/airtime',     label: 'Airtime',               icon: Phone,       color: 'text-emerald-600', bgColor: 'bg-emerald-50 dark:bg-emerald-950',  description: 'Recharge any network' },
  { to: '/services/data',        label: 'Data',                  icon: Wifi,        color: 'text-blue-600',    bgColor: 'bg-blue-50 dark:bg-blue-950',         description: 'Buy data bundles' },
  { to: '/services/electricity', label: 'Electricity',           icon: Zap,         color: 'text-amber-600',   bgColor: 'bg-amber-50 dark:bg-amber-950',       description: 'Pay electricity bills' },
  { to: '/services/cable-tv',    label: 'Cable TV',              icon: Tv,          color: 'text-purple-600',  bgColor: 'bg-purple-50 dark:bg-purple-950',     description: 'DSTV, GoTV, StarTimes' },
  { to: '/services/exam-pin',    label: 'Exam PIN',              icon: FileText,    color: 'text-rose-600',    bgColor: 'bg-rose-50 dark:bg-rose-950',         description: 'WAEC, NECO tokens' },
  { to: '/services/identity',    label: 'Identity Verification', icon: ShieldCheck, color: 'text-indigo-600',  bgColor: 'bg-indigo-50 dark:bg-indigo-950',     description: 'NIN / BVN lookup' },
]

export function ServicesPage() {
  return (
    <div className="space-y-4 pt-2">
      <div>
        <h1 className="text-xl font-bold text-ink">Services</h1>
        <p className="text-sm text-ink-muted mt-0.5">Choose a service to get started</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {SERVICES.map((s) => (
          <Link
            key={s.to}
            to={s.to}
            className="flex flex-col items-center gap-2.5 p-4 rounded-2xl border border-border bg-surface-1 hover:border-brand-200 hover:shadow-card-md active:scale-95 transition-all"
          >
            <div className={`h-12 w-12 rounded-2xl flex items-center justify-center ${s.bgColor}`}>
              <s.icon className={`h-6 w-6 ${s.color}`} />
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-ink">{s.label}</p>
              <p className="text-xs text-ink-muted mt-0.5">{s.description}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}

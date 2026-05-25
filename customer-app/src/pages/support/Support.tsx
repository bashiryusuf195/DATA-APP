import { Mail, MessageCircle, Phone, ChevronRight, HelpCircle } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { contentApi, type SupportContact, type SupportContent } from '@/api/content.api'

const DEFAULTS: SupportContent = {
  hero_subtitle: 'Our support team is available Monday – Saturday, 8 am – 8 pm.',
  contacts: [
    { type: 'whatsapp', label: 'WhatsApp', value: 'Chat with us',           href: 'https://wa.me/2348000000000' },
    { type: 'email',    label: 'Email',    value: 'support@smshikasub.com', href: 'mailto:support@smshikasub.com' },
    { type: 'phone',    label: 'Phone',    value: '0800 000 0000',          href: 'tel:08000000000' },
  ],
  faqs: [
    { q: 'How long does airtime top-up take?',    a: 'Airtime is delivered instantly after a successful transaction.' },
    { q: "My electricity token hasn't arrived?",  a: 'Tokens are sent via SMS and shown in your transaction history. If missing after 5 minutes, contact us.' },
    { q: 'Can I reverse a failed transaction?',   a: 'Failed transactions are auto-reversed to your wallet within 24 hours.' },
    { q: 'How do I fund my wallet?',              a: 'Go to Wallet → Add Money and follow the bank transfer instructions.' },
    { q: 'What is KYC and why do I need it?',     a: 'KYC verification increases your daily transaction limits and unlocks all features.' },
  ],
}

const CONTACT_STYLE: Record<SupportContact['type'], { icon: typeof Mail; bg: string; color: string }> = {
  whatsapp: { icon: MessageCircle, bg: 'bg-emerald-100 dark:bg-emerald-900/30', color: 'text-emerald-600 dark:text-emerald-400' },
  email:    { icon: Mail,          bg: 'bg-brand-100 dark:bg-brand-900/30',     color: 'text-brand-600 dark:text-brand-400'     },
  phone:    { icon: Phone,         bg: 'bg-amber-100 dark:bg-amber-900/30',     color: 'text-amber-600 dark:text-amber-400'     },
}

function ContactCard({ contact }: { contact: SupportContact }) {
  const style = CONTACT_STYLE[contact.type] ?? CONTACT_STYLE.email
  const Icon  = style.icon
  return (
    <a
      href={contact.href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-4 p-4 bg-surface-1 rounded-2xl shadow-card hover:bg-surface-2 transition-colors"
    >
      <div className={`h-11 w-11 rounded-full flex items-center justify-center shrink-0 ${style.bg}`}>
        <Icon className={`h-5 w-5 ${style.color}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-ink-faint">{contact.label}</p>
        <p className="text-sm font-semibold text-ink truncate">{contact.value}</p>
      </div>
      <ChevronRight className="h-4 w-4 text-ink-faint shrink-0" />
    </a>
  )
}

export function SupportPage() {
  const { data: content } = useQuery({
    queryKey:  ['app-content'],
    queryFn:   contentApi.getAppContent,
    staleTime: 0,
    retry:     false,
  })

  const support: SupportContent = content?.support ?? DEFAULTS

  return (
    <div className="space-y-5 pt-1 pb-4">
      <h1 className="text-xl font-bold text-ink">Support</h1>

      {/* Hero */}
      <div className="bg-brand-600 rounded-3xl p-5 shadow-brand text-white">
        <div className="h-12 w-12 rounded-2xl bg-white/20 flex items-center justify-center mb-3">
          <HelpCircle className="h-6 w-6 text-white" />
        </div>
        <p className="font-bold text-base">How can we help you?</p>
        <p className="text-white/80 text-sm mt-1">{support.hero_subtitle}</p>
      </div>

      {/* Contact channels */}
      {support.contacts.length > 0 && (
        <div>
          <p className="text-sm font-bold text-ink mb-3">Contact Us</p>
          <div className="space-y-3">
            {support.contacts.map((c, i) => (
              <ContactCard key={i} contact={c} />
            ))}
          </div>
        </div>
      )}

      {/* FAQs */}
      {support.faqs.length > 0 && (
        <div>
          <p className="text-sm font-bold text-ink mb-3">Frequently Asked Questions</p>
          <div className="bg-surface-1 rounded-3xl shadow-card overflow-hidden divide-y divide-border">
            {support.faqs.map(({ q, a }, i) => (
              <details key={i} className="group">
                <summary className="flex items-center justify-between gap-3 p-4 cursor-pointer list-none hover:bg-surface-2 transition-colors">
                  <span className="text-sm font-semibold text-ink">{q}</span>
                  <ChevronRight className="h-4 w-4 text-ink-faint shrink-0 transition-transform group-open:rotate-90" />
                </summary>
                <p className="px-4 pb-4 text-sm text-ink-muted leading-relaxed">{a}</p>
              </details>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

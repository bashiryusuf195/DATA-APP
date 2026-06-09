import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { MessageCircle, X, ExternalLink, Ticket } from 'lucide-react'
import { useSupportConfig } from '@/hooks/useSupportConfig'
import { cn } from '@/utils/cn'

// WhatsApp brand green
const WA_GREEN = '#25D366'

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  )
}

function isExternal(url: string): boolean {
  return url.startsWith('http://') || url.startsWith('https://')
}

export function SupportWidget() {
  const navigate           = useNavigate()
  const { data: config }   = useSupportConfig()
  const [open, setOpen]    = useState(false)
  const panelRef           = useRef<HTMLDivElement>(null)
  const btnRef             = useRef<HTMLButtonElement>(null)

  // Close when clicking outside
  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (
        panelRef.current  && !panelRef.current.contains(e.target as Node) &&
        btnRef.current    && !btnRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  // Hide if disabled or no links configured
  if (!config?.enabled) return null
  const hasWhatsApp = !!config.whatsapp_url
  const hasTicket   = !!config.ticket_url
  if (!hasWhatsApp && !hasTicket) return null

  function handleWhatsApp() {
    setOpen(false)
    window.open(config!.whatsapp_url, '_blank', 'noopener,noreferrer')
  }

  function handleTicket() {
    setOpen(false)
    const url = config!.ticket_url
    if (isExternal(url)) {
      window.open(url, '_blank', 'noopener,noreferrer')
    } else {
      navigate(url)
    }
  }

  return (
    // Positioned above bottom-nav on mobile (bottom-nav ≈ 64px + 8px gap = bottom-20)
    // On md+ screens the bottom-nav is hidden so we drop to bottom-6
    <div className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-40 flex flex-col items-end gap-2">

      {/* ── Pop-up panel ──────────────────────────────────────────────── */}
      <div
        ref={panelRef}
        role="dialog"
        aria-label="Support options"
        aria-hidden={!open}
        className={cn(
          'w-52 rounded-2xl shadow-xl border border-border bg-surface-0 overflow-hidden',
          'transition-all duration-200 ease-out origin-bottom-right',
          open
            ? 'opacity-100 scale-100 translate-y-0 pointer-events-auto'
            : 'opacity-0 scale-95 translate-y-2 pointer-events-none',
        )}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-border bg-surface-1">
          <p className="text-xs font-bold text-ink">Need help?</p>
          <p className="text-[11px] text-ink-faint mt-0.5">Choose a support option</p>
        </div>

        {/* Options */}
        <div className="p-1.5 space-y-0.5">
          {hasWhatsApp && (
            <button
              onClick={handleWhatsApp}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-surface-1 transition-colors group text-left"
            >
              <span
                className="h-8 w-8 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-110"
                style={{ background: WA_GREEN }}
              >
                <WhatsAppIcon className="h-4 w-4 text-white" />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-[13px] font-semibold text-ink">WhatsApp</span>
                <span className="block text-[10px] text-ink-faint">Chat with us</span>
              </span>
              <ExternalLink className="h-3 w-3 text-ink-faint shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          )}

          {hasTicket && (
            <button
              onClick={handleTicket}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-surface-1 transition-colors group text-left"
            >
              <span className="h-8 w-8 rounded-xl bg-brand-50 dark:bg-brand-950/40 flex items-center justify-center shrink-0 transition-transform group-hover:scale-110">
                <Ticket className="h-4 w-4 text-brand-600 dark:text-brand-400" />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-[13px] font-semibold text-ink">Support Ticket</span>
                <span className="block text-[10px] text-ink-faint">
                  {isExternal(config.ticket_url) ? 'Open help centre' : 'Open a ticket'}
                </span>
              </span>
              {isExternal(config.ticket_url) && (
                <ExternalLink className="h-3 w-3 text-ink-faint shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
              )}
            </button>
          )}
        </div>

        {/* Footer label */}
        <p className="text-center text-[10px] text-ink-faint pb-2.5 pt-1">
          We're here to help
        </p>
      </div>

      {/* ── FAB ───────────────────────────────────────────────────────── */}
      <button
        ref={btnRef}
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Close support menu' : 'Open support menu'}
        aria-expanded={open}
        className={cn(
          'h-14 w-14 rounded-full shadow-xl flex items-center justify-center',
          'transition-all duration-200 ease-out',
          'focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-400/40',
          open
            ? 'bg-surface-0 border-2 border-border rotate-0 scale-100'
            : 'bg-brand-600 hover:bg-brand-700 scale-100 hover:scale-105 active:scale-95',
        )}
      >
        <span
          className={cn(
            'absolute inset-0 flex items-center justify-center transition-all duration-200',
            open ? 'opacity-100 rotate-0 scale-100' : 'opacity-0 rotate-90 scale-75'
          )}
        >
          <X className="h-5 w-5 text-ink" />
        </span>
        <span
          className={cn(
            'absolute inset-0 flex items-center justify-center transition-all duration-200',
            open ? 'opacity-0 -rotate-90 scale-75' : 'opacity-100 rotate-0 scale-100'
          )}
        >
          <MessageCircle className="h-6 w-6 text-white" />
        </span>
      </button>

      {/* Pulse ring — draws attention on first render, only when closed */}
      {!open && (
        <span className="absolute bottom-0 right-0 h-14 w-14 rounded-full bg-brand-400/30 animate-ping pointer-events-none" />
      )}
    </div>
  )
}

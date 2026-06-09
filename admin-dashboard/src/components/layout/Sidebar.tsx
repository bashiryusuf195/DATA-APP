import { cn } from '@/utils/cn'
import { NavLink } from 'react-router-dom'
import { useUiStore } from '@/store/ui.store'
import { useState, useCallback } from 'react'
import {
  LayoutDashboard, Zap, GitBranch, ArrowLeftRight, CreditCard,
  HeartPulse, Wallet, Bell, WalletCards, ChevronLeft, ChevronRight,
  ChevronDown, Users, RotateCcw, Scale, List, Globe, Plug, Landmark,
  ClipboardList, SlidersHorizontal, ArrowUpDown, Radio, ShieldCheck,
  Gift, MessageSquare, Flag, PackageX, Webhook, Layout, MonitorDot,
  HeartHandshake, HardDrive, KeyRound, TrendingUp, AlertTriangle,
  BookOpen, Tag, RefreshCcw, FileText, Plus, FlaskConical, Activity,
} from 'lucide-react'
import type { ReactNode } from 'react'

interface NavItem {
  to:    string
  label: string
  icon:  ReactNode
}

interface NavSection {
  key:   string
  title: string
  items: NavItem[]
}

const nav: NavSection[] = [
  {
    key:   'overview',
    title: 'Overview',
    items: [
      { to: '/dashboard', label: 'Dashboard', icon: <LayoutDashboard className="h-4 w-4" /> },
    ],
  },
  {
    key:   'users',
    title: 'Users',
    items: [
      { to: '/users', label: 'Users',              icon: <Users       className="h-4 w-4" /> },
      { to: '/roles', label: 'Roles & Permissions', icon: <ShieldCheck className="h-4 w-4" /> },
    ],
  },
  {
    key:   'wallet',
    title: 'Wallet & Funding',
    items: [
      { to: '/system/wallet-adjust', label: 'Manual Wallet Ops',   icon: <ArrowUpDown className="h-4 w-4" /> },
      { to: '/wallets',              label: 'Wallets',              icon: <Wallet      className="h-4 w-4" /> },
      { to: '/funding',              label: 'Funding Transactions', icon: <Landmark    className="h-4 w-4" /> },
      { to: '/ledger',               label: 'Ledger',               icon: <BookOpen    className="h-4 w-4" /> },
    ],
  },
  {
    key:   'transactions',
    title: 'Transactions',
    items: [
      { to: '/transactions',                 label: 'Transactions',      icon: <ArrowLeftRight className="h-4 w-4" /> },
      { to: '/attempts',                     label: 'Provider Attempts', icon: <RefreshCcw     className="h-4 w-4" /> },
      { to: '/finance/refunds-reversals',    label: 'Refunds',           icon: <RotateCcw      className="h-4 w-4" /> },
      { to: '/finance/reconciliation-reports', label: 'Reconciliation',  icon: <Scale          className="h-4 w-4" /> },
    ],
  },
  {
    key:   'services',
    title: 'Services & Pricing',
    items: [
      { to: '/service-plans',        label: 'Service Plans',  icon: <List     className="h-4 w-4" /> },
      { to: '/service-status',       label: 'Service Status', icon: <Activity className="h-4 w-4" /> },
      { to: '/service-availability', label: 'Availability',   icon: <Globe    className="h-4 w-4" /> },
      { to: '/pricing',              label: 'Pricing',        icon: <Tag      className="h-4 w-4" /> },
    ],
  },
  {
    key:   'providers',
    title: 'Providers',
    items: [
      { to: '/providers',               label: 'Providers',       icon: <Plug       className="h-4 w-4" /> },
      { to: '/api-integrations',        label: 'Credentials',     icon: <KeyRound   className="h-4 w-4" /> },
      { to: '/routing-rules',           label: 'Routing Rules',   icon: <GitBranch  className="h-4 w-4" /> },
      { to: '/provider-wallets',        label: 'Provider Wallets',icon: <WalletCards className="h-4 w-4" /> },
      { to: '/operations/provider-health', label: 'Provider Health', icon: <HeartPulse className="h-4 w-4" /> },
    ],
  },
  {
    key:   'payments',
    title: 'Payments',
    items: [
      { to: '/payment-gateways',    label: 'Payment Gateways', icon: <CreditCard     className="h-4 w-4" /> },
      { to: '/operations/webhooks', label: 'Webhook Events',   icon: <Webhook        className="h-4 w-4" /> },
      { to: '/squad-uat',           label: 'Squad UAT ⚗',     icon: <FlaskConical   className="h-4 w-4 text-amber-400" /> },
    ],
  },
  {
    key:   'comms',
    title: 'Notifications & Broadcasts',
    items: [
      { to: '/communication/broadcasts',   label: 'Broadcast Center', icon: <Radio         className="h-4 w-4" /> },
      { to: '/communication/notifications',label: 'Notifications',    icon: <Bell          className="h-4 w-4" /> },
      { to: '/support/tickets',            label: 'Support Tickets',  icon: <MessageSquare className="h-4 w-4" /> },
      { to: '/support/disputes',           label: 'Disputes',         icon: <Flag          className="h-4 w-4" /> },
    ],
  },
  {
    key:   'reports',
    title: 'Reports',
    items: [
      { to: '/finance/revenue',                label: 'Revenue',        icon: <TrendingUp    className="h-4 w-4" /> },
      { to: '/finance/reconciliation-issues',  label: 'Recon Issues',   icon: <AlertTriangle className="h-4 w-4" /> },
      { to: '/audit-logs',                     label: 'Audit Logs',     icon: <ClipboardList className="h-4 w-4" /> },
      { to: '/referral-program',               label: 'Referral Program',icon: <Gift         className="h-4 w-4" /> },
    ],
  },
  {
    key:   'cms',
    title: 'Content Management',
    items: [
      { to: '/cms/pages',     label: 'Pages',    icon: <FileText className="h-4 w-4" /> },
      { to: '/cms/pages/new', label: 'New Page', icon: <Plus     className="h-4 w-4" /> },
    ],
  },
  {
    key:   'security',
    title: 'Security',
    items: [
      { to: '/compliance/kyc', label: 'KYC / Compliance', icon: <ShieldCheck className="h-4 w-4" /> },
      { to: '/app-content',    label: 'App Content',      icon: <Layout      className="h-4 w-4" /> },
    ],
  },
  {
    key:   'system',
    title: 'System Health',
    items: [
      { to: '/operations/system-health',         label: 'System Health',        icon: <HeartHandshake className="h-4 w-4" /> },
      { to: '/operations/queue-monitor',         label: 'Queue Monitor',        icon: <MonitorDot     className="h-4 w-4" /> },
      { to: '/failed-jobs',                      label: 'Failed Jobs',          icon: <PackageX       className="h-4 w-4" /> },
      { to: '/operations/backup-integrity',      label: 'Backup & Integrity',   icon: <HardDrive      className="h-4 w-4" /> },
      { to: '/operations/webhook-diagnostics',   label: 'Webhook Diagnostics',  icon: <Webhook        className="h-4 w-4" /> },
    ],
  },
  {
    key:   'settings',
    title: 'Settings',
    items: [
      { to: '/settings', label: 'Settings', icon: <SlidersHorizontal className="h-4 w-4" /> },
    ],
  },
]

// Reports and Settings start collapsed — they're lower-priority and would
// overflow the sidebar if all sections were open on first load.
const DEFAULT_CLOSED = new Set(['reports', 'settings'])

export function Sidebar() {
  const { sidebarCollapsed, toggleSidebar } = useUiStore()
  const [closedSections, setClosedSections] = useState<Set<string>>(DEFAULT_CLOSED)

  const toggleSection = useCallback((key: string) => {
    setClosedSections((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  return (
    <aside
      className={cn(
        'flex flex-col bg-surface-1 border-r border-border transition-all duration-200 shrink-0',
        sidebarCollapsed ? 'w-16' : 'w-56'
      )}
    >
      {/* Brand */}
      <div className="flex h-14 items-center justify-between px-4 border-b border-border shrink-0">
        {!sidebarCollapsed ? (
          <>
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded-md bg-accent flex items-center justify-center shrink-0">
                <Zap className="h-3.5 w-3.5 text-white" />
              </div>
              <span className="text-sm font-bold text-ink">Hive Data</span>
            </div>
            <button
              onClick={toggleSidebar}
              className="text-ink-faint hover:text-ink transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          </>
        ) : (
          <div className="h-6 w-6 rounded-md bg-accent flex items-center justify-center mx-auto">
            <Zap className="h-3.5 w-3.5 text-white" />
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-3">
        {nav.map((section) => {
          const isClosed = !sidebarCollapsed && closedSections.has(section.key)
          return (
            <div key={section.key}>
              {!sidebarCollapsed ? (
                <button
                  onClick={() => toggleSection(section.key)}
                  className="flex items-center justify-between w-full px-2 mb-1 group"
                >
                  <p className="text-[10px] font-semibold text-ink-faint uppercase tracking-widest">
                    {section.title}
                  </p>
                  <ChevronDown
                    className={cn(
                      'h-3 w-3 text-ink-faint transition-transform duration-150',
                      isClosed && '-rotate-90'
                    )}
                  />
                </button>
              ) : null}

              {!isClosed && (
                <ul className="space-y-0.5">
                  {section.items.map((item) => (
                    <li key={item.to}>
                      <NavLink
                        to={item.to}
                        className={({ isActive }) =>
                          cn(
                            'flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm transition-colors duration-100',
                            isActive
                              ? 'bg-accent-subtle text-accent font-medium'
                              : 'text-ink-muted hover:text-ink hover:bg-surface-2',
                            sidebarCollapsed && 'justify-center'
                          )
                        }
                        title={sidebarCollapsed ? item.label : undefined}
                      >
                        {item.icon}
                        {!sidebarCollapsed && (
                          <span className="truncate">{item.label}</span>
                        )}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </nav>

      {/* Expand button when collapsed */}
      {sidebarCollapsed && (
        <div className="p-2 border-t border-border shrink-0">
          <button
            onClick={toggleSidebar}
            className="w-full flex justify-center p-2 rounded-lg text-ink-faint hover:text-ink hover:bg-surface-2 transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </aside>
  )
}

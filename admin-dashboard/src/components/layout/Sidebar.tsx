import { cn } from '@/utils/cn'
import { NavLink } from 'react-router-dom'
import { useUiStore } from '@/store/ui.store'
import { useState, useCallback } from 'react'
import {
  LayoutDashboard,
  Zap,
  GitBranch,
  ArrowLeftRight,
  CreditCard,
  Activity,
  HeartPulse,
  Wallet,
  Bell,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  // Users
  Users,
  Shield,
  // Finance
  BookOpen,
  FileText,
  RotateCcw,
  TrendingUp,
  // Services
  Package,
  List,
  Tag,
  Globe,
  // Payments
  Plug,
  Landmark,
  // Security
  ClipboardList,
  UserCheck,
  Lock,
  Gauge,
  // Operations
  Monitor,
  Scale,
  Cpu,
  BarChart2,
  // Support
  MessageSquare,
  Flag,
  Megaphone,
  // System
  SlidersHorizontal,
  // Communication
  FileText as FileTemplate,
  Clock as ClockIcon,
  Radio,
} from 'lucide-react'
import type { ReactNode } from 'react'

interface NavItem {
  to: string
  label: string
  icon: ReactNode
}

interface NavSection {
  key: string
  title: string
  items: NavItem[]
}

const nav: NavSection[] = [
  {
    key: 'overview',
    title: 'Overview',
    items: [
      { to: '/dashboard', label: 'Dashboard', icon: <LayoutDashboard className="h-4 w-4" /> },
    ],
  },
  {
    key: 'users',
    title: 'Users',
    items: [
      { to: '/users',  label: 'Users',             icon: <Users className="h-4 w-4" /> },
      { to: '/roles',  label: 'Roles & Permissions', icon: <Shield className="h-4 w-4" /> },
    ],
  },
  {
    key: 'finance',
    title: 'Finance',
    items: [
      { to: '/finance/reconciliation-reports', label: 'Reconciliation Reports', icon: <Scale className="h-4 w-4" /> },
      { to: '/finance/reconciliation-issues',  label: 'Reconciliation Issues',  icon: <AlertTriangle className="h-4 w-4" /> },
      { to: '/finance/revenue',                label: 'Revenue Analytics',      icon: <TrendingUp className="h-4 w-4" /> },
      { to: '/finance/provider-balances',      label: 'Provider Balances',      icon: <BarChart2 className="h-4 w-4" /> },
      { to: '/finance/profit-analysis',        label: 'Profit Analysis',        icon: <TrendingUp className="h-4 w-4" /> },
      { to: '/finance/refunds-reversals',      label: 'Refunds & Reversals',    icon: <RotateCcw className="h-4 w-4" /> },
    ],
  },
  {
    key: 'ledger',
    title: 'Ledger',
    items: [
      { to: '/ledger',          label: 'Ledger Explorer', icon: <BookOpen className="h-4 w-4" /> },
      { to: '/journal-batches', label: 'Journal Batches', icon: <FileText className="h-4 w-4" /> },
      { to: '/funding',         label: 'Funding',         icon: <CreditCard className="h-4 w-4" /> },
    ],
  },
  {
    key: 'services',
    title: 'Services',
    items: [
      { to: '/services',             label: 'Services',          icon: <Package className="h-4 w-4" /> },
      { to: '/service-plans',        label: 'Service Plans',     icon: <List className="h-4 w-4" /> },
      { to: '/pricing',              label: 'Pricing',           icon: <Tag className="h-4 w-4" /> },
      { to: '/service-availability', label: 'Availability',      icon: <Globe className="h-4 w-4" /> },
    ],
  },
  {
    key: 'payments',
    title: 'Payments',
    items: [
      { to: '/paystack',         label: 'Paystack Txns',   icon: <CreditCard className="h-4 w-4" /> },
      { to: '/webhooks',         label: 'Webhook Events',  icon: <Plug className="h-4 w-4" /> },
      { to: '/virtual-accounts', label: 'Virtual Accounts', icon: <Landmark className="h-4 w-4" /> },
    ],
  },
  {
    key: 'providers',
    title: 'Providers',
    items: [
      { to: '/providers',      label: 'Providers',       icon: <Zap className="h-4 w-4" /> },
      { to: '/routing-rules',  label: 'Routing Rules',   icon: <GitBranch className="h-4 w-4" /> },
      { to: '/health-metrics', label: 'Health Metrics',  icon: <HeartPulse className="h-4 w-4" /> },
    ],
  },
  {
    key: 'transactions',
    title: 'Transactions',
    items: [
      { to: '/transactions', label: 'Transactions',     icon: <ArrowLeftRight className="h-4 w-4" /> },
      { to: '/attempts',     label: 'Provider Attempts', icon: <Activity className="h-4 w-4" /> },
    ],
  },
  {
    key: 'security',
    title: 'Security',
    items: [
      { to: '/audit-logs',     label: 'Audit Logs',      icon: <ClipboardList className="h-4 w-4" /> },
      { to: '/admin-activity', label: 'Admin Activity',  icon: <UserCheck className="h-4 w-4" /> },
      { to: '/sessions',       label: 'Sessions',        icon: <Lock className="h-4 w-4" /> },
      { to: '/rate-limits',    label: 'Rate Limits',     icon: <Gauge className="h-4 w-4" /> },
    ],
  },
  {
    key: 'operations',
    title: 'Operations',
    items: [
      { to: '/queue-monitor', label: 'Queue Monitor', icon: <Monitor className="h-4 w-4" /> },
      { to: '/failed-jobs',   label: 'Failed Jobs',   icon: <AlertTriangle className="h-4 w-4" /> },
      { to: '/worker-health', label: 'Worker Health', icon: <Cpu className="h-4 w-4" /> },
    ],
  },
  {
    key: 'support',
    title: 'Customer Support',
    items: [
      { to: '/support/tickets',    label: 'Support Tickets', icon: <MessageSquare className="h-4 w-4" /> },
      { to: '/support/disputes',   label: 'Disputes',        icon: <Flag className="h-4 w-4" /> },
      { to: '/support/complaints', label: 'Complaints',      icon: <Megaphone className="h-4 w-4" /> },
    ],
  },
  {
    key: 'communication',
    title: 'Communication',
    items: [
      { to: '/communication/notifications', label: 'Notifications',    icon: <Bell         className="h-4 w-4" /> },
      { to: '/communication/templates',     label: 'Templates',       icon: <FileTemplate className="h-4 w-4" /> },
      { to: '/communication/queue',         label: 'Queue',           icon: <ClockIcon    className="h-4 w-4" /> },
      { to: '/communication/broadcasts',    label: 'Broadcast Center', icon: <Radio       className="h-4 w-4" /> },
    ],
  },
  {
    key: 'system',
    title: 'System',
    items: [
      { to: '/wallets',   label: 'Wallet Monitor', icon: <Wallet            className="h-4 w-4" /> },
      { to: '/settings',  label: 'Settings',       icon: <SlidersHorizontal className="h-4 w-4" /> },
    ],
  },
]

// Sections closed by default to keep sidebar manageable on first load
const DEFAULT_CLOSED = new Set(['services', 'payments', 'ledger'])

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
              <span className="text-sm font-bold text-ink">VTU Admin</span>
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

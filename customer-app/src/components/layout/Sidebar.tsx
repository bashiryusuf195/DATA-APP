import { NavLink } from 'react-router-dom'
import {
  Home, Grid3X3, Wallet, ArrowLeftRight, User,
  Bell, Gift, Settings, Zap, LogOut,
} from 'lucide-react'
import { cn } from '@/utils/cn'
import { useAuthStore } from '@/store/auth.store'
import { authApi } from '@/api/auth.api'

const NAV = [
  { to: '/dashboard',    label: 'Home',          icon: Home },
  { to: '/services',     label: 'Services',      icon: Grid3X3 },
  { to: '/wallet',       label: 'Wallet',        icon: Wallet },
  { to: '/transactions', label: 'Transactions',  icon: ArrowLeftRight },
  { to: '/notifications',label: 'Notifications', icon: Bell },
  { to: '/referrals',    label: 'Referrals',     icon: Gift },
  { to: '/profile',      label: 'Profile',       icon: User },
  { to: '/settings',     label: 'Settings',      icon: Settings },
]

export function Sidebar() {
  const clearAuth = useAuthStore((s) => s.clearAuth)

  const handleLogout = async () => {
    try { await authApi.logout() } catch { /* ignore */ }
    clearAuth()
    window.location.href = '/login'
  }

  return (
    <aside className="hidden md:flex flex-col w-56 min-h-screen bg-surface-1 border-r border-border shrink-0">
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-5 h-16 border-b border-border shrink-0">
        <div className="h-8 w-8 rounded-xl bg-brand-600 flex items-center justify-center shrink-0">
          <Zap className="h-4 w-4 text-white" />
        </div>
        <div>
          <p className="text-sm font-bold text-ink leading-none">VTU Platform</p>
          <p className="text-[10px] text-ink-muted mt-0.5">Fast & Reliable</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors',
                isActive
                  ? 'bg-brand-50 text-brand-700 font-medium'
                  : 'text-ink-muted hover:text-ink hover:bg-surface-2'
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon className={cn('h-4.5 w-4.5 shrink-0', isActive && 'stroke-[2.5px]')} />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Logout */}
      <div className="px-3 pb-4 pt-2 border-t border-border">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm text-ink-muted hover:text-danger hover:bg-danger-light transition-colors"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          Sign out
        </button>
      </div>
    </aside>
  )
}

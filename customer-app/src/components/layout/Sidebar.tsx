import { NavLink, Link, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import {
  Home, Wallet, ArrowLeftRight, Bell,
  Gift, User, Settings, Zap, LogOut, Headphones,
} from 'lucide-react'
import { cn } from '@/utils/cn'
import { useAuthStore } from '@/store/auth.store'
import { authApi } from '@/api/auth.api'

const NAV = [
  { to: '/dashboard',    label: 'Home',          icon: Home          },
  { to: '/transactions', label: 'Transactions',  icon: ArrowLeftRight },
  { to: '/wallet',       label: 'Wallet',        icon: Wallet        },
  { to: '/services',     label: 'Services',      icon: Zap           },
  { to: '/notifications',label: 'Notifications', icon: Bell          },
  { to: '/referrals',    label: 'Referrals',     icon: Gift          },
  { to: '/profile',      label: 'Profile',       icon: User          },
  { to: '/settings',     label: 'Settings',      icon: Settings      },
  { to: '/support',      label: 'Support',       icon: Headphones    },
]

export function Sidebar() {
  const clearAuth   = useAuthStore((s) => s.clearAuth)
  const navigate    = useNavigate()
  const queryClient = useQueryClient()

  const handleLogout = async () => {
    try { await authApi.logout() } catch { /* ignore */ }
    clearAuth()
    queryClient.clear()
    navigate('/login', { replace: true })
  }

  return (
    <aside className="hidden md:flex flex-col w-60 min-h-screen bg-surface-1 border-r border-border shrink-0">
      {/* Brand */}
      <div className="flex items-center px-5 h-14 border-b border-border shrink-0">
        <img src="/logo-horizontal.png" alt="Hive Data" className="w-[120px] h-auto object-contain app-logo" />
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-5 space-y-0.5 overflow-y-auto">
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={`${to}-${label}`}
            to={to}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-150',
                isActive
                  ? 'bg-brand-600 text-white font-semibold shadow-brand'
                  : 'text-ink-muted hover:text-ink hover:bg-surface-2 font-medium'
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon className={cn('h-4.5 w-4.5 shrink-0', isActive ? 'stroke-[2px]' : 'stroke-[1.5px]')} />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Legal links + Logout */}
      <div className="px-3 pb-5 pt-2 border-t border-border space-y-1">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium text-ink-muted hover:text-danger hover:bg-danger/10 transition-colors"
        >
          <LogOut className="h-4.5 w-4.5 shrink-0" />
          Sign out
        </button>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 px-3 pt-1">
          <Link to="/about"            className="text-[10px] text-ink-faint hover:text-ink-muted transition-colors">About</Link>
          <Link to="/privacy-policy"   className="text-[10px] text-ink-faint hover:text-ink-muted transition-colors">Privacy</Link>
          <Link to="/terms-of-service" className="text-[10px] text-ink-faint hover:text-ink-muted transition-colors">Terms</Link>
          <Link to="/refund-policy"    className="text-[10px] text-ink-faint hover:text-ink-muted transition-colors">Refunds</Link>
          <Link to="/contact"          className="text-[10px] text-ink-faint hover:text-ink-muted transition-colors">Contact</Link>
        </div>
      </div>
    </aside>
  )
}

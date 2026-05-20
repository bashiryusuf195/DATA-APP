import { NavLink } from 'react-router-dom'
import { Home, Grid3X3, Wallet, ArrowLeftRight, User } from 'lucide-react'
import { cn } from '@/utils/cn'

const NAV = [
  { to: '/dashboard',    label: 'Home',         icon: Home },
  { to: '/services',     label: 'Services',     icon: Grid3X3 },
  { to: '/wallet',       label: 'Wallet',       icon: Wallet },
  { to: '/transactions', label: 'History',      icon: ArrowLeftRight },
  { to: '/profile',      label: 'Profile',      icon: User },
]

export function BottomNav() {
  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 bg-surface-1 border-t border-border safe-bottom md:hidden">
      <ul className="flex">
        {NAV.map(({ to, label, icon: Icon }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors',
                  isActive ? 'text-brand-600' : 'text-ink-faint'
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className={cn('h-5 w-5', isActive && 'stroke-[2.5px]')} />
                  {label}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}

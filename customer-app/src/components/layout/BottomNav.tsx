import { NavLink } from 'react-router-dom'
import { Home, Clock, Wallet, User, Headphones } from 'lucide-react'
import { cn } from '@/utils/cn'

const NAV = [
  { to: '/dashboard',    label: 'Home',    icon: Home       },
  { to: '/transactions', label: 'History', icon: Clock      },
  { to: '/wallet',       label: 'Wallet',  icon: Wallet     },
  { to: '/profile',      label: 'Profile', icon: User       },
  { to: '/support',      label: 'Support', icon: Headphones },
]

export function BottomNav() {
  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 bg-surface-1 border-t border-border safe-bottom md:hidden">
      <ul className="flex h-16">
        {NAV.map(({ to, label, icon: Icon }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center justify-center gap-1 h-full text-[10px] font-semibold transition-colors',
                  isActive ? 'text-brand-600' : 'text-ink-faint'
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon
                    className={cn(
                      'h-5 w-5 transition-all',
                      isActive ? 'stroke-[2.5px] text-brand-600' : 'stroke-[1.5px]'
                    )}
                  />
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

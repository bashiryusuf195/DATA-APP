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
    <nav className="fixed bottom-4 inset-x-4 z-40 md:hidden">
      <div className="bg-white/85 dark:bg-[#161B22]/90 backdrop-blur-xl border border-border rounded-[2rem] shadow-modal">
        <ul className="flex items-center h-[62px] px-2">
          {NAV.map(({ to, label, icon: Icon }) => (
            <li key={to} className="flex-1">
              <NavLink
                to={to}
                className="flex flex-col items-center justify-center gap-0.5 h-full"
              >
                {({ isActive }) => (
                  <>
                    <div className={cn(
                      'flex items-center justify-center h-8 w-8 rounded-2xl transition-all duration-200',
                      isActive ? 'bg-brand-600 shadow-brand' : ''
                    )}>
                      <Icon className={cn(
                        'transition-all duration-200',
                        'h-[18px] w-[18px]',
                        isActive ? 'stroke-[2.5px] text-white' : 'stroke-[1.5px] text-ink-faint'
                      )} />
                    </div>
                    <span className={cn(
                      'text-[10px] font-semibold transition-colors duration-200',
                      isActive ? 'text-brand-600' : 'text-ink-faint'
                    )}>
                      {label}
                    </span>
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  )
}

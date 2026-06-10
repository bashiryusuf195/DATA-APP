import { useEffect, useRef } from 'react'
import { NavLink } from 'react-router-dom'
import { Home, Clock, Wallet, User, Headphones, type LucideIcon } from 'lucide-react'
import { cn } from '@/utils/cn'
import { useHaptic } from '@/hooks/useHaptic'

const NAV = [
  { to: '/dashboard',    label: 'Home',    icon: Home       },
  { to: '/transactions', label: 'History', icon: Clock      },
  { to: '/wallet',       label: 'Wallet',  icon: Wallet     },
  { to: '/profile',      label: 'Profile', icon: User       },
  { to: '/support',      label: 'Support', icon: Headphones },
] as const

type NavEntry = { to: string; label: string; icon: LucideIcon }

/**
 * Inner content split into its own component so it can use a useEffect that
 * watches `isActive` without needing state in the render prop callback.
 *
 * When a tab transitions from inactive → active, nav-active-bounce is
 * retriggered via the "remove + force reflow + add" pattern so the animation
 * replays on every tap even if the user taps the same tab twice.
 */
function NavIconContent({
  isActive,
  Icon,
  label,
}: { isActive: boolean; Icon: LucideIcon; label: string }) {
  const iconRef  = useRef<HTMLDivElement>(null)
  const prevRef  = useRef(isActive)

  useEffect(() => {
    if (isActive && !prevRef.current) {
      const el = iconRef.current
      if (el) {
        el.classList.remove('nav-active-bounce')
        void el.offsetWidth            // force reflow — restarts the animation
        el.classList.add('nav-active-bounce')
      }
    }
    prevRef.current = isActive
  }, [isActive])

  return (
    <>
      <div
        ref={iconRef}
        className={cn(
          'flex items-center justify-center h-8 w-8 rounded-2xl',
          'transition-colors duration-200',
          isActive ? 'bg-brand-600 shadow-brand' : '',
        )}
      >
        <Icon className={cn(
          'h-[18px] w-[18px] transition-all duration-200',
          isActive ? 'stroke-[2.5px] text-white' : 'stroke-[1.5px] text-ink-faint',
        )} />
      </div>
      <span className={cn(
        'text-[10px] font-semibold transition-colors duration-200',
        isActive ? 'text-brand-600' : 'text-ink-faint',
      )}>
        {label}
      </span>
    </>
  )
}

function NavItem({ to, label, icon: Icon }: NavEntry) {
  const { light } = useHaptic()

  return (
    <li className="flex-1">
      <NavLink
        to={to}
        onClick={light}
        className="flex flex-col items-center justify-center gap-0.5 h-full pressable rounded-xl"
      >
        {({ isActive }) => (
          <NavIconContent isActive={isActive} Icon={Icon} label={label} />
        )}
      </NavLink>
    </li>
  )
}

export function BottomNav() {
  return (
    // bottom: calc(1rem + env(safe-area-inset-bottom)) lifts the nav above the
    // Android gesture navigation bar / iPhone home indicator. On web/PWA it's 0px.
    <nav
      className="fixed inset-x-4 z-40 md:hidden"
      style={{ bottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
    >
      <div className="bg-white/85 dark:bg-[#161B22]/90 backdrop-blur-xl border border-border rounded-[2rem] shadow-modal">
        <ul className="flex items-center h-[62px] px-2">
          {NAV.map((item) => <NavItem key={item.to} {...item} />)}
        </ul>
      </div>
    </nav>
  )
}

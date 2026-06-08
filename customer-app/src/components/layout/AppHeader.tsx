import { Link } from 'react-router-dom'
import { Bell, Sun, Moon } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { notificationsApi } from '@/api/notifications.api'
import { useAuthStore } from '@/store/auth.store'
import { useThemeStore } from '@/store/theme.store'
import { cn } from '@/utils/cn'

export function AppHeader() {
  const user = useAuthStore((s) => s.user)
  const { dark, toggle: toggleDark } = useThemeStore()
  const { data } = useQuery({
    queryKey: ['notifications-count'],
    queryFn: () => notificationsApi.list({ limit: 1 }),
    staleTime: 60_000,
  })

  const unread    = data?.unread_count ?? 0
  const initials  = [user?.first_name?.[0], user?.last_name?.[0]].filter(Boolean).join('').toUpperCase()
                 || (user?.email?.[0] ?? 'U').toUpperCase()

  return (
    <header className="md:hidden fixed top-0 inset-x-0 z-40 flex items-center justify-between h-14 px-4 bg-surface-1 border-b border-border">
      {/* Brand */}
      <Link to="/dashboard" className="flex items-center">
        <img src="/logo-horizontal.png" alt="Hive Data" className="h-9 w-auto object-contain" />
      </Link>

      {/* Right: theme + bell + avatar */}
      <div className="flex items-center gap-2">
        <button
          onClick={toggleDark}
          className="p-2 rounded-xl hover:bg-surface-2 transition-colors"
          aria-label="Toggle dark mode"
        >
          {dark ? <Sun className="h-5 w-5 text-ink-muted" /> : <Moon className="h-5 w-5 text-ink-muted" />}
        </button>
        <Link to="/notifications" className="relative p-2 rounded-xl hover:bg-surface-2 transition-colors">
          <Bell className="h-5 w-5 text-ink-muted" />
          {unread > 0 && (
            <span className={cn(
              'absolute top-1.5 right-1.5 min-w-[16px] h-4 px-0.5',
              'bg-danger text-white text-[9px] font-bold rounded-full',
              'flex items-center justify-center'
            )}>
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </Link>

        <Link to="/profile">
          <div className="h-8 w-8 rounded-full bg-brand-100 flex items-center justify-center">
            <span className="text-xs font-bold text-brand-700">{initials}</span>
          </div>
        </Link>
      </div>
    </header>
  )
}

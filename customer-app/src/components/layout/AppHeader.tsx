import { Link } from 'react-router-dom'
import { Bell, Zap } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { notificationsApi } from '@/api/notifications.api'
import { useAuthStore } from '@/store/auth.store'
import { cn } from '@/utils/cn'

export function AppHeader() {
  const user = useAuthStore((s) => s.user)
  const { data } = useQuery({
    queryKey: ['notifications-count'],
    queryFn: () => notificationsApi.list({ limit: 1 }),
    staleTime: 60_000,
  })

  const unread = data?.unread_count ?? 0

  return (
    <header className="md:hidden fixed top-0 inset-x-0 z-40 flex items-center justify-between h-14 px-4 bg-surface-1 border-b border-border">
      {/* Brand */}
      <Link to="/dashboard" className="flex items-center gap-2">
        <div className="h-7 w-7 rounded-lg bg-brand-600 flex items-center justify-center">
          <Zap className="h-3.5 w-3.5 text-white" />
        </div>
        <span className="text-sm font-bold text-ink">VTU Platform</span>
      </Link>

      {/* Greeting */}
      <p className="text-xs text-ink-muted hidden sm:block">
        Hi, {user?.first_name ?? user?.email?.split('@')[0] ?? 'there'} 👋
      </p>

      {/* Notifications bell */}
      <Link to="/notifications" className="relative p-2 rounded-xl hover:bg-surface-2 transition-colors">
        <Bell className="h-5 w-5 text-ink-muted" />
        {unread > 0 && (
          <span className={cn(
            'absolute top-1 right-1 min-w-[16px] h-4 px-1',
            'bg-danger text-white text-[10px] font-bold rounded-full',
            'flex items-center justify-center'
          )}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </Link>
    </header>
  )
}

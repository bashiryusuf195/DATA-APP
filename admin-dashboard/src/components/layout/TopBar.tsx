import { useAuthStore } from '@/store/auth.store'
import { useUiStore } from '@/store/ui.store'
import { authApi } from '@/api/auth.api'
import { Sun, Moon, LogOut, User } from 'lucide-react'
import { Button } from '@/components/ui'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'

export function TopBar() {
  const { user, clearAuth } = useAuthStore()
  const { theme, toggleTheme } = useUiStore()
  const navigate = useNavigate()

  const handleLogout = async () => {
    try { await authApi.logout() } catch { /* best-effort */ }
    clearAuth()
    toast.success('Logged out')
    navigate('/login')
  }

  return (
    <header className="h-14 flex items-center justify-between px-5 bg-surface-1 border-b border-border shrink-0">
      <div />
      <div className="flex items-center gap-3">
        {/* Theme toggle */}
        <Button variant="ghost" size="xs" onClick={toggleTheme} className="text-ink-muted">
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>

        {/* User chip */}
        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-surface-2 border border-border">
          <div className="h-5 w-5 rounded-full bg-accent flex items-center justify-center">
            <User className="h-3 w-3 text-white" />
          </div>
          <span className="text-xs font-medium text-ink max-w-[120px] truncate">
            {user?.email ?? 'Admin'}
          </span>
          <span className="text-[10px] text-ink-faint font-medium uppercase px-1.5 py-0.5 rounded bg-surface-3">
            {user?.role ?? 'admin'}
          </span>
        </div>

        {/* Logout */}
        <Button variant="ghost" size="xs" onClick={handleLogout} className="text-ink-muted hover:text-rose-400">
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  )
}

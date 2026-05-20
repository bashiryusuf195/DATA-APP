import { Outlet } from 'react-router-dom'
import { Zap } from 'lucide-react'

export function AuthLayout() {
  return (
    <div className="min-h-screen flex flex-col bg-surface-0">
      {/* Brand bar */}
      <div className="flex items-center justify-center gap-2.5 py-8">
        <div className="h-9 w-9 rounded-xl bg-brand-600 flex items-center justify-center shadow-lg shadow-brand-600/20">
          <Zap className="h-5 w-5 text-white" />
        </div>
        <div>
          <p className="text-[10px] text-ink-faint uppercase tracking-widest">Welcome to</p>
          <p className="text-base font-bold text-ink leading-none">VTU Platform</p>
        </div>
      </div>

      {/* Form card */}
      <div className="flex-1 flex items-start justify-center px-4 pb-12">
        <div className="w-full max-w-sm">
          <Outlet />
        </div>
      </div>

      <p className="text-center text-xs text-ink-faint pb-8">
        Fast · Reliable · Secure
      </p>
    </div>
  )
}

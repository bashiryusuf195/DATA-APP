import { Outlet } from 'react-router-dom'

export function AuthLayout() {
  return (
    <div className="min-h-screen flex flex-col bg-surface-0">
      {/* Brand bar */}
      <div className="flex items-center justify-center py-8">
        <img src="/logo-horizontal.png" alt="Hive Data" className="w-[200px] h-auto object-contain" />
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

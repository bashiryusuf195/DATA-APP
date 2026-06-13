import { Outlet } from 'react-router-dom'

export function AuthLayout() {
  return (
    <div className="min-h-screen flex flex-col bg-surface-0 overflow-y-auto">
      {/* Brand bar — top padding accounts for Android status bar / iOS notch */}
      <div
        className="flex items-center justify-center pb-8 shrink-0"
        style={{ paddingTop: 'calc(2rem + env(safe-area-inset-top, 0px))' }}
      >
        <img src="/logo-horizontal.png" alt="Hive Data" className="w-[200px] h-auto object-contain" />
      </div>

      {/* Form card — flex-1 so the card stretches, items-start keeps the form at the top
          when the keyboard shrinks the viewport, allowing the user to scroll to the submit button */}
      <div className="flex-1 flex items-start justify-center px-4 pb-16">
        <div className="w-full max-w-sm">
          <Outlet />
        </div>
      </div>

      <p className="text-center text-xs text-ink-faint pb-8 shrink-0">
        Fast · Reliable · Secure
      </p>
    </div>
  )
}

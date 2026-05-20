import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { BottomNav } from './BottomNav'
import { AppHeader } from './AppHeader'

export function AppLayout() {
  return (
    <div className="flex min-h-screen bg-surface-0">
      {/* Desktop sidebar */}
      <Sidebar />

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile header */}
        <AppHeader />

        {/* Page content — top padding for mobile header, bottom padding for bottom nav */}
        <main className="flex-1 px-4 pt-[72px] pb-24 md:pt-0 md:pb-0 md:px-8 md:py-8 max-w-2xl w-full mx-auto">
          <Outlet />
        </main>
      </div>

      {/* Mobile bottom nav */}
      <BottomNav />
    </div>
  )
}

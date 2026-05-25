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

        {/* Page content */}
        <main className="flex-1 px-4 pt-[72px] pb-24 md:pt-8 md:pb-8 md:px-8 max-w-lg w-full mx-auto md:max-w-2xl">
          <Outlet />
        </main>
      </div>

      {/* Mobile bottom nav */}
      <BottomNav />
    </div>
  )
}

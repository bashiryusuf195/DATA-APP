import { Link, useNavigate, useLocation, Outlet } from 'react-router-dom'
import { Zap, ArrowLeft, Sun, Moon } from 'lucide-react'
import { useAuthStore } from '@/store/auth.store'
import { useThemeStore } from '@/store/theme.store'

const LEGAL_LINKS = [
  { label: 'About Us',         to: '/about'           },
  { label: 'Privacy Policy',   to: '/privacy-policy'  },
  { label: 'Terms of Service', to: '/terms-of-service' },
  { label: 'Refund Policy',    to: '/refund-policy'   },
  { label: 'Contact',          to: '/contact'         },
]

export function LegalLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const token    = useAuthStore((s) => s.access_token)
  const { dark, toggle: toggleDark } = useThemeStore()

  const backTo   = token ? '/dashboard' : '/'
  const backLabel = token ? 'Dashboard' : 'Home'

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#070B12] text-gray-900 dark:text-white font-sans transition-colors duration-200">

      {/* Navbar */}
      <nav className="sticky top-0 z-40 border-b border-gray-200 dark:border-white/5 bg-white/90 dark:bg-[#070B12]/90 backdrop-blur-md">
        <div className="max-w-4xl mx-auto px-5 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => navigate(backTo)}
              className="flex items-center gap-1 text-sm text-gray-500 dark:text-white/50 hover:text-gray-900 dark:hover:text-white transition-colors shrink-0"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">{backLabel}</span>
            </button>
            <span className="text-gray-300 dark:text-white/20 shrink-0">|</span>
            <Link to="/" className="flex items-center gap-2 min-w-0">
              <div className="h-7 w-7 rounded-lg bg-brand-600 flex items-center justify-center shrink-0">
                <Zap className="h-4 w-4 text-white" />
              </div>
              <span className="font-black text-sm text-gray-900 dark:text-white truncate">Hive Data</span>
            </Link>
          </div>
          <button
            onClick={toggleDark}
            className="p-2 rounded-xl text-gray-400 dark:text-white/40 hover:text-gray-700 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/10 transition-colors shrink-0"
            aria-label="Toggle theme"
          >
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>
      </nav>

      {/* Page content */}
      <main className="max-w-4xl mx-auto px-5 py-10 pb-16">
        <Outlet />
      </main>

      {/* Footer nav */}
      <footer className="border-t border-gray-200 dark:border-white/5 py-8 px-5">
        <div className="max-w-4xl mx-auto flex flex-col items-center gap-4">
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-2">
            {LEGAL_LINKS.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className={[
                  'text-xs transition-colors',
                  location.pathname === l.to
                    ? 'text-brand-600 dark:text-brand-400 font-semibold'
                    : 'text-gray-400 dark:text-white/40 hover:text-gray-700 dark:hover:text-white',
                ].join(' ')}
              >
                {l.label}
              </Link>
            ))}
          </div>
          <p className="text-xs text-gray-400 dark:text-white/30">
            &copy; {new Date().getFullYear()} Hive Data. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  )
}

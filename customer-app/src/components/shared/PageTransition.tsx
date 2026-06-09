import { Outlet, useLocation, useNavigationType } from 'react-router-dom'

/**
 * Wraps <Outlet /> with a CSS entry animation keyed on location.key so every
 * route change re-mounts the wrapper and replays the animation.
 *
 * Tab-level routes get a quick cross-fade (feels instant, like a tab switch).
 * Drilldown routes (services, detail pages, etc.) slide up from below like an
 * Android Activity entering from the bottom of the stack.
 * Back navigation (POP) always fades — no "slide from left" since we can't
 * animate the exit without a library.
 */

const TAB_PATHS = new Set([
  '/dashboard',
  '/transactions',
  '/wallet',
  '/profile',
  '/support',
])

export function PageTransition() {
  const location = useLocation()
  const navType  = useNavigationType()   // 'PUSH' | 'POP' | 'REPLACE'

  const isTabRoute = TAB_PATHS.has(location.pathname)
  const isBack     = navType === 'POP'

  const animClass = isTabRoute || isBack ? 'page-anim-fade' : 'page-anim-slide'

  return (
    <div key={location.key} className={animClass}>
      <Outlet />
    </div>
  )
}

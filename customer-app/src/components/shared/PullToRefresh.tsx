import { RotateCcw } from 'lucide-react'
import type { PTRState } from '@/hooks/usePullToRefresh'

interface Props {
  ptrState: PTRState
  distance: number
}

const THRESHOLD = 64

/**
 * Fixed indicator that appears just below the mobile header as the user pulls
 * down. Hidden on desktop (md+) and when pull distance is zero.
 *
 * Visual states:
 *  - Pulling (idle):     fades in + scales up, icon rotates with pull progress
 *  - Pulling (ready):    full opacity, icon at 180° — "release to refresh"
 *  - Refreshing:         icon spins with ptr-spinner CSS animation
 *  - Released (no trig): fades out and scales down (via CSS transition)
 */
export function PullToRefreshIndicator({ ptrState, distance }: Props) {
  if (distance <= 0) return null

  const progress = Math.min(distance / THRESHOLD, 1)
  const opacity  = Math.min(progress * 1.9, 1)
  const scale    = 0.5 + progress * 0.5
  const spin     = ptrState === 'refreshing'

  return (
    <div
      className="fixed top-14 inset-x-0 z-[38] flex justify-center pointer-events-none md:hidden"
      aria-hidden="true"
    >
      <div
        className="mt-2 h-9 w-9 rounded-full bg-surface-1 shadow-card-md border border-border flex items-center justify-center"
        style={{
          opacity,
          transform: `scale(${scale})`,
          transition: ptrState === 'idle' ? 'opacity 200ms ease, transform 200ms ease' : 'none',
        }}
      >
        <RotateCcw
          className={`h-4 w-4 text-brand-600 ${spin ? 'ptr-spinner' : ''}`}
          style={!spin ? { transform: `rotate(${progress * 200}deg)`, transition: 'none' } : undefined}
        />
      </div>
    </div>
  )
}

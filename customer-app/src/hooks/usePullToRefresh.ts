import { useState, useEffect, useRef } from 'react'

export type PTRState = 'idle' | 'pulling' | 'refreshing'

const THRESHOLD  = 64    // visual px of pull that triggers a refresh
const RESISTANCE = 0.45  // drag-to-visual ratio (so ~140 px drag = 64 px visual)

/**
 * Detects a downward pull gesture at the top of the page and calls onRefresh.
 *
 * Uses document-level touch events so it works regardless of which element is
 * the scroll container. Requires `overscroll-behavior: none` on html/body
 * (already set in index.css) to suppress the browser's built-in PTR.
 */
export function usePullToRefresh(
  onRefresh: () => Promise<void>,
  enabled = true,
) {
  const [ptrState, setPtrState] = useState<PTRState>('idle')
  const [distance, setDistance] = useState(0)

  // Keep onRefresh in a ref so the effect dependency stays stable
  const onRefreshRef = useRef(onRefresh)
  useEffect(() => { onRefreshRef.current = onRefresh })

  const trackingRef  = useRef(false)
  const startYRef    = useRef(0)
  const distanceRef  = useRef(0)

  useEffect(() => {
    if (!enabled) return

    function onTouchStart(e: TouchEvent) {
      if (window.scrollY > 4) return         // only engage at the very top
      trackingRef.current = true
      startYRef.current   = e.touches[0].clientY
    }

    function onTouchMove(e: TouchEvent) {
      if (!trackingRef.current) return
      if (window.scrollY > 4) { trackingRef.current = false; return }

      const delta = e.touches[0].clientY - startYRef.current
      if (delta <= 0) { trackingRef.current = false; return }

      const pull = Math.min(delta * RESISTANCE, THRESHOLD * 1.6)
      distanceRef.current = pull
      setDistance(pull)
      setPtrState(pull >= THRESHOLD ? 'pulling' : 'idle')
    }

    function onTouchEnd() {
      if (!trackingRef.current) return
      trackingRef.current = false

      if (distanceRef.current >= THRESHOLD) {
        setPtrState('refreshing')
        setDistance(THRESHOLD)               // settle the indicator
        onRefreshRef.current().finally(() => {
          setDistance(0)
          setPtrState('idle')
        })
      } else {
        setDistance(0)
        setPtrState('idle')
      }
      distanceRef.current = 0
    }

    document.addEventListener('touchstart', onTouchStart, { passive: true })
    document.addEventListener('touchmove',  onTouchMove,  { passive: true })
    document.addEventListener('touchend',   onTouchEnd)

    return () => {
      document.removeEventListener('touchstart', onTouchStart)
      document.removeEventListener('touchmove',  onTouchMove)
      document.removeEventListener('touchend',   onTouchEnd)
    }
  }, [enabled])

  return { ptrState, distance }
}

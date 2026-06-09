/**
 * Thin wrapper around the Vibration API.
 * Silent no-op on browsers / OS settings that don't support vibration.
 */
export function useHaptic() {
  function vibrate(pattern: number | number[]) {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try { navigator.vibrate(pattern) } catch { /* swallow SecurityError on some browsers */ }
    }
  }

  return {
    /** 6 ms — barely perceptible, for navigation taps */
    light:   () => vibrate(6),
    /** 12 ms — standard button tap */
    tap:     () => vibrate(12),
    /** Double-pulse — confirm / success actions */
    success: () => vibrate([10, 60, 10]),
    /** Error / warning feedback */
    error:   () => vibrate([18, 40, 18, 40]),
  }
}

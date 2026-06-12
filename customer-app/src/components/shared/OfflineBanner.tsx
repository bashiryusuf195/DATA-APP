import { useState, useEffect } from 'react'
import { WifiOff, CheckCircle2 } from 'lucide-react'
import { cn } from '@/utils/cn'

export function OfflineBanner() {
  const [online,  setOnline]  = useState(() => navigator.onLine)
  const [visible, setVisible] = useState(!navigator.onLine)

  useEffect(() => {
    let hideTimer: ReturnType<typeof setTimeout>

    const onOnline = () => {
      clearTimeout(hideTimer)
      setOnline(true)
      setVisible(true)
      hideTimer = setTimeout(() => setVisible(false), 2500)
    }

    const onOffline = () => {
      clearTimeout(hideTimer)
      setOnline(false)
      setVisible(true)
    }

    window.addEventListener('online',  onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online',  onOnline)
      window.removeEventListener('offline', onOffline)
      clearTimeout(hideTimer)
    }
  }, [])

  if (!visible) return null

  return (
    <div
      role="status"
      aria-live="assertive"
      className={cn(
        'fixed inset-x-0 z-[70] flex items-center justify-center gap-2 px-4 text-sm font-semibold text-white transition-colors duration-300',
        online ? 'bg-success' : 'bg-[#0D1117] dark:bg-surface-2 dark:text-ink',
      )}
      style={{
        paddingTop:    'calc(0.625rem + env(safe-area-inset-top, 0px))',
        paddingBottom: '0.625rem',
      }}
    >
      {online ? (
        <>
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          Back online — syncing your data
        </>
      ) : (
        <>
          <WifiOff className="h-4 w-4 shrink-0" />
          No internet connection
        </>
      )}
    </div>
  )
}

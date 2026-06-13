import { Wrench, RefreshCw } from 'lucide-react'
import { useSystemStore } from '@/store/system.store'
import { apiClient } from '@/api/client'

export function MaintenancePage() {
  const setMaintenance = useSystemStore((s) => s.setMaintenance)

  async function handleRetry() {
    try {
      const res = await apiClient.get<{ maintenance: boolean }>('/public/status')
      if (!res.data.maintenance) {
        setMaintenance(false)
        window.location.reload()
      }
    } catch {
      // still down — stay on this screen
    }
  }

  return (
    <div className="min-h-screen bg-[#070B12] flex flex-col items-center justify-center p-6">
      <div className="max-w-xs w-full text-center space-y-6">
        <div className="mx-auto h-20 w-20 rounded-full bg-brand-500/10 flex items-center justify-center">
          <Wrench className="h-10 w-10 text-brand-400" />
        </div>

        <div className="space-y-2">
          <h1 className="text-xl font-bold text-white">System temporarily unavailable</h1>
          <p className="text-sm text-white/60 leading-relaxed">
            We&apos;re performing maintenance.<br />We&apos;ll be back shortly.
          </p>
        </div>

        <button
          onClick={() => void handleRetry()}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
          Try again
        </button>
      </div>
    </div>
  )
}

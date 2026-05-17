import { ENDPOINTS, type EndpointKey } from '@/config/endpoints'
import { PageHeader } from './PageHeader'
import { Card } from '@/components/ui'
import { Unplug } from 'lucide-react'
import type { ReactNode } from 'react'

interface EndpointGuardProps {
  /** Registry key for the primary endpoint this page depends on. */
  endpointKey: EndpointKey
  pageTitle: string
  pageSubtitle?: string
  /** Planned feature bullets shown in the placeholder. */
  features?: string[]
  children: ReactNode
}

/**
 * Renders children only when the endpoint is marked 'available'.
 * When 'planned', renders a placeholder without ever calling the API.
 */
export function EndpointGuard({
  endpointKey,
  pageTitle,
  pageSubtitle,
  features = [],
  children,
}: EndpointGuardProps) {
  const entry = ENDPOINTS[endpointKey]

  if (entry.status === 'planned') {
    const endpointLine = `${entry.method} ${entry.path}`
    return (
      <div className="space-y-6 animate-fade-in">
        <PageHeader
          title={pageTitle}
          subtitle={pageSubtitle ?? `${pageTitle} management and monitoring`}
        />
        <Card>
          <div className="flex flex-col items-center justify-center py-14 text-center">
            <div className="mb-5 p-4 rounded-2xl bg-amber-500/10 text-amber-400">
              <Unplug className="h-9 w-9" />
            </div>
            <h3 className="text-base font-semibold text-ink mb-1">Backend Not Available Yet</h3>
            <p className="text-sm text-ink-muted mb-2 max-w-sm">
              This page is waiting on a backend endpoint that has not been implemented yet.
            </p>
            <code className="text-xs font-mono bg-surface-2 text-amber-400 border border-amber-500/20 rounded px-2 py-1 mb-7">
              {endpointLine}
            </code>
            {features.length > 0 && (
              <div className="text-left w-full max-w-xs">
                <p className="text-[10px] font-semibold text-ink-faint uppercase tracking-widest mb-3">
                  Planned features
                </p>
                <ul className="space-y-2.5">
                  {features.map((f) => (
                    <li key={f} className="flex items-center gap-2.5 text-sm text-ink-muted">
                      <span className="h-1.5 w-1.5 rounded-full bg-accent shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Card>
      </div>
    )
  }

  return <>{children}</>
}

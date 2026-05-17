import { PageHeader } from './PageHeader'
import { Card } from '@/components/ui'
import type { ReactNode } from 'react'

interface PlaceholderPageProps {
  title: string
  subtitle?: string
  icon?: ReactNode
  features?: string[]
}

export function PlaceholderPage({ title, subtitle, icon, features = [] }: PlaceholderPageProps) {
  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title={title} subtitle={subtitle ?? `${title} management and monitoring`} />
      <Card>
        <div className="flex flex-col items-center justify-center py-16 text-center">
          {icon && (
            <div className="mb-5 p-5 rounded-2xl bg-surface-2 text-ink-faint">
              {icon}
            </div>
          )}
          <h3 className="text-base font-semibold text-ink mb-2">Coming Soon</h3>
          <p className="text-sm text-ink-muted max-w-sm mb-8">
            This module is under active development and will be available in a future release.
          </p>
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

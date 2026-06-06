import type { ReactNode } from 'react'
import { useSitePage } from '@/hooks/useSitePage'

interface Props {
  slug:     string
  children: ReactNode  // fallback content rendered when CMS is unavailable
}

// Renders CMS HTML when available, otherwise falls back to children.
// Skeleton is not shown — the fallback renders immediately while the fetch
// happens in the background, so the page never feels slow.
export function CmsPageContent({ slug, children }: Props) {
  const { data: page } = useSitePage(slug)

  if (page?.content) {
    return (
      <div
        className="cms-content text-sm leading-relaxed text-ink-muted
          [&_h1]:text-2xl [&_h1]:font-black [&_h1]:text-ink [&_h1]:mb-3 [&_h1]:mt-6
          [&_h2]:text-base [&_h2]:font-bold [&_h2]:text-ink [&_h2]:mb-2 [&_h2]:mt-6
          [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-ink [&_h3]:mb-1.5 [&_h3]:mt-4
          [&_p]:mb-3 [&_p]:leading-relaxed
          [&_ul]:mb-3 [&_ul]:pl-5 [&_ul]:list-disc [&_ul]:space-y-1
          [&_ol]:mb-3 [&_ol]:pl-5 [&_ol]:list-decimal [&_ol]:space-y-1
          [&_li]:leading-relaxed
          [&_a]:text-brand-600 [&_a]:no-underline hover:[&_a]:underline
          dark:[&_a]:text-brand-400
          [&_strong]:font-semibold [&_strong]:text-ink
          [&_em]:italic
          [&_code]:bg-surface-2 [&_code]:text-ink-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs
          [&_blockquote]:border-l-2 [&_blockquote]:border-brand-500/30 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-ink-faint
          [&_hr]:border-border [&_hr]:my-6"
        // Content is sanitized server-side by sanitize-html before storage.
        dangerouslySetInnerHTML={{ __html: page.content }}
      />
    )
  }

  return <>{children}</>
}

import { useQuery } from '@tanstack/react-query'
import { contentApi } from '@/api/content.api'

export function useSitePage(slug: string) {
  return useQuery({
    queryKey:  ['site-page', slug],
    queryFn:   () => contentApi.getSitePage(slug),
    staleTime: 5 * 60_000,
    retry:     false,
  })
}

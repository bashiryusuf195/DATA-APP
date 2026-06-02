import { useQuery } from '@tanstack/react-query'
import { announcementsApi } from '@/api/announcements.api'

export function useAnnouncements() {
  return useQuery({
    queryKey:   ['announcements-active'],
    queryFn:    announcementsApi.getActive,
    staleTime:  60_000,        // re-use cached data for 1 minute
    refetchOnWindowFocus: true, // re-check when user returns to the tab
  })
}

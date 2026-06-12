import { useQuery } from '@tanstack/react-query'
import { announcementsApi } from '@/api/announcements.api'

export function useAnnouncements() {
  return useQuery({
    queryKey:  ['announcements-active'],
    queryFn:   announcementsApi.getActive,
    staleTime: 5 * 60_000, // announcements change rarely — cache for 5 min
  })
}

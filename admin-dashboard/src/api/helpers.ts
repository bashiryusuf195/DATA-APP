import type { PaginatedResponse } from '@/types'

/** Convert 1-based page number to offset for backends using offset-based pagination. */
export function pageOffset(page: number, limit: number): number {
  return (page - 1) * limit
}

/**
 * Normalise a backend list response `{ success, data: T[], meta: { limit, offset } }`
 * into the frontend PaginatedResponse<T> shape.
 *
 * The backend has no total count — we estimate from item count:
 *   full page  → assume at least one more exists (enables "Next" button)
 *   short page → this is the last page
 */
export function normalizePaged<T>(
  items: T[],
  page: number,
  limit: number,
): PaginatedResponse<T> {
  const offset  = (page - 1) * limit
  const hasMore = items.length >= limit
  const total   = hasMore ? offset + items.length + 1 : offset + items.length
  return { data: items, total, page, limit }
}

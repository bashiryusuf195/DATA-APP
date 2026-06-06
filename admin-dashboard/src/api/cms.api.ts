import { apiClient } from './client'

export interface SitePage {
  slug:         string
  title:        string
  content:      string
  is_published: boolean
  version:      number
  created_by:   string | null
  updated_by:   string | null
  created_at:   string
  updated_at:   string
}

export interface UpsertPageInput {
  title:         string
  content:       string
  is_published?: boolean
}

export interface CreatePageInput extends UpsertPageInput {
  slug: string
}

export const cmsApi = {
  list: (): Promise<SitePage[]> =>
    apiClient
      .get<{ success: boolean; data: SitePage[] }>('/admin/content')
      .then((r) => r.data.data),

  get: (slug: string): Promise<SitePage> =>
    apiClient
      .get<{ success: boolean; data: SitePage }>(`/admin/content/${slug}`)
      .then((r) => r.data.data),

  create: (body: CreatePageInput): Promise<SitePage> =>
    apiClient
      .post<{ success: boolean; data: SitePage }>('/admin/content', body)
      .then((r) => r.data.data),

  update: (slug: string, body: UpsertPageInput): Promise<SitePage> =>
    apiClient
      .put<{ success: boolean; data: SitePage }>(`/admin/content/${slug}`, body)
      .then((r) => r.data.data),

  setPublished: (slug: string, is_published: boolean): Promise<SitePage> =>
    apiClient
      .patch<{ success: boolean; data: SitePage }>(`/admin/content/${slug}/publish`, { is_published })
      .then((r) => r.data.data),

  delete: (slug: string): Promise<void> =>
    apiClient.delete(`/admin/content/${slug}`).then(() => undefined),
}

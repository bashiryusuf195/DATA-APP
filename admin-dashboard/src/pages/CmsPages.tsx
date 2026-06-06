import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import {
  FileText, Plus, Pencil, Trash2, Eye, EyeOff, RefreshCw,
} from 'lucide-react'
import { cmsApi } from '@/api/cms.api'
import type { SitePage } from '@/api/cms.api'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button, Badge, Card, Spinner, Modal } from '@/components/ui'
import { cn } from '@/utils/cn'

function statusBadge(page: SitePage) {
  return page.is_published
    ? <Badge variant="success">Published</Badge>
    : <Badge variant="neutral">Draft</Badge>
}

export function CmsPagesPage() {
  const navigate = useNavigate()
  const qc       = useQueryClient()
  const [deleteTarget, setDeleteTarget] = useState<SitePage | null>(null)

  const { data: pages = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ['cms-pages'],
    queryFn:  cmsApi.list,
    staleTime: 30_000,
  })

  const publishMutation = useMutation({
    mutationFn: ({ slug, published }: { slug: string; published: boolean }) =>
      cmsApi.setPublished(slug, published),
    onSuccess: (updated) => {
      qc.setQueryData<SitePage[]>(['cms-pages'], (prev = []) =>
        prev.map((p) => (p.slug === updated.slug ? updated : p)),
      )
      toast.success(updated.is_published ? 'Page published' : 'Page unpublished')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: (slug: string) => cmsApi.delete(slug),
    onSuccess: (_v, slug) => {
      qc.setQueryData<SitePage[]>(['cms-pages'], (prev = []) =>
        prev.filter((p) => p.slug !== slug),
      )
      toast.success('Page deleted')
      setDeleteTarget(null)
    },
    onError: (err: Error) => { toast.error(err.message); setDeleteTarget(null) },
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Content Management"
        subtitle="Edit site pages served to the customer app"
        actions={
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
            </Button>
            <Button size="sm" onClick={() => navigate('/cms/pages/new')}>
              <Plus className="h-4 w-4 mr-1.5" /> New Page
            </Button>
          </div>
        }
      />

      <Card>
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Spinner />
          </div>
        ) : pages.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-ink-faint">
            <FileText className="h-10 w-10" />
            <p className="text-sm">No pages yet. Create one to get started.</p>
            <Button size="sm" onClick={() => navigate('/cms/pages/new')}>
              <Plus className="h-4 w-4 mr-1.5" /> New Page
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="pb-3 text-xs font-semibold text-ink-faint">Slug</th>
                  <th className="pb-3 text-xs font-semibold text-ink-faint">Title</th>
                  <th className="pb-3 text-xs font-semibold text-ink-faint">Status</th>
                  <th className="pb-3 text-xs font-semibold text-ink-faint">Version</th>
                  <th className="pb-3 text-xs font-semibold text-ink-faint">Updated</th>
                  <th className="pb-3 text-xs font-semibold text-ink-faint text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {pages.map((page) => (
                  <tr key={page.slug} className="hover:bg-surface-2/40 transition-colors">
                    <td className="py-3 pr-4 font-mono text-xs text-ink-muted">{page.slug}</td>
                    <td className="py-3 pr-4 font-medium text-ink">{page.title}</td>
                    <td className="py-3 pr-4">{statusBadge(page)}</td>
                    <td className="py-3 pr-4 text-ink-faint">v{page.version}</td>
                    <td className="py-3 pr-4 text-ink-faint whitespace-nowrap">
                      {format(new Date(page.updated_at), 'dd MMM yyyy')}
                    </td>
                    <td className="py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          title={page.is_published ? 'Unpublish' : 'Publish'}
                          onClick={() =>
                            publishMutation.mutate({ slug: page.slug, published: !page.is_published })
                          }
                          disabled={publishMutation.isPending}
                          className="p-1.5 rounded-lg text-ink-faint hover:text-ink hover:bg-surface-2 transition-colors"
                        >
                          {page.is_published
                            ? <EyeOff className="h-4 w-4" />
                            : <Eye    className="h-4 w-4" />}
                        </button>
                        <button
                          title="Edit"
                          onClick={() => navigate(`/cms/pages/${page.slug}`)}
                          className="p-1.5 rounded-lg text-ink-faint hover:text-ink hover:bg-surface-2 transition-colors"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          title="Delete"
                          onClick={() => setDeleteTarget(page)}
                          className="p-1.5 rounded-lg text-ink-faint hover:text-danger hover:bg-danger/10 transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Delete confirmation modal */}
      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete page"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.slug)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-muted">
          Permanently delete <strong className="text-ink">{deleteTarget?.slug}</strong>? This cannot
          be undone and will immediately make the page unavailable to the customer app.
        </p>
      </Modal>
    </div>
  )
}

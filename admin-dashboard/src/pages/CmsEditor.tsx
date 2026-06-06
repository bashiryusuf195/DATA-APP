import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import toast from 'react-hot-toast'
import {
  ArrowLeft, Save, Eye, EyeOff, Bold, Italic, List, ListOrdered,
  Heading2, Heading3, Minus, Undo2, Redo2, Code,
} from 'lucide-react'
import { cmsApi } from '@/api/cms.api'
import type { UpsertPageInput } from '@/api/cms.api'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button, Card, Input, Badge, Spinner } from '@/components/ui'
import { cn } from '@/utils/cn'

// ── Toolbar button ────────────────────────────────────────────────────────────

function ToolbarBtn({
  onClick,
  active,
  disabled,
  title,
  children,
}: {
  onClick: () => void
  active?: boolean
  disabled?: boolean
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'p-1.5 rounded-md text-sm transition-colors',
        active
          ? 'bg-accent text-white'
          : 'text-ink-muted hover:text-ink hover:bg-surface-2',
        'disabled:opacity-40 disabled:pointer-events-none',
      )}
    >
      {children}
    </button>
  )
}

// ── Editor toolbar ────────────────────────────────────────────────────────────

function Toolbar({ editor }: { editor: ReturnType<typeof useEditor> }) {
  if (!editor) return null
  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-border px-3 py-2">
      <ToolbarBtn
        title="Undo"
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
      >
        <Undo2 className="h-4 w-4" />
      </ToolbarBtn>
      <ToolbarBtn
        title="Redo"
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
      >
        <Redo2 className="h-4 w-4" />
      </ToolbarBtn>

      <span className="mx-1.5 h-4 w-px bg-border" />

      <ToolbarBtn
        title="Bold"
        active={editor.isActive('bold')}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold className="h-4 w-4" />
      </ToolbarBtn>
      <ToolbarBtn
        title="Italic"
        active={editor.isActive('italic')}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic className="h-4 w-4" />
      </ToolbarBtn>
      <ToolbarBtn
        title="Code"
        active={editor.isActive('code')}
        onClick={() => editor.chain().focus().toggleCode().run()}
      >
        <Code className="h-4 w-4" />
      </ToolbarBtn>

      <span className="mx-1.5 h-4 w-px bg-border" />

      <ToolbarBtn
        title="Heading 2"
        active={editor.isActive('heading', { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        <Heading2 className="h-4 w-4" />
      </ToolbarBtn>
      <ToolbarBtn
        title="Heading 3"
        active={editor.isActive('heading', { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
      >
        <Heading3 className="h-4 w-4" />
      </ToolbarBtn>

      <span className="mx-1.5 h-4 w-px bg-border" />

      <ToolbarBtn
        title="Bullet list"
        active={editor.isActive('bulletList')}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <List className="h-4 w-4" />
      </ToolbarBtn>
      <ToolbarBtn
        title="Ordered list"
        active={editor.isActive('orderedList')}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered className="h-4 w-4" />
      </ToolbarBtn>
      <ToolbarBtn
        title="Horizontal rule"
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
      >
        <Minus className="h-4 w-4" />
      </ToolbarBtn>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function CmsEditorPage() {
  const { slug }   = useParams<{ slug: string }>()
  const isNew      = slug === 'new'
  const navigate   = useNavigate()
  const qc         = useQueryClient()

  const [title,    setTitle]    = useState('')
  const [pageSlug, setPageSlug] = useState('')
  const [dirty,    setDirty]    = useState(false)

  // ── Fetch existing page ──────────────────────────────────────────────────
  const { data: existing, isLoading } = useQuery({
    queryKey: ['cms-page', slug],
    queryFn:  () => cmsApi.get(slug!),
    enabled:  !isNew && !!slug,
    staleTime: 30_000,
  })

  // ── TipTap editor ────────────────────────────────────────────────────────
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: 'Start writing page content…' }),
    ],
    content: '',
    onUpdate: () => setDirty(true),
    editorProps: {
      attributes: {
        class: 'prose prose-sm prose-invert max-w-none min-h-[320px] px-5 py-4 focus:outline-none',
      },
    },
  })

  // Populate form when existing data arrives
  useEffect(() => {
    if (existing && editor && !editor.isDestroyed) {
      setTitle(existing.title)
      setPageSlug(existing.slug)
      editor.commands.setContent(existing.content)
      setDirty(false)
    }
  }, [existing, editor])

  // ── Save mutation ────────────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: (input: UpsertPageInput & { slug?: string; create?: boolean }) => {
      const { slug: s, create, ...rest } = input
      if (create && s) return cmsApi.create({ ...rest, slug: s })
      return cmsApi.update(slug!, rest)
    },
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey: ['cms-pages'] })
      qc.setQueryData(['cms-page', saved.slug], saved)
      toast.success('Page saved')
      setDirty(false)
      if (isNew) navigate(`/cms/pages/${saved.slug}`, { replace: true })
    },
    onError: (err: Error) => toast.error(err.message),
  })

  // ── Publish toggle ───────────────────────────────────────────────────────
  const publishMutation = useMutation({
    mutationFn: (published: boolean) => cmsApi.setPublished(slug!, published),
    onSuccess: (updated) => {
      qc.setQueryData(['cms-page', slug], updated)
      qc.invalidateQueries({ queryKey: ['cms-pages'] })
      toast.success(updated.is_published ? 'Page published' : 'Page unpublished')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const handleSave = useCallback(() => {
    if (!title.trim()) { toast.error('Title is required'); return }
    if (isNew && !pageSlug.trim()) { toast.error('Slug is required'); return }
    saveMutation.mutate({
      title:        title.trim(),
      content:      editor?.getHTML() ?? '',
      is_published: existing?.is_published,
      ...(isNew ? { slug: pageSlug.trim(), create: true } : {}),
    })
  }, [title, pageSlug, isNew, editor, existing, saveMutation])

  const isPublished = isNew ? false : (existing?.is_published ?? false)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={isNew ? 'New Page' : `Edit: ${existing?.title ?? slug}`}
        actions={
          <div className="flex items-center gap-2">
            {!isNew && (
              <button
                onClick={() => publishMutation.mutate(!isPublished)}
                disabled={publishMutation.isPending}
                title={isPublished ? 'Unpublish' : 'Publish'}
                className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-border text-ink-muted hover:text-ink hover:bg-surface-2 transition-colors disabled:opacity-50"
              >
                {isPublished
                  ? <><EyeOff className="h-4 w-4" /> Unpublish</>
                  : <><Eye    className="h-4 w-4" /> Publish</>}
              </button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/cms/pages')}
            >
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saveMutation.isPending || (!dirty && !isNew)}
            >
              <Save className="h-4 w-4 mr-1.5" />
              {saveMutation.isPending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        }
      />

      {/* Meta fields */}
      <Card padding="md" className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-ink-muted">Title</label>
            <Input
              value={title}
              onChange={(e) => { setTitle(e.target.value); setDirty(true) }}
              placeholder="Page title"
            />
          </div>
          {isNew ? (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-ink-muted">Slug</label>
              <Input
                value={pageSlug}
                onChange={(e) => { setPageSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-')); setDirty(true) }}
                placeholder="e.g. privacy-policy"
                className="font-mono"
              />
            </div>
          ) : (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-ink-muted">Slug</label>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm text-ink-muted bg-surface-2 border border-border rounded-lg px-3 py-2 flex-1">
                  {existing?.slug}
                </span>
                <Badge variant={isPublished ? 'success' : 'neutral'}>
                  {isPublished ? 'Published' : 'Draft'}
                </Badge>
                {existing && (
                  <Badge variant="neutral">v{existing.version}</Badge>
                )}
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Rich text editor */}
      <Card padding="none" className="overflow-hidden">
        <Toolbar editor={editor} />
        <EditorContent editor={editor} />
      </Card>

      {dirty && (
        <p className="text-xs text-ink-faint text-right">Unsaved changes</p>
      )}
    </div>
  )
}

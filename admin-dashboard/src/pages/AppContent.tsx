import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { settingsApi } from '@/api/settings.api'
import { PageHeader } from '@/components/shared/PageHeader'
import { Card, Button } from '@/components/ui'
import {
  Layout, Globe, Smartphone, Plus, Trash2, Save, RefreshCw, GripVertical, HeadphonesIcon,
} from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface OnboardingSlide {
  title: string
  description: string
  icon: string
  gradient: [string, string]
}

interface LandingFeature {
  icon: string
  title: string
  description: string
}

interface HowItWorksStep {
  step: number
  title: string
  description: string
}

interface LandingContent {
  app_name: string
  hero_title: string
  hero_subtitle: string
  hero_cta_primary: string
  hero_cta_secondary: string
  features: LandingFeature[]
  how_it_works: HowItWorksStep[]
}

interface SupportContact {
  type: 'whatsapp' | 'email' | 'phone'
  label: string
  value: string
  href: string
}

interface SupportFaq {
  q: string
  a: string
}

interface SupportContent {
  hero_subtitle: string
  contacts: SupportContact[]
  faqs: SupportFaq[]
}

interface AppContentData {
  landing: LandingContent
  onboarding: OnboardingSlide[]
  support: SupportContent
}

const ICON_OPTIONS = ['Phone', 'Wifi', 'Zap', 'Tv', 'Shield', 'Wallet', 'Star', 'Globe']
const CONTACT_TYPE_OPTIONS = ['whatsapp', 'email', 'phone']

// ── Helpers ───────────────────────────────────────────────────────────────────

function Field({
  label, value, onChange, multiline = false, hint,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  multiline?: boolean
  hint?: string
}) {
  const base =
    'w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-ink placeholder-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/40'
  return (
    <div className="space-y-1">
      <label className="block text-xs font-semibold text-ink-muted">{label}</label>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          className={`${base} resize-none`}
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={base}
        />
      )}
      {hint && <p className="text-[11px] text-ink-faint">{hint}</p>}
    </div>
  )
}

function SelectField({
  label, value, options, onChange,
}: {
  label: string
  value: string
  options: string[]
  onChange: (v: string) => void
}) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-semibold text-ink-muted">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent/40"
      >
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  )
}

// ── Tabs ──────────────────────────────────────────────────────────────────────

type Tab = 'landing' | 'onboarding' | 'support'

// ── Landing editor ────────────────────────────────────────────────────────────

function LandingEditor({
  data, onChange,
}: {
  data: LandingContent
  onChange: (d: LandingContent) => void
}) {
  const set = <K extends keyof LandingContent>(key: K, val: LandingContent[K]) =>
    onChange({ ...data, [key]: val })

  const updateFeature = (i: number, patch: Partial<LandingFeature>) => {
    const features = data.features.map((f, idx) => (idx === i ? { ...f, ...patch } : f))
    set('features', features)
  }

  const addFeature = () =>
    set('features', [...data.features, { icon: 'Zap', title: '', description: '' }])

  const removeFeature = (i: number) =>
    set('features', data.features.filter((_, idx) => idx !== i))

  const updateStep = (i: number, patch: Partial<HowItWorksStep>) => {
    const how_it_works = data.how_it_works.map((s, idx) =>
      idx === i ? { ...s, ...patch } : s
    )
    set('how_it_works', how_it_works)
  }

  const addStep = () =>
    set('how_it_works', [
      ...data.how_it_works,
      { step: data.how_it_works.length + 1, title: '', description: '' },
    ])

  const removeStep = (i: number) => {
    const steps = data.how_it_works
      .filter((_, idx) => idx !== i)
      .map((s, idx) => ({ ...s, step: idx + 1 }))
    set('how_it_works', steps)
  }

  return (
    <div className="space-y-6">
      {/* Brand & hero */}
      <Card>
        <h3 className="text-sm font-bold text-ink mb-4 flex items-center gap-2">
          <Globe className="h-4 w-4 text-ink-muted" /> Hero Section
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="App Name"           value={data.app_name}          onChange={(v) => set('app_name', v)} />
          <Field label="Primary CTA Text"   value={data.hero_cta_primary}  onChange={(v) => set('hero_cta_primary', v)} />
          <Field label="Secondary CTA Text" value={data.hero_cta_secondary} onChange={(v) => set('hero_cta_secondary', v)} />
        </div>
        <div className="mt-4 space-y-4">
          <Field label="Hero Title"    value={data.hero_title}    onChange={(v) => set('hero_title', v)} />
          <Field label="Hero Subtitle" value={data.hero_subtitle} onChange={(v) => set('hero_subtitle', v)} multiline />
        </div>
      </Card>

      {/* Features */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-ink flex items-center gap-2">
            <Layout className="h-4 w-4 text-ink-muted" /> Feature Cards
          </h3>
          <Button size="sm" variant="secondary" icon={<Plus className="h-3.5 w-3.5" />} onClick={addFeature}>
            Add Feature
          </Button>
        </div>
        <div className="space-y-4">
          {data.features.map((f, i) => (
            <div key={i} className="rounded-lg border border-border bg-surface-2 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs text-ink-muted">
                  <GripVertical className="h-3.5 w-3.5" />
                  Feature {i + 1}
                </div>
                <button onClick={() => removeFeature(i)} className="text-danger hover:opacity-80">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <SelectField label="Icon" value={f.icon} options={ICON_OPTIONS} onChange={(v) => updateFeature(i, { icon: v })} />
                <div className="sm:col-span-2">
                  <Field label="Title" value={f.title} onChange={(v) => updateFeature(i, { title: v })} />
                </div>
              </div>
              <Field label="Description" value={f.description} onChange={(v) => updateFeature(i, { description: v })} multiline />
            </div>
          ))}
        </div>
      </Card>

      {/* How it works */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-ink">How It Works Steps</h3>
          <Button size="sm" variant="secondary" icon={<Plus className="h-3.5 w-3.5" />} onClick={addStep}>
            Add Step
          </Button>
        </div>
        <div className="space-y-4">
          {data.how_it_works.map((s, i) => (
            <div key={i} className="rounded-lg border border-border bg-surface-2 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-ink-muted">Step {s.step}</span>
                <button onClick={() => removeStep(i)} className="text-danger hover:opacity-80">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <Field label="Title"       value={s.title}       onChange={(v) => updateStep(i, { title: v })} />
              <Field label="Description" value={s.description} onChange={(v) => updateStep(i, { description: v })} multiline />
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

// ── Onboarding editor ─────────────────────────────────────────────────────────

function OnboardingEditor({
  slides, onChange,
}: {
  slides: OnboardingSlide[]
  onChange: (s: OnboardingSlide[]) => void
}) {
  const update = (i: number, patch: Partial<OnboardingSlide>) =>
    onChange(slides.map((s, idx) => (idx === i ? { ...s, ...patch } : s)))

  const add = () =>
    onChange([...slides, { title: '', description: '', icon: 'Wallet', gradient: ['#3535D9', '#6366F1'] }])

  const remove = (i: number) => onChange(slides.filter((_, idx) => idx !== i))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-muted">Configure the onboarding slides shown to first-time mobile users.</p>
        <Button size="sm" variant="secondary" icon={<Plus className="h-3.5 w-3.5" />} onClick={add}>
          Add Slide
        </Button>
      </div>

      {slides.map((s, i) => (
        <Card key={i}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-ink flex items-center gap-2">
              <Smartphone className="h-4 w-4 text-ink-muted" /> Slide {i + 1}
            </h3>
            <button onClick={() => remove(i)} disabled={slides.length <= 1} className="text-danger hover:opacity-80 disabled:opacity-30">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Title" value={s.title} onChange={(v) => update(i, { title: v })} />
              <SelectField label="Icon" value={s.icon} options={ICON_OPTIONS} onChange={(v) => update(i, { icon: v })} />
            </div>
            <Field label="Description" value={s.description} onChange={(v) => update(i, { description: v })} multiline />
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-ink-muted">Gradient Start</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={s.gradient[0]}
                    onChange={(e) => update(i, { gradient: [e.target.value, s.gradient[1]] })}
                    className="h-8 w-8 rounded cursor-pointer border border-border"
                  />
                  <span className="text-xs font-mono text-ink-muted">{s.gradient[0]}</span>
                </div>
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-ink-muted">Gradient End</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={s.gradient[1]}
                    onChange={(e) => update(i, { gradient: [s.gradient[0], e.target.value] })}
                    className="h-8 w-8 rounded cursor-pointer border border-border"
                  />
                  <span className="text-xs font-mono text-ink-muted">{s.gradient[1]}</span>
                </div>
              </div>
            </div>
            {/* Preview */}
            <div className="rounded-xl p-4 text-white text-center" style={{ background: `linear-gradient(135deg, ${s.gradient[0]}, ${s.gradient[1]})` }}>
              <p className="text-xs font-semibold opacity-75 mb-1">Preview</p>
              <p className="text-sm font-bold">{s.title || '—'}</p>
            </div>
          </div>
        </Card>
      ))}
    </div>
  )
}

// ── Support editor ────────────────────────────────────────────────────────────

function SupportEditor({
  data, onChange,
}: {
  data: SupportContent
  onChange: (d: SupportContent) => void
}) {
  const set = <K extends keyof SupportContent>(key: K, val: SupportContent[K]) =>
    onChange({ ...data, [key]: val })

  const updateContact = (i: number, patch: Partial<SupportContact>) => {
    const contacts = data.contacts.map((c, idx) => (idx === i ? { ...c, ...patch } : c))
    set('contacts', contacts)
  }

  const addContact = () =>
    set('contacts', [...data.contacts, { type: 'phone' as const, label: '', value: '', href: '' }])

  const removeContact = (i: number) =>
    set('contacts', data.contacts.filter((_, idx) => idx !== i))

  const updateFaq = (i: number, patch: Partial<SupportFaq>) => {
    const faqs = data.faqs.map((f, idx) => (idx === i ? { ...f, ...patch } : f))
    set('faqs', faqs)
  }

  const addFaq = () => set('faqs', [...data.faqs, { q: '', a: '' }])

  const removeFaq = (i: number) =>
    set('faqs', data.faqs.filter((_, idx) => idx !== i))

  return (
    <div className="space-y-6">
      {/* Hero text */}
      <Card>
        <h3 className="text-sm font-bold text-ink mb-4 flex items-center gap-2">
          <HeadphonesIcon className="h-4 w-4 text-ink-muted" /> Hero Banner
        </h3>
        <Field
          label="Availability / Tagline"
          value={data.hero_subtitle}
          onChange={(v) => set('hero_subtitle', v)}
          hint='Shown beneath "How can we help you?" on the support page.'
        />
      </Card>

      {/* Contact channels */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-ink">Contact Channels</h3>
          <Button size="sm" variant="secondary" icon={<Plus className="h-3.5 w-3.5" />} onClick={addContact}>
            Add Channel
          </Button>
        </div>
        <div className="space-y-4">
          {data.contacts.map((c, i) => (
            <div key={i} className="rounded-lg border border-border bg-surface-2 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-ink-muted flex items-center gap-1.5">
                  <GripVertical className="h-3.5 w-3.5" /> Channel {i + 1}
                </span>
                <button onClick={() => removeContact(i)} className="text-danger hover:opacity-80">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <SelectField
                  label="Type"
                  value={c.type}
                  options={CONTACT_TYPE_OPTIONS}
                  onChange={(v) => updateContact(i, { type: v as SupportContact['type'] })}
                />
                <Field label="Display Label" value={c.label} onChange={(v) => updateContact(i, { label: v })} />
                <Field label="Display Value" value={c.value} onChange={(v) => updateContact(i, { value: v })} />
              </div>
              <Field
                label="Link (href)"
                value={c.href}
                onChange={(v) => updateContact(i, { href: v })}
                hint="e.g. https://wa.me/2348012345678 · mailto:you@email.com · tel:08012345678"
              />
            </div>
          ))}
        </div>
      </Card>

      {/* FAQs */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-ink">FAQ Items</h3>
          <Button size="sm" variant="secondary" icon={<Plus className="h-3.5 w-3.5" />} onClick={addFaq}>
            Add FAQ
          </Button>
        </div>
        <div className="space-y-4">
          {data.faqs.map((f, i) => (
            <div key={i} className="rounded-lg border border-border bg-surface-2 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-ink-muted flex items-center gap-1.5">
                  <GripVertical className="h-3.5 w-3.5" /> FAQ {i + 1}
                </span>
                <button onClick={() => removeFaq(i)} className="text-danger hover:opacity-80">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <Field label="Question" value={f.q} onChange={(v) => updateFaq(i, { q: v })} />
              <Field label="Answer"   value={f.a} onChange={(v) => updateFaq(i, { a: v })} multiline />
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

// ── Default content ───────────────────────────────────────────────────────────

const EMPTY: AppContentData = {
  landing: {
    app_name: 'Hive Data',
    hero_title: 'All Your VTU Services in One Place',
    hero_subtitle: 'Top up airtime, buy data, pay electricity and cable TV bills instantly.',
    hero_cta_primary: 'Get Started Free',
    hero_cta_secondary: 'Login',
    features: [],
    how_it_works: [],
  },
  onboarding: [
    { title: '', description: '', icon: 'Wallet', gradient: ['#3535D9', '#6366F1'] },
  ],
  support: {
    hero_subtitle: 'Our support team is available Monday – Saturday, 8 am – 8 pm.',
    contacts: [
      { type: 'whatsapp', label: 'WhatsApp', value: 'Chat with us', href: 'https://wa.me/2348000000000' },
    ],
    faqs: [],
  },
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function AppContentPage() {
  const qc = useQueryClient()

  const { data: settingsMap, isLoading, error } = useQuery({
    queryKey: ['admin-settings'],
    queryFn:  settingsApi.list,
  })

  const rawSetting = settingsMap?.['appearance']?.find?.((s: { key: string }) => s.key === 'app_content')

  const [draft, setDraft] = useState<AppContentData | null>(null)
  const [tab, setTab] = useState<Tab>('landing')

  useEffect(() => {
    if (!rawSetting) return
    try {
      const parsed = typeof rawSetting.value === 'string'
        ? JSON.parse(rawSetting.value)
        : rawSetting.value
      setDraft(parsed)
    } catch {
      setDraft(EMPTY)
    }
  }, [rawSetting])

  const saveMutation = useMutation({
    mutationFn: () => settingsApi.update('app_content', JSON.stringify(draft)),
    onSuccess: () => {
      toast.success('App content saved')
      qc.invalidateQueries({ queryKey: ['admin-settings'] })
    },
    onError: () => toast.error('Failed to save content'),
  })

  const handleReset = () => {
    if (!rawSetting) return
    try {
      setDraft(typeof rawSetting.value === 'string' ? JSON.parse(rawSetting.value) : rawSetting.value)
      toast('Changes discarded')
    } catch { /* ignore */ }
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <PageHeader title="App Content" subtitle="Edit landing page and onboarding slide content" />
        <div className="animate-pulse space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-24 rounded-xl bg-surface-2" />)}
        </div>
      </div>
    )
  }

  if (error || !draft) {
    return (
      <div className="space-y-4">
        <PageHeader title="App Content" />
        <Card>
          <p className="text-sm text-danger">
            Failed to load app content. Run the migration to seed the <code>app_content</code> setting.
          </p>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="App Content"
        subtitle="Edit landing page, mobile onboarding slides, and support page content"
        actions={
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              icon={<RefreshCw className="h-3.5 w-3.5" />}
              onClick={handleReset}
              disabled={saveMutation.isPending}
            >
              Reset
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={<Save className="h-3.5 w-3.5" />}
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? 'Saving…' : 'Save Changes'}
            </Button>
          </div>
        }
      />

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 bg-surface-2 rounded-xl p-1 w-fit border border-border">
        {([
          { key: 'landing',    label: 'Landing Page', icon: <Globe            className="h-3.5 w-3.5" /> },
          { key: 'onboarding', label: 'Onboarding',   icon: <Smartphone       className="h-3.5 w-3.5" /> },
          { key: 'support',    label: 'Support',       icon: <HeadphonesIcon   className="h-3.5 w-3.5" /> },
        ] as { key: Tab; label: string; icon: React.ReactNode }[]).map(({ key, label, icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
              tab === key
                ? 'bg-surface-1 text-ink shadow-sm border border-border'
                : 'text-ink-muted hover:text-ink'
            }`}
          >
            <span className="flex items-center gap-1.5">{icon} {label}</span>
          </button>
        ))}
      </div>

      {tab === 'landing' && (
        <LandingEditor
          data={draft.landing}
          onChange={(landing) => setDraft((d) => d ? { ...d, landing } : d)}
        />
      )}
      {tab === 'onboarding' && (
        <OnboardingEditor
          slides={draft.onboarding}
          onChange={(onboarding) => setDraft((d) => d ? { ...d, onboarding } : d)}
        />
      )}
      {tab === 'support' && (
        <SupportEditor
          data={draft.support ?? EMPTY.support}
          onChange={(support) => setDraft((d) => d ? { ...d, support } : d)}
        />
      )}
    </div>
  )
}

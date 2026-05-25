import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  User, Settings, ChevronRight, Lock, Shield, Hash,
  Bell, Mail, Moon, Sun, LogOut, BadgeCheck, Edit2,
} from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { useAuthStore } from '@/store/auth.store'
import { useThemeStore } from '@/store/theme.store'
import { authApi } from '@/api/auth.api'
import { notificationsApi } from '@/api/notifications.api'
import { fmtDate } from '@/utils/format'
import { cn } from '@/utils/cn'
import type { NotificationPreferences } from '@/types'

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200',
        checked ? 'bg-brand-600' : 'bg-surface-2 border border-border'
      )}
    >
      <span className={cn(
        'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform duration-200',
        checked ? 'translate-x-5' : 'translate-x-0'
      )} />
    </button>
  )
}

function SecurityRow({ icon: Icon, label, hint, onClick }: {
  icon: React.FC<{ className?: string }>
  label: string
  hint: string
  onClick?: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-4 py-4 px-1 text-left hover:bg-surface-2/50 transition-colors rounded-xl"
    >
      <div className="h-10 w-10 rounded-full bg-wallet flex items-center justify-center shrink-0">
        <Icon className="h-4.5 w-4.5 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-ink">{label}</p>
        <p className="text-xs text-ink-faint mt-0.5">{hint}</p>
      </div>
      <ChevronRight className="h-4 w-4 text-ink-faint shrink-0" />
    </button>
  )
}

function PrefRow({ icon: Icon, label, hint, checked, onChange }: {
  icon: React.FC<{ className?: string }>
  label: string
  hint: string
  checked: boolean
  onChange: () => void
}) {
  return (
    <div className="flex items-center gap-4 py-4 px-1">
      <div className="h-10 w-10 rounded-full bg-wallet flex items-center justify-center shrink-0">
        <Icon className="h-4.5 w-4.5 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-ink">{label}</p>
        <p className="text-xs text-ink-faint mt-0.5">{hint}</p>
      </div>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  )
}

export function ProfilePage() {
  const navigate  = useNavigate()
  const user      = useAuthStore((s) => s.user)
  const clearAuth = useAuthStore((s) => s.clearAuth)
  const qc        = useQueryClient()
  const { dark, toggle: toggleDark } = useThemeStore()
  const [logging, setLogging] = useState(false)

  const displayName = [user?.first_name, user?.last_name].filter(Boolean).join(' ')
                   || user?.username || user?.email || 'User'

  const initials = [user?.first_name?.[0], user?.last_name?.[0]].filter(Boolean).join('').toUpperCase()
                || (user?.email?.[0] ?? 'U').toUpperCase()

  const KYC_LABELS: Record<number, string> = { 0: 'Unverified', 1: 'Basic', 2: 'Verified', 3: 'Full' }
  const kycLevel = user?.kyc_level ?? 0

  const handleLogout = async () => {
    setLogging(true)
    try { await authApi.logout() } catch { /* ignore */ }
    clearAuth()
    window.location.href = '/login'
  }

  // Notification prefs (reused from Settings)
  const { data: prefs, isLoading: prefsLoading } = useQuery({
    queryKey: ['notification-prefs'],
    queryFn:  notificationsApi.getPreferences,
    staleTime: 60_000,
  })

  const updatePrefsMutation = useMutation({
    mutationFn: (p: Partial<NotificationPreferences>) => notificationsApi.updatePreferences(p),
    onError: (err: Error, _vars, context) => {
      // Revert optimistic update on failure
      if (context) qc.setQueryData(['notification-prefs'], context)
      toast.error(err.message)
    },
  })

  const togglePref = (key: keyof NotificationPreferences) => {
    if (!prefs) return
    const newValue = !prefs[key]
    // Optimistic update — toggle responds instantly, reverts on error
    qc.setQueryData(['notification-prefs'], { ...prefs, [key]: newValue })
    updatePrefsMutation.mutate(
      { [key]: newValue },
      { onError: () => qc.setQueryData(['notification-prefs'], prefs) }
    )
  }

  return (
    <div className="space-y-4 pb-2">
      {/* ── Top: settings gear ───────────────────────────────────────── */}
      <div className="flex items-center justify-between pt-1">
        <h1 className="text-xl font-bold text-ink">Profile</h1>
        <button
          onClick={() => navigate('/settings')}
          className="h-10 w-10 rounded-2xl bg-surface-1 border border-border flex items-center justify-center hover:bg-surface-2 transition-colors shadow-card"
        >
          <Settings className="h-5 w-5 text-ink-muted" />
        </button>
      </div>

      {/* ── Avatar + name card ─────────────────────────────────────── */}
      <div className="bg-surface-1 rounded-3xl p-6 shadow-card flex flex-col items-center text-center gap-3">
        <div className="relative">
          <div className="h-20 w-20 rounded-full bg-brand-100 border-4 border-brand-200 flex items-center justify-center">
            {initials
              ? <span className="text-2xl font-bold text-brand-700">{initials}</span>
              : <User className="h-9 w-9 text-brand-600" />}
          </div>
          <button className="absolute bottom-0 right-0 h-7 w-7 rounded-full bg-brand-600 flex items-center justify-center shadow-brand border-2 border-white">
            <Edit2 className="h-3 w-3 text-white" />
          </button>
        </div>

        <div>
          <p className="text-lg font-bold text-ink">{displayName}</p>
          <p className="text-sm text-ink-faint mt-0.5">{user?.email}</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap justify-center">
          <span className={cn(
            'text-xs px-3 py-1 rounded-full font-semibold',
            kycLevel >= 2 ? 'bg-success/10 text-success' : 'bg-amber-100 text-amber-700'
          )}>
            KYC {KYC_LABELS[kycLevel] ?? 'Unknown'}
          </span>
          {user?.is_email_verified && (
            <span className="flex items-center gap-1 text-xs px-3 py-1 rounded-full bg-teal-100 text-teal-600 font-semibold">
              <BadgeCheck className="h-3 w-3" /> Verified
            </span>
          )}
        </div>
      </div>

      {/* ── Personal Information ───────────────────────────────────── */}
      <div className="bg-surface-1 rounded-3xl p-5 shadow-card">
        <p className="text-sm font-bold text-ink mb-4">Personal Information</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm mb-4">
          <div>
            <p className="text-xs text-ink-faint mb-0.5">Full Name</p>
            <p className="font-semibold text-ink">{displayName}</p>
          </div>
          <div>
            <p className="text-xs text-ink-faint mb-0.5">Phone Number</p>
            <p className="font-semibold text-ink">{user?.phone ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs text-ink-faint mb-0.5">Username</p>
            <p className="font-semibold text-ink">{user?.username ?? '—'}</p>
          </div>
          {user?.created_at && (
            <div>
              <p className="text-xs text-ink-faint mb-0.5">Member Since</p>
              <p className="font-semibold text-ink">{fmtDate(user.created_at)}</p>
            </div>
          )}
        </div>
        <button
          onClick={() => navigate('/profile/edit')}
          className="w-full py-2.5 rounded-2xl border-2 border-brand-600 text-brand-600 text-sm font-semibold hover:bg-brand-50 transition-colors"
        >
          Edit Profile
        </button>
      </div>

      {/* ── Security ──────────────────────────────────────────────── */}
      <div className="bg-surface-1 rounded-3xl p-5 shadow-card">
        <p className="text-sm font-bold text-ink mb-2">Security</p>
        <div className="divide-y divide-border">
          <SecurityRow
            icon={Lock}
            label="Change Password"
            hint="Update your account password"
            onClick={() => navigate('/settings')}
          />
          <SecurityRow
            icon={Shield}
            label="Two-Factor Authentication"
            hint="Add extra security to your account"
            onClick={() => navigate('/settings')}
          />
          <SecurityRow
            icon={Hash}
            label="Change PIN"
            hint="Update your transaction PIN"
            onClick={() => navigate('/settings')}
          />
        </div>
      </div>

      {/* ── Preferences ───────────────────────────────────────────── */}
      <div className="bg-surface-1 rounded-3xl p-5 shadow-card">
        <p className="text-sm font-bold text-ink mb-2">Preferences</p>
        {prefsLoading ? (
          <p className="text-xs text-ink-faint py-4">Loading preferences…</p>
        ) : prefs ? (
          <div className="divide-y divide-border">
            <PrefRow
              icon={Bell}
              label="Push Notifications"
              hint="Receive transaction alerts"
              checked={prefs.push}
              onChange={() => togglePref('push')}
            />
            <PrefRow
              icon={Mail}
              label="Email Notifications"
              hint="Receive monthly statements"
              checked={prefs.email}
              onChange={() => togglePref('email')}
            />
            <PrefRow
              icon={dark ? Sun : Moon}
              label="Dark Mode"
              hint="Switch to dark theme"
              checked={dark}
              onChange={toggleDark}
            />
          </div>
        ) : null}
      </div>

      {/* ── Referral code ─────────────────────────────────────────── */}
      {user?.referral_code && (
        <div className="bg-surface-1 rounded-3xl p-5 shadow-card flex items-center justify-between gap-3">
          <div>
            <p className="text-xs text-ink-faint">Referral Code</p>
            <p className="text-sm font-bold text-ink mt-0.5 font-mono">{user.referral_code}</p>
          </div>
          <button
            onClick={() => navigate('/referrals')}
            className="text-xs font-semibold text-brand-600 border border-brand-200 px-3 py-1.5 rounded-xl hover:bg-brand-50 transition-colors"
          >
            Refer & Earn
          </button>
        </div>
      )}

      {/* ── Logout ────────────────────────────────────────────────── */}
      <button
        disabled={logging}
        onClick={handleLogout}
        className="w-full py-3 rounded-2xl border-2 border-danger text-danger text-sm font-bold flex items-center justify-center gap-2 hover:bg-danger/5 transition-colors disabled:opacity-60"
      >
        <LogOut className="h-4 w-4" />
        {logging ? 'Signing out…' : 'Logout'}
      </button>
    </div>
  )
}

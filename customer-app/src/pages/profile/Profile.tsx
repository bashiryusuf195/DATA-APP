import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { User, ArrowLeft, Mail, Phone, BadgeCheck, Shield, LogOut } from 'lucide-react'
import { Button, Card } from '@/components/ui'
import { useAuthStore } from '@/store/auth.store'
import { authApi } from '@/api/auth.api'
import { fmtDate } from '@/utils/format'
import { cn } from '@/utils/cn'

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-border last:border-0">
      <p className="text-xs text-ink-muted shrink-0 pt-0.5">{label}</p>
      <p className="text-sm text-ink text-right break-all">{value ?? '—'}</p>
    </div>
  )
}

export function ProfilePage() {
  const navigate      = useNavigate()
  const user          = useAuthStore((s) => s.user)
  const clearAuth     = useAuthStore((s) => s.clearAuth)
  const [logging, setLogging] = useState(false)

  const handleLogout = async () => {
    setLogging(true)
    try { await authApi.logout() } catch { /* ignore */ }
    clearAuth()
    window.location.href = '/login'
  }

  const displayName = [user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.username || user?.email

  const KYC_LABELS: Record<number, string> = { 0: 'Unverified', 1: 'Basic', 2: 'Verified', 3: 'Full' }
  const KYC_COLORS: Record<number, string> = {
    0: 'bg-red-100 text-red-700',
    1: 'bg-amber-100 text-amber-700',
    2: 'bg-emerald-100 text-emerald-700',
    3: 'bg-brand-100 text-brand-700',
  }
  const kycLevel = user?.kyc_level ?? 0

  return (
    <div className="space-y-4 pt-2">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      {/* Avatar + name */}
      <Card>
        <div className="flex flex-col items-center py-4 gap-3">
          <div className="h-16 w-16 rounded-full bg-brand-100 flex items-center justify-center">
            <User className="h-8 w-8 text-brand-600" />
          </div>
          <div className="text-center">
            <p className="text-base font-semibold text-ink">{displayName}</p>
            <p className="text-xs text-ink-muted mt-0.5">{user?.email}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn('text-xs px-2.5 py-0.5 rounded-full font-medium', KYC_COLORS[kycLevel])}>
              KYC Level {kycLevel} — {KYC_LABELS[kycLevel] ?? 'Unknown'}
            </span>
            {user?.is_email_verified && (
              <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">
                <BadgeCheck className="h-3 w-3" /> Verified
              </span>
            )}
          </div>
        </div>

        {/* Account info */}
        <div className="mt-2">
          <InfoRow label="First name"    value={user?.first_name} />
          <InfoRow label="Last name"     value={user?.last_name} />
          <InfoRow label="Email"         value={user?.email} />
          <InfoRow label="Phone"         value={user?.phone} />
          <InfoRow label="Username"      value={user?.username} />
          <InfoRow label="Referral code" value={user?.referral_code} />
          {user?.created_at && <InfoRow label="Member since" value={fmtDate(user.created_at)} />}
        </div>
      </Card>

      {/* Quick links */}
      <Card className="divide-y divide-border !p-0">
        <button
          onClick={() => navigate('/settings')}
          className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-surface-2 transition-colors rounded-t-xl"
        >
          <Shield className="h-5 w-5 text-ink-muted" />
          <span className="text-sm font-medium text-ink">Security & Settings</span>
          <ArrowLeft className="h-4 w-4 text-ink-faint ml-auto rotate-180" />
        </button>
        <button
          onClick={() => navigate('/referrals')}
          className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-surface-2 transition-colors"
        >
          <Mail className="h-5 w-5 text-ink-muted" />
          <span className="text-sm font-medium text-ink">Refer & Earn</span>
          <ArrowLeft className="h-4 w-4 text-ink-faint ml-auto rotate-180" />
        </button>
        <button
          onClick={() => navigate('/notifications')}
          className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-surface-2 transition-colors rounded-b-xl"
        >
          <Phone className="h-5 w-5 text-ink-muted" />
          <span className="text-sm font-medium text-ink">Notifications</span>
          <ArrowLeft className="h-4 w-4 text-ink-faint ml-auto rotate-180" />
        </button>
      </Card>

      {/* Logout */}
      <Button
        variant="danger"
        fullWidth
        size="lg"
        loading={logging}
        onClick={handleLogout}
        icon={<LogOut className="h-4 w-4" />}
      >
        Sign out
      </Button>
    </div>
  )
}

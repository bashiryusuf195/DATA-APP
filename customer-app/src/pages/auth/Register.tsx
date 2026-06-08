import { useState } from 'react'
import { Link, useNavigate, Navigate, useSearchParams } from 'react-router-dom'
import { Mail, Lock, User, Phone } from 'lucide-react'
import { Button, Input, Card } from '@/components/ui'
import { authApi } from '@/api/auth.api'
import { apiClient } from '@/api/client'
import { useAuthStore } from '@/store/auth.store'
import toast from 'react-hot-toast'
import { isAxiosError } from 'axios'

export function RegisterPage() {
  const [form, setForm] = useState({
    first_name: '', last_name: '', email: '', phone: '', password: '', referral_code: '',
  })
  const [errors, setErrors] = useState<Partial<typeof form>>({})
  const [loading, setLoading] = useState(false)

  const [searchParams] = useSearchParams()
  const { setAuth, access_token, _hasHydrated } = useAuthStore()
  const navigate = useNavigate()

  if (!_hasHydrated) return null
  if (access_token) return <Navigate to="/dashboard" replace />

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((f) => ({ ...f, [k]: e.target.value }))
    setErrors((err) => ({ ...err, [k]: undefined }))
  }

  const validate = () => {
    const e: Partial<typeof form> = {}
    if (!form.first_name.trim()) e.first_name = 'Required'
    if (!form.last_name.trim())  e.last_name  = 'Required'
    if (!form.email.trim())      e.email      = 'Required'
    if (form.password.length < 8)              e.password = 'At least 8 characters'
    else if (!/[A-Z]/.test(form.password))     e.password = 'Must include an uppercase letter'
    else if (!/[a-z]/.test(form.password))     e.password = 'Must include a lowercase letter'
    else if (!/\d/.test(form.password))        e.password = 'Must include a number'
    return e
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    setLoading(true)
    try {
      const refCode = form.referral_code || searchParams.get('ref') || undefined
      const res = await authApi.register({ ...form, referral_code: refCode })
      setAuth({ access_token: res.access_token, refresh_token: res.refresh_token, session_id: res.session_id, user: res.user })
      apiClient.defaults.headers.common['Authorization'] = `Bearer ${res.access_token}`
      toast.success('Account created! Welcome.')
      navigate('/dashboard', { replace: true })
    } catch (err) {
      if (isAxiosError(err)) {
        const data = err.response?.data as Record<string, unknown> | undefined
        if (data?.code === 'RATE_LIMIT_EXCEEDED') {
          const secs = typeof data.retry_after === 'number' ? data.retry_after : null
          toast.error(secs ? `Too many attempts. Try again in ${secs} seconds.` : 'Too many attempts. Please try again later.')
          return
        }
        // Map per-field Zod errors back to the form so each input shows its own message
        if (data?.code === 'VALIDATION_ERROR' && data?.details && typeof data.details === 'object') {
          const details = data.details as Record<string, string[]>
          const serverErrors: Partial<typeof form> = {}
          for (const [field, msgs] of Object.entries(details)) {
            if (field in form && Array.isArray(msgs) && msgs.length > 0) {
              serverErrors[field as keyof typeof form] = msgs[0]
            }
          }
          if (Object.keys(serverErrors).length > 0) { setErrors(serverErrors); return }
        }
        toast.error(String(data?.message ?? 'Registration failed.'))
      } else {
        toast.error('Registration failed.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <h1 className="text-xl font-bold text-ink mb-1">Create account</h1>
      <p className="text-sm text-ink-muted mb-6">Join millions using Hive Data.</p>
      <form onSubmit={handleSubmit} className="space-y-3.5">
        <div className="grid grid-cols-2 gap-3">
          <Input label="First name" value={form.first_name} onChange={set('first_name')} placeholder="John" error={errors.first_name} prefix={<User className="h-4 w-4" />} />
          <Input label="Last name" value={form.last_name} onChange={set('last_name')} placeholder="Doe" error={errors.last_name} />
        </div>
        <Input label="Email" type="email" value={form.email} onChange={set('email')} placeholder="you@example.com" autoComplete="email" error={errors.email} prefix={<Mail className="h-4 w-4" />} />
        <Input label="Phone (optional)" type="tel" value={form.phone} onChange={set('phone')} placeholder="08012345678" prefix={<Phone className="h-4 w-4" />} hint="Nigerian numbers auto-converted to international format" />
        <Input label="Password" type="password" value={form.password} onChange={set('password')} placeholder="Min 8 characters" autoComplete="new-password" error={errors.password} hint={!errors.password ? 'Uppercase, lowercase, and a number required' : undefined} prefix={<Lock className="h-4 w-4" />} />
        <Input label="Referral code (optional)" value={form.referral_code || searchParams.get('ref') || ''} onChange={set('referral_code')} placeholder="e.g. ABC123" />
        <Button type="submit" loading={loading} fullWidth className="mt-1">Create Account</Button>
      </form>
      <p className="text-center text-sm text-ink-muted mt-5">
        Already have an account?{' '}
        <Link to="/login" className="text-brand-600 font-medium hover:underline">Sign in</Link>
      </p>
    </Card>
  )
}

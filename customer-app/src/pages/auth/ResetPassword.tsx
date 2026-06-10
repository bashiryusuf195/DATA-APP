import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Lock, ArrowLeft, AlertCircle, Eye, EyeOff } from 'lucide-react'
import { Button, Input, Card } from '@/components/ui'
import { authApi } from '@/api/auth.api'
import { isAxiosError } from 'axios'

type PageState = 'loading' | 'form' | 'invalid_token'

export function ResetPasswordPage() {
  const navigate = useNavigate()

  const [pageState, setPageState]       = useState<PageState>('loading')
  const [tokenError, setTokenError]     = useState('')
  const [accessToken, setAccessToken]   = useState('')
  const [refreshToken, setRefreshToken] = useState('')

  const [password, setPassword]   = useState('')
  const [confirm, setConfirm]     = useState('')
  const [errors, setErrors]       = useState<Record<string, string>>({})
  const [loading, setLoading]     = useState(false)
  const [showPw, setShowPw]       = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  useEffect(() => {
    // Supabase appends tokens as a URL fragment:
    // /reset-password#access_token=...&refresh_token=...&type=recovery
    const hash   = window.location.hash.substring(1)  // strip leading '#'
    const params = new URLSearchParams(hash)

    const error            = params.get('error')
    const errorDescription = params.get('error_description')

    if (error) {
      setTokenError(errorDescription ?? error)
      setPageState('invalid_token')
      return
    }

    const at   = params.get('access_token')
    const rt   = params.get('refresh_token') ?? ''
    const type = params.get('type')

    if (!at || type !== 'recovery') {
      setPageState('invalid_token')
      return
    }

    setAccessToken(at)
    setRefreshToken(rt)
    setPageState('form')
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const errs: Record<string, string> = {}
    if (!password)                        errs.password = 'Password is required.'
    else if (password.length < 8)         errs.password = 'Password must be at least 8 characters.'
    if (!confirm)                         errs.confirm  = 'Please confirm your password.'
    else if (password && password !== confirm) errs.confirm = 'Passwords do not match.'
    if (Object.keys(errs).length) { setErrors(errs); return }
    setErrors({})
    setLoading(true)
    try {
      await authApi.resetPassword({ access_token: accessToken, refresh_token: refreshToken, password })
      sessionStorage.setItem('password_reset_success', '1')
      navigate('/login', { replace: true })
    } catch (err) {
      if (isAxiosError(err)) {
        if (err.response?.status === 401) {
          setTokenError('This reset link has expired. Please request a new one.')
          setPageState('invalid_token')
        } else {
          setErrors({ password: err.response?.data?.message ?? 'Failed to reset password. Please try again.' })
        }
      } else {
        setErrors({ password: 'Something went wrong. Please try again.' })
      }
    } finally {
      setLoading(false)
    }
  }

  if (pageState === 'loading') return null

  if (pageState === 'invalid_token') {
    return (
      <Card>
        <div className="flex flex-col items-center text-center py-4">
          <div className="h-14 w-14 rounded-full bg-danger/10 flex items-center justify-center mb-4">
            <AlertCircle className="h-7 w-7 text-danger" />
          </div>
          <p className="text-base font-semibold text-ink mb-1">Link expired or invalid</p>
          <p className="text-sm text-ink-muted mb-6">
            {tokenError || 'This password reset link is no longer valid.'}
          </p>
          <Link to="/forgot-password" className="text-sm text-brand-600 hover:underline">
            Request a new reset link
          </Link>
        </div>
      </Card>
    )
  }

  return (
    <Card>
      <h1 className="text-xl font-bold text-ink mb-1">Set new password</h1>
      <p className="text-sm text-ink-muted mb-6">Enter and confirm your new password below.</p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="New Password"
          type={showPw ? 'text' : 'password'}
          value={password}
          onChange={(e) => { setPassword(e.target.value); setErrors((prev) => ({ ...prev, password: '' })) }}
          placeholder="••••••••"
          autoComplete="new-password"
          prefix={<Lock className="h-4 w-4" />}
          error={errors.password}
          suffix={
            <button type="button" tabIndex={-1} onClick={() => setShowPw((v) => !v)} className="text-ink-faint hover:text-ink transition-colors" aria-label={showPw ? 'Hide password' : 'Show password'}>
              {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          }
        />
        <Input
          label="Confirm Password"
          type={showConfirm ? 'text' : 'password'}
          value={confirm}
          onChange={(e) => { setConfirm(e.target.value); setErrors((prev) => ({ ...prev, confirm: '' })) }}
          placeholder="••••••••"
          autoComplete="new-password"
          prefix={<Lock className="h-4 w-4" />}
          error={errors.confirm}
          suffix={
            <button type="button" tabIndex={-1} onClick={() => setShowConfirm((v) => !v)} className="text-ink-faint hover:text-ink transition-colors" aria-label={showConfirm ? 'Hide password' : 'Show password'}>
              {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          }
        />
        <Button type="submit" loading={loading} fullWidth>Set Password</Button>
      </form>
      <div className="flex justify-center mt-5">
        <Link to="/login" className="text-sm text-ink-muted hover:text-ink flex items-center gap-1">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to sign in
        </Link>
      </div>
    </Card>
  )
}

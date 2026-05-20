import { useState } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/auth.store'
import { authApi } from '@/api/auth.api'
import { apiClient } from '@/api/client'
import { Button, Input, Card } from '@/components/ui'
import { PageSpinner } from '@/components/ui/Spinner'
import { Zap, Mail, Lock, Smartphone, ArrowLeft } from 'lucide-react'
import toast from 'react-hot-toast'
import axios from 'axios'

type LoginStep = 'credentials' | '2fa'

export function LoginPage() {
  const [step,        setStep]        = useState<LoginStep>('credentials')
  const [challengeId, setChallengeId] = useState('')

  // Credentials step
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')

  // 2FA step
  const [totpCode, setTotpCode] = useState('')

  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  const { setAuth, access_token, _hasHydrated } = useAuthStore()
  const navigate = useNavigate()

  if (!_hasHydrated) return <PageSpinner />
  if (access_token) return <Navigate to="/dashboard" replace />

  // ── Step 1: password ───────────────────────────────────────────────────────

  const handleCredentials = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) { setError('Email and password are required.'); return }
    setLoading(true)
    setError('')
    try {
      const res = await authApi.login({ email, password })

      if (res.requires_2fa) {
        setChallengeId(res.challenge_id)
        setStep('2fa')
        return
      }

      // Normal login (admin without 2FA, or non-admin user)
      setAuth({
        access_token:  res.access_token,
        refresh_token: res.refresh_token,
        session_id:    res.session_id,
        user:          res.user,
      })
      apiClient.defaults.headers.common['Authorization'] = `Bearer ${res.access_token}`
      toast.success('Welcome back!')
      navigate('/dashboard', { replace: true })
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.message ?? 'Invalid credentials.')
      } else {
        setError('Login failed. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  // ── Step 2: 2FA ────────────────────────────────────────────────────────────

  const handle2fa = async (e: React.FormEvent) => {
    e.preventDefault()
    const code = totpCode.replace(/\s/g, '')
    if (code.length < 6) { setError('Enter your 6-digit code.'); return }
    setLoading(true)
    setError('')
    try {
      const res = await authApi.verifyLoginTotp(challengeId, code)
      setAuth({
        access_token:  res.access_token,
        refresh_token: res.refresh_token,
        session_id:    res.session_id,
        user:          res.user,
      })
      apiClient.defaults.headers.common['Authorization'] = `Bearer ${res.access_token}`
      toast.success('Welcome back!')
      navigate('/dashboard', { replace: true })
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const msg = err.response?.data?.message ?? 'Invalid code.'
        setError(msg)
        // Challenge consumed on valid TOTP (even if other error) — always safe to retry
        // from scratch. If the error is CHALLENGE_EXPIRED we must go back to step 1.
        const code = err.response?.data?.code as string | undefined
        if (code === 'CHALLENGE_EXPIRED') {
          setStep('credentials')
          setChallengeId('')
          setTotpCode('')
        }
      } else {
        setError('Verification failed. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  // ── UI ────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-0 p-4">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <div className="h-9 w-9 rounded-xl bg-accent flex items-center justify-center shadow-lg shadow-accent/20">
            <Zap className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-xs text-ink-faint">Admin Console</p>
            <p className="text-base font-bold text-ink leading-none">VTU Platform</p>
          </div>
        </div>

        {step === 'credentials' ? (
          <Card>
            <h1 className="text-lg font-bold text-ink mb-1">Sign in</h1>
            <p className="text-sm text-ink-muted mb-6">
              Enter your admin credentials to continue.
            </p>

            <form onSubmit={handleCredentials} className="space-y-4">
              <Input
                label="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@example.com"
                autoComplete="email"
                prefix={<Mail className="h-4 w-4" />}
              />
              <Input
                label="Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                prefix={<Lock className="h-4 w-4" />}
              />

              {error && (
                <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 px-3 py-2.5">
                  <p className="text-xs text-rose-400">{error}</p>
                </div>
              )}

              <Button type="submit" loading={loading} className="w-full">
                Sign in
              </Button>
            </form>
          </Card>
        ) : (
          <Card>
            <div className="flex items-center gap-2 mb-1">
              <Smartphone className="h-5 w-5 text-accent" />
              <h1 className="text-lg font-bold text-ink">Two-Factor Authentication</h1>
            </div>
            <p className="text-sm text-ink-muted mb-6">
              Enter the 6-digit code from your authenticator app, or a backup code.
            </p>

            <form onSubmit={handle2fa} className="space-y-4">
              <Input
                label="Authentication code"
                type="text"
                inputMode="numeric"
                value={totpCode}
                onChange={(e) => { setTotpCode(e.target.value.replace(/[^0-9A-Fa-f]/g, '')); setError('') }}
                placeholder="000000"
                autoComplete="one-time-code"
                maxLength={10}
                className="text-center text-xl font-mono tracking-[0.4em]"
              />

              {error && (
                <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 px-3 py-2.5">
                  <p className="text-xs text-rose-400">{error}</p>
                </div>
              )}

              <Button type="submit" loading={loading} className="w-full">
                Verify
              </Button>

              <button
                type="button"
                onClick={() => { setStep('credentials'); setChallengeId(''); setTotpCode(''); setError('') }}
                className="flex items-center gap-1 text-xs text-ink-faint hover:text-ink mx-auto"
              >
                <ArrowLeft className="h-3 w-3" />
                Back to sign in
              </button>
            </form>
          </Card>
        )}

        <p className="text-center text-xs text-ink-faint mt-4">
          VTU Admin Dashboard · Restricted Access
        </p>
      </div>
    </div>
  )
}

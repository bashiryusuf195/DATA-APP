import { useState } from 'react'
import { Link, useNavigate, Navigate } from 'react-router-dom'
import { Mail, Lock, Smartphone, ArrowLeft } from 'lucide-react'
import { Button, Input, Card } from '@/components/ui'
import { authApi } from '@/api/auth.api'
import { apiClient } from '@/api/client'
import { useAuthStore } from '@/store/auth.store'
import toast from 'react-hot-toast'
import { isAxiosError } from 'axios'

type Step = 'credentials' | '2fa'

export function LoginPage() {
  const [step, setStep]               = useState<Step>('credentials')
  const [challengeId, setChallengeId] = useState('')
  const [email, setEmail]             = useState('')
  const [password, setPassword]       = useState('')
  const [totpCode, setTotpCode]       = useState('')
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState('')

  const { setAuth, access_token, _hasHydrated } = useAuthStore()
  const navigate = useNavigate()

  if (!_hasHydrated) return null
  if (access_token) return <Navigate to="/dashboard" replace />

  const handleCredentials = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) { setError('Email and password are required.'); return }
    setLoading(true); setError('')
    try {
      const res = await authApi.login({ email, password })
      if (res.requires_2fa) {
        setChallengeId(res.challenge_id)
        setStep('2fa')
        return
      }
      setAuth({ access_token: res.access_token, refresh_token: res.refresh_token, session_id: res.session_id, user: res.user })
      apiClient.defaults.headers.common['Authorization'] = `Bearer ${res.access_token}`
      toast.success('Welcome back!')
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(isAxiosError(err) ? (err.response?.data?.message ?? 'Invalid credentials.') : 'Login failed.')
    } finally {
      setLoading(false)
    }
  }

  const handle2fa = async (e: React.FormEvent) => {
    e.preventDefault()
    const code = totpCode.replace(/\s/g, '')
    if (code.length < 6) { setError('Enter your 6-digit code.'); return }
    setLoading(true); setError('')
    try {
      const res = await authApi.verifyLoginTotp(challengeId, code)
      setAuth({ access_token: res.access_token, refresh_token: res.refresh_token, session_id: res.session_id, user: res.user })
      apiClient.defaults.headers.common['Authorization'] = `Bearer ${res.access_token}`
      toast.success('Welcome back!')
      navigate('/dashboard', { replace: true })
    } catch (err) {
      if (isAxiosError(err)) {
        setError(err.response?.data?.message ?? 'Invalid code.')
        if ((err.response?.data?.code as string) === 'CHALLENGE_EXPIRED') {
          setStep('credentials'); setChallengeId(''); setTotpCode('')
        }
      } else {
        setError('Verification failed.')
      }
    } finally {
      setLoading(false)
    }
  }

  if (step === '2fa') {
    return (
      <Card>
        <div className="flex items-center gap-2 mb-1">
          <Smartphone className="h-5 w-5 text-brand-600" />
          <h1 className="text-lg font-bold text-ink">Two-Factor Auth</h1>
        </div>
        <p className="text-sm text-ink-muted mb-6">Enter the 6-digit code from your authenticator app.</p>
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
          {error && <p className="text-xs text-danger">{error}</p>}
          <Button type="submit" loading={loading} fullWidth>Verify</Button>
          <button
            type="button"
            onClick={() => { setStep('credentials'); setChallengeId(''); setTotpCode(''); setError('') }}
            className="flex items-center gap-1 text-xs text-ink-faint hover:text-ink mx-auto"
          >
            <ArrowLeft className="h-3 w-3" /> Back to sign in
          </button>
        </form>
      </Card>
    )
  }

  return (
    <Card>
      <h1 className="text-xl font-bold text-ink mb-1">Sign in</h1>
      <p className="text-sm text-ink-muted mb-6">Enter your credentials to continue.</p>
      <form onSubmit={handleCredentials} className="space-y-4">
        <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" prefix={<Mail className="h-4 w-4" />} />
        <Input label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" prefix={<Lock className="h-4 w-4" />} />
        <div className="flex justify-end">
          <Link to="/forgot-password" className="text-xs text-brand-600 hover:underline">Forgot password?</Link>
        </div>
        {error && <p className="text-xs text-danger">{error}</p>}
        <Button type="submit" loading={loading} fullWidth>Sign in</Button>
      </form>
      <p className="text-center text-sm text-ink-muted mt-5">
        Don't have an account?{' '}
        <Link to="/register" className="text-brand-600 font-medium hover:underline">Sign up</Link>
      </p>
    </Card>
  )
}

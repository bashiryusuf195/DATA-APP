import { useState, useEffect } from 'react'
import { Link, useNavigate, Navigate } from 'react-router-dom'
import { Mail, Lock, Smartphone, ArrowLeft, Fingerprint, Eye, EyeOff } from 'lucide-react'
import { ONBOARDING_KEY } from '@/pages/onboarding/Onboarding'
import { Button, Input, Card } from '@/components/ui'
import { authApi } from '@/api/auth.api'
import { apiClient } from '@/api/client'
import { useAuthStore } from '@/store/auth.store'
import toast from 'react-hot-toast'
import { isAxiosError } from 'axios'
import {
  isWebAuthnSupported,
  isPlatformAuthenticatorAvailable,
  authenticateWithPasskey,
  browserSupportsWebAuthnAutofill,
  WebAuthnAbortService,
  startConditionalAuthentication,
} from '@/hooks/usePasskey'

type Step = 'credentials' | '2fa'

export function LoginPage() {
  const [step, setStep]               = useState<Step>('credentials')
  const [challengeId, setChallengeId] = useState('')
  const [email, setEmail]             = useState('')
  const [password, setPassword]       = useState('')
  const [totpCode, setTotpCode]       = useState('')
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState('')
  const [showPw, setShowPw]           = useState(false)
  const [biometricAvailable, setBiometricAvailable] = useState(false)
  const [biometricLoading, setBiometricLoading]     = useState(false)

  const { setAuth, access_token, _hasHydrated } = useAuthStore()
  const navigate = useNavigate()

  // Show a toast if the user was redirected here because their session expired.
  useEffect(() => {
    if (sessionStorage.getItem('session_expired') === '1') {
      sessionStorage.removeItem('session_expired')
      toast.error('Session expired. Please log in again.')
    }
    if (sessionStorage.getItem('password_reset_success') === '1') {
      sessionStorage.removeItem('password_reset_success')
      toast.success('Password updated! Sign in with your new password.')
    }
    // First-time mobile visitors see onboarding before login
    const isMobile = window.innerWidth < 768
    if (isMobile && !localStorage.getItem(ONBOARDING_KEY)) {
      navigate('/onboarding', { replace: true })
    }

    // Explicit biometric button: check platform authenticator availability
    if (isWebAuthnSupported()) {
      isPlatformAuthenticatorAvailable().then(setBiometricAvailable)
    }

    // Conditional UI: start a background WebAuthn ceremony so registered passkeys
    // appear in the browser's email autofill dropdown. The promise stays pending
    // until the user picks a credential or the ceremony is aborted. Requires the
    // email input to have autocomplete ending in "webauthn".
    browserSupportsWebAuthnAutofill().then((supported) => {
      if (!supported) return
      startConditionalAuthentication()
        .then((result) => {
          if (result) {
            toast.success('Welcome back!')
            navigate('/dashboard', { replace: true })
          }
        })
        .catch((err) => {
          // AbortError = intentional cancel (unmount or explicit biometric button used)
          if ((err as Error)?.name === 'AbortError') return
          // Challenge expired or server error — silently fall back to the form
          console.warn('[passkey] conditional UI error:', (err as Error)?.message)
        })
    })

    return () => {
      // Cancel any pending WebAuthn ceremony to avoid dangling promises on unmount
      WebAuthnAbortService.cancelCeremony()
    }
  }, [navigate])

  if (!_hasHydrated) return null
  if (access_token) return <Navigate to="/dashboard" replace />

  const handleBiometric = async () => {
    setBiometricLoading(true)
    setError('')
    try {
      const result = await authenticateWithPasskey()
      if (result === null) {
        // User cancelled or no credential — stay on the form, no error message
        return
      }
      toast.success('Welcome back!')
      navigate('/dashboard', { replace: true })
    } catch (err) {
      // Any error that isn't a user-cancellation shows an inline message.
      // The email form remains fully accessible below.
      const msg = isAxiosError(err)
        ? (err.response?.data?.message ?? 'Biometric sign-in failed.')
        : (err as Error)?.message ?? 'Biometric sign-in failed.'
      setError(msg)
    } finally {
      setBiometricLoading(false)
    }
  }

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
        <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email webauthn" prefix={<Mail className="h-4 w-4" />} />
        <Input
          label="Password"
          type={showPw ? 'text' : 'password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          autoComplete="current-password"
          prefix={<Lock className="h-4 w-4" />}
          suffix={
            <button type="button" tabIndex={-1} onClick={() => setShowPw((v) => !v)} className="text-ink-faint hover:text-ink transition-colors" aria-label={showPw ? 'Hide password' : 'Show password'}>
              {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          }
        />
        <div className="flex justify-end">
          <Link to="/forgot-password" className="text-xs text-brand-600 hover:underline">Forgot password?</Link>
        </div>
        {error && <p className="text-xs text-danger">{error}</p>}
        <Button type="submit" loading={loading} fullWidth>Sign in</Button>
      </form>
      {biometricAvailable && (
        <>
          <div className="flex items-center gap-3 mt-5">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-ink-faint">or</span>
            <div className="flex-1 h-px bg-border" />
          </div>
          <button
            type="button"
            disabled={biometricLoading}
            onClick={handleBiometric}
            className="mt-3 w-full flex items-center justify-center gap-2.5 py-3 rounded-2xl border border-border bg-surface-1 text-sm font-semibold text-ink hover:bg-surface-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Fingerprint className="h-5 w-5 text-brand-600" />
            {biometricLoading ? 'Verifying…' : 'Sign in with Biometrics'}
          </button>
        </>
      )}
      <p className="text-center text-sm text-ink-muted mt-5">
        Don't have an account?{' '}
        <Link to="/register" className="text-brand-600 font-medium hover:underline">Sign up</Link>
      </p>
    </Card>
  )
}

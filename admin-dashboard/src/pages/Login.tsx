import { useState } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/auth.store'
import { authApi } from '@/api/auth.api'
import { apiClient } from '@/api/client'
import { Button, Input, Card } from '@/components/ui'
import { PageSpinner } from '@/components/ui/Spinner'
import { Zap, Mail, Lock } from 'lucide-react'
import toast from 'react-hot-toast'
import axios from 'axios'

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const { setAuth, access_token, _hasHydrated } = useAuthStore()
  const navigate = useNavigate()

  // Wait for persist rehydration before rendering anything
  if (!_hasHydrated) return <PageSpinner />

  // If already authenticated, skip the login page entirely
  if (access_token) return <Navigate to="/dashboard" replace />

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) {
      setError('Email and password are required.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await authApi.login({ email, password })
      console.log('[Login] API response:', res)

      // 1. Persist tokens + user in Zustand (written to localStorage by persist middleware)
      setAuth({
        access_token:  res.access_token,
        refresh_token: res.refresh_token,
        session_id:    res.session_id,
        user:          res.user,
      })
      console.log('[Login] Auth store after setAuth:', useAuthStore.getState())

      // 2. Also set the Authorization header directly on the Axios instance so the
      //    very next request — before the interceptor re-reads the store — is authenticated.
      apiClient.defaults.headers.common['Authorization'] = `Bearer ${res.access_token}`

      toast.success('Welcome back!')

      // 3. Replace the history entry so the back-button doesn't return to /login
      console.log('[Login] Navigating to /dashboard')
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

        <Card>
          <h1 className="text-lg font-bold text-ink mb-1">Sign in</h1>
          <p className="text-sm text-ink-muted mb-6">
            Enter your admin credentials to continue.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
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

        <p className="text-center text-xs text-ink-faint mt-4">
          VTU Admin Dashboard · Restricted Access
        </p>
      </div>
    </div>
  )
}

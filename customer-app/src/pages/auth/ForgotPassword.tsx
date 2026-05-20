import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Mail, ArrowLeft, CheckCircle2 } from 'lucide-react'
import { Button, Input, Card } from '@/components/ui'
import { authApi } from '@/api/auth.api'
import { isAxiosError } from 'axios'

export function ForgotPasswordPage() {
  const [email, setEmail]     = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent]       = useState(false)
  const [error, setError]     = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) { setError('Email is required.'); return }
    setLoading(true); setError('')
    try {
      await authApi.forgotPassword(email)
      setSent(true)
    } catch (err) {
      setError(isAxiosError(err) ? (err.response?.data?.message ?? 'Failed to send reset email.') : 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  if (sent) {
    return (
      <Card>
        <div className="flex flex-col items-center text-center py-4">
          <div className="h-14 w-14 rounded-full bg-success-light flex items-center justify-center mb-4">
            <CheckCircle2 className="h-7 w-7 text-success" />
          </div>
          <p className="text-base font-semibold text-ink mb-1">Check your email</p>
          <p className="text-sm text-ink-muted mb-6">
            If an account exists for <strong>{email}</strong>, a password reset link has been sent.
          </p>
          <Link to="/login" className="text-sm text-brand-600 hover:underline flex items-center gap-1">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to sign in
          </Link>
        </div>
      </Card>
    )
  }

  return (
    <Card>
      <h1 className="text-xl font-bold text-ink mb-1">Reset password</h1>
      <p className="text-sm text-ink-muted mb-6">Enter your email and we'll send you a reset link.</p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input label="Email" type="email" value={email} onChange={(e) => { setEmail(e.target.value); setError('') }} placeholder="you@example.com" autoComplete="email" prefix={<Mail className="h-4 w-4" />} error={error} />
        <Button type="submit" loading={loading} fullWidth>Send Reset Link</Button>
      </form>
      <div className="flex justify-center mt-5">
        <Link to="/login" className="text-sm text-ink-muted hover:text-ink flex items-center gap-1">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to sign in
        </Link>
      </div>
    </Card>
  )
}

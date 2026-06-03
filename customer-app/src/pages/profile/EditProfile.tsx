import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { useAuthStore } from '@/store/auth.store'
import { authApi } from '@/api/auth.api'
import { Button, Input } from '@/components/ui'

export function EditProfilePage() {
  const navigate  = useNavigate()
  const user      = useAuthStore((s) => s.user)
  const setUser   = useAuthStore((s) => s.setUser)

  const [form, setForm] = useState({
    first_name:    user?.first_name    ?? '',
    last_name:     user?.last_name     ?? '',
    phone:         user?.phone         ?? '',
    username:      user?.username      ?? '',
    date_of_birth: user?.date_of_birth ?? '',
    address_line1: user?.address_line1 ?? '',
    gender:        user?.gender        ?? '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  const updateMutation = useMutation({
    mutationFn: (data: typeof form) => authApi.updateProfile(data),
    onSuccess: (updated) => {
      setUser(updated)
      toast.success('Profile updated')
      navigate('/profile')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const errs: Record<string, string> = {}
    if (!form.first_name.trim()) errs.first_name = 'First name is required'
    if (!form.last_name.trim())  errs.last_name  = 'Last name is required'
    if (Object.keys(errs).length) { setErrors(errs); return }
    setErrors({})
    updateMutation.mutate(form)
  }

  const set = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((f) => ({ ...f, [field]: e.target.value }))
    setErrors((err) => ({ ...err, [field]: '' }))
  }

  return (
    <div className="space-y-4 pt-2 pb-4">
      <button
        onClick={() => navigate('/profile')}
        className="flex items-center gap-1.5 text-sm font-medium text-ink-muted hover:text-ink transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Profile
      </button>

      <h1 className="text-lg font-bold text-ink">Edit Profile</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="bg-surface-1 rounded-3xl p-5 shadow-card space-y-4">
          <Input
            label="First Name"
            value={form.first_name}
            onChange={set('first_name')}
            error={errors.first_name}
            placeholder="e.g. John"
          />
          <Input
            label="Last Name"
            value={form.last_name}
            onChange={set('last_name')}
            error={errors.last_name}
            placeholder="e.g. Doe"
          />
          <Input
            label="Phone Number"
            type="tel"
            inputMode="numeric"
            value={form.phone}
            onChange={set('phone')}
            error={errors.phone}
            placeholder="e.g. 08012345678"
          />
          <Input
            label="Date of Birth"
            type="date"
            value={form.date_of_birth}
            onChange={set('date_of_birth')}
            error={errors.date_of_birth}
            max={new Date().toISOString().slice(0, 10)}
          />
          <Input
            label="Address"
            value={form.address_line1}
            onChange={set('address_line1')}
            error={errors.address_line1}
            placeholder="e.g. 12 Main Street, Lagos"
          />
          <div className="w-full">
            <label htmlFor="gender" className="block text-sm font-medium text-ink mb-1.5">
              Gender
            </label>
            <select
              id="gender"
              value={form.gender}
              onChange={(e) => { setForm((f) => ({ ...f, gender: e.target.value })); setErrors((err) => ({ ...err, gender: '' })) }}
              className="w-full rounded-xl border bg-surface-1 text-ink h-11 px-3.5 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent border-border"
            >
              <option value="">Select gender</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
            {errors.gender && <p className="mt-1.5 text-xs text-danger">{errors.gender}</p>}
          </div>
          <Input
            label="Username"
            value={form.username}
            onChange={set('username')}
            error={errors.username}
            placeholder="e.g. johndoe"
          />
        </div>

        <Button type="submit" fullWidth size="lg" loading={updateMutation.isPending}>
          Save Changes
        </Button>
      </form>
    </div>
  )
}

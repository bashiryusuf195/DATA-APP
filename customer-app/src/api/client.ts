import axios from 'axios'
import { useAuthStore } from '@/store/auth.store'

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''

export const apiClient = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30_000,
})

// ── Request: attach JWT ───────────────────────────────────────────────────────
apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().access_token
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// ── Response: 401 handling + error normalisation ──────────────────────────────
apiClient.interceptors.response.use(
  (res) => res,
  (error) => {
    const status: number | undefined = error.response?.status

    if (status === 401) {
      const url: string = error.config?.url ?? ''
      const isAuthEndpoint = url.includes('/auth/login') ||
        url.includes('/auth/register') ||
        url.includes('/auth/refresh') ||
        url.includes('/auth/2fa/')
      if (!isAuthEndpoint) {
        useAuthStore.getState().clearAuth()
        window.location.href = '/login'
      }
      return Promise.reject(error)
    }

    // Normalise message
    if (!error.message || error.message === 'Network Error') {
      error.message = 'Unable to reach the server. Check your connection.'
    } else if (status === 403) {
      error.message = 'You do not have permission to perform this action.'
    } else if (status === 429) {
      const retryAfter = error.response?.headers?.['retry-after']
      const secs = retryAfter ? Math.ceil(Number(retryAfter)) : null
      error.message = secs
        ? `Too many requests. Please wait ${secs} second${secs === 1 ? '' : 's'}.`
        : 'Too many requests. Please wait a moment.'
      ;(error as { retryAfterSeconds?: number | null }).retryAfterSeconds = secs
    } else if (status != null && status >= 500) {
      error.message = `Server error (${status}). Please try again shortly.`
    }

    return Promise.reject(error)
  }
)

export function syncAuthHeader() {
  const token = useAuthStore.getState().access_token
  if (token) {
    apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`
  } else {
    delete apiClient.defaults.headers.common['Authorization']
  }
}

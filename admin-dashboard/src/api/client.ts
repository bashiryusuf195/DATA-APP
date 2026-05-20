import axios from 'axios'
import { useAuthStore } from '@/store/auth.store'

/**
 * Empty baseURL → Vite dev proxy handles routing to http://localhost:3000
 * Set VITE_API_BASE_URL=http://localhost:3000 only if the backend allows
 * CORS from this origin (add http://localhost:5173 to CORS_ORIGINS on server).
 */
const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''

export const apiClient = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30_000,
})

// ── Request interceptor: attach JWT ──────────────────────────────────────────
apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().access_token
  if (token) config.headers.Authorization = `Bearer ${token}`

  if (import.meta.env.DEV) {
    const method = (config.method ?? 'GET').toUpperCase()
    const url    = (config.baseURL ?? '') + (config.url ?? '')
    const params = config.params ? ` ${JSON.stringify(config.params)}` : ''
    console.debug(`[API →] ${method} ${url}${params}`)
  }

  return config
})

// ── Response interceptor: debug + error normalisation ────────────────────────
apiClient.interceptors.response.use(
  (res) => {
    if (import.meta.env.DEV) {
      const url    = res.config.url ?? ''
      const status = res.status
      const shape  = typeof res.data === 'object' && res.data !== null
        ? Object.keys(res.data).join(', ')
        : typeof res.data
      console.debug(`[API ←] ${status} ${url}  { ${shape} }`)
    }
    return res
  },
  (error) => {
    const status: number | undefined = error.response?.status

    if (import.meta.env.DEV) {
      const url = error.config?.url ?? '(unknown)'
      console.warn(`[API ✗] ${status ?? 'NET'} ${url}`, error.message)
    }

    if (status === 401) {
      // If the 401 came from the login endpoint itself, it means wrong credentials —
      // do NOT redirect; let the error propagate to the form's error handler so the
      // user sees the message instead of silently reloading the login page.
      const isLoginRequest = (
        !!error.config?.url?.includes('/auth/login') ||
        !!error.config?.url?.includes('/auth/2fa/verify-login')
      )
      useAuthStore.getState().clearAuth()
      delete apiClient.defaults.headers.common['Authorization']
      if (!isLoginRequest) {
        window.location.href = '/login'
      }
      return Promise.reject(error)
    }

    // Normalise error message so UI always has something human-readable.
    if (!error.message || error.message === 'Network Error') {
      error.message = 'Unable to reach the server. Check your connection and try again.'
    } else if (status === 403) {
      error.message = 'You do not have permission to perform this action.'
    } else if (status === 404) {
      // Keep the original message; ErrorMessage component handles 404 specially.
    } else if (status === 429) {
      const retryAfter = error.response?.headers?.['retry-after']
      const seconds    = retryAfter ? Math.ceil(Number(retryAfter)) : null
      error.message    = seconds
        ? `Too many requests. Please wait ${seconds} second${seconds === 1 ? '' : 's'} before trying again.`
        : 'Too many requests. Please wait a moment before trying again.'
      // Attach for components that want to show a countdown.
      error.retryAfterSeconds = seconds
    } else if (status != null && status >= 500) {
      error.message = `Server error (${status}). Please try again shortly.`
    }

    return Promise.reject(error)
  },
)

/**
 * Sync the default Authorization header from the persisted auth store.
 * Call once at app startup so requests fired before the first interceptor run
 * (e.g. React Query cache hydration) are already authenticated.
 */
export function syncAuthHeader() {
  const token = useAuthStore.getState().access_token
  if (token) {
    apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`
  } else {
    delete apiClient.defaults.headers.common['Authorization']
  }
}

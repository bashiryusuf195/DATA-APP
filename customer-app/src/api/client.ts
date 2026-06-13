import axios from 'axios'
import { useAuthStore } from '@/store/auth.store'
import { useSystemStore } from '@/store/system.store'

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''

export const apiClient = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30_000,
})

// ── Request: attach JWT ───────────────────────────────────────────────────────
// Always reads from the store at request time — correct even before
// syncAuthHeader() has been called (Zustand persist hydrates asynchronously).
apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().access_token
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  } else {
    delete config.headers.Authorization
  }
  return config
})

// ── 401 redirect guard ────────────────────────────────────────────────────────
let _isRedirectingToLogin = false

function redirectToLogin() {
  if (_isRedirectingToLogin) return
  _isRedirectingToLogin = true
  useAuthStore.getState().clearAuth()
  delete apiClient.defaults.headers.common['Authorization']
  sessionStorage.setItem('session_expired', '1')
  window.location.replace('/login')
}

// ── Response: 401 handling + error normalisation ──────────────────────────────
apiClient.interceptors.response.use(
  (res) => res,
  (error) => {
    const status: number | undefined = error.response?.status

    // 503 from the backend with maintenance flag → surface the maintenance screen
    if (status === 503 && error.response?.data?.maintenance === true) {
      useSystemStore.getState().setMaintenance(true)
      return new Promise(() => {})
    }

    if (status === 401) {
      const url: string  = error.config?.url ?? ''
      const code: string = error.response?.data?.code ?? ''

      const isAuthEndpoint =
        url.includes('/auth/login') ||
        url.includes('/auth/register') ||
        url.includes('/auth/refresh') ||
        url.includes('/auth/2fa/')

      // PIN errors use 401 on older deployments — never treat them as session expiry.
      // (Current backend uses 422 for INVALID_TRANSACTION_PIN, but this guard handles
      // any deployment that may not yet have that fix.)
      const isPinError =
        code === 'INVALID_TRANSACTION_PIN' ||
        code === 'TRANSACTION_PIN_LOCKED'  ||
        code === 'TRANSACTION_PIN_NOT_SET' ||
        code === 'TRANSACTION_PIN_REQUIRED'

      if (!isAuthEndpoint && !isPinError) {
        // Friendly message first — if any component briefly renders before
        // navigation completes, it sees clean text instead of raw JSON.
        error.message = 'Session expired. Please log in again.'
        redirectToLogin()
        // Never-resolving promise: page is navigating away, no component
        // should ever render this error response.
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        return new Promise(() => {})
      }

      // Auth endpoints and PIN errors: let the caller handle the error normally.
      error.message = error.response?.data?.message ?? 'Invalid credentials.'
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
    } else if (status != null && status >= 400) {
      // Use the server's message when available — it's more specific than Axios's default.
      error.message = error.response?.data?.message ?? error.message
    }

    // Attach machine-readable code so PIN-specific handlers can branch on it
    const backendCode = error.response?.data?.code as string | undefined
    if (backendCode) {
      (error as Record<string, unknown>).code = backendCode
    }

    return Promise.reject(error)
  }
)

export function syncAuthHeader() {
  const token = useAuthStore.getState().access_token
  if (token) {
    apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`
    _isRedirectingToLogin = false
  } else {
    delete apiClient.defaults.headers.common['Authorization']
  }
}

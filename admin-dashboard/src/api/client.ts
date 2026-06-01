import axios from 'axios'
import type { AuthTokens } from '@/types'
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
  // Always read from the store at request time — works correctly even before
  // syncAuthHeader() has been called (i.e. before the first useEffect fires).
  const token = useAuthStore.getState().access_token
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  } else {
    delete config.headers.Authorization
  }

  if (import.meta.env.DEV) {
    const method = (config.method ?? 'GET').toUpperCase()
    const url    = (config.baseURL ?? '') + (config.url ?? '')
    const params = config.params ? ` ${JSON.stringify(config.params)}` : ''
    console.debug(`[API →] ${method} ${url}${params}`)
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

// ── Token refresh queue ────────────────────────────────────────────────────────
// When the access token expires, the first failing request triggers a refresh.
// Subsequent requests that arrive while the refresh is in-flight are queued and
// replayed with the new token once refresh completes.
let _isRefreshing = false
let _refreshQueue: Array<{
  resolve: (token: string) => void
  reject:  (err: unknown) => void
}> = []

function drainQueue(err: unknown, token: string | null): void {
  for (const cb of _refreshQueue) {
    if (err) cb.reject(err)
    else     cb.resolve(token!)
  }
  _refreshQueue = []
}

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
      const url = error.config?.url ?? ''

      // Auth endpoints (login, 2FA, refresh) are never silently retried.
      // Login/2FA: propagate so the form can show the message.
      // Refresh: handled by the catch below when the refresh itself fails.
      const isLoginOrTwoFactor = url.includes('/auth/login') || url.includes('/auth/2fa/verify-login')
      const isRefreshEndpoint  = url.includes('/auth/refresh')

      if (!isLoginOrTwoFactor && !isRefreshEndpoint) {
        // Protected resource — attempt silent token refresh before giving up.
        const { refresh_token } = useAuthStore.getState()

        if (!refresh_token) {
          error.message = 'Session expired. Please log in again.'
          redirectToLogin()
          return new Promise(() => {})
        }

        if (_isRefreshing) {
          // Another request is already refreshing — queue this one for replay.
          return new Promise<string>((resolve, reject) => {
            _refreshQueue.push({ resolve, reject })
          })
            .then((newToken) => {
              error.config.headers = { ...error.config.headers, Authorization: `Bearer ${newToken}` }
              return apiClient.request(error.config)
            })
            .catch(() => new Promise(() => {})) // page is navigating away
        }

        _isRefreshing = true

        return new Promise((resolve, reject) => {
          apiClient
            .post<{ success: boolean; data: { tokens: AuthTokens; session_id: string } }>(
              '/auth/refresh',
              { refresh_token },
            )
            .then((res) => {
              const { access_token, refresh_token: newRefresh } = res.data.data.tokens
              useAuthStore.getState().setTokens({ access_token, refresh_token: newRefresh })
              apiClient.defaults.headers.common.Authorization = `Bearer ${access_token}`
              drainQueue(null, access_token)
              error.config.headers = { ...error.config.headers, Authorization: `Bearer ${access_token}` }
              resolve(apiClient.request(error.config))
            })
            .catch((refreshErr) => {
              drainQueue(refreshErr, null)
              error.message = 'Session expired. Please log in again.'
              redirectToLogin()
              reject(refreshErr)
            })
            .finally(() => {
              _isRefreshing = false
            })
        })
      }

      if (isRefreshEndpoint) {
        // Refresh token itself is expired/invalid — caller's catch handles redirect.
        return Promise.reject(error)
      }

      // Login / 2FA: let the form handle it normally.
      error.message = error.response?.data?.message ?? 'Invalid credentials.'
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
    } else if (status != null && status >= 400) {
      error.message = error.response?.data?.message
        ?? (status >= 500 ? `Server error (${status}). Please try again shortly.` : error.message)
    }

    return Promise.reject(error)
  },
)

/**
 * Sync the default Authorization header from the persisted auth store.
 * Call after hydration (AuthHeaderSync component) so requests fired before
 * the first interceptor run are already authenticated.
 */
export function syncAuthHeader() {
  const token = useAuthStore.getState().access_token
  if (token) {
    apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`
    // A fresh valid token means we're no longer mid-redirect — reset the guard.
    _isRedirectingToLogin = false
  } else {
    delete apiClient.defaults.headers.common['Authorization']
  }
}

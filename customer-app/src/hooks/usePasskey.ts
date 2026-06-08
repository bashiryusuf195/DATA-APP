import { startRegistration, startAuthentication } from '@simplewebauthn/browser'
import type { PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser'
import { passkeyApi }    from '@/api/passkey.api'
import { useAuthStore }  from '@/store/auth.store'
import { apiClient }     from '@/api/client'
import type { User }     from '@/types'

// ── Support detection ─────────────────────────────────────────────────────────

/** True if the browser has a functional WebAuthn implementation. */
export function isWebAuthnSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.PublicKeyCredential !== 'undefined' &&
    typeof navigator.credentials?.get === 'function'
  )
}

/**
 * Async check: true if the device has a platform authenticator
 * (Touch ID, Face ID, Windows Hello, Android biometrics, device passcode).
 * Returns false if WebAuthn is unsupported or the platform check fails.
 */
export async function isPlatformAuthenticatorAvailable(): Promise<boolean> {
  if (!isWebAuthnSupported()) return false
  if (typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable !== 'function') return false
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
  } catch {
    return false
  }
}

// ── Registration ──────────────────────────────────────────────────────────────

/**
 * Register a new passkey for the currently authenticated user.
 * Call only from Settings after a successful login session exists.
 *
 * @param friendlyName - Optional label shown in the device list (e.g. "iPhone 14")
 * @throws Error with a user-readable message on failure or cancellation
 */
export async function registerPasskey(friendlyName?: string): Promise<void> {
  // 1. Get options from server (challenge stored in Redis)
  const options = await passkeyApi.registerBegin()

  // 2. Invoke the platform authenticator — shows the OS biometric prompt
  const credential = await startRegistration({
    optionsJSON: options as PublicKeyCredentialCreationOptionsJSON,
  })

  // 3. Send the signed credential to the server for verification and storage
  await passkeyApi.registerComplete(credential, friendlyName)
}

// ── Authentication ────────────────────────────────────────────────────────────

export interface BiometricAuthResult {
  success:       true
  access_token:  string
  refresh_token: string
  session_id:    string
  user:          User
}

/**
 * Authenticate using a registered passkey (biometric / device passcode).
 * On success, stores tokens in the auth store and returns the result.
 * On cancellation (NotAllowedError) or no credential, returns null.
 * On other errors, throws with a user-readable message.
 */
export async function authenticateWithPasskey(): Promise<BiometricAuthResult | null> {
  // 1. Get challenge and passkeySessionToken from server
  const { options, passkeySessionToken } = await passkeyApi.authBegin()

  // 2. Invoke the platform authenticator
  let assertion
  try {
    assertion = await startAuthentication({
      optionsJSON: options as PublicKeyCredentialRequestOptionsJSON,
    })
  } catch (err) {
    const name = (err as Error)?.name
    // User cancelled or no credential on this device — graceful fallback
    if (name === 'NotAllowedError' || name === 'NotSupportedError') return null
    throw err
  }

  // 3. Send the assertion to the server — server verifies and issues tokens
  const result = await passkeyApi.authComplete(passkeySessionToken, assertion)

  // 4. Store in Zustand (same as email login — persisted to localStorage)
  const setAuth = useAuthStore.getState().setAuth
  setAuth({
    access_token:  result.tokens.access_token,
    refresh_token: result.tokens.refresh_token,
    session_id:    result.session_id,
    user:          result.user,
  })

  // 5. Attach Authorization header for all future requests
  apiClient.defaults.headers.common['Authorization'] = `Bearer ${result.tokens.access_token}`

  return {
    success:       true,
    access_token:  result.tokens.access_token,
    refresh_token: result.tokens.refresh_token,
    session_id:    result.session_id,
    user:          result.user,
  }
}

import { Capacitor } from '@capacitor/core'
import { SecureStorage } from '@aparajita/capacitor-secure-storage'

const isNative = Capacitor.isNativePlatform()

const KEY_AT              = 'hive_access_token'
const KEY_RT              = 'hive_refresh_token'
const KEY_BIO_DEVICE_ID   = 'hive_biometric_device_id'
const KEY_BIO_DEVICE_SECRET = 'hive_biometric_device_secret'

export async function getStoredTokens(): Promise<{
  access_token:  string | null
  refresh_token: string | null
} | null> {
  if (!isNative) return null
  try {
    const [at, rt] = await Promise.all([
      SecureStorage.get(KEY_AT),
      SecureStorage.get(KEY_RT),
    ])
    return {
      access_token:  typeof at === 'string' ? at : null,
      refresh_token: typeof rt === 'string' ? rt : null,
    }
  } catch {
    return null
  }
}

// All mutating helpers below use try-catch + .catch() to suppress both
// synchronous throws (plugin not yet registered in the APK) and async
// rejections (OS keystore errors). Token operations must never propagate
// errors to callers — a storage failure should degrade gracefully, not
// crash login or logout.

export function saveTokens(access_token: string, refresh_token: string): void {
  if (!isNative) return
  try { SecureStorage.set(KEY_AT, access_token).catch(() => {}) } catch {}
  try { SecureStorage.set(KEY_RT, refresh_token).catch(() => {}) } catch {}
}

export function removeTokens(): void {
  if (!isNative) return
  try { SecureStorage.remove(KEY_AT).catch(() => {}) } catch {}
  try { SecureStorage.remove(KEY_RT).catch(() => {}) } catch {}
}

export function removeAccessToken(): void {
  if (!isNative) return
  try { SecureStorage.remove(KEY_AT).catch(() => {}) } catch {}
}

// ── Biometric device credentials ──────────────────────────────────────────────
// device_id and device_secret are stored in Android Keystore on native.
// On web these are no-ops: biometric device auth is Android-only.

export async function getBiometricCredentials(): Promise<{
  device_id:     string
  device_secret: string
} | null> {
  if (!isNative) return null
  try {
    const [id, secret] = await Promise.all([
      SecureStorage.get(KEY_BIO_DEVICE_ID),
      SecureStorage.get(KEY_BIO_DEVICE_SECRET),
    ])
    if (typeof id === 'string' && typeof secret === 'string' && id && secret) {
      return { device_id: id, device_secret: secret }
    }
    return null
  } catch {
    return null
  }
}

export async function saveBiometricCredentials(deviceId: string, deviceSecret: string): Promise<void> {
  if (!isNative) return
  await Promise.all([
    SecureStorage.set(KEY_BIO_DEVICE_ID,     deviceId),
    SecureStorage.set(KEY_BIO_DEVICE_SECRET, deviceSecret),
  ])
}

export function removeBiometricCredentials(): void {
  if (!isNative) return
  try { SecureStorage.remove(KEY_BIO_DEVICE_ID).catch(() => {})     } catch {}
  try { SecureStorage.remove(KEY_BIO_DEVICE_SECRET).catch(() => {}) } catch {}
}

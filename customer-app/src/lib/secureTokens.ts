import { Capacitor } from '@capacitor/core'
import { SecureStorage } from '@aparajita/capacitor-secure-storage'

const isNative = Capacitor.isNativePlatform()

const KEY_AT = 'hive_access_token'
const KEY_RT = 'hive_refresh_token'

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

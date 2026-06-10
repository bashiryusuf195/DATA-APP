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

export function saveTokens(access_token: string, refresh_token: string): void {
  if (!isNative) return
  SecureStorage.set(KEY_AT, access_token).catch(() => {})
  SecureStorage.set(KEY_RT, refresh_token).catch(() => {})
}

export function removeTokens(): void {
  if (!isNative) return
  SecureStorage.remove(KEY_AT).catch(() => {})
  SecureStorage.remove(KEY_RT).catch(() => {})
}

export function removeAccessToken(): void {
  if (!isNative) return
  SecureStorage.remove(KEY_AT).catch(() => {})
}

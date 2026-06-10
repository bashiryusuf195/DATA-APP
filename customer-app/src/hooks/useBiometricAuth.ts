import { Capacitor } from '@capacitor/core'
import { BiometricAuth, BiometryError, BiometryErrorType } from '@aparajita/capacitor-biometric-auth'

export async function checkNativeBiometricAvailable(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false
  try {
    const info = await BiometricAuth.checkBiometry()
    return info.isAvailable
  } catch {
    return false
  }
}

export async function performNativeBiometric(reason: string): Promise<'success' | 'cancelled' | 'failed'> {
  if (!Capacitor.isNativePlatform()) return 'failed'
  try {
    await BiometricAuth.authenticate({ reason, cancelTitle: 'Cancel', allowDeviceCredential: false })
    return 'success'
  } catch (err) {
    if (err instanceof BiometryError) {
      const cancelCodes = [BiometryErrorType.userCancel, BiometryErrorType.systemCancel, BiometryErrorType.appCancel]
      if (cancelCodes.includes(err.code)) return 'cancelled'
    }
    return 'failed'
  }
}

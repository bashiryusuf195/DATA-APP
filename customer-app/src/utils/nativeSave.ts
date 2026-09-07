import { Filesystem, Directory } from '@capacitor/filesystem'
import toast from 'react-hot-toast'

/**
 * Saves a Blob to the device's Documents directory (visible in the Files app
 * on iOS; app-scoped on Android) and shows a toast confirming the save.
 * Used for native (Capacitor) downloads instead of the browser's anchor-click
 * download, which doesn't work inside a webview.
 */
export async function saveBlobToDevice(blob: Blob, filename: string): Promise<void> {
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload  = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })

  await Filesystem.writeFile({
    path: filename,
    data: base64,
    directory: Directory.Documents,
  })

  toast.success(`Saved "${filename}" to your device`)
}
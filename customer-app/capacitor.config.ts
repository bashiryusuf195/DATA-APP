import { CapacitorConfig } from '@capacitor/cli'

// On Android the WebView loads the app under https://localhost (Capacitor 5+
// default). Relative API paths like /auth/login resolve against that origin
// and will NOT reach the backend. Always build Android with:
//   npm run android:build   (loads .env.android → VITE_API_BASE_URL=https://api.hivedata.com.ng)
const config: CapacitorConfig = {
  appId: 'ng.hivedata.app',
  appName: 'Hive Data',
  webDir: 'dist',
}

export default config

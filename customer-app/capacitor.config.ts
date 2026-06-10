import { CapacitorConfig } from '@capacitor/cli'

// On Android the WebView loads the app under https://localhost (Capacitor 5+
// default). Relative API paths like /auth/login resolve against that origin
// and will NOT reach the backend. Always build Android with:
//   npm run android:build   (loads .env.android → VITE_API_BASE_URL=https://api.hivedata.ng)
const config: CapacitorConfig = {
  appId: 'ng.hivedata.app',
  appName: 'Hive Data',
  webDir: 'dist',
  plugins: {
    SplashScreen: {
      launchAutoHide: false,
      backgroundColor: '#070B12',
      showSpinner: false,
    },
    PushNotifications: {
      // Show the system permission dialog on first launch (Android 13+)
      presentationOptions: ['alert', 'badge', 'sound'],
    },
  },
}

export default config

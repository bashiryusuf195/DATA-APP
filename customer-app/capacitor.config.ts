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
      // Do not auto-hide — we call SplashScreen.hide() from App.tsx once React
      // has rendered so the user never sees the blank WebView loading gap.
      launchAutoHide: false,
      // Match the app's dark background so the transition is seamless.
      backgroundColor: '#070B12',
      showSpinner: false,
    },
  },
}

export default config

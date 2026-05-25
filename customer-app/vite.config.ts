import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// Bypass function: let browser-navigation requests (Accept: text/html) be
// served by Vite as the SPA index page.  XHR/fetch API calls do not send
// text/html in Accept, so they continue to be proxied to the backend.
function spaBypass(req: { headers?: Record<string, string | string[] | undefined> }) {
  const accept = req.headers?.accept ?? ''
  if (typeof accept === 'string' && accept.includes('text/html')) return '/index.html'
  return undefined // proxy it
}

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    port: 5174,
    proxy: {
      '/auth':          { target: 'http://localhost:3000', changeOrigin: true, bypass: spaBypass },
      '/wallet':        { target: 'http://localhost:3000', changeOrigin: true, bypass: spaBypass },
      '/transactions':  { target: 'http://localhost:3000', changeOrigin: true, bypass: spaBypass },
      '/services':      { target: 'http://localhost:3000', changeOrigin: true, bypass: spaBypass },
      '/notifications': { target: 'http://localhost:3000', changeOrigin: true, bypass: spaBypass },
      '/referrals':     { target: 'http://localhost:3000', changeOrigin: true, bypass: spaBypass },
      '/kyc':           { target: 'http://localhost:3000', changeOrigin: true, bypass: spaBypass },
      '/public':        { target: 'http://localhost:3000', changeOrigin: true, bypass: spaBypass },
    },
  },
})

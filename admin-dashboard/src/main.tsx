import { initSentry } from '@/lib/sentry'
initSentry() // must run before React renders so all errors are caught

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { syncAuthHeader } from '@/api/client'
import './index.css'
import App from './App'

// Best-effort early sync — Zustand persist hydrates asynchronously so this
// call may find access_token = null on the first run.  The AuthHeaderSync
// component in App.tsx performs the authoritative sync after hydration, and
// the request interceptor always reads the live store value per-request.
syncAuthHeader()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)

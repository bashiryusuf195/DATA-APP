import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import { syncAuthHeader } from '@/api/client'
import { applyPersistedTheme } from '@/store/theme.store'
import App from './App'
import './index.css'

// Apply persisted theme before first render to prevent flash
applyPersistedTheme()
// Sync the auth header from persisted store before first render
syncAuthHeader()


const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      // Keep cache alive for 10 min so navigating away and back reuses data
      // without a refetch (default is 5 min).
      gcTime: 10 * 60 * 1000,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      <Toaster
        position="top-center"
        toastOptions={{
          duration: 4000,
          style: {
            background: '#0F172A',
            color: '#F8FAFC',
            fontSize: '14px',
            borderRadius: '12px',
            padding: '12px 16px',
          },
        }}
      />
    </QueryClientProvider>
  </StrictMode>
)

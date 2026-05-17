import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/auth': { target: 'http://localhost:3000', changeOrigin: true },
      '/admin': { target: 'http://localhost:3000', changeOrigin: true },
      '/transactions': { target: 'http://localhost:3000', changeOrigin: true },
      '/wallet': { target: 'http://localhost:3000', changeOrigin: true },
      '/notifications': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
})

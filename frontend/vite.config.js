import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import process from 'node:process'

const apiTarget = process.env.HOSIS_API_TARGET || 'http://localhost:5000'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Permit temporary Cloudflare demo URLs while still rejecting unrelated
    // Host headers. The public tunnel forwards to this development server.
    allowedHosts: ['.trycloudflare.com'],
    // Forward API calls to the Express backend during local development.
    proxy: {
      '/api': apiTarget,
    },
  },
})

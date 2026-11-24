import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import process from 'node:process'
import { networkInterfaces } from 'node:os'

const apiTarget = process.env.HOSIS_API_TARGET || 'http://localhost:5000'

function findLanIpv4() {
  const candidates = Object.entries(networkInterfaces()).flatMap(([name, addresses = []]) =>
    addresses
      .filter((entry) => entry.family === 'IPv4' && !entry.internal)
      .filter((entry) => /^(10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(entry.address))
      .map((entry) => ({ name, address: entry.address })),
  )
  const physical = candidates.find(({ name }) => /wi-?fi|wireless|ethernet/i.test(name) && !/virtual|vethernet|wsl|vpn|tunnel/i.test(name))
  return physical?.address || candidates[0]?.address || ''
}

const lanHost = findLanIpv4()

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    'import.meta.env.VITE_DETECTED_LAN_HOST': JSON.stringify(lanHost),
  },
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

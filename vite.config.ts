import { cloudflare } from '@cloudflare/vite-plugin'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const apiProxyTarget = process.env.API_PROXY_TARGET?.trim()

export default defineConfig({
  plugins: [react(), cloudflare()],
  server: {
    allowedHosts: ['.slackclassics.com', 'localhost', '127.0.0.1'],
    proxy: apiProxyTarget
      ? {
          '/api': {
            target: apiProxyTarget,
            changeOrigin: true,
            secure: true,
          },
        }
      : undefined,
  },
})

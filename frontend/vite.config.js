import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Team Golf Scoring',
        short_name: 'GolfScore',
        start_url: '/',
        display: 'standalone',
        background_color: '#0b3d2e',
        theme_color: '#0b3d2e',
        icons: [
          // Drop real 192x192 and 512x512 png icons into /public and reference them here
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' }
        ]
      }
    })
  ]
})

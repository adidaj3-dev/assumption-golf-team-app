import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Assumption Golf',
        short_name: 'AU Golf',
        start_url: '/',
        display: 'standalone',
        background_color: '#004b87',
        theme_color: '#004b87',
        icons: [
          // Drop real 192x192 and 512x512 png icons into /public and reference them here
          // (ideally cropped from the Greyhounds logo once you have it — square,
          // some padding around the mark tends to look best as a home screen icon)
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' }
        ]
      }
    })
  ]
})

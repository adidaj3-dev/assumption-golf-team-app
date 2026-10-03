import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // 'prompt' (not 'autoUpdate') is what actually makes onNeedRefresh below
      // fire reliably. With autoUpdate, Workbox swaps in the new service
      // worker on its own without telling the already-open page, so a phone
      // relaunching from the home screen can still get served the OLD
      // cached index.html/bundle — which is exactly the "phone shows an
      // older version" symptom. 'prompt' hands control to onNeedRefresh,
      // which we use to force an immediate reload instead of prompting.
      registerType: 'prompt',
      injectRegister: false, // we register manually in main.jsx
      manifest: {
        name: 'Assumption Golf',
        short_name: 'AU Golf',
        start_url: '/',
        display: 'standalone',
        background_color: '#004b87',
        theme_color: '#004b87',
        icons: [
          // Generated from the real Assumption seal (frontend/public/branding/assumption-seal.png),
          // padded onto the brand-blue background — see the image-processing step
          // in git history if these ever need to be regenerated.
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' }
        ]
      }
    })
  ]
})

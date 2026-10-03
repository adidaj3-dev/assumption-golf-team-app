import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import App from './App.jsx'
import './index.css'

// As soon as a new deployed version is detected, activate it and reload
// immediately — without this, updates silently wait in the background and
// never actually show up until the app is fully closed and reopened.
// We also poll for updates every 60s ourselves: a home-screen PWA is
// launched, not navigated to, so it may never otherwise ask the server
// whether a new version exists.
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    window.location.reload()
  },
  onRegisteredSW(_url, registration) {
    if (!registration) return
    setInterval(() => registration.update(), 60 * 1000)
  },
})
void updateSW

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)

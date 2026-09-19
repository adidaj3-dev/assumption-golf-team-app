import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import App from './App.jsx'
import './index.css'

// As soon as a new deployed version is detected, activate it and reload
// immediately — without this, updates silently wait in the background and
// never actually show up until the app is fully closed and reopened.
registerSW({
  immediate: true,
  onNeedRefresh() {
    window.location.reload()
  },
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)

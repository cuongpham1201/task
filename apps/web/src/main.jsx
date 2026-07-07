import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
)

// PWA: đăng ký service worker (autoUpdate — sw.js tự skipWaiting).
// SW không đụng /api nên không ảnh hưởng SSO.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((e) => {
      console.warn('[PWA] Không đăng ký được service worker:', e)
    })
  })
}

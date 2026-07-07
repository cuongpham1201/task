/* Service worker — App Giao việc.
 * Chiến lược thận trọng:
 *  - /api/*: KHÔNG đụng (auth/session/dữ liệu động đi thẳng mạng, không cache).
 *  - Điều hướng (HTML): network-first, offline → fallback app shell đã cache.
 *  - Asset tĩnh (/assets, /icons): cache-first (Vite hash tên file nên an toàn).
 *  - autoUpdate: skipWaiting + clients.claim → bản mới nhận ngay lần tải sau.
 */
const CACHE = 'giaoviec-shell-v1'
const SHELL = ['/', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png']

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  if (url.origin !== self.location.origin) return // cross-origin: bỏ qua
  if (url.pathname.startsWith('/api/')) return // API/auth: không can thiệp
  if (e.request.method !== 'GET') return

  // Điều hướng trang → network-first, offline dùng shell cache
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put('/', copy))
          return res
        })
        .catch(() => caches.match('/'))
    )
    return
  }

  // Asset tĩnh → cache-first
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) {
    e.respondWith(
      caches.match(e.request).then(
        (hit) =>
          hit ||
          fetch(e.request).then((res) => {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(e.request, copy))
            return res
          })
      )
    )
  }
  // Còn lại (module dev /src/... v.v.): đi thẳng mạng
})

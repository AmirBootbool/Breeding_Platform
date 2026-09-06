const CACHE_NAME = 'wbp-pwa-v1'
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.ico',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS)
    }).then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    }).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  // Skip non-GET requests (handled by offline storage queue)
  if (event.request.method !== 'GET') {
    return
  }

  // Handle static assets & navigation (Stale-While-Revalidate / Cache-First)
  if (
    url.origin === self.location.origin &&
    (url.pathname.startsWith('/assets/') || event.request.mode === 'navigate' || STATIC_ASSETS.includes(url.pathname))
  ) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          // Revalidate in background
          fetch(event.request)
            .then((networkResponse) => {
              if (networkResponse && networkResponse.status === 200) {
                caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse))
              }
            })
            .catch(() => {})
          return cachedResponse
        }

        return fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone))
          }
          return networkResponse
        }).catch(() => {
          if (event.request.mode === 'navigate') {
            return caches.match('/index.html')
          }
        })
      })
    )
    return
  }

  // Network-first for API with fallback to cache
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone))
          }
          return response
        })
        .catch(() => {
          return caches.match(event.request)
        })
    )
  }
})

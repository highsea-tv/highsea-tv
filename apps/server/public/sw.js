// SPDX-License-Identifier: AGPL-3.0-only
// The admin's service worker (checkpoint 8b): web push only. It has no fetch handler, so it never
// stands between the admin and the server. A push carries the message as JSON (`title`, `body`,
// `url`, `image`, `tag`, from @highsea-tv/notifications' browser channel); a click opens its page, or
// the admin. As Next's PWA guide sets it up: https://nextjs.org/docs/app/guides/progressive-web-apps
// and MDN's https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerRegistration/showNotification

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : '' }
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'highsea', {
      body: data.body || '',
      icon: '/favicon.svg',
      image: data.image || undefined,
      tag: data.tag || undefined,
      data: { url: data.url || '/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => w.url === url)
      return open ? open.focus() : self.clients.openWindow(url)
    }),
  )
})

/// <reference lib="webworker" />
/**
 * Service worker:
 *  - caches the app so it opens instantly and offline
 *  - receives files from Android's Share menu ("Share → View")
 */
import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { db, SHARED } from '../storage/db'

declare let self: ServiceWorkerGlobalScope

// Android "Share → View": the share sheet POSTs the files here.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (event.request.method === 'POST' && url.pathname.endsWith('/share-target')) {
    event.respondWith(receiveShare(event.request))
  }
})

async function receiveShare(request: Request): Promise<Response> {
  const scope = self.registration.scope
  try {
    const form = await request.formData()
    const files = form.getAll('files').filter((f): f is File => f instanceof File && f.size > 0)
    const store = (await db()).transaction(SHARED, 'readwrite').store
    const now = Date.now()
    for (const [i, f] of files.entries()) {
      await store.put({ id: crypto.randomUUID(), name: f.name || `Shared_${now}`, type: f.type, blob: f, receivedAt: now + i })
    }
    return Response.redirect(`${scope}?share=${files.length}`, 303)
  } catch {
    return Response.redirect(`${scope}?share=error`, 303)
  }
}

self.skipWaiting()
clientsClaim()
precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')))

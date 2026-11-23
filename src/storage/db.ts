import { openDB, type IDBPDatabase } from 'idb'

/**
 * The app's on-device database (IndexedDB), shared by the app and the
 * service worker.
 *
 *  - events:  cached calendar (Phase 1)
 *  - uploads: files waiting to go to OneDrive (works offline)
 *  - shared:  files received from Android's Share menu, waiting for you to pick a job
 */
export const DB_NAME = 'view-cache'
export const EVENTS = 'events'
export const UPLOADS = 'uploads'
export const SHARED = 'shared'

let dbPromise: Promise<IDBPDatabase> | null = null

export function db(): Promise<IDBPDatabase> {
  dbPromise ??= openDB(DB_NAME, 2, {
    upgrade(d, oldVersion) {
      if (oldVersion < 1) d.createObjectStore(EVENTS, { keyPath: 'id' })
      if (oldVersion < 2) {
        d.createObjectStore(UPLOADS, { keyPath: 'id' })
        d.createObjectStore(SHARED, { keyPath: 'id' })
      }
    },
  })
  return dbPromise
}

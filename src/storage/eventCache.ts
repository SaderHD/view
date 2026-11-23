import { openDB, type IDBPDatabase } from 'idb'
import type { CalEvent } from '../calendar/types'
import { overlaps, toDate } from '../calendar/time'

/**
 * On-device copy of the calendar (IndexedDB) so the app opens instantly and
 * still shows your schedule with no signal. Outlook is always the source of
 * truth; this is only a cache.
 */

const DB_NAME = 'view-cache'
const EVENTS = 'events'

let dbPromise: Promise<IDBPDatabase> | null = null

function db() {
  dbPromise ??= openDB(DB_NAME, 1, {
    upgrade(d) {
      d.createObjectStore(EVENTS, { keyPath: 'id' })
    },
  })
  return dbPromise
}

const inRange = (e: CalEvent, start: Date, end: Date) => overlaps(toDate(e.start), toDate(e.end), start, end)

/** Cached events overlapping [start, end). Never throws — an empty cache is fine. */
export async function getCachedEvents(start: Date, end: Date): Promise<CalEvent[]> {
  try {
    const all: CalEvent[] = await (await db()).getAll(EVENTS)
    return all.filter((e) => inRange(e, start, end))
  } catch {
    return []
  }
}

/** Replace the cache for [start, end) with a fresh list from Outlook. */
export async function replaceRange(start: Date, end: Date, fresh: CalEvent[]): Promise<void> {
  try {
    const tx = (await db()).transaction(EVENTS, 'readwrite')
    const keep = new Set(fresh.map((e) => e.id))
    const existing: CalEvent[] = await tx.store.getAll()
    for (const e of existing) {
      if (inRange(e, start, end) && !keep.has(e.id)) await tx.store.delete(e.id)
    }
    for (const e of fresh) await tx.store.put(e)
    await tx.done
  } catch {
    /* cache is best-effort */
  }
}

export async function putCachedEvent(e: CalEvent): Promise<void> {
  try {
    await (await db()).put(EVENTS, e)
  } catch {
    /* best-effort */
  }
}

export async function deleteCachedEvent(id: string): Promise<void> {
  try {
    await (await db()).delete(EVENTS, id)
  } catch {
    /* best-effort */
  }
}

/** Wipe the cache (on sign-out). */
export async function clearCache(): Promise<void> {
  try {
    await (await db()).clear(EVENTS)
  } catch {
    /* best-effort */
  }
}

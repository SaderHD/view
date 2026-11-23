import { useCallback, useEffect, useRef, useState } from 'react'
import { createEvent, deleteEvent, listEvents, updateEvent } from '../graph/calendar'
import { GraphError } from '../graph/client'
import {
  deleteCachedEvent,
  getCachedEvents,
  putCachedEvent,
  replaceRange,
} from '../storage/eventCache'
import { overlaps, toDate } from './time'
import type { CalEvent, EventDraft } from './types'

export type SyncStatus =
  | { kind: 'idle'; lastSynced: Date | null }
  | { kind: 'syncing'; lastSynced: Date | null }
  | { kind: 'offline'; lastSynced: Date | null }
  | { kind: 'error'; lastSynced: Date | null; message: string }

const inRange = (e: CalEvent, start: Date, end: Date) => overlaps(toDate(e.start), toDate(e.end), start, end)

/** Swap the events in [start, end) for `fresh`, keeping everything else. */
function mergeRange(prev: CalEvent[], start: Date, end: Date, fresh: CalEvent[]): CalEvent[] {
  const freshIds = new Set(fresh.map((e) => e.id))
  return [...prev.filter((e) => !inRange(e, start, end) && !freshIds.has(e.id)), ...fresh]
}

function errorMessage(err: unknown): string {
  if (err instanceof GraphError) return `${err.message} (${err.code})`
  return err instanceof Error ? err.message : String(err)
}

const isNetworkError = (err: unknown) => err instanceof TypeError || !navigator.onLine

/**
 * Calendar state for the visible date range: shows the on-device cache
 * immediately, then refreshes from Outlook. Also performs create / edit /
 * delete and keeps the cache in step.
 */
export function useCalendarData() {
  const [events, setEvents] = useState<CalEvent[]>([])
  const [status, setStatus] = useState<SyncStatus>({ kind: 'idle', lastSynced: null })
  const range = useRef<{ start: Date; end: Date } | null>(null)
  const latestRequest = useRef(0)

  const sync = useCallback(async (start: Date, end: Date) => {
    const request = ++latestRequest.current
    setStatus((s) => ({ kind: 'syncing', lastSynced: s.lastSynced }))
    try {
      const fresh = await listEvents(start, end)
      setEvents((prev) => mergeRange(prev, start, end, fresh))
      await replaceRange(start, end, fresh)
      if (request === latestRequest.current) setStatus({ kind: 'idle', lastSynced: new Date() })
    } catch (err) {
      if (request !== latestRequest.current) return
      setStatus((s) =>
        isNetworkError(err)
          ? { kind: 'offline', lastSynced: s.lastSynced }
          : { kind: 'error', lastSynced: s.lastSynced, message: errorMessage(err) },
      )
    }
  }, [])

  /** Called whenever the calendar shows a new date range. */
  const loadRange = useCallback(
    async (start: Date, end: Date) => {
      range.current = { start, end }
      const cached = await getCachedEvents(start, end)
      setEvents((prev) => mergeRange(prev, start, end, cached))
      await sync(start, end)
    },
    [sync],
  )

  const refresh = useCallback(async () => {
    if (range.current) await sync(range.current.start, range.current.end)
  }, [sync])

  // Re-sync when the app comes back to the foreground or the phone reconnects.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    const onOnline = () => void refresh()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onOnline)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onOnline)
    }
  }, [refresh])

  const create = useCallback(
    async (draft: EventDraft) => {
      const created = await createEvent(draft)
      setEvents((prev) => [...prev, created])
      await putCachedEvent(created)
      return created
    },
    [],
  )

  const update = useCallback(
    async (id: string, draft: EventDraft, notesChanged: boolean) => {
      const updated = await updateEvent(id, draft, notesChanged)
      setEvents((prev) => prev.map((e) => (e.id === id ? updated : e)))
      await putCachedEvent(updated)
      return updated
    },
    [],
  )

  const remove = useCallback(async (id: string) => {
    await deleteEvent(id)
    setEvents((prev) => prev.filter((e) => e.id !== id))
    await deleteCachedEvent(id)
  }, [])

  return { events, status, loadRange, refresh, create, update, remove }
}

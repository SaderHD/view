import { addDays, startOfDay } from '../calendar/time'
import type { CalEvent } from '../calendar/types'
import { listEvents } from '../graph/calendar'
import { getCachedEvents } from '../storage/eventCache'

/** How far back / ahead search looks. */
export const SEARCH_PAST_DAYS = 180
export const SEARCH_FUTURE_DAYS = 365

export interface SearchIndex {
  events: CalEvent[]
  from: Date
  to: Date
  /** True when Outlook couldn't be reached and the phone's saved copy was used. */
  offline: boolean
}

/**
 * Load events for searching: six months back to a year ahead. Outlook can't
 * search event text on the server, so we load the range once and search it
 * on the phone (fast, and works offline from the saved copy).
 */
export async function loadSearchIndex(now = new Date()): Promise<SearchIndex> {
  const from = addDays(startOfDay(now), -SEARCH_PAST_DAYS)
  const to = addDays(startOfDay(now), SEARCH_FUTURE_DAYS)
  try {
    return { events: await listEvents(from, to), from, to, offline: false }
  } catch {
    return { events: await getCachedEvents(from, to), from, to, offline: true }
  }
}

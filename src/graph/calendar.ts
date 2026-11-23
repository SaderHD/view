import type { CalEvent, EventDraft, ShowAs } from '../calendar/types'
import { addDays, dateKey, deviceTimeZone, fromGraphLocal, startOfDay, toGraphLocal } from '../calendar/time'
import { graph } from './client'

/** The shape Graph returns for the fields we $select. */
interface GraphEvent {
  id: string
  subject: string | null
  start: { dateTime: string; timeZone: string }
  end: { dateTime: string; timeZone: string }
  isAllDay: boolean
  location?: { displayName?: string }
  bodyPreview?: string
  showAs?: ShowAs
  categories?: string[]
  isOrganizer?: boolean
  organizer?: { emailAddress?: { name?: string } }
  isCancelled?: boolean
  type?: CalEvent['type']
  webLink?: string
}

const SELECT = [
  'id', 'subject', 'start', 'end', 'isAllDay', 'location', 'bodyPreview', 'showAs',
  'categories', 'isOrganizer', 'organizer', 'isCancelled', 'type', 'webLink',
].join(',')

/** Ask Graph to return and interpret times in the phone's time zone. */
const tzHeader = { Prefer: `outlook.timezone="${deviceTimeZone}"` }

export function fromGraph(e: GraphEvent): CalEvent {
  const start = fromGraphLocal(e.start.dateTime)
  const end = fromGraphLocal(e.end.dateTime)
  return {
    id: e.id,
    title: e.subject?.trim() || '(No title)',
    start: e.isAllDay ? dateKey(start) : start.toISOString(),
    end: e.isAllDay ? dateKey(end) : end.toISOString(),
    allDay: e.isAllDay,
    location: e.location?.displayName ?? '',
    notes: e.bodyPreview ?? '',
    showAs: e.showAs ?? 'busy',
    categories: e.categories ?? [],
    isOrganizer: e.isOrganizer ?? true,
    organizerName: e.organizer?.emailAddress?.name ?? '',
    isCancelled: e.isCancelled ?? false,
    type: e.type ?? 'singleInstance',
    webLink: e.webLink ?? '',
  }
}

/**
 * All events overlapping [start, end), with repeating events expanded into
 * individual occurrences. Follows paging so nothing is missed.
 */
export async function listEvents(start: Date, end: Date): Promise<CalEvent[]> {
  const params = new URLSearchParams({
    startDateTime: start.toISOString(),
    endDateTime: end.toISOString(),
    $select: SELECT,
    $orderby: 'start/dateTime',
    $top: '250',
  })
  const out: CalEvent[] = []
  let url: string | undefined = `/me/calendarView?${params}`
  while (url) {
    const page: { value: GraphEvent[]; '@odata.nextLink'?: string } = await graph(url, { headers: tzHeader })
    out.push(...page.value.map(fromGraph))
    url = page['@odata.nextLink']
  }
  return out
}

function toGraphBody(d: EventDraft, includeNotes: boolean) {
  // All-day events must start and end at midnight.
  const start = d.allDay ? startOfDay(d.start) : d.start
  let end = d.allDay ? startOfDay(d.end) : d.end
  if (d.allDay && end <= start) end = addDays(start, 1)
  return {
    subject: d.title.trim() || '(No title)',
    isAllDay: d.allDay,
    start: { dateTime: toGraphLocal(start), timeZone: deviceTimeZone },
    end: { dateTime: toGraphLocal(end), timeZone: deviceTimeZone },
    location: { displayName: d.location.trim() },
    showAs: d.showAs,
    ...(includeNotes ? { body: { contentType: 'text', content: d.notes } } : {}),
  }
}

export async function createEvent(draft: EventDraft): Promise<CalEvent> {
  const created = await graph<GraphEvent>(`/me/events?$select=${SELECT}`, {
    method: 'POST',
    headers: tzHeader,
    body: JSON.stringify(toGraphBody(draft, draft.notes.trim() !== '')),
  })
  return fromGraph(created)
}

/**
 * Update an event. Notes are only sent if they changed, because Outlook
 * stores rich (HTML) bodies and we only show a plain-text preview — writing
 * it back unchanged would strip the formatting.
 */
export async function updateEvent(id: string, draft: EventDraft, notesChanged: boolean): Promise<CalEvent> {
  const updated = await graph<GraphEvent>(`/me/events/${encodeURIComponent(id)}?$select=${SELECT}`, {
    method: 'PATCH',
    headers: tzHeader,
    body: JSON.stringify(toGraphBody(draft, notesChanged)),
  })
  return fromGraph(updated)
}

export async function deleteEvent(id: string): Promise<void> {
  await graph<void>(`/me/events/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

/**
 * The event's full notes as plain text. (The list only includes Outlook's
 * 255-character preview, which must never be written back.)
 */
export async function getEventNotes(id: string): Promise<string> {
  const e = await graph<{ body?: { content?: string } }>(`/me/events/${encodeURIComponent(id)}?$select=body`, {
    headers: { Prefer: `outlook.timezone="${deviceTimeZone}", outlook.body-content-type="text"` },
  })
  return (e.body?.content ?? '').replace(/\r\n/g, '\n').trim()
}

import { addDays, fmtDayShort, fmtTime, toDate } from './time'
import type { CalEvent, EventDraft, ShowAs } from './types'

/** CSS classes that colour an event (see index.css). */
export function eventClasses(e: CalEvent): string[] {
  const c: string[] = []
  if (e.categories.some((x) => x.toLowerCase() === 'job')) c.push('ev-job')
  else c.push(`ev-${e.showAs}`)
  if (e.isCancelled) c.push('ev-cancelled')
  return c
}

/** "9:00 AM – 10:30 AM", "All day", "Mon, Nov 24 – Wed, Nov 26", … */
export function describeWhen(e: CalEvent): string {
  const start = toDate(e.start)
  const end = toDate(e.end)
  if (e.allDay) {
    const last = addDays(end, -1)
    return last <= start ? 'All day' : `${fmtDayShort(start)} – ${fmtDayShort(last)}`
  }
  const sameDay = start.toDateString() === end.toDateString()
  return sameDay
    ? `${fmtTime(start)} – ${fmtTime(end)}`
    : `${fmtDayShort(start)}, ${fmtTime(start)} – ${fmtDayShort(end)}, ${fmtTime(end)}`
}

export const SHOW_AS_LABEL: Record<ShowAs, string> = {
  busy: 'Busy',
  tentative: 'Tentative',
  free: 'Free',
  oof: 'Away',
  workingElsewhere: 'Working elsewhere',
  unknown: 'Unknown',
}

/** Sort for day lists: all-day first, then by start time. */
export function byStart(a: CalEvent, b: CalEvent): number {
  if (a.allDay !== b.allDay) return a.allDay ? -1 : 1
  return toDate(a.start).getTime() - toDate(b.start).getTime()
}

/** Event → form values. */
export function eventToDraft(e: CalEvent): EventDraft {
  return {
    title: e.title === '(No title)' ? '' : e.title,
    allDay: e.allDay,
    start: toDate(e.start),
    end: toDate(e.end),
    location: e.location,
    notes: e.notes,
    showAs: e.showAs,
  }
}

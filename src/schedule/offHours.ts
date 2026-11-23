import type { EventInput } from '@fullcalendar/core'
import { addDays, dateKey, startOfDay } from '../calendar/time'
import { workIntervals, type Settings } from './workHours'

/**
 * Background shading for time outside your work hours (week/day views) and
 * whole days off (all views), for the visible date range.
 */
export function offHoursEvents(rangeStart: Date, rangeEnd: Date, settings: Settings): EventInput[] {
  const out: EventInput[] = []
  for (let d = startOfDay(rangeStart); d < rangeEnd; d = addDays(d, 1)) {
    const blocks = workIntervals(d, settings)
    const next = addDays(d, 1)
    if (blocks.length === 0) {
      out.push({ id: `off-${dateKey(d)}`, start: dateKey(d), end: dateKey(next), allDay: true, display: 'background', classNames: ['off-day'] })
      continue
    }
    let cursor = d
    blocks.forEach(([s, e], i) => {
      if (s > cursor) out.push({ id: `off-${dateKey(d)}-${i}`, start: cursor, end: s, display: 'background', classNames: ['off-hours'] })
      cursor = e
    })
    if (cursor < next) out.push({ id: `off-${dateKey(d)}-end`, start: cursor, end: next, display: 'background', classNames: ['off-hours'] })
  }
  return out
}

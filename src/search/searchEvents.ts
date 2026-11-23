import { startOfDay, toDate } from '../calendar/time'
import type { CalEvent } from '../calendar/types'
import { JOB_STATUSES, type JobStatus } from '../jobs/types'

export interface EventFilters {
  jobsOnly: boolean
  status: JobStatus | null
  when: 'all' | 'upcoming' | 'past'
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')

const statusLabel = (s: JobStatus) => JOB_STATUSES.find((x) => x.id === s)?.label ?? s
const isJob = (e: CalEvent) => !!e.job || e.categories.some((c) => c.toLowerCase() === 'job')

/** Everything a search can match on for one event. */
function haystack(e: CalEvent): string {
  return norm(
    [
      e.title,
      e.location,
      e.notes,
      e.categories.join(' '),
      e.organizerName,
      e.job?.customer ?? '',
      e.job?.jobId ?? '',
      e.job ? statusLabel(e.job.status) : '',
      e.job?.folder?.name ?? '',
    ].join(' \u0001 '),
  )
}

/**
 * Match every word of the query (any order) against title, address, notes,
 * client, job number and status. Upcoming first (soonest first), then past
 * (most recent first).
 */
export function searchEvents(events: CalEvent[], query: string, filters: EventFilters, now = new Date()): CalEvent[] {
  const words = norm(query).split(/\s+/).filter(Boolean)
  const today = startOfDay(now)
  const seen = new Set<string>()
  const matches = events.filter((e) => {
    if (seen.has(e.id)) return false
    seen.add(e.id)
    if (e.isCancelled && !words.length) return false
    if ((filters.jobsOnly || filters.status) && !isJob(e)) return false
    if (filters.status && e.job?.status !== filters.status) return false
    const end = toDate(e.end)
    if (filters.when === 'upcoming' && end <= today) return false
    if (filters.when === 'past' && end > today) return false
    if (!words.length) return filters.jobsOnly || !!filters.status
    const h = haystack(e)
    return words.every((w) => h.includes(w))
  })
  const upcoming = matches.filter((e) => toDate(e.end) > today).sort((a, b) => toDate(a.start).getTime() - toDate(b.start).getTime())
  const past = matches.filter((e) => toDate(e.end) <= today).sort((a, b) => toDate(b.start).getTime() - toDate(a.start).getTime())
  return [...upcoming, ...past]
}

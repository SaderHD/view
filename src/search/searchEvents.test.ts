import { describe, expect, it } from 'vitest'
import type { CalEvent } from '../calendar/types'
import type { JobInfo } from '../jobs/types'
import { searchEvents, type EventFilters } from './searchEvents'

const NOW = new Date(2026, 10, 23, 9)
let n = 0
function ev(dayOffset: number, title: string, extra: Partial<CalEvent> = {}): CalEvent {
  const start = new Date(2026, 10, 23 + dayOffset, 9)
  const end = new Date(2026, 10, 23 + dayOffset, 11)
  return {
    id: `e${++n}`,
    title,
    start: start.toISOString(),
    end: end.toISOString(),
    allDay: false,
    location: '',
    notes: '',
    showAs: 'busy',
    categories: [],
    isOrganizer: true,
    organizerName: '',
    isCancelled: false,
    type: 'singleInstance',
    webLink: '',
    ...extra,
  }
}
const job = (j: Partial<JobInfo>): JobInfo => ({ jobId: 'J-1', customer: '', status: 'scheduled', folder: null, links: [], ...j })
const all: EventFilters = { jobsOnly: false, status: null, when: 'all' }

const events = [
  ev(-10, 'Roof inspection', { location: '412 Oak St 62704', job: job({ customer: 'Smith', status: 'done', jobId: 'J-261113-ABC' }) }),
  ev(2, 'Gutter repair', { job: job({ customer: 'Nguyen', status: 'scheduled' }) }),
  ev(5, 'Team meeting', { notes: 'Discuss the Smith invoice' }),
  ev(1, 'Café visit', { location: 'Main St' }),
  ev(3, 'Old supplier call', { isCancelled: true }),
]

describe('searchEvents', () => {
  it('matches title, customer, address and notes, any word order', () => {
    expect(searchEvents(events, 'smith', all, NOW).map((e) => e.title)).toEqual(['Team meeting', 'Roof inspection'])
    expect(searchEvents(events, 'oak 62704', all, NOW).map((e) => e.title)).toEqual(['Roof inspection'])
    expect(searchEvents(events, 'repair nguyen', all, NOW).map((e) => e.title)).toEqual(['Gutter repair'])
  })

  it('matches job number and status', () => {
    expect(searchEvents(events, 'J-261113', all, NOW)).toHaveLength(1)
    expect(searchEvents(events, 'done', all, NOW).map((e) => e.title)).toEqual(['Roof inspection'])
  })

  it('ignores accents and case', () => {
    expect(searchEvents(events, 'CAFE', all, NOW).map((e) => e.title)).toEqual(['Café visit'])
  })

  it('lists upcoming soonest first, then past most recent first', () => {
    const titles = searchEvents(events, 'e', all, NOW).map((e) => e.title)
    expect(titles.slice(0, 3)).toEqual(['Café visit', 'Gutter repair', 'Old supplier call'])
    expect(titles.at(-1)).toBe('Roof inspection')
  })

  it('filters to jobs, by status and by time', () => {
    expect(searchEvents(events, '', { ...all, jobsOnly: true }, NOW).map((e) => e.title)).toEqual(['Gutter repair', 'Roof inspection'])
    expect(searchEvents(events, '', { ...all, status: 'done' }, NOW).map((e) => e.title)).toEqual(['Roof inspection'])
    expect(searchEvents(events, '', { jobsOnly: true, status: null, when: 'upcoming' }, NOW).map((e) => e.title)).toEqual(['Gutter repair'])
    expect(searchEvents(events, 'smith', { ...all, when: 'past' }, NOW).map((e) => e.title)).toEqual(['Roof inspection'])
  })

  it('shows nothing for an empty query without filters', () => {
    expect(searchEvents(events, '  ', all, NOW)).toEqual([])
  })
})

import { describe, expect, it } from 'vitest'
import type { CalEvent } from '../calendar/types'
import { freeTimeByDay, subtract, suggestSlots, zipOf, type JobRequest } from './scheduler'
import {
  blocksFor,
  copyPreviousWeek,
  DEFAULT_SETTINGS,
  normalizeBlocks,
  resetWeek,
  sanitizeSettings,
  setDayForWeek,
  weekKey,
  type Settings,
} from './workHours'

// Monday 2026-11-23, 06:00 local
const MON = new Date(2026, 10, 23, 6, 0)
const at = (dayOffset: number, h: number, m = 0) => new Date(2026, 10, 23 + dayOffset, h, m)
let n = 0
function ev(start: Date, end: Date, extra: Partial<CalEvent> = {}): CalEvent {
  return {
    id: `e${++n}`,
    title: 'Event',
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
const req = (r: Partial<JobRequest>): JobRequest => ({
  durationMinutes: 120,
  earliest: MON,
  preferred: 'any',
  allowSplit: false,
  urgent: false,
  location: '',
  ...r,
})
const settings: Settings = {
  ...DEFAULT_SETTINGS,
  scheduling: { bufferMinutes: 30, maxJobHoursPerDay: 9, lookaheadDays: 7 },
}
const hm = (d: Date) => `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`

describe('work hours', () => {
  it('uses the default week', () => {
    expect(blocksFor(at(0, 0), DEFAULT_SETTINGS)).toEqual([['07:00', '15:30']])
    expect(blocksFor(at(-1, 0), DEFAULT_SETTINGS)).toEqual([]) // Sunday off
  })

  it('applies a one-week override without touching other weeks', () => {
    const s = setDayForWeek(DEFAULT_SETTINGS, at(2, 0), [['10:00', '14:00']])
    expect(blocksFor(at(2, 0), s)).toEqual([['10:00', '14:00']])
    expect(blocksFor(at(9, 0), s)).toEqual([['07:00', '15:30']]) // next Wednesday
    expect(Object.keys(s.weekOverrides)).toEqual([weekKey(at(0, 0))])
  })

  it('drops an override that matches the default again', () => {
    const s1 = setDayForWeek(DEFAULT_SETTINGS, at(2, 0), [['10:00', '14:00']])
    const s2 = setDayForWeek(s1, at(2, 0), [['07:00', '15:30']])
    expect(s2.weekOverrides).toEqual({})
  })

  it('copies last week', () => {
    const s1 = setDayForWeek(DEFAULT_SETTINGS, at(-5, 0), []) // last Wednesday off
    const s2 = copyPreviousWeek(s1, at(0, 0))
    expect(blocksFor(at(2, 0), s2)).toEqual([])
    expect(resetWeek(s2, at(0, 0)).weekOverrides[weekKey(at(0, 0))]).toBeUndefined()
  })

  it('merges overlapping blocks and drops invalid ones', () => {
    expect(
      normalizeBlocks([
        ['12:00', '15:00'],
        ['08:00', '12:30'],
        ['16:00', '15:00'],
      ]),
    ).toEqual([['08:00', '15:00']])
  })

  it('repairs a partial settings file', () => {
    const s = sanitizeSettings({ defaultWeek: { mon: [['06:00', '18:00']] }, scheduling: { bufferMinutes: 15 } })
    expect(s.defaultWeek.mon).toEqual([['06:00', '18:00']])
    expect(s.defaultWeek.tue).toEqual([['07:00', '15:30']])
    expect(s.scheduling).toEqual({ bufferMinutes: 15, maxJobHoursPerDay: 9, lookaheadDays: 21 })
  })
})

describe('availability', () => {
  it('subtracts intervals', () => {
    expect(subtract([[0, 100]], [[20, 30], [50, 120]])).toEqual([[0, 20], [30, 50]])
  })

  it('removes events plus buffer, ignores free and cancelled events', () => {
    const events = [
      ev(at(0, 10), at(0, 11)),
      ev(at(0, 12), at(0, 13), { showAs: 'free' }),
      ev(at(0, 13), at(0, 14), { isCancelled: true }),
    ]
    const [mon] = freeTimeByDay(events, settings, MON, 1, MON)
    expect(mon.free.map(([s, e]) => `${hm(new Date(s))}-${hm(new Date(e))}`)).toEqual(['7:00-9:30', '11:30-15:30'])
  })

  it('blocks the whole day for all-day busy events', () => {
    const events = [ev(new Date(2026, 10, 23), new Date(2026, 10, 24), { allDay: true, start: '2026-11-23', end: '2026-11-24', showAs: 'oof' })]
    const [mon] = freeTimeByDay(events, settings, MON, 1, MON)
    expect(mon.free).toEqual([])
  })

  it('never offers time in the past', () => {
    const [mon] = freeTimeByDay([], settings, MON, 1, at(0, 9, 5))
    expect(hm(new Date(mon.free[0][0]))).toBe('9:15')
  })
})

describe('suggestions', () => {
  it('finds the earliest open slot', () => {
    const [best] = suggestSlots(req({}), [], settings, { now: MON })
    expect(best.slots).toHaveLength(1)
    expect(best.slots[0].start).toEqual(at(0, 7))
    expect(best.slots[0].end).toEqual(at(0, 9))
  })

  it('respects work-hour overrides (day off this week)', () => {
    const s = setDayForWeek(settings, at(0, 0), [])
    const [best] = suggestSlots(req({}), [], s, { now: MON })
    expect(best.slots[0].start.getDate()).toBe(24)
  })

  it('skips slots that collide with existing events and buffers', () => {
    const events = [ev(at(0, 7), at(0, 15))]
    const [best] = suggestSlots(req({ durationMinutes: 60 }), events, settings, { now: MON })
    expect(best.slots[0].start.getDate()).toBe(24)
  })

  it('a "morning" slot must finish by noon', () => {
    // Only 11:00-15:30 free today: a 3h job would straddle noon, so a full morning tomorrow wins.
    const events = [ev(at(0, 7), at(0, 10, 30))]
    const [best] = suggestSlots(req({ durationMinutes: 180, preferred: 'morning' }), events, settings, { now: MON })
    expect(best.slots[0].start).toEqual(at(1, 7))
    expect(best.reasons).toContain('Morning')
  })

  it('honours the deadline', () => {
    const busyAll = [0, 1].map((d) => ev(at(d, 7), at(d, 15, 30)))
    const res = suggestSlots(req({ deadline: at(1, 0) }), busyAll, settings, { now: MON })
    expect(res).toEqual([])
  })

  it('prefers afternoons when asked', () => {
    const [best] = suggestSlots(req({ preferred: 'afternoon' }), [], settings, { now: MON })
    expect(best.slots[0].start.getHours()).toBeGreaterThanOrEqual(12)
    expect(best.reasons).toContain('Afternoon')
  })

  it('prefers a day with a nearby job (same ZIP)', () => {
    const events = [ev(at(2, 7), at(2, 9), { title: 'Smith roof', categories: ['Job'], location: '1 Oak St, Springfield 62704' })]
    const [best] = suggestSlots(req({ location: '9 Elm St 62704' }), events, settings, { now: MON })
    expect(best.slots[0].start.getDate()).toBe(25)
    expect(best.reasons.join(' ')).toContain('Smith roof')
  })

  it('offers different days as alternatives', () => {
    const res = suggestSlots(req({}), [], settings, { now: MON })
    const days = new Set(res.map((r) => r.slots[0].start.toDateString()))
    expect(days.size).toBe(res.length)
  })

  it('respects the max job hours per day', () => {
    const events = [ev(at(0, 7), at(0, 13), { categories: ['Job'] })]
    const s = { ...settings, scheduling: { ...settings.scheduling, maxJobHoursPerDay: 7 } }
    const [best] = suggestSlots(req({ durationMinutes: 90 }), events, s, { now: MON })
    expect(best.slots[0].start.getDate()).toBe(24)
  })

  it('splits a long job across days when allowed', () => {
    const res = suggestSlots(req({ durationMinutes: 12 * 60, allowSplit: true }), [], settings, { now: MON })
    expect(res.length).toBeGreaterThan(0)
    const total = res[0].slots.reduce((m, s) => m + (s.end.getTime() - s.start.getTime()) / 60000, 0)
    expect(total).toBe(12 * 60)
    expect(res[0].slots.length).toBeGreaterThan(1)
  })

  it('does not split unless allowed', () => {
    expect(suggestSlots(req({ durationMinutes: 12 * 60 }), [], settings, { now: MON })).toEqual([])
  })

  it('reads ZIP codes', () => {
    expect(zipOf('412 Oak St, Springfield, IL 62704-1234')).toBe('62704')
    expect(zipOf('Home Depot')).toBeNull()
  })
})

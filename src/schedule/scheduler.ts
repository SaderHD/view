/**
 * Smart scheduling: find the best open slots for a job, based on that
 * week's work hours and what's already on the calendar.
 */
import { addDays, startOfDay, toDate } from '../calendar/time'
import type { CalEvent } from '../calendar/types'
import { workIntervals, type Settings } from './workHours'

export type TimePref = 'any' | 'morning' | 'afternoon'

export interface JobRequest {
  durationMinutes: number
  /** First day the job may happen (local date). */
  earliest: Date
  /** Last day the job may happen (inclusive), if any. */
  deadline?: Date
  preferred: TimePref
  /** Allow splitting a long job across several days. */
  allowSplit: boolean
  urgent: boolean
  /** Cities the job is in; used to prefer days with other jobs in the same city. */
  cities: string[]
}

export interface Slot {
  start: Date
  end: Date
}

export interface Suggestion {
  /** One slot, or several for a job split across days. */
  slots: Slot[]
  score: number
  /** Short human-readable reasons, e.g. "Morning", "Near your Smith job". */
  reasons: string[]
}

type Interval = [number, number] // epoch ms

const MIN = 60_000
const SNAP = 15 * MIN
const STEP = 30 * MIN
/** Pieces of a split job are at least this long. */
const MIN_PIECE = 60 * MIN

const isBlocking = (e: CalEvent) => !e.isCancelled && e.showAs !== 'free'
const isJobEvent = (e: CalEvent) => !!e.job || e.categories.some((c) => c.toLowerCase() === 'job')

const cityKey = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()

/** Cities an existing event is in: its job's cities, else its location text. */
function citiesOf(e: CalEvent): string[] {
  if (e.job?.cities.length) return e.job.cities.map(cityKey)
  return e.location
    .split(/→|,|;/)
    .map(cityKey)
    .filter(Boolean)
}

/** The first of `cities` that `e` is also in, if any. */
export function sharedCity(cities: string[], e: CalEvent): string | null {
  const theirs = citiesOf(e)
  return cities.find((c) => c.trim() && theirs.includes(cityKey(c))) ?? null
}

/** Remove `cuts` from `base` intervals. */
export function subtract(base: Interval[], cuts: Interval[]): Interval[] {
  let out = base
  for (const [cs, ce] of cuts) {
    const next: Interval[] = []
    for (const [s, e] of out) {
      if (ce <= s || cs >= e) next.push([s, e])
      else {
        if (cs > s) next.push([s, cs])
        if (ce < e) next.push([ce, e])
      }
    }
    out = next
  }
  return out
}

const ceilTo = (t: number, step: number) => Math.ceil(t / step) * step

interface DayInfo {
  date: Date
  index: number
  free: Interval[]
  jobMinutes: number
  busyMinutes: number
  dayJobs: CalEvent[]
}

/** Free time per day within work hours, minus events and buffers around them. */
export function freeTimeByDay(
  events: CalEvent[],
  settings: Settings,
  from: Date,
  days: number,
  now = new Date(),
): DayInfo[] {
  const buffer = settings.scheduling.bufferMinutes * MIN
  const blocking = events.filter(isBlocking)
  const out: DayInfo[] = []
  for (let i = 0; i < days; i++) {
    const date = addDays(startOfDay(from), i)
    const dayStart = date.getTime()
    const dayEnd = addDays(date, 1).getTime()
    const work: Interval[] = workIntervals(date, settings).map(([a, b]) => [a.getTime(), b.getTime()])
    const todays = blocking.filter((e) => toDate(e.start).getTime() < dayEnd && toDate(e.end).getTime() > dayStart)
    const cuts: Interval[] = todays.map((e) =>
      e.allDay ? [dayStart, dayEnd] : [toDate(e.start).getTime() - buffer, toDate(e.end).getTime() + buffer],
    )
    // Nothing in the past (rounded up to the next 15 minutes).
    cuts.push([dayStart, ceilTo(now.getTime(), SNAP)])
    const free = subtract(work, cuts)
      .map(([s, e]) => [ceilTo(s, SNAP), e] as Interval)
      .filter(([s, e]) => e > s)
    const minutesIn = (list: CalEvent[]) =>
      list
        .filter((e) => !e.allDay)
        .reduce((sum, e) => sum + (Math.min(toDate(e.end).getTime(), dayEnd) - Math.max(toDate(e.start).getTime(), dayStart)) / MIN, 0)
    const dayJobs = todays.filter(isJobEvent)
    out.push({ date, index: i, free, jobMinutes: minutesIn(dayJobs), busyMinutes: minutesIn(todays), dayJobs })
  }
  return out
}

/**
 * Best options for a job, highest score first. Returns up to `limit`
 * suggestions, preferring different days so you get real choices.
 */
export function suggestSlots(
  req: JobRequest,
  events: CalEvent[],
  settings: Settings,
  { now = new Date(), limit = 5 }: { now?: Date; limit?: number } = {},
): Suggestion[] {
  const duration = req.durationMinutes * MIN
  if (duration <= 0) return []
  const from = startOfDay(req.earliest < now ? now : req.earliest)
  const lastDay = req.deadline ? startOfDay(req.deadline) : addDays(from, settings.scheduling.lookaheadDays - 1)
  const days = Math.min(Math.round((lastDay.getTime() - from.getTime()) / (24 * 60 * MIN)) + 1, 120)
  if (days <= 0) return []

  const info = freeTimeByDay(events, settings, from, days, now)
  const maxJob = settings.scheduling.maxJobHoursPerDay * 60
  const perDayPenalty = req.urgent ? 8 : 2

  const singles: Suggestion[] = []
  for (const day of info) {
    if (day.jobMinutes + req.durationMinutes > maxJob) continue
    for (const [fs, fe] of day.free) {
      for (let start = fs; start + duration <= fe; start += STEP) {
        const end = start + duration
        const reasons: string[] = []
        let score = 100 - day.index * perDayPenalty

        // Time-of-day preference: full credit if the whole job is in the
        // morning (ends by noon) / afternoon (starts at noon or later); a little
        // credit if it's mostly there; a penalty otherwise.
        const noon = new Date(start).setHours(12, 0, 0, 0)
        const mid = start + duration / 2
        if (req.preferred === 'morning') {
          if (end <= noon) {
            score += 8
            reasons.push('Morning')
          } else score += mid < noon ? 1 : -6
        } else if (req.preferred === 'afternoon') {
          if (start >= noon) {
            score += 8
            reasons.push('Afternoon')
          } else score += mid >= noon ? 1 : -6
        }

        // Fit snugly: penalise leaving an unusable sliver before/after.
        const before = (start - fs) / MIN
        const after = (fe - end) / MIN
        if (before === 0 || after === 0) score += 2
        if (before > 0 && before < 60) score -= 3
        if (after > 0 && after < 60) score -= 3

        // Spread work: lighter days score higher.
        score -= (day.busyMinutes / 60) * 0.75
        if (day.busyMinutes === 0) reasons.push('Open day')

        // Another job in the same city that day = less driving.
        const near = day.dayJobs.find((j) => sharedCity(req.cities, j))
        if (near) {
          score += 6
          reasons.push(`Same city as "${near.title}"`)
        }

        if (day.index === 0 && !reasons.includes('Earliest')) reasons.unshift('Earliest')
        singles.push({ slots: [{ start: new Date(start), end: new Date(end) }], score, reasons })
      }
    }
  }

  const picked = pickDiverse(singles, limit)
  if (picked.length > 0 || !req.allowSplit) return picked

  return splitSuggestions(req, info, maxJob, limit)
}

/** Best per day first, then fill with the next best overall. */
function pickDiverse(all: Suggestion[], limit: number): Suggestion[] {
  const sorted = [...all].sort((a, b) => b.score - a.score || a.slots[0].start.getTime() - b.slots[0].start.getTime())
  const seenDays = new Set<string>()
  const out: Suggestion[] = []
  for (const s of sorted) {
    const d = s.slots[0].start.toDateString()
    if (seenDays.has(d)) continue
    seenDays.add(d)
    out.push(s)
    if (out.length === limit) return out
  }
  for (const s of sorted) {
    if (out.length === limit) break
    if (!out.includes(s) && !out.some((o) => overlapsSlot(o.slots[0], s.slots[0]))) out.push(s)
  }
  return out.sort((a, b) => b.score - a.score)
}

const overlapsSlot = (a: Slot, b: Slot) => a.start < b.end && b.start < a.end

/** When no single slot is long enough: spread the job over consecutive open blocks. */
function splitSuggestions(req: JobRequest, info: DayInfo[], maxJobMinutes: number, limit: number): Suggestion[] {
  const out: Suggestion[] = []
  for (let first = 0; first < info.length && out.length < Math.min(limit, 3); first++) {
    if (!info[first].free.some(([s, e]) => e - s >= MIN_PIECE)) continue
    let remaining = req.durationMinutes * MIN
    const slots: Slot[] = []
    for (let i = first; i < info.length && remaining > 0; i++) {
      let dayBudget = (maxJobMinutes - info[i].jobMinutes) * MIN
      for (const [s, e] of info[i].free) {
        if (remaining <= 0 || dayBudget < MIN_PIECE) break
        const len = Math.min(e - s, remaining, dayBudget)
        if (len < MIN_PIECE && len < remaining) continue
        slots.push({ start: new Date(s), end: new Date(s + len) })
        remaining -= len
        dayBudget -= len
      }
    }
    if (remaining > 0) break // can't fit even split, later starts won't either
    const daysUsed = new Set(slots.map((s) => s.start.toDateString())).size
    const score = 60 - first * (req.urgent ? 8 : 2) - daysUsed * 3
    out.push({ slots, score, reasons: [`Split over ${slots.length} part${slots.length === 1 ? '' : 's'}`] })
    // Next suggestion should start on a later day than this one.
    const lastFirstDay = info.findIndex((d) => d.date.toDateString() === slots[0].start.toDateString())
    first = Math.max(first, lastFirstDay)
  }
  return out
}

// ── Multi-location jobs ──────────────────────────────────────────────────────

export interface Stop {
  city: string
  minutes: number
}

export interface StopSegment {
  stopIndex: number
  city: string
  start: Date
  end: Date
}

/**
 * Lay a job's stops out back to back over the booked slot(s): the first stop
 * from the start, the next right after it, and so on. If the job was split
 * across days, a stop that doesn't fit in what's left of one slot continues
 * in the next.
 */
export function allocateStops(slots: Slot[], stops: Stop[]): StopSegment[] {
  const out: StopSegment[] = []
  let i = 0
  let left = (stops[0]?.minutes ?? 0) * MIN
  for (const slot of slots) {
    let t = slot.start.getTime()
    const end = slot.end.getTime()
    while (t < end && i < stops.length) {
      const len = Math.min(left, end - t)
      if (len > 0) out.push({ stopIndex: i, city: stops[i].city.trim(), start: new Date(t), end: new Date(t + len) })
      t += len
      left -= len
      if (left <= 0) {
        i++
        left = (stops[i]?.minutes ?? 0) * MIN
      }
    }
  }
  return out
}

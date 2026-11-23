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
  /** Used to find days with jobs nearby. */
  location: string
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

/** Pull a 5-digit ZIP (or postcode-ish token) out of an address. */
export function zipOf(location: string): string | null {
  return /\b(\d{5})(?:-\d{4})?\b/.exec(location)?.[1] ?? null
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
  const zip = zipOf(req.location)
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

        // Same area as another job that day = less driving.
        if (zip && day.dayJobs.some((j) => zipOf(j.location) === zip)) {
          score += 6
          const near = day.dayJobs.find((j) => zipOf(j.location) === zip)!
          reasons.push(`Near "${near.title}" (same ZIP)`)
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

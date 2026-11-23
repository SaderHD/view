/**
 * Work hours: a default weekly template plus per-week overrides, because
 * hours change from week to week.
 */

/** A working block in local wall-clock time, e.g. ["07:00", "15:30"]. */
export type Block = [start: string, end: string]

export const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const
export type DayKey = (typeof DAY_KEYS)[number]
export const DAY_LABELS: Record<DayKey, string> = {
  sun: 'Sunday',
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
}

/** Hours for each day of the week. An empty list = day off. */
export type Week = Record<DayKey, Block[]>

export interface SchedulingRules {
  /** Gap kept before and after other appointments (travel / setup). */
  bufferMinutes: number
  /** Don't book more job time than this on one day. */
  maxJobHoursPerDay: number
  /** How far ahead to look for open slots. */
  lookaheadDays: number
}

export interface Settings {
  version: 1
  defaultWeek: Week
  presets: Record<string, Week>
  /** Keyed by the week's Sunday ("YYYY-MM-DD"). Only days that differ are stored. */
  weekOverrides: Record<string, Partial<Week>>
  scheduling: SchedulingRules
}

const weekday = (): Block[] => [['07:00', '15:30']]

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  defaultWeek: { sun: [], mon: weekday(), tue: weekday(), wed: weekday(), thu: weekday(), fri: weekday(), sat: [] },
  presets: {},
  weekOverrides: {},
  scheduling: { bufferMinutes: 30, maxJobHoursPerDay: 9, lookaheadDays: 21 },
}

const pad = (n: number) => String(n).padStart(2, '0')
const key = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** The Sunday that starts the week containing `date` (local). */
export function weekStart(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  d.setDate(d.getDate() - d.getDay())
  return d
}

export const weekKey = (date: Date) => key(weekStart(date))
export const dayKeyOf = (date: Date): DayKey => DAY_KEYS[date.getDay()]

/** "HH:mm" → minutes after midnight. "24:00" is allowed as end of day. */
export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + (m || 0)
}

export function fromMinutes(min: number): string {
  return `${pad(Math.floor(min / 60))}:${pad(min % 60)}`
}

/** Sorted, merged, valid blocks (drops empty or reversed ones). */
export function normalizeBlocks(blocks: Block[]): Block[] {
  const sorted = blocks
    .map(([s, e]) => [toMinutes(s), toMinutes(e)] as const)
    .filter(([s, e]) => e > s)
    .sort((a, b) => a[0] - b[0])
  const out: [number, number][] = []
  for (const [s, e] of sorted) {
    const last = out[out.length - 1]
    if (last && s <= last[1]) last[1] = Math.max(last[1], e)
    else out.push([s, e])
  }
  return out.map(([s, e]) => [fromMinutes(s), fromMinutes(e)])
}

/** Work blocks for one date, taking that week's overrides into account. */
export function blocksFor(date: Date, settings: Settings): Block[] {
  const day = dayKeyOf(date)
  const override = settings.weekOverrides[weekKey(date)]?.[day]
  return override ?? settings.defaultWeek[day]
}

/** True if this date's hours come from a week override. */
export function isOverridden(date: Date, settings: Settings): boolean {
  return settings.weekOverrides[weekKey(date)]?.[dayKeyOf(date)] !== undefined
}

/** The full week (Sunday first) as it applies to the week containing `date`. */
export function effectiveWeek(date: Date, settings: Settings): Week {
  const start = weekStart(date)
  const week = {} as Week
  for (let i = 0; i < 7; i++) {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    week[DAY_KEYS[i]] = blocksFor(d, settings)
  }
  return week
}

/** Work blocks for a date as absolute [start, end) Date pairs. */
export function workIntervals(date: Date, settings: Settings): [Date, Date][] {
  return blocksFor(date, settings).map(([s, e]) => {
    const a = new Date(date.getFullYear(), date.getMonth(), date.getDate())
    const b = new Date(a)
    a.setMinutes(toMinutes(s))
    b.setMinutes(toMinutes(e))
    return [a, b]
  })
}

// ── Edits (all return a new Settings) ───────────────────────────────────────

/** Set one day's hours for one specific week only. */
export function setDayForWeek(settings: Settings, date: Date, blocks: Block[]): Settings {
  const wk = weekKey(date)
  const day = dayKeyOf(date)
  const normalized = normalizeBlocks(blocks)
  const current = { ...settings.weekOverrides[wk] }
  // Matching the default again? Drop the override so default changes still apply.
  if (JSON.stringify(normalized) === JSON.stringify(normalizeBlocks(settings.defaultWeek[day]))) delete current[day]
  else current[day] = normalized
  return withWeek(settings, wk, current)
}

/** Replace a whole week's hours (e.g. "copy last week" or a preset). */
export function setWholeWeek(settings: Settings, date: Date, week: Week): Settings {
  let next = settings
  const start = weekStart(date)
  for (let i = 0; i < 7; i++) {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    next = setDayForWeek(next, d, week[DAY_KEYS[i]])
  }
  return next
}

export function resetWeek(settings: Settings, date: Date): Settings {
  return withWeek(settings, weekKey(date), {})
}

export function copyPreviousWeek(settings: Settings, date: Date): Settings {
  const prev = new Date(weekStart(date))
  prev.setDate(prev.getDate() - 7)
  return setWholeWeek(settings, date, effectiveWeek(prev, settings))
}

export function setDefaultDay(settings: Settings, day: DayKey, blocks: Block[]): Settings {
  return { ...settings, defaultWeek: { ...settings.defaultWeek, [day]: normalizeBlocks(blocks) } }
}

function withWeek(settings: Settings, wk: string, days: Partial<Week>): Settings {
  const weekOverrides = { ...settings.weekOverrides }
  if (Object.keys(days).length) weekOverrides[wk] = days
  else delete weekOverrides[wk]
  return { ...settings, weekOverrides }
}

/** Fill in anything missing (older or hand-edited settings files). */
export function sanitizeSettings(raw: unknown): Settings {
  const r = (raw ?? {}) as Partial<Settings>
  const defaultWeek = { ...DEFAULT_SETTINGS.defaultWeek }
  for (const d of DAY_KEYS) {
    const v = r.defaultWeek?.[d]
    if (Array.isArray(v)) defaultWeek[d] = normalizeBlocks(v as Block[])
  }
  return {
    version: 1,
    defaultWeek,
    presets: r.presets && typeof r.presets === 'object' ? r.presets : {},
    weekOverrides: r.weekOverrides && typeof r.weekOverrides === 'object' ? r.weekOverrides : {},
    scheduling: { ...DEFAULT_SETTINGS.scheduling, ...(r.scheduling ?? {}) },
  }
}

/** "7:00 AM – 3:30 PM, 5:00 PM – 7:00 PM" or "Off". */
export function describeBlocks(blocks: Block[]): string {
  if (!blocks.length) return 'Off'
  const fmt = (hhmm: string) => {
    const m = toMinutes(hhmm)
    const d = new Date(2000, 0, 1, Math.floor(m / 60), m % 60)
    return m === 24 * 60 ? 'midnight' : d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  }
  return blocks.map(([s, e]) => `${fmt(s)} – ${fmt(e)}`).join(', ')
}

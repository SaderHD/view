/** Date/time helpers. All "local" means the phone's time zone. */

export const deviceTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone

const pad = (n: number) => String(n).padStart(2, '0')

/** Parse "YYYY-MM-DD" or an ISO string. Date-only strings are local midnight (not UTC). */
export function toDate(value: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return new Date(value)
}

/** Local calendar date as "YYYY-MM-DD". */
export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Local wall-clock time as "HH:mm". */
export function timeKey(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Combine "YYYY-MM-DD" and "HH:mm" into a local Date. */
export function combine(date: string, time: string): Date {
  const d = toDate(date)
  const [h, m] = time.split(':').map(Number)
  d.setHours(h, m, 0, 0)
  return d
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

export function startOfDay(d: Date): Date {
  const r = new Date(d)
  r.setHours(0, 0, 0, 0)
  return r
}

/** Graph's dateTimeTimeZone.dateTime format for a local Date: "YYYY-MM-DDTHH:mm:ss". */
export function toGraphLocal(d: Date): string {
  return `${dateKey(d)}T${timeKey(d)}:00`
}

/**
 * Parse a Graph dateTime that was returned in the device time zone
 * (we always send `Prefer: outlook.timezone="<device tz>"`).
 * e.g. "2026-11-24T09:30:00.0000000" → local Date.
 */
export function fromGraphLocal(dateTime: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(dateTime)
  if (!m) return new Date(dateTime)
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])
}

/** True if [aStart, aEnd) overlaps [bStart, bEnd). */
export function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && aEnd > bStart
}

/** Next round half hour from now, e.g. 9:07 → 9:30. */
export function nextHalfHour(from = new Date()): Date {
  const d = new Date(from)
  d.setSeconds(0, 0)
  d.setMinutes(d.getMinutes() <= 30 ? 30 : 60)
  return d
}

export const fmtTime = (d: Date) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
export const fmtDayLong = (d: Date) =>
  d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })
export const fmtDayShort = (d: Date) =>
  d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })

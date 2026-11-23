import { useEffect, useRef, useState, type ReactNode } from 'react'
import { addDays, dateKey, fmtDayShort, fmtTime, startOfDay, toDate } from '../calendar/time'
import type { CalEvent } from '../calendar/types'
import { ClientPicker } from '../clients/ClientPicker'
import { Icon, Sheet } from '../components/Sheet'
import { listEvents } from '../graph/calendar'
import { useSettings } from '../settings/store'
import { getCachedEvents } from '../storage/eventCache'
import { suggestSlots, type Suggestion, type TimePref } from './scheduler'

export interface JobDetails {
  title: string
  /** Client name (folder under View/Clients). */
  customer: string
  location: string
  notes: string
}

const DURATIONS = [60, 90, 120, 180, 240, 360, 480]
const fmtDuration = (m: number) => (m % 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m / 60}h`).replace(/^0h /, '')

/** Type in a job → get the best open slots → book one with a tap. */
export function FindTimeSheet({
  onClose,
  onBook,
  onEditHours,
  initialEarliest,
  initialClient = '',
}: {
  initialClient?: string
  initialEarliest?: Date
  onClose: () => void
  onBook: (details: JobDetails, suggestion: Suggestion) => Promise<void>
  onEditHours: () => void
}) {
  const { settings } = useSettings()
  const [today] = useState(() => dateKey(new Date()))
  const [details, setDetails] = useState<JobDetails>({ title: '', customer: initialClient, location: '', notes: '' })
  const [duration, setDuration] = useState(120)
  const [customDuration, setCustomDuration] = useState(false)
  const [earliest, setEarliest] = useState(() => dateKey(initialEarliest && initialEarliest > new Date() ? initialEarliest : new Date()))
  const [deadline, setDeadline] = useState('')
  const [preferred, setPreferred] = useState<TimePref>('any')
  const [allowSplit, setAllowSplit] = useState(false)
  const [urgent, setUrgent] = useState(false)
  const [results, setResults] = useState<Suggestion[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [booking, setBooking] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [offline, setOffline] = useState(false)

  // Show results from the top (the form above may have been scrolled).
  const resultsTop = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (results) resultsTop.current?.scrollIntoView({ block: 'start' })
  }, [results])

  const set = <K extends keyof JobDetails>(k: K, v: string) => setDetails((d) => ({ ...d, [k]: v }))

  async function find() {
    setSearching(true)
    setError(null)
    setResults(null)
    const from = startOfDay(toDate(earliest))
    const to = deadline ? addDays(toDate(deadline), 1) : addDays(from, settings.scheduling.lookaheadDays)
    let events: CalEvent[]
    try {
      events = await listEvents(from, to)
      setOffline(false)
    } catch {
      events = await getCachedEvents(from, to) // offline: use what's saved on the phone
      setOffline(true)
    }
    setResults(
      suggestSlots(
        {
          durationMinutes: duration,
          earliest: from,
          deadline: deadline ? toDate(deadline) : undefined,
          preferred,
          allowSplit,
          urgent,
          location: details.location,
        },
        events,
        settings,
      ),
    )
    setSearching(false)
  }

  async function book(i: number, s: Suggestion) {
    setBooking(i)
    setError(null)
    try {
      await onBook({ ...details, title: details.title.trim() || 'New job' }, s)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBooking(null)
    }
  }

  const input = 'w-full rounded-lg border border-line bg-bg px-3 py-2.5 outline-none focus:border-brand'
  const chip = (active: boolean) =>
    `rounded-full px-3 py-1.5 text-sm ${active ? 'bg-brand text-white' : 'bg-surface-2 active:bg-line'}`

  return (
    <Sheet
      title="Schedule a job"
      onClose={onClose}
      footer={
        results === null ? (
          <button
            type="button"
            onClick={() => void find()}
            disabled={searching || (!!deadline && deadline < earliest)}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-3 font-medium text-white disabled:opacity-50"
          >
            <Icon name="search" /> {searching ? 'Checking your calendar…' : 'Find the best times'}
          </button>
        ) : (
          <button type="button" onClick={() => setResults(null)} className="w-full rounded-xl border border-line py-3 font-medium active:bg-surface-2">
            Change job details
          </button>
        )
      }
    >
      {results === null ? (
        <div className="space-y-4">
          <input className={`${input} text-lg font-medium`} placeholder="Job title, e.g. Roof inspection" value={details.title} onChange={(e) => set('title', e.target.value)} autoFocus />
          <ClientPicker value={details.customer} onChange={(v) => set('customer', v)} />
          <input className={input} placeholder="Address (ZIP helps group nearby jobs)" value={details.location} onChange={(e) => set('location', e.target.value)} autoComplete="street-address" />

          <Field label="How long will it take?">
            <div className="flex flex-wrap gap-1.5">
              {DURATIONS.map((m) => (
                <button key={m} type="button" onClick={() => { setDuration(m); setCustomDuration(false) }} className={chip(!customDuration && duration === m)}>
                  {fmtDuration(m)}
                </button>
              ))}
              <button type="button" onClick={() => setCustomDuration(true)} className={chip(customDuration)}>
                Other
              </button>
            </div>
            {customDuration && (
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="number"
                  inputMode="decimal"
                  min={0.25}
                  step={0.25}
                  className={`${input} w-28`}
                  value={duration / 60}
                  onChange={(e) => setDuration(Math.max(15, Math.round((Number(e.target.value) || 0) * 4) * 15))}
                />
                <span className="text-muted">hours</span>
              </div>
            )}
          </Field>

          <div className="flex gap-2">
            <Field label="Earliest">
              <input type="date" className={input} value={earliest} min={today} onChange={(e) => setEarliest(e.target.value || today)} />
            </Field>
            <Field label="Must be done by">
              <input type="date" className={input} value={deadline} min={earliest} onChange={(e) => setDeadline(e.target.value)} />
            </Field>
          </div>
          {!!deadline && deadline < earliest && <p className="text-sm text-danger">The deadline is before the earliest date.</p>}

          <Field label="Time of day">
            <div className="flex gap-1.5">
              {(['any', 'morning', 'afternoon'] as const).map((p) => (
                <button key={p} type="button" onClick={() => setPreferred(p)} className={chip(preferred === p)}>
                  {p === 'any' ? 'Any time' : p === 'morning' ? 'Morning' : 'Afternoon'}
                </button>
              ))}
            </div>
          </Field>

          <div className="divide-y divide-line rounded-lg border border-line">
            <Toggle label="Urgent" help="Strongly prefer the soonest slot" checked={urgent} onChange={setUrgent} />
            <Toggle label="Can be split across days" help="For long jobs when no single slot is free" checked={allowSplit} onChange={setAllowSplit} />
          </div>

          <textarea className={`${input} min-h-20`} placeholder="Notes (optional)" value={details.notes} onChange={(e) => set('notes', e.target.value)} />
        </div>
      ) : (
        <div ref={resultsTop} className="scroll-mt-4">
          <p className="mb-3 text-sm text-muted">
            {fmtDuration(duration)} · {details.title || 'New job'}
            {details.customer ? ` · ${details.customer}` : ''}
          </p>
          {offline && (
            <p className="mb-3 rounded-lg bg-surface-2 px-3 py-2 text-sm text-muted">Offline: using your saved calendar. Double-check before booking.</p>
          )}
          {results.length === 0 ? (
            <div className="rounded-xl bg-surface-2 p-4 text-center">
              <p className="font-medium">No open time fits.</p>
              <p className="mt-1 text-sm text-muted">
                Try a later deadline, a shorter duration{allowSplit ? '' : ', allowing a split'}, or extend your work hours.
              </p>
              <button type="button" onClick={onEditHours} className="mt-3 text-sm font-medium text-brand">
                Edit work hours
              </button>
            </div>
          ) : (
            <ul className="space-y-2">
              {results.map((s, i) => (
                <li key={i} className={`rounded-xl border p-3 ${i === 0 ? 'border-brand' : 'border-line'}`}>
                  {i === 0 && <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-brand">Best fit</p>}
                  {s.slots.map((slot, j) => (
                    <p key={j} className="font-semibold">
                      {fmtDayShort(slot.start)} · {fmtTime(slot.start)} – {fmtTime(slot.end)}
                    </p>
                  ))}
                  {s.reasons.length > 0 && <p className="mt-0.5 text-sm text-muted">{s.reasons.join(' · ')}</p>}
                  <button
                    type="button"
                    onClick={() => void book(i, s)}
                    disabled={booking !== null}
                    className={`mt-2 w-full rounded-lg py-2.5 font-medium disabled:opacity-50 ${i === 0 ? 'bg-brand text-white' : 'border border-line active:bg-surface-2'}`}
                  >
                    {booking === i ? 'Booking…' : s.slots.length > 1 ? `Book all ${s.slots.length} parts` : 'Book this time'}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-center text-xs text-muted">
            Booking adds it to Outlook and creates the job's folder inside the client's folder.
          </p>
        </div>
      )}
      {error && <p className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
    </Sheet>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 flex-1">
      <p className="mb-1 text-sm font-medium text-muted">{label}</p>
      {children}
    </div>
  )
}

function Toggle({ label, help, checked, onChange }: { label: string; help: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 px-3 py-2.5">
      <span>
        {label}
        <span className="block text-xs text-muted">{help}</span>
      </span>
      <input type="checkbox" className="h-5 w-5 accent-[var(--color-brand)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  )
}

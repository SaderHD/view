import { useState, type ReactNode } from 'react'
import { Sheet } from '../components/Sheet'
import { SHOW_AS_LABEL } from './eventDisplay'
import { addDays, combine, dateKey, timeKey, toDate } from './time'
import type { EventDraft, ShowAs } from './types'

interface FormState {
  title: string
  allDay: boolean
  startDate: string
  startTime: string
  /** For all-day events this is the LAST day (inclusive), as people expect. */
  endDate: string
  endTime: string
  location: string
  notes: string
  showAs: ShowAs
}

function fromDraft(d: EventDraft): FormState {
  return {
    title: d.title,
    allDay: d.allDay,
    startDate: dateKey(d.start),
    startTime: timeKey(d.start),
    endDate: dateKey(d.allDay ? addDays(d.end, -1) : d.end),
    endTime: timeKey(d.end),
    location: d.location,
    notes: d.notes,
    showAs: d.showAs,
  }
}

function toDraft(f: FormState): EventDraft {
  if (f.allDay) {
    const start = toDate(f.startDate)
    return { ...base(f), start, end: addDays(toDate(f.endDate), 1) }
  }
  return { ...base(f), start: combine(f.startDate, f.startTime), end: combine(f.endDate, f.endTime) }
}

const base = (f: FormState) => ({
  title: f.title,
  allDay: f.allDay,
  location: f.location,
  notes: f.notes,
  showAs: f.showAs,
})

const SHOW_AS_OPTIONS: ShowAs[] = ['busy', 'tentative', 'free', 'oof', 'workingElsewhere']

export function EventForm({
  mode,
  initial,
  notesEditable = true,
  onClose,
  onSave,
}: {
  mode: 'new' | 'edit'
  initial: EventDraft
  /** False when the event's full notes couldn't be loaded; editing them could lose text. */
  notesEditable?: boolean
  onClose: () => void
  /** Resolves when saved; rejects with an error to show. */
  onSave: (draft: EventDraft, notesChanged: boolean) => Promise<void>
}) {
  const [form, setForm] = useState<FormState>(() => fromDraft(initial))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }))

  /** Moving the start keeps the event's length the same. */
  function setStart(date: string, time: string) {
    setForm((f) => {
      const oldStart = f.allDay ? toDate(f.startDate) : combine(f.startDate, f.startTime)
      const oldEnd = f.allDay ? toDate(f.endDate) : combine(f.endDate, f.endTime)
      const length = oldEnd.getTime() - oldStart.getTime()
      const newStart = f.allDay ? toDate(date) : combine(date, time)
      const newEnd = new Date(newStart.getTime() + Math.max(length, 0))
      return { ...f, startDate: date, startTime: time, endDate: dateKey(newEnd), endTime: f.allDay ? f.endTime : timeKey(newEnd) }
    })
  }

  const draft = toDraft(form)
  const invalid = draft.end <= draft.start
  const problem = !form.startDate || !form.endDate ? 'Pick a date.' : invalid ? 'End must be after start.' : null

  async function handleSave() {
    if (problem) return
    setSaving(true)
    setError(null)
    try {
      await onSave(draft, form.notes !== initial.notes)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setSaving(false)
    }
  }

  const field = 'rounded-lg border border-line bg-bg px-3 py-2.5 text-base outline-none focus:border-brand'
  const input = `${field} w-full`

  return (
    <Sheet
      title={mode === 'new' ? 'New event' : 'Edit event'}
      onClose={onClose}
      footer={
        <div className="space-y-2">
          {(error || problem) && (
            <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
              {error ?? problem}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-line px-5 py-3 font-medium active:bg-surface-2"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving || !!problem}
              className="flex-1 rounded-xl bg-brand py-3 font-medium text-white disabled:opacity-50"
            >
              {saving ? 'Saving…' : mode === 'new' ? 'Add to Outlook' : 'Save'}
            </button>
          </div>
        </div>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          void handleSave()
        }}
      >
        <input
          className={`${input} text-lg font-medium`}
          placeholder="Title"
          value={form.title}
          onChange={(e) => set('title', e.target.value)}
          autoFocus={mode === 'new'}
          enterKeyHint="done"
        />

        <label className="flex items-center justify-between rounded-lg border border-line px-3 py-2.5">
          <span>All day</span>
          <input
            type="checkbox"
            className="h-5 w-5 accent-[var(--color-brand)]"
            checked={form.allDay}
            onChange={(e) => set('allDay', e.target.checked)}
          />
        </label>

        <Field label="Starts">
          <div className="flex gap-2">
            <input
              type="date"
              className={`${field} min-w-0 flex-1`}
              value={form.startDate}
              onChange={(e) => setStart(e.target.value, form.startTime)}
            />
            {!form.allDay && (
              <input
                type="time"
                className={`${field} w-[8.75rem] shrink-0`}
                value={form.startTime}
                onChange={(e) => setStart(form.startDate, e.target.value)}
              />
            )}
          </div>
        </Field>

        <Field label="Ends">
          <div className="flex gap-2">
            <input
              type="date"
              className={`${field} min-w-0 flex-1`}
              value={form.endDate}
              onChange={(e) => set('endDate', e.target.value)}
            />
            {!form.allDay && (
              <input
                type="time"
                className={`${field} w-[8.75rem] shrink-0`}
                value={form.endTime}
                onChange={(e) => set('endTime', e.target.value)}
              />
            )}
          </div>
        </Field>

        <Field label="Location">
          <input
            className={input}
            placeholder="Address or place"
            value={form.location}
            onChange={(e) => set('location', e.target.value)}
            autoComplete="street-address"
          />
        </Field>

        <Field label="Show as">
          <select className={input} value={form.showAs} onChange={(e) => set('showAs', e.target.value as ShowAs)}>
            {SHOW_AS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {SHOW_AS_LABEL[s]}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Notes">
          <textarea
            className={`${input} min-h-24 disabled:opacity-60`}
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
            disabled={!notesEditable}
          />
          {!notesEditable && (
            <p className="mt-1 text-xs text-muted">Notes can't be edited offline. Connect and reopen to edit them.</p>
          )}
          {mode === 'edit' && notesEditable && initial.notes && (
            <p className="mt-1 text-xs text-muted">
              Editing notes saves them as plain text in Outlook (formatting is removed).
            </p>
          )}
        </Field>
      </form>
    </Sheet>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-sm font-medium text-muted">{label}</p>
      {children}
    </div>
  )
}

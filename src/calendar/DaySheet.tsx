import { useState } from 'react'
import { Icon, Sheet } from '../components/Sheet'
import { byStart, describeWhen, eventClasses } from './eventDisplay'
import { freeTimeByDay } from '../schedule/scheduler'
import { blocksFor, describeBlocks, isOverridden } from '../schedule/workHours'
import { useSettings } from '../settings/store'
import { addDays, fmtDayLong, fmtTime, overlaps, toDate } from './time'
import type { CalEvent } from './types'

/** Everything on one date. Opened by tapping a day in the month view. */
export function DaySheet({
  date,
  events,
  onClose,
  onOpenEvent,
  onAddEvent,
  onFindTime,
  onEditHours,
}: {
  date: Date
  events: CalEvent[]
  onClose: () => void
  onOpenEvent: (id: string) => void
  onAddEvent: (date: Date) => void
  onFindTime: (date: Date) => void
  onEditHours: (date: Date) => void
}) {
  const { settings } = useSettings()
  const [now] = useState(() => new Date())
  const blocks = blocksFor(date, settings)
  const [free] = freeTimeByDay(events, settings, date, 1, now)
  const freeMinutes = free.free.reduce((m, [s, e]) => m + (e - s) / 60000, 0)
  const dayEnd = addDays(date, 1)
  const todays = events.filter((e) => overlaps(toDate(e.start), toDate(e.end), date, dayEnd)).sort(byStart)

  return (
    <Sheet
      title={fmtDayLong(date)}
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onFindTime(date)}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-line py-3 font-medium active:bg-surface-2"
          >
            <Icon name="briefcase" /> Schedule job
          </button>
          <button
            type="button"
            onClick={() => onAddEvent(date)}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand py-3 font-medium text-white active:opacity-90"
          >
            <Icon name="plus" /> Add event
          </button>
        </div>
      }
    >
      <button
        type="button"
        onClick={() => onEditHours(date)}
        className="mb-3 flex w-full items-start gap-3 rounded-xl bg-surface-2 px-3 py-2.5 text-left text-sm active:bg-line"
      >
        <Icon name="clock" className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
        <span className="min-w-0 flex-1">
          <span className="block">
            <span className="font-medium">Work hours: </span>
            {describeBlocks(blocks)}
            {isOverridden(date, settings) && <span className="text-muted"> (this week)</span>}
          </span>
          {blocks.length > 0 && dayEnd > now && (
            <span className="block text-muted">
              {free.free.length === 0
                ? 'Fully booked'
                : `Open: ${free.free.map(([a, b]) => `${fmtTime(new Date(a))}–${fmtTime(new Date(b))}`).join(', ')} (${(freeMinutes / 60).toFixed(1)} h)`}
            </span>
          )}
        </span>
        <span className="shrink-0 font-medium text-brand">Edit</span>
      </button>

      {todays.length === 0 ? (
        <p className="py-8 text-center text-muted">Nothing scheduled.</p>
      ) : (
        <ul className="space-y-2">
          {todays.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => onOpenEvent(e.id)}
                className="flex w-full items-stretch gap-3 rounded-xl border border-line bg-surface p-3 text-left active:bg-surface-2"
              >
                <span className={`day-bar w-1.5 shrink-0 rounded-full ${eventClasses(e).join(' ')}`} />
                <span className="min-w-0 flex-1">
                  <span className={`block truncate font-medium ${e.isCancelled ? 'line-through opacity-60' : ''}`}>
                    {e.title}
                  </span>
                  <span className="block text-sm text-muted">{describeWhen(e)}</span>
                  {e.location && <span className="block truncate text-sm text-muted">{e.location}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  )
}

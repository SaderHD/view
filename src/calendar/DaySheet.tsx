import { Icon, Sheet } from '../components/Sheet'
import { byStart, describeWhen, eventClasses } from './eventDisplay'
import { addDays, fmtDayLong, overlaps, toDate } from './time'
import type { CalEvent } from './types'

/** Everything on one date. Opened by tapping a day in the month view. */
export function DaySheet({
  date,
  events,
  onClose,
  onOpenEvent,
  onAddEvent,
}: {
  date: Date
  events: CalEvent[]
  onClose: () => void
  onOpenEvent: (id: string) => void
  onAddEvent: (date: Date) => void
}) {
  const dayEnd = addDays(date, 1)
  const todays = events.filter((e) => overlaps(toDate(e.start), toDate(e.end), date, dayEnd)).sort(byStart)

  return (
    <Sheet
      title={fmtDayLong(date)}
      onClose={onClose}
      footer={
        <button
          type="button"
          onClick={() => onAddEvent(date)}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-3 font-medium text-white active:opacity-90"
        >
          <Icon name="plus" /> Add event
        </button>
      }
    >
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

import type { DatesSetArg, EventClickArg, EventInput } from '@fullcalendar/core'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin, { type DateClickArg } from '@fullcalendar/interaction'
import listPlugin from '@fullcalendar/list'
import FullCalendar from '@fullcalendar/react'
import timeGridPlugin from '@fullcalendar/timegrid'
import { useCallback, useEffect, useMemo, useRef, useState, type TouchEvent } from 'react'
import { DaySheet } from '../calendar/DaySheet'
import { EventDetail } from '../calendar/EventDetail'
import { EventForm } from '../calendar/EventForm'
import { eventClasses, eventToDraft } from '../calendar/eventDisplay'
import { addDays, fmtTime, nextHalfHour, startOfDay } from '../calendar/time'
import type { CalEvent, EventDraft } from '../calendar/types'
import { useCalendarData, type SyncStatus } from '../calendar/useCalendarData'
import { Icon } from '../components/Sheet'
import { getEventNotes } from '../graph/calendar'
import { SettingsSheet } from './SettingsSheet'

type SheetState =
  | { kind: 'day'; date: Date }
  /** snapshot keeps the sheet showing while a just-deleted event closes */
  | { kind: 'event'; id: string; snapshot?: CalEvent }
  | { kind: 'new'; draft: EventDraft }
  | { kind: 'edit'; id: string; draft: EventDraft; notesEditable: boolean }
  | { kind: 'settings' }

const VIEWS = [
  { id: 'dayGridMonth', label: 'Month' },
  { id: 'timeGridWeek', label: 'Week' },
  { id: 'timeGrid3Day', label: '3 Day' },
  { id: 'timeGridDay', label: 'Day' },
  { id: 'listWeek', label: 'List' },
] as const
type ViewId = (typeof VIEWS)[number]['id']

const VIEW_KEY = 'view:calendarView'
function savedView(): ViewId {
  try {
    const v = localStorage.getItem(VIEW_KEY)
    if (VIEWS.some((x) => x.id === v)) return v as ViewId
  } catch {
    /* storage unavailable */
  }
  return 'dayGridMonth'
}

function newDraft(start: Date, allDay = false): EventDraft {
  return {
    title: '',
    allDay,
    start: allDay ? startOfDay(start) : start,
    end: allDay ? addDays(startOfDay(start), 1) : new Date(start.getTime() + 60 * 60 * 1000),
    location: '',
    notes: '',
    showAs: 'busy',
  }
}

export function CalendarScreen({ name, username }: { name: string; username: string }) {
  const calendarRef = useRef<FullCalendar>(null)
  const { events, status, loadRange, refresh, create, update, remove } = useCalendarData()
  const [title, setTitle] = useState('')
  const [view, setView] = useState<ViewId>(savedView)
  const [visibleRange, setVisibleRange] = useState<{ start: Date; end: Date } | null>(null)
  const [stack, setStack] = useState<SheetState[]>([])
  const [fullNotes, setFullNotes] = useState<Record<string, string>>({})

  // ── Sheets are tied to browser history so Android's Back button closes them.
  const pushSheet = useCallback((s: SheetState) => {
    history.pushState({ sheet: true }, '')
    setStack((prev) => [...prev, s])
  }, [])
  const closeSheet = useCallback(() => history.back(), [])
  useEffect(() => {
    const onPop = () => setStack((prev) => prev.slice(0, -1))
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const api = () => calendarRef.current?.getApi()

  async function loadNotes(id: string) {
    try {
      const text = await getEventNotes(id)
      setFullNotes((n) => ({ ...n, [id]: text }))
      return text
    } catch {
      return undefined
    }
  }

  function openEvent(id: string) {
    pushSheet({ kind: 'event', id, snapshot: events.find((e) => e.id === id) })
    void loadNotes(id)
  }

  const fcEvents: EventInput[] = useMemo(
    () =>
      events.map((e) => ({
        id: e.id,
        title: e.title,
        start: e.start,
        end: e.end,
        allDay: e.allDay,
        classNames: eventClasses(e),
      })),
    [events],
  )

  function changeView(v: ViewId) {
    setView(v)
    api()?.changeView(v)
    try {
      localStorage.setItem(VIEW_KEY, v)
    } catch {
      /* ignore */
    }
  }

  function addEventDefault() {
    const now = new Date()
    const range = visibleRange
    const inView = !range || (now >= range.start && now < range.end)
    const start = inView ? nextHalfHour(now) : new Date(range.start.getFullYear(), range.start.getMonth(), range.start.getDate(), 9)
    pushSheet({ kind: 'new', draft: newDraft(start) })
  }

  // ── Swipe left/right to change month/week/day.
  const touch = useRef<{ x: number; y: number; t: number } | null>(null)
  function onTouchStart(e: TouchEvent) {
    const t = e.touches[0]
    touch.current = { x: t.clientX, y: t.clientY, t: Date.now() }
  }
  function onTouchEnd(e: TouchEvent) {
    const start = touch.current
    touch.current = null
    if (!start) return
    const t = e.changedTouches[0]
    const dx = t.clientX - start.x
    const dy = t.clientY - start.y
    if (Date.now() - start.t < 600 && Math.abs(dx) > 70 && Math.abs(dx) > 2 * Math.abs(dy)) {
      if (dx < 0) api()?.next()
      else api()?.prev()
    }
  }

  const top = stack.at(-1)
  const eventById = (id: string) => events.find((e) => e.id === id)

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center gap-1 border-b border-line bg-surface px-2 pb-2 pt-[max(env(safe-area-inset-top),0.5rem)]">
        <button type="button" aria-label="Previous" onClick={() => api()?.prev()} className="rounded-full p-2 active:bg-surface-2">
          <Icon name="chevronLeft" />
        </button>
        <h1 className="min-w-0 flex-1 truncate text-center text-lg font-semibold">{title}</h1>
        <button type="button" aria-label="Next" onClick={() => api()?.next()} className="rounded-full p-2 active:bg-surface-2">
          <Icon name="chevronRight" />
        </button>
        <button
          type="button"
          onClick={() => api()?.today()}
          className="rounded-lg border border-line px-2.5 py-1 text-sm font-medium active:bg-surface-2"
        >
          Today
        </button>
        <button
          type="button"
          aria-label="Refresh"
          onClick={() => void refresh()}
          className="rounded-full p-2 text-muted active:bg-surface-2"
        >
          <Icon name="refresh" className={`h-5 w-5 ${status.kind === 'syncing' ? 'animate-spin' : ''}`} />
        </button>
        <button
          type="button"
          aria-label="Settings"
          onClick={() => pushSheet({ kind: 'settings' })}
          className="rounded-full p-2 text-muted active:bg-surface-2"
        >
          <Icon name="settings" />
        </button>
      </header>

      <nav className="flex gap-1 border-b border-line bg-surface px-2 py-1.5" aria-label="Calendar view">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => changeView(v.id)}
            aria-pressed={view === v.id}
            className={`flex-1 rounded-lg py-1.5 text-sm font-medium ${
              view === v.id ? 'bg-brand text-white' : 'text-muted active:bg-surface-2'
            }`}
          >
            {v.label}
          </button>
        ))}
      </nav>

      <StatusBanner status={status} onRetry={() => void refresh()} />

      <div className="relative min-h-0 flex-1 bg-surface" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
          initialView={view}
          headerToolbar={false}
          eventDisplay="block"
          height="100%"
          views={{
            timeGrid3Day: { type: 'timeGrid', duration: { days: 3 } },
            // Phone-width month cells: solid coloured bars with the title, no time.
            dayGridMonth: { displayEventTime: false },
          }}
          events={fcEvents}
          nowIndicator
          scrollTime="07:00:00"
          fixedWeekCount={false}
          dayMaxEvents={3}
          moreLinkClick={(arg) => {
            pushSheet({ kind: 'day', date: startOfDay(arg.date) })
            return 'none' // handled by our day sheet
          }}
          eventTimeFormat={{ hour: 'numeric', minute: '2-digit', meridiem: 'short' }}
          slotLabelFormat={{ hour: 'numeric', meridiem: 'short' }}
          dayHeaderFormat={view === 'dayGridMonth' ? { weekday: 'narrow' } : { weekday: 'short', day: 'numeric' }}
          allDayText="All day"
          noEventsText="Nothing scheduled"
          datesSet={(arg: DatesSetArg) => {
            setTitle(arg.view.title)
            setVisibleRange({ start: arg.start, end: arg.end })
            void loadRange(arg.start, arg.end)
          }}
          dateClick={(arg: DateClickArg) => {
            if (arg.view.type === 'dayGridMonth') pushSheet({ kind: 'day', date: startOfDay(arg.date) })
            else pushSheet({ kind: 'new', draft: newDraft(arg.date, arg.allDay) })
          }}
          eventClick={(arg: EventClickArg) => {
            arg.jsEvent.preventDefault()
            openEvent(arg.event.id)
          }}
        />
      </div>

      <button
        type="button"
        aria-label="New event"
        onClick={addEventDefault}
        className="fixed bottom-[max(env(safe-area-inset-bottom),1.25rem)] right-5 z-30 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand text-white shadow-lg active:scale-95"
      >
        <Icon name="plus" className="h-7 w-7" />
      </button>

      {top?.kind === 'day' && (
        <DaySheet
          date={top.date}
          events={events}
          onClose={closeSheet}
          onOpenEvent={openEvent}
          onAddEvent={(d) => {
            const now = new Date()
            const start = d.toDateString() === now.toDateString() ? nextHalfHour(now) : new Date(d.getFullYear(), d.getMonth(), d.getDate(), 9)
            pushSheet({ kind: 'new', draft: newDraft(start) })
          }}
        />
      )}

      {top?.kind === 'event' &&
        (() => {
          const ev = eventById(top.id) ?? top.snapshot
          if (!ev) return null
          const notes = fullNotes[ev.id]
          return (
            <EventDetail
              event={notes === undefined ? ev : { ...ev, notes }}
              onClose={closeSheet}
              onEdit={async () => {
                const text = notes ?? (await loadNotes(ev.id))
                const draft = { ...eventToDraft(ev), notes: text ?? ev.notes }
                pushSheet({ kind: 'edit', id: ev.id, draft, notesEditable: text !== undefined })
              }}
              onDelete={async () => {
                await remove(ev.id)
                closeSheet()
              }}
            />
          )
        })()}

      {top?.kind === 'new' && (
        <EventForm
          mode="new"
          initial={top.draft}
          onClose={closeSheet}
          onSave={async (draft) => {
            await create(draft)
            closeSheet()
          }}
        />
      )}

      {top?.kind === 'edit' && (
        <EventForm
          mode="edit"
          initial={top.draft}
          notesEditable={top.notesEditable}
          onClose={closeSheet}
          onSave={async (draft, notesChanged) => {
            await update(top.id, draft, notesChanged)
            if (notesChanged) setFullNotes((n) => ({ ...n, [top.id]: draft.notes }))
            closeSheet()
          }}
        />
      )}

      {top?.kind === 'settings' && <SettingsSheet name={name} username={username} onClose={closeSheet} />}
    </div>
  )
}

function StatusBanner({ status, onRetry }: { status: SyncStatus; onRetry: () => void }) {
  if (status.kind !== 'offline' && status.kind !== 'error') return null
  const synced = status.lastSynced ? ` (last synced ${fmtTime(status.lastSynced)})` : ''
  return (
    <div
      role="status"
      className={`flex items-center gap-2 px-3 py-2 text-sm ${
        status.kind === 'offline' ? 'bg-surface-2 text-muted' : 'bg-danger-soft text-danger'
      }`}
    >
      <span className="min-w-0 flex-1">
        {status.kind === 'offline'
          ? `Offline: showing your saved calendar${synced}.`
          : `Couldn't sync with Outlook: ${status.message}`}
      </span>
      <button type="button" onClick={onRetry} className="shrink-0 font-medium underline">
        Retry
      </button>
    </div>
  )
}

export type ShowAs = 'free' | 'tentative' | 'busy' | 'oof' | 'workingElsewhere' | 'unknown'

/**
 * An Outlook calendar event, normalised for the app.
 *
 * start/end:
 *  - all-day events: "YYYY-MM-DD" (end is exclusive, i.e. the day after)
 *  - timed events:   ISO-8601 UTC strings
 */
export interface CalEvent {
  id: string
  title: string
  start: string
  end: string
  allDay: boolean
  location: string
  notes: string
  showAs: ShowAs
  categories: string[]
  /** false = someone else's meeting invite; we don't edit those. */
  isOrganizer: boolean
  organizerName: string
  isCancelled: boolean
  /** "occurrence" / "exception" = one instance of a repeating series. */
  type: 'singleInstance' | 'occurrence' | 'exception' | 'seriesMaster'
  webLink: string
}

/** What the event form edits. */
export interface EventDraft {
  title: string
  allDay: boolean
  /** Local Date objects; for all-day events, local midnight and exclusive end. */
  start: Date
  end: Date
  location: string
  notes: string
  showAs: ShowAs
}

export const isRepeating = (e: CalEvent) => e.type === 'occurrence' || e.type === 'exception'

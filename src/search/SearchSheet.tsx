import { useEffect, useMemo, useState } from 'react'
import { describeWhen, eventClasses } from '../calendar/eventDisplay'
import { toDate } from '../calendar/time'
import type { CalEvent } from '../calendar/types'
import { Icon, Sheet } from '../components/Sheet'
import { findFolder, searchDrive, type DriveItem } from '../graph/drive'
import { ItemList } from '../jobs/FilesSheet'
import { StatusBadge } from '../jobs/StatusBadge'
import { JOB_STATUSES, JOBS_ROOT, type JobStatus } from '../jobs/types'
import { searchEvents, type EventFilters } from './searchEvents'
import { loadSearchIndex, type SearchIndex } from './searchIndex'

const MAX_EVENTS = 100
const monthYear = (d: Date) => d.toLocaleDateString([], { month: 'short', year: 'numeric' })

/**
 * One search box for jobs, customers, addresses, notes, job numbers and files.
 * With "Jobs" on and no text it's a job list you can filter by status.
 */
export function SearchSheet({
  onClose,
  onOpenEvent,
  initialJobsOnly = false,
}: {
  onClose: () => void
  onOpenEvent: (event: CalEvent) => void
  initialJobsOnly?: boolean
}) {
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState<EventFilters>({ jobsOnly: initialJobsOnly, status: null, when: 'all' })
  const [index, setIndex] = useState<SearchIndex | null>(null)
  const [fileScope, setFileScope] = useState<'jobs' | 'all'>('jobs')
  const [files, setFiles] = useState<{ q: string; items: DriveItem[] | null; error?: string } | null>(null)

  useEffect(() => {
    loadSearchIndex().then(setIndex)
  }, [])

  const results = useMemo(
    () => (index ? searchEvents(index.events, query, filters) : []),
    [index, query, filters],
  )

  // File search (OneDrive) after a short pause in typing.
  const q = query.trim()
  useEffect(() => {
    if (q.length < 2) return
    let stale = false
    const t = setTimeout(async () => {
      setFiles({ q, items: null })
      try {
        const within = fileScope === 'jobs' ? await findFolder(JOBS_ROOT) : null
        const items = fileScope === 'jobs' && !within ? [] : await searchDrive(q, within ? { driveId: within.driveId, itemId: within.id } : undefined)
        if (!stale) setFiles({ q, items })
      } catch (err) {
        if (!stale)
          setFiles({ q, items: [], error: navigator.onLine ? (err instanceof Error ? err.message : String(err)) : 'File search needs a connection.' })
      }
    }, 450)
    return () => {
      stale = true
      clearTimeout(t)
    }
  }, [q, fileScope])

  const setStatus = (status: JobStatus | null) => setFilters((f) => ({ ...f, status }))
  const chip = (active: boolean) =>
    `shrink-0 rounded-full px-3 py-1.5 text-sm ${active ? 'bg-brand text-white' : 'bg-surface-2 active:bg-line'}`
  const listing = filters.jobsOnly || !!filters.status
  const showEvents = q.length > 0 || listing
  const fileResults = q.length >= 2 && files?.q === q ? files : null

  return (
    <Sheet title="Search" onClose={onClose}>
      <label className="sticky top-0 z-10 mb-3 flex items-center gap-2 rounded-xl border border-line bg-bg px-3 py-2.5 focus-within:border-brand">
        <Icon name="search" className="h-5 w-5 text-muted" />
        <input
          autoFocus
          type="text"
          inputMode="search"
          aria-label="Search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Jobs, customers, addresses, files…"
          className="min-w-0 flex-1 bg-transparent text-base outline-none"
          enterKeyHint="search"
        />
        {query && (
          <button type="button" aria-label="Clear" onClick={() => setQuery('')} className="text-muted">
            <Icon name="close" className="h-4 w-4" />
          </button>
        )}
      </label>

      <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1" role="group" aria-label="Filters">
        <button
          type="button"
          aria-pressed={filters.jobsOnly}
          onClick={() => setFilters((f) => ({ ...f, jobsOnly: !f.jobsOnly, status: f.jobsOnly ? null : f.status }))}
          className={chip(filters.jobsOnly)}
        >
          Jobs only
        </button>
        {(['all', 'upcoming', 'past'] as const).map((w) => (
          <button key={w} type="button" aria-pressed={filters.when === w} onClick={() => setFilters((f) => ({ ...f, when: w }))} className={chip(filters.when === w)}>
            {w === 'all' ? 'Any date' : w === 'upcoming' ? 'Upcoming' : 'Past'}
          </button>
        ))}
      </div>
      {filters.jobsOnly && (
        <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1" role="group" aria-label="Job status">
          <button type="button" aria-pressed={!filters.status} onClick={() => setStatus(null)} className={chip(!filters.status)}>
            Any status
          </button>
          {JOB_STATUSES.map((s) => (
            <button key={s.id} type="button" aria-pressed={filters.status === s.id} onClick={() => setStatus(s.id)} className={chip(filters.status === s.id)}>
              {s.label}
            </button>
          ))}
        </div>
      )}

      {!showEvents && (
        <p className="py-6 text-center text-sm text-muted">
          Search by title, customer, address, notes, job number or status. Turn on <b>Jobs only</b> to list your jobs.
        </p>
      )}

      {showEvents && (
        <section className="mb-5">
          <h3 className="mb-2 flex items-baseline justify-between text-sm font-semibold text-muted">
            <span>{listing && !q ? 'Jobs' : 'Calendar'}</span>
            {index && (
              <span className="font-normal">
                {results.length > MAX_EVENTS ? `${MAX_EVENTS}+` : results.length} result{results.length === 1 ? '' : 's'}
              </span>
            )}
          </h3>
          {!index && <p className="py-4 text-center text-muted">Loading your calendar…</p>}
          {index?.offline && (
            <p className="mb-2 rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">Offline: searching the calendar saved on this phone.</p>
          )}
          {index && results.length === 0 && <p className="py-3 text-center text-sm text-muted">No matching events.</p>}
          <ul className="space-y-1.5">
            {results.slice(0, MAX_EVENTS).map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => onOpenEvent(e)}
                  className="flex w-full items-stretch gap-3 rounded-xl border border-line p-2.5 text-left active:bg-surface-2"
                >
                  <span className={`day-bar w-1.5 shrink-0 rounded-full ${eventClasses(e).join(' ')}`} />
                  <span className="w-14 shrink-0 text-center">
                    <span className="block text-xs uppercase text-muted">{toDate(e.start).toLocaleDateString([], { month: 'short' })}</span>
                    <span className="block text-lg font-semibold leading-tight">{toDate(e.start).getDate()}</span>
                    <span className="block text-[0.65rem] text-muted">{toDate(e.start).getFullYear() !== new Date().getFullYear() ? toDate(e.start).getFullYear() : toDate(e.start).toLocaleDateString([], { weekday: 'short' })}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate font-medium ${e.isCancelled ? 'line-through opacity-60' : ''}`}>{e.title}</span>
                    <span className="block truncate text-sm text-muted">
                      {describeWhen(e)}
                      {e.job?.customer ? ` · ${e.job.customer}` : ''}
                    </span>
                    {e.location && <span className="block truncate text-xs text-muted">{e.location}</span>}
                  </span>
                  {e.job && (
                    <span className="self-center">
                      <StatusBadge status={e.job.status} />
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
          {index && (
            <p className="mt-2 text-center text-xs text-muted">
              Searched {monthYear(index.from)} – {monthYear(index.to)}
            </p>
          )}
        </section>
      )}

      {q.length >= 2 && (
        <section>
          <h3 className="mb-2 flex items-center justify-between text-sm font-semibold text-muted">
            <span>Files</span>
            <span className="flex gap-1">
              {(['jobs', 'all'] as const).map((s) => (
                <button key={s} type="button" aria-pressed={fileScope === s} onClick={() => setFileScope(s)} className={`rounded-full px-2.5 py-1 text-xs font-medium ${fileScope === s ? 'bg-brand text-white' : 'bg-surface-2'}`}>
                  {s === 'jobs' ? 'Job folders' : 'All OneDrive'}
                </button>
              ))}
            </span>
          </h3>
          {!fileResults?.items && <p className="py-3 text-center text-sm text-muted">Searching OneDrive…</p>}
          {fileResults?.error && <p className="rounded-lg bg-surface-2 px-3 py-2 text-sm text-muted">{fileResults.error}</p>}
          {fileResults?.items?.length === 0 && !fileResults.error && <p className="py-3 text-center text-sm text-muted">No matching files.</p>}
          {fileResults?.items && fileResults.items.length > 0 && (
            <ItemList items={fileResults.items} onOpen={(item) => window.open(item.webUrl, '_blank', 'noopener')} />
          )}
        </section>
      )}
    </Sheet>
  )
}

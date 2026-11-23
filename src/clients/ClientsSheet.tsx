import { useEffect, useMemo, useState } from 'react'
import { describeWhen } from '../calendar/eventDisplay'
import { toDate } from '../calendar/time'
import type { CalEvent } from '../calendar/types'
import { Icon, Sheet } from '../components/Sheet'
import { findFolder, toRef, type DriveRef } from '../graph/drive'
import { StatusBadge } from '../jobs/StatusBadge'
import { CLIENTS_ROOT } from '../jobs/types'
import { searchEvents } from '../search/searchEvents'
import { loadSearchIndex, type SearchIndex } from '../search/searchIndex'
import { useClients } from './clients'

/** All clients (folders under View/Clients). */
export function ClientsSheet({
  onClose,
  onOpenClient,
}: {
  onClose: () => void
  onOpenClient: (name: string) => void
}) {
  const { clients } = useClients()
  const [filter, setFilter] = useState('')
  const shown = clients.filter((c) => c.name.toLowerCase().includes(filter.trim().toLowerCase()))

  return (
    <Sheet title="Clients" onClose={onClose}>
      {clients.length > 6 && (
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Find a client"
          aria-label="Find a client"
          className="mb-3 w-full rounded-lg border border-line bg-bg px-3 py-2.5 outline-none focus:border-brand"
        />
      )}
      {clients.length === 0 ? (
        <div className="py-8 text-center text-muted">
          <p>No clients yet.</p>
          <p className="mt-1 text-sm">A client is added the first time you choose it for a job.</p>
        </div>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {shown.map((c) => (
            <li key={c.name}>
              <button
                type="button"
                onClick={() => onOpenClient(c.name)}
                className="flex w-full items-center gap-3 px-3 py-3 text-left active:bg-surface-2"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand/10 font-semibold text-brand">
                  {c.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{c.name}</span>
                  <span className="block text-xs text-muted">
                    {c.jobCount} folder{c.jobCount === 1 ? '' : 's'}
                  </span>
                </span>
                <Icon name="chevronRight" className="h-4 w-4 text-muted" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-center text-xs text-muted">Stored in OneDrive under {CLIENTS_ROOT.join(' / ')}</p>
    </Sheet>
  )
}

/** One client: its jobs on the calendar and its OneDrive folder. */
export function ClientSheet({
  name,
  onClose,
  onOpenEvent,
  onOpenFolder,
  onScheduleJob,
}: {
  name: string
  onClose: () => void
  onOpenEvent: (event: CalEvent) => void
  onOpenFolder: (folder: DriveRef) => void
  onScheduleJob: (client: string) => void
}) {
  const [index, setIndex] = useState<SearchIndex | null>(null)
  const [folder, setFolder] = useState<DriveRef | null | undefined>(undefined)
  const [now] = useState(() => new Date())

  useEffect(() => {
    loadSearchIndex().then(setIndex)
    findFolder([...CLIENTS_ROOT, name]).then(
      (f) => setFolder(f ? toRef(f) : null),
      () => setFolder(null),
    )
  }, [name])

  const jobs = useMemo(() => {
    if (!index) return []
    const key = name.toLowerCase()
    return searchEvents(index.events, '', { jobsOnly: true, status: null, when: 'all' }).filter(
      (e) => e.job?.customer.toLowerCase() === key,
    )
  }, [index, name])
  const upcoming = jobs.filter((j) => toDate(j.end) > now)
  const past = jobs.filter((j) => toDate(j.end) <= now)

  return (
    <Sheet
      title={name}
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          <button
            type="button"
            disabled={!folder}
            onClick={() => folder && onOpenFolder(folder)}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-line py-3 font-medium active:bg-surface-2 disabled:opacity-50"
          >
            <Icon name="folder" /> {folder === undefined ? 'Loading…' : folder ? 'Client folder' : 'No folder yet'}
          </button>
          <button
            type="button"
            onClick={() => onScheduleJob(name)}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand py-3 font-medium text-white active:opacity-90"
          >
            <Icon name="briefcase" /> Schedule job
          </button>
        </div>
      }
    >
      {!index && <p className="py-6 text-center text-muted">Loading jobs…</p>}
      {index && jobs.length === 0 && (
        <p className="py-6 text-center text-sm text-muted">No jobs for {name} in the last six months or the next year.</p>
      )}
      {[
        { label: 'Upcoming', list: upcoming },
        { label: 'Past', list: past },
      ]
        .filter((g) => g.list.length)
        .map((g) => (
          <section key={g.label} className="mb-4">
            <h3 className="mb-2 text-sm font-semibold text-muted">
              {g.label} ({g.list.length})
            </h3>
            <ul className="space-y-1.5">
              {g.list.map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => onOpenEvent(e)}
                    className="flex w-full items-center gap-3 rounded-xl border border-line p-2.5 text-left active:bg-surface-2"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{e.title}</span>
                      <span className="block truncate text-sm text-muted">
                        {toDate(e.start).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })} · {describeWhen(e)}
                      </span>
                    </span>
                    {e.job && <StatusBadge status={e.job.status} />}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      {index?.offline && <p className="text-center text-xs text-muted">Offline: showing the calendar saved on this phone.</p>}
    </Sheet>
  )
}

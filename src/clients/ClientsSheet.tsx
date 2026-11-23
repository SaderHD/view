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
  onOpenFolder: (folder: DriveRef, city: string | null) => void
  onScheduleJob: (client: string) => void
}) {
  const [index, setIndex] = useState<SearchIndex | null>(null)
  const [folder, setFolder] = useState<DriveRef | null | undefined>(undefined)
  const [now] = useState(() => new Date())
  const [city, setCity] = useState<string | null>(null)
  const [cityFolder, setCityFolder] = useState<{ city: string; folder: DriveRef | null } | null>(null)

  useEffect(() => {
    loadSearchIndex().then(setIndex)
    findFolder([...CLIENTS_ROOT, name]).then(
      (f) => setFolder(f ? toRef(f) : null),
      () => setFolder(null),
    )
  }, [name])

  const allJobs = useMemo(() => {
    if (!index) return []
    const key = name.toLowerCase()
    return searchEvents(index.events, '', { jobsOnly: true, status: null, when: 'all' }).filter(
      (e) => e.job?.customer.toLowerCase() === key,
    )
  }, [index, name])

  // The client's cities (from its jobs), most-used first.
  const cities = useMemo(() => {
    const count = new Map<string, number>()
    for (const e of allJobs) for (const c of e.job?.cities ?? []) count.set(c, (count.get(c) ?? 0) + 1)
    return [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([c]) => c)
  }, [allJobs])

  const jobs = city ? allJobs.filter((e) => e.job?.cities.some((c) => c.toLowerCase() === city.toLowerCase())) : allJobs

  // The selected city's folder (View/Clients/<client>/<city>).
  useEffect(() => {
    if (!city) return
    let stale = false
    findFolder([...CLIENTS_ROOT, name, city]).then(
      (f) => !stale && setCityFolder({ city, folder: f ? toRef(f) : null }),
      () => !stale && setCityFolder({ city, folder: null }),
    )
    return () => {
      stale = true
    }
  }, [city, name])
  const shownFolder = city ? (cityFolder?.city === city ? cityFolder.folder : undefined) : folder
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
            disabled={!shownFolder}
            onClick={() => shownFolder && onOpenFolder(shownFolder, city)}
            className="flex flex-1 items-center justify-center gap-2 truncate rounded-xl border border-line px-2 py-3 font-medium active:bg-surface-2 disabled:opacity-50"
          >
            <Icon name="folder" />{' '}
            {shownFolder === undefined ? 'Loading…' : shownFolder ? (city ? `${city} folder` : 'Client folder') : 'No folder yet'}
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
      {cities.length > 0 && (
        <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1" role="group" aria-label="Filter by city">
          {[null, ...cities].map((c) => (
            <button
              key={c ?? '__all'}
              type="button"
              aria-pressed={city === c}
              onClick={() => setCity(c)}
              className={`flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-sm ${city === c ? 'bg-brand text-white' : 'bg-surface-2 active:bg-line'}`}
            >
              {c && <Icon name="pin" className="h-3.5 w-3.5" />}
              {c ?? 'All locations'}
            </button>
          ))}
        </div>
      )}
      {!index && <p className="py-6 text-center text-muted">Loading jobs…</p>}
      {index && jobs.length === 0 && (
        <p className="py-6 text-center text-sm text-muted">
          No jobs for {name}
          {city ? ` in ${city}` : ''} in the last six months or the next year.
        </p>
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
                      {!!e.job?.cities.length && <span className="block truncate text-xs text-muted">{e.job.cities.join(' → ')}</span>}
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

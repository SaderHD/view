import { useState } from 'react'
import { Icon } from '../components/Sheet'
import type { DriveRef } from '../graph/drive'
import { JOB_STATUSES, type JobInfo, type JobStatus } from './types'

/** The "Job" part of the event details sheet. */
export function JobSection({
  job,
  editable,
  onMakeJob,
  onOpenFolder,
  onOpenLink,
  onAttach,
  onChangeFolder,
  onRemoveLink,
  onStatus,
  onRemoveJob,
  onOpenClient,
}: {
  onOpenClient: (client: string) => void
  /** undefined = still loading */
  job: JobInfo | null | undefined
  editable: boolean
  onMakeJob: () => void
  onOpenFolder: (folder: DriveRef) => void
  onOpenLink: (link: DriveRef) => void
  onAttach: () => void
  onChangeFolder: () => void
  onRemoveLink: (link: DriveRef) => Promise<void>
  onStatus: (status: JobStatus) => Promise<void>
  onRemoveJob: () => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmRemove, setConfirmRemove] = useState(false)

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  if (job === undefined) {
    return <div className="mt-5 h-24 animate-pulse rounded-xl bg-surface-2" aria-label="Loading job" />
  }

  if (job === null) {
    if (!editable) return null
    return (
      <button
        type="button"
        onClick={onMakeJob}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-brand py-3 font-medium text-brand active:bg-surface-2"
      >
        <Icon name="briefcase" /> Make this a job (adds a OneDrive folder)
      </button>
    )
  }

  return (
    <section className="mt-5 rounded-xl border border-line p-3">
      <div className="mb-3 flex items-center gap-2">
        <Icon name="briefcase" className="h-5 w-5 text-brand" />
        <h3 className="flex-1 font-semibold">Job {job.jobId}</h3>
        {job.customer && (
          <button
            type="button"
            onClick={() => onOpenClient(job.customer)}
            className="flex min-w-0 items-center gap-1 truncate rounded-full bg-surface-2 px-2.5 py-1 text-sm active:bg-line"
          >
            <Icon name="person" className="h-3.5 w-3.5 shrink-0 text-muted" />
            <span className="truncate">{job.customer}</span>
          </button>
        )}
      </div>
      {job.cities.length > 0 && (
        <p className="-mt-1 mb-3 flex items-center gap-1.5 text-sm text-muted">
          <Icon name="pin" className="h-3.5 w-3.5 shrink-0" />
          {job.cities.join(' → ')}
        </p>
      )}

      <div className="mb-3 flex gap-1 overflow-x-auto pb-1" role="radiogroup" aria-label="Job status">
        {JOB_STATUSES.map((s) => (
          <button
            key={s.id}
            type="button"
            role="radio"
            aria-checked={job.status === s.id}
            disabled={busy || !editable}
            onClick={() => void run(() => onStatus(s.id))}
            className={`shrink-0 rounded-full px-3 py-1 text-sm ${
              job.status === s.id ? 'bg-brand text-white' : 'bg-surface-2 text-muted active:bg-line'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {job.folder ? (
        <button
          type="button"
          onClick={() => onOpenFolder(job.folder!)}
          className="flex w-full items-center gap-3 rounded-xl bg-brand px-3 py-3 text-left text-white active:opacity-90"
        >
          <Icon name="folder" />
          <span className="min-w-0 flex-1">
            <span className="block font-medium">Job files</span>
            <span className="block truncate text-xs opacity-80">{job.folder.name}</span>
          </span>
          <Icon name="chevronRight" />
        </button>
      ) : (
        <p className="rounded-lg bg-surface-2 px-3 py-2 text-sm text-muted">No folder linked.</p>
      )}

      {job.links.length > 0 && (
        <ul className="mt-3 space-y-1">
          {job.links.map((l) => (
            <li key={l.itemId} className="flex items-center gap-2 rounded-lg bg-surface-2 pl-3">
              <Icon name={l.isFolder ? 'folder' : 'link'} className="h-4 w-4 shrink-0 text-muted" />
              <button type="button" onClick={() => onOpenLink(l)} className="min-w-0 flex-1 truncate py-2 text-left text-sm">
                {l.name}
              </button>
              {editable && (
                <button
                  type="button"
                  aria-label={`Remove ${l.name}`}
                  disabled={busy}
                  onClick={() => void run(() => onRemoveLink(l))}
                  className="p-2 text-muted active:text-danger"
                >
                  <Icon name="close" className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {editable && (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <button type="button" onClick={onAttach} className="py-1 font-medium text-brand">
            + Attach from OneDrive
          </button>
          <button type="button" onClick={onChangeFolder} className="py-1 text-brand">
            {job.folder ? 'Change folder' : 'Link a folder'}
          </button>
          {confirmRemove ? (
            <span className="flex items-center gap-2 py-1">
              <span className="text-muted">Remove job? Files stay in OneDrive.</span>
              <button type="button" disabled={busy} onClick={() => void run(onRemoveJob)} className="font-medium text-danger">
                Remove
              </button>
              <button type="button" onClick={() => setConfirmRemove(false)} className="text-muted">
                Keep
              </button>
            </span>
          ) : (
            <button type="button" onClick={() => setConfirmRemove(true)} className="py-1 text-muted">
              Remove job
            </button>
          )}
        </div>
      )}

      {error && <p className="mt-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
    </section>
  )
}

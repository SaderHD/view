import { useEffect, useMemo, useState } from 'react'
import { byStart } from '../calendar/eventDisplay'
import { addDays, fmtDayShort, startOfDay, toDate } from '../calendar/time'
import type { CalEvent } from '../calendar/types'
import { Icon, Sheet } from '../components/Sheet'
import { listEvents } from '../graph/calendar'
import { listChildren, type DriveItem } from '../graph/drive'
import { db, SHARED } from '../storage/db'
import { getCachedEvents } from '../storage/eventCache'
import { enqueue } from './queue'
import { formatSize } from './format'

interface SharedFile {
  id: string
  name: string
  type: string
  blob: Blob
  receivedAt: number
}

async function loadShared(): Promise<SharedFile[]> {
  const all: SharedFile[] = await (await db()).getAll(SHARED)
  return all.sort((a, b) => a.receivedAt - b.receivedAt)
}

async function clearShared(ids: string[]) {
  const tx = (await db()).transaction(SHARED, 'readwrite')
  for (const id of ids) await tx.store.delete(id)
  await tx.done
}

/** Jobs from a month back to two months ahead: today first, then upcoming, then recent. */
async function loadJobs(): Promise<CalEvent[]> {
  const today = startOfDay(new Date())
  const start = addDays(today, -30)
  const end = addDays(today, 60)
  let events: CalEvent[]
  try {
    events = await listEvents(start, end)
  } catch {
    events = await getCachedEvents(start, end)
  }
  const jobs = events.filter((e) => e.job?.folder)
  const tomorrow = addDays(today, 1)
  const todays = jobs.filter((e) => toDate(e.start) >= today && toDate(e.start) < tomorrow).sort(byStart)
  const upcoming = jobs.filter((e) => toDate(e.start) >= tomorrow).sort(byStart)
  const past = jobs.filter((e) => toDate(e.start) < today).sort((a, b) => byStart(b, a))
  return [...todays, ...upcoming, ...past]
}

/** Opened after "Share → View" in another app: choose the job and folder for the files. */
export function ShareSheet({ onClose, onQueued }: { onClose: () => void; onQueued: (count: number) => void }) {
  const [files, setFiles] = useState<SharedFile[] | null>(null)
  const [jobs, setJobs] = useState<CalEvent[] | null>(null)
  const [filter, setFilter] = useState('')
  const [jobId, setJobId] = useState<string | null>(null)
  const [folders, setFolders] = useState<DriveItem[] | null>(null)
  const [folderId, setFolderId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadShared().then(setFiles, () => setFiles([]))
    loadJobs().then(setJobs, (err: unknown) => setError(err instanceof Error ? err.message : String(err)))
  }, [])

  const previews = useMemo(
    () => new Map((files ?? []).filter((f) => f.type.startsWith('image/')).map((f) => [f.id, URL.createObjectURL(f.blob)])),
    [files],
  )
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews])

  const job = jobs?.find((j) => j.id === jobId)

  // When a job is chosen, offer its subfolders; default photos → "Photos".
  useEffect(() => {
    const folder = job?.job?.folder
    if (!folder) return
    let stale = false
    listChildren(folder.driveId, folder.itemId)
      .then((items) => {
        if (stale) return
        const subs = items.filter((i) => i.isFolder)
        setFolders(subs)
        const allImages = (files ?? []).every((f) => f.type.startsWith('image/'))
        const photos = subs.find((s) => s.name.toLowerCase() === 'photos')
        setFolderId(allImages && photos ? photos.id : folder.itemId)
      })
      .catch(() => {
        if (stale) return
        setFolders([]) // offline: upload to the job folder itself
        setFolderId(folder.itemId)
      })
    return () => {
      stale = true
    }
  }, [job, files])

  const shownJobs = (jobs ?? []).filter((j) => {
    const q = filter.trim().toLowerCase()
    return !q || j.title.toLowerCase().includes(q) || (j.job?.customer ?? '').toLowerCase().includes(q)
  })

  async function save() {
    const folder = job?.job?.folder
    if (!folder || !files?.length || !folderId) return
    setSaving(true)
    try {
      const sub = folders?.find((f) => f.id === folderId)
      await enqueue(
        files.map((f) => ({ blob: f.blob, name: f.name })),
        { driveId: folder.driveId, parentId: folderId, label: sub ? `${job.title} › ${sub.name}` : job.title },
      )
      await clearShared(files.map((f) => f.id))
      onQueued(files.length)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setSaving(false)
    }
  }

  async function discard() {
    if (files) await clearShared(files.map((f) => f.id))
    onClose()
  }

  return (
    <Sheet
      title={files ? `Save ${files.length} shared file${files.length === 1 ? '' : 's'}` : 'Shared files'}
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          <button type="button" onClick={() => void discard()} className="rounded-xl border border-line px-4 py-3 font-medium text-muted">
            Discard
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || !job || !folderId || !files?.length}
            className="flex-1 rounded-xl bg-brand py-3 font-medium text-white disabled:opacity-50"
          >
            {saving ? 'Saving…' : job ? 'Upload to job' : 'Choose a job'}
          </button>
        </div>
      }
    >
      {files?.length === 0 && <p className="py-6 text-center text-muted">Nothing was received. Try sharing again.</p>}

      {files && files.length > 0 && (
        <ul className="mb-4 flex gap-2 overflow-x-auto pb-1">
          {files.map((f) => (
            <li key={f.id} className="w-20 shrink-0 text-center">
              {previews.get(f.id) ? (
                <img src={previews.get(f.id)} alt="" className="h-20 w-20 rounded-lg object-cover" />
              ) : (
                <span className="flex h-20 w-20 items-center justify-center rounded-lg bg-surface-2 text-muted">
                  <Icon name="file" className="h-8 w-8" />
                </span>
              )}
              <span className="mt-1 block truncate text-xs">{f.name}</span>
              <span className="block text-[0.65rem] text-muted">{formatSize(f.blob.size)}</span>
            </li>
          ))}
        </ul>
      )}

      <p className="mb-1 text-sm font-medium text-muted">Job</p>
      <input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Search jobs"
        className="mb-2 w-full rounded-lg border border-line bg-bg px-3 py-2 outline-none focus:border-brand"
      />
      {jobs === null && !error && <p className="py-4 text-center text-muted">Loading jobs…</p>}
      {jobs?.length === 0 && (
        <p className="rounded-lg bg-surface-2 px-3 py-2 text-sm text-muted">
          No jobs in the last month or next two months. Open an event and tap “Make this a job” first.
        </p>
      )}
      <ul className="max-h-64 space-y-1 overflow-y-auto" role="radiogroup" aria-label="Job">
        {shownJobs.map((j) => (
          <li key={j.id}>
            <button
              type="button"
              role="radio"
              aria-checked={j.id === jobId}
              onClick={() => {
                setJobId(j.id)
                setFolders(null)
                setFolderId(null)
              }}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left ${
                j.id === jobId ? 'bg-brand text-white' : 'active:bg-surface-2'
              }`}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{j.title}</span>
                <span className={`block text-xs ${j.id === jobId ? 'opacity-80' : 'text-muted'}`}>
                  {fmtDayShort(toDate(j.start))}
                  {j.job?.customer ? ` · ${j.job.customer}` : ''}
                </span>
              </span>
              {j.id === jobId && <Icon name="check" />}
            </button>
          </li>
        ))}
      </ul>

      {job?.job?.folder && (
        <>
          <p className="mb-1 mt-4 text-sm font-medium text-muted">Folder</p>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Folder">
            {[{ id: job.job.folder.itemId, name: 'Job folder' }, ...(folders ?? [])].map((f) => (
              <button
                key={f.id}
                type="button"
                role="radio"
                aria-checked={folderId === f.id}
                onClick={() => setFolderId(f.id)}
                className={`rounded-full px-3 py-1.5 text-sm ${folderId === f.id ? 'bg-brand text-white' : 'bg-surface-2'}`}
              >
                {f.name}
              </button>
            ))}
            {folders === null && <span className="py-1.5 text-sm text-muted">Loading folders…</span>}
          </div>
        </>
      )}

      {error && <p className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
    </Sheet>
  )
}

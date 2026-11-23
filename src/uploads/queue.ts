import { useEffect, useState } from 'react'
import { GraphError } from '../graph/client'
import { uploadFile, type DriveItem } from '../graph/drive'
import { db, UPLOADS } from '../storage/db'

/**
 * Upload queue. Files are saved on the phone first (IndexedDB) and then sent
 * to OneDrive one at a time. With no signal they wait and go automatically
 * when you're back online (while the app is open).
 */

export interface UploadDest {
  driveId: string
  parentId: string
  /** Shown in the queue, e.g. "Smith – Roof › Receipts". */
  label: string
}

export interface UploadTask extends UploadDest {
  id: string
  name: string
  size: number
  blob: Blob
  status: 'pending' | 'uploading' | 'failed'
  progress: number
  error?: string
  createdAt: number
}

type Listener = () => void
const listeners = new Set<Listener>()
const uploadedListeners = new Set<(parentId: string, item: DriveItem) => void>()
let snapshot: UploadTask[] = []
let running = false

async function load(): Promise<UploadTask[]> {
  try {
    const all: UploadTask[] = await (await db()).getAll(UPLOADS)
    return all.sort((a, b) => a.createdAt - b.createdAt)
  } catch {
    return []
  }
}

async function refreshSnapshot() {
  snapshot = await load()
  listeners.forEach((l) => l())
}

async function save(task: UploadTask) {
  await (await db()).put(UPLOADS, task)
  await refreshSnapshot()
}

/** Add files to the queue and start uploading. */
export async function enqueue(files: { blob: Blob; name: string }[], dest: UploadDest): Promise<void> {
  const d = await db()
  const now = Date.now()
  for (const [i, f] of files.entries()) {
    const task: UploadTask = {
      ...dest,
      id: crypto.randomUUID(),
      name: f.name,
      size: f.blob.size,
      blob: f.blob,
      status: 'pending',
      progress: 0,
      createdAt: now + i,
    }
    await d.put(UPLOADS, task)
  }
  await refreshSnapshot()
  void processQueue()
}

export async function retry(id: string) {
  const task = snapshot.find((t) => t.id === id)
  if (!task) return
  await save({ ...task, status: 'pending', error: undefined, progress: 0 })
  void processQueue()
}

export async function retryAll() {
  for (const t of snapshot.filter((t) => t.status === 'failed')) {
    await (await db()).put(UPLOADS, { ...t, status: 'pending', error: undefined, progress: 0 })
  }
  await refreshSnapshot()
  void processQueue()
}

export async function cancel(id: string) {
  await (await db()).delete(UPLOADS, id)
  await refreshSnapshot()
}

const isNetworkError = (err: unknown) => err instanceof TypeError || !navigator.onLine

/** Upload pending files one by one. Safe to call any time; only one run at a time. */
export async function processQueue(): Promise<void> {
  if (running) return
  running = true
  try {
    for (;;) {
      if (!navigator.onLine) return
      const next = (await load()).find((t) => t.status === 'pending')
      if (!next) return
      await save({ ...next, status: 'uploading', progress: 0 })
      let lastPaint = 0
      try {
        const item = await uploadFile(next.driveId, next.parentId, next.name, next.blob, (p) => {
          // Update the progress bar at most ~5 times a second.
          if (Date.now() - lastPaint > 200 || p === 1) {
            lastPaint = Date.now()
            snapshot = snapshot.map((t) => (t.id === next.id ? { ...t, progress: p } : t))
            listeners.forEach((l) => l())
          }
        })
        await (await db()).delete(UPLOADS, next.id)
        await refreshSnapshot()
        uploadedListeners.forEach((l) => l(next.parentId, item))
      } catch (err) {
        if (isNetworkError(err)) {
          await save({ ...next, status: 'pending', progress: 0 })
          return // wait for the 'online' event
        }
        const message =
          err instanceof GraphError ? `${err.message} (${err.code})` : err instanceof Error ? err.message : String(err)
        await save({ ...next, status: 'failed', progress: 0, error: message })
      }
    }
  } finally {
    running = false
  }
}

/** Call once at startup: resumes anything interrupted last time. */
let started = false
export async function startQueue() {
  if (started) return
  started = true
  const tasks = await load()
  for (const t of tasks.filter((t) => t.status === 'uploading')) {
    await (await db()).put(UPLOADS, { ...t, status: 'pending', progress: 0 })
  }
  await refreshSnapshot()
  window.addEventListener('online', () => void processQueue())
  void processQueue()
}

/** Live list of queued uploads. */
export function useUploadQueue(): UploadTask[] {
  const [tasks, setTasks] = useState(snapshot)
  useEffect(() => {
    const l = () => setTasks(snapshot)
    listeners.add(l)
    l()
    return () => {
      listeners.delete(l)
    }
  }, [])
  return tasks
}

/** Run a callback whenever a file finishes uploading (e.g. to refresh a folder view). */
export function useOnUploaded(cb: (parentId: string, item: DriveItem) => void) {
  useEffect(() => {
    uploadedListeners.add(cb)
    return () => {
      uploadedListeners.delete(cb)
    }
  }, [cb])
}

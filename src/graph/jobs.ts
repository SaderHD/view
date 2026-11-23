import { dateKey, toDate } from '../calendar/time'
import type { CalEvent } from '../calendar/types'
import { JOB_SUBFOLDERS, JOBS_ROOT, newJobId, type JobInfo, type JobStatus } from '../jobs/types'
import { graph, GraphError } from './client'
import { createFolder, ensureFolderPath, toRef, type DriveRef } from './drive'

/** Open-extension name used to store job info on Outlook events. */
export const JOB_EXT = 'com.saderhd.view.job'
/** How Graph identifies the extension in $expand/$filter. */
export const JOB_EXT_ID = `Microsoft.OutlookServices.OpenTypeExtension.${JOB_EXT}`

/** Raw extension as stored (all strings, so nothing depends on Graph's JSON typing). */
interface JobExt {
  id?: string
  extensionName?: string
  jobId?: string
  customer?: string
  status?: string
  folderJson?: string
  linksJson?: string
}

function parseJson<T>(s: string | undefined, fallback: T): T {
  try {
    return s ? (JSON.parse(s) as T) : fallback
  } catch {
    return fallback
  }
}

export function parseJobExt(ext: JobExt | undefined): JobInfo | null {
  if (!ext?.jobId) return null
  return {
    jobId: ext.jobId,
    customer: ext.customer ?? '',
    status: (ext.status as JobStatus) || 'scheduled',
    folder: parseJson<DriveRef | null>(ext.folderJson, null),
    links: parseJson<DriveRef[]>(ext.linksJson, []),
  }
}

/** Pick our extension out of an event's expanded extensions list. */
export function jobFromExtensions(exts: JobExt[] | undefined): JobInfo | null {
  const ext = exts?.find((e) => e.extensionName === JOB_EXT || e.id === JOB_EXT_ID || e.id?.endsWith(JOB_EXT))
  return parseJobExt(ext)
}

const extPath = (eventId: string) => `/me/events/${encodeURIComponent(eventId)}/extensions`

/** Job info for one event, fresh from Outlook (null = not a job). */
export async function getJob(eventId: string): Promise<JobInfo | null> {
  try {
    return parseJobExt(await graph<JobExt>(`${extPath(eventId)}/${JOB_EXT}`))
  } catch (err) {
    if (err instanceof GraphError && err.status === 404) return null
    throw err
  }
}

/** Create or replace the job info on an event. */
export async function saveJob(eventId: string, job: JobInfo, exists: boolean): Promise<void> {
  const body = {
    '@odata.type': '#microsoft.graph.openTypeExtension',
    extensionName: JOB_EXT,
    jobId: job.jobId,
    customer: job.customer,
    status: job.status,
    folderJson: JSON.stringify(job.folder),
    linksJson: JSON.stringify(job.links),
  }
  if (exists) {
    await graph(`${extPath(eventId)}/${JOB_EXT}`, { method: 'PATCH', body: JSON.stringify(body) })
  } else {
    await graph(extPath(eventId), { method: 'POST', body: JSON.stringify(body) })
  }
}

/** Remove job info (the OneDrive folder and files are left untouched). */
export async function removeJob(event: CalEvent): Promise<void> {
  await graph(`${extPath(event.id)}/${JOB_EXT}`, { method: 'DELETE' })
  const categories = event.categories.filter((c) => c.toLowerCase() !== 'job')
  await graph(`/me/events/${encodeURIComponent(event.id)}`, { method: 'PATCH', body: JSON.stringify({ categories }) })
}

/** "2026-11-24 - Smith - Roof inspection" */
export function jobFolderName(event: Pick<CalEvent, 'start' | 'title'>, customer: string): string {
  const parts = [dateKey(toDate(event.start)), customer.trim(), event.title.trim()].filter(Boolean)
  return parts.join(' - ')
}

/** Create a job folder (with Reports / Receipts / Photos) under View/Jobs. */
export async function createJobFolder(name: string): Promise<DriveRef> {
  const root = await ensureFolderPath(JOBS_ROOT)
  const folder = await createFolder(root.driveId, root.id, name, 'rename')
  await Promise.all(JOB_SUBFOLDERS.map((sub) => createFolder(folder.driveId, folder.id, sub, 'fail').catch(() => null)))
  return toRef(folder)
}

/**
 * Turn an event into a job: create (or use) a folder, store the job info on
 * the event and tag it with the "Job" category.
 * Returns the job and the event's new categories.
 */
export async function makeJob(
  event: CalEvent,
  options: { customer: string; existingFolder?: DriveRef; jobId?: string },
): Promise<{ job: JobInfo; categories: string[] }> {
  const folder = options.existingFolder ?? (await createJobFolder(jobFolderName(event, options.customer)))
  const job: JobInfo = {
    jobId: options.jobId ?? newJobId(toDate(event.start)),
    customer: options.customer.trim(),
    status: 'scheduled',
    folder,
    links: [],
  }
  await saveJob(event.id, job, false)
  const categories = event.categories.some((c) => c.toLowerCase() === 'job') ? event.categories : [...event.categories, 'Job']
  await graph(`/me/events/${encodeURIComponent(event.id)}`, { method: 'PATCH', body: JSON.stringify({ categories }) })
  return { job, categories }
}

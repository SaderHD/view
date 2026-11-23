import { toDate } from '../calendar/time'
import type { CalEvent } from '../calendar/types'
import { ensureClientFolder, getClients, matchClient } from '../clients/clients'
import { JOB_SUBFOLDERS, newJobId, type JobInfo, type JobStatus } from '../jobs/types'
import { graph, GraphError } from './client'
import { createFolder, toRef, type DriveRef } from './drive'

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

/** A job's folder is named after the job, e.g. "Generator repair". */
export function jobFolderName(title: string): string {
  return title.trim() || 'New job'
}

/**
 * Create a job folder inside its client's folder (with Reports / Receipts /
 * Photos): View/Clients/<client>/<job title>/. If the client already has a
 * job with that name, OneDrive adds a number ("Generator repair 1").
 */
export async function createJobFolder(client: string, title: string): Promise<DriveRef> {
  const clientFolder = await ensureClientFolder(client)
  const folder = await createFolder(clientFolder.driveId, clientFolder.id, jobFolderName(title), 'rename')
  await Promise.all(JOB_SUBFOLDERS.map((sub) => createFolder(folder.driveId, folder.id, sub, 'fail').catch(() => null)))
  return toRef(folder)
}

/**
 * Turn an event into a job for a client: create (or use) a folder, store the job info on
 * the event and tag it with the "Job" category.
 * Returns the job and the event's new categories.
 */
export async function makeJob(
  event: CalEvent,
  options: { client: string; existingFolder?: DriveRef; jobId?: string; folderTitle?: string },
): Promise<{ job: JobInfo; categories: string[] }> {
  // Use an existing client's exact spelling when the typed name matches one.
  const client = matchClient(options.client, getClients())
  const folder = options.existingFolder ?? (await createJobFolder(client, options.folderTitle ?? event.title))
  const job: JobInfo = {
    jobId: options.jobId ?? newJobId(toDate(event.start)),
    customer: client,
    status: 'scheduled',
    folder,
    links: [],
  }
  await saveJob(event.id, job, false)
  const categories = event.categories.some((c) => c.toLowerCase() === 'job') ? event.categories : [...event.categories, 'Job']
  await graph(`/me/events/${encodeURIComponent(event.id)}`, { method: 'PATCH', body: JSON.stringify({ categories }) })
  return { job, categories }
}

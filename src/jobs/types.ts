import type { DriveRef } from '../graph/drive'

export type JobStatus = 'lead' | 'scheduled' | 'in-progress' | 'done' | 'invoiced'

export const JOB_STATUSES: { id: JobStatus; label: string }[] = [
  { id: 'lead', label: 'Lead' },
  { id: 'scheduled', label: 'Scheduled' },
  { id: 'in-progress', label: 'In progress' },
  { id: 'done', label: 'Done' },
  { id: 'invoiced', label: 'Invoiced' },
]

/**
 * Job info, stored on the Outlook event as a hidden open extension
 * (com.saderhd.view.job). Outlook keeps it with the event; other apps ignore it.
 */
export interface JobInfo {
  jobId: string
  /** The client's name (stored as "customer" for compatibility). Matches its folder under View/Clients. */
  customer: string
  status: JobStatus
  /**
   * Cities the job takes place in, in visiting order. A job can cover several
   * locations of the same client (e.g. clean Austin, then Dallas). The job's
   * folder lives under the first city.
   */
  cities: string[]
  /** The job's OneDrive folder. */
  folder: DriveRef | null
  /** Extra OneDrive files/folders attached to the job (left where they are). */
  links: DriveRef[]
}

/** Folders created inside every new job folder. */
export const JOB_SUBFOLDERS = ['Reports', 'Receipts', 'Photos']

/**
 * Where client folders live in your OneDrive. Jobs are organized by client,
 * then city: View/Clients/<client>/<city>/<job title>/
 * (no city → View/Clients/<client>/<job title>/)
 */
export const CLIENTS_ROOT = ['View', 'Clients']

/** Used when a job has no client. */
export const GENERAL_CLIENT = 'General'

/** Short, readable job number, e.g. "J-261124-K7Q". */
export function newJobId(date: Date): string {
  const y = String(date.getFullYear()).slice(2)
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const rand = Array.from(crypto.getRandomValues(new Uint8Array(3)))
    .map((b) => 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'[b % 31])
    .join('')
  return `J-${y}${m}${d}-${rand}`
}

import { JOB_STATUSES, type JobStatus } from './types'

const TONE: Record<JobStatus, string> = {
  lead: 'bg-surface-2 text-muted',
  scheduled: 'bg-brand/15 text-brand',
  'in-progress': 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  done: 'bg-ok-soft text-ok',
  invoiced: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
}

export function StatusBadge({ status }: { status: JobStatus }) {
  return (
    <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${TONE[status]}`}>
      {JOB_STATUSES.find((s) => s.id === status)?.label ?? status}
    </span>
  )
}

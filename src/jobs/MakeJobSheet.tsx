import { useState } from 'react'
import { Icon, Sheet } from '../components/Sheet'
import { jobFolderName } from '../graph/jobs'
import type { CalEvent } from '../calendar/types'
import { JOB_SUBFOLDERS, JOBS_ROOT } from './types'

/** Turn an event into a job: customer name + new or existing folder. */
export function MakeJobSheet({
  event,
  onClose,
  onCreate,
  onUseExisting,
}: {
  event: CalEvent
  onClose: () => void
  /** Create a new folder for the job. */
  onCreate: (customer: string) => Promise<void>
  /** Open the OneDrive picker to use an existing folder. */
  onUseExisting: (customer: string) => void
}) {
  const [customer, setCustomer] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function create() {
    setBusy(true)
    setError(null)
    try {
      await onCreate(customer)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  const folderPath = [...JOBS_ROOT, jobFolderName(event, customer)].join(' / ')

  return (
    <Sheet
      title="Make this a job"
      onClose={onClose}
      footer={
        <div className="space-y-2">
          {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
          <button
            type="button"
            onClick={() => void create()}
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-3 font-medium text-white disabled:opacity-60"
          >
            <Icon name="folderPlus" /> {busy ? 'Creating folder…' : 'Create job folder'}
          </button>
          <button
            type="button"
            onClick={() => onUseExisting(customer)}
            disabled={busy}
            className="w-full rounded-xl border border-line py-3 font-medium active:bg-surface-2"
          >
            Use an existing OneDrive folder
          </button>
        </div>
      }
    >
      <p className="mb-1 text-sm font-medium text-muted">Customer (optional)</p>
      <input
        value={customer}
        onChange={(e) => setCustomer(e.target.value)}
        placeholder="e.g. Smith"
        autoFocus
        className="mb-4 w-full rounded-lg border border-line bg-bg px-3 py-2.5 outline-none focus:border-brand"
      />
      <p className="text-sm text-muted">New folder:</p>
      <p className="mb-1 break-words rounded-lg bg-surface-2 px-3 py-2 text-sm">{folderPath}</p>
      <p className="text-xs text-muted">With subfolders {JOB_SUBFOLDERS.join(', ')}.</p>
    </Sheet>
  )
}

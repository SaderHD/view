import { useState } from 'react'
import { Icon, Sheet } from '../components/Sheet'
import { CitiesInput } from '../clients/CityPicker'
import { ClientPicker } from '../clients/ClientPicker'
import { getClients, matchClient } from '../clients/clients'
import { safeName } from '../graph/drive'
import { jobFolderName } from '../graph/jobs'
import { useSettings } from '../settings/store'
import type { CalEvent } from '../calendar/types'
import { CLIENTS_ROOT, JOB_SUBFOLDERS } from './types'

/** Turn an event into a job: pick the client and city (or cities), then a new or existing folder. */
export function MakeJobSheet({
  event,
  onClose,
  onCreate,
  onUseExisting,
}: {
  event: CalEvent
  onClose: () => void
  /** Create a new folder for the job. */
  onCreate: (client: string, cities: string[]) => Promise<void>
  /** Open the OneDrive picker to use an existing folder. */
  onUseExisting: (client: string, cities: string[]) => void
}) {
  const [client, setClient] = useState('')
  const { settings } = useSettings()
  // If the event's location is a city you've used before, start with it.
  const [cities, setCities] = useState<string[]>(() => {
    const loc = event.location.trim().toLowerCase()
    const known = settings.cities.find((c) => c.toLowerCase() === loc)
    return [known ?? '']
  })
  const filled = cities.map((c) => c.trim()).filter(Boolean)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function create() {
    setBusy(true)
    setError(null)
    try {
      await onCreate(client, filled)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  const folderPath = [...CLIENTS_ROOT, matchClient(client, getClients()), ...(filled[0] ? [safeName(filled[0])] : []), jobFolderName(event.title)].join(' / ')

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
            onClick={() => onUseExisting(client, filled)}
            disabled={busy}
            className="w-full rounded-xl border border-line py-3 font-medium active:bg-surface-2"
          >
            Use an existing OneDrive folder
          </button>
        </div>
      }
    >
      <p className="mb-1 text-sm font-medium text-muted">Client</p>
      <div className="mb-4">
        <ClientPicker value={client} onChange={setClient} autoFocus />
      </div>
      <p className="mb-1 text-sm font-medium text-muted">Location</p>
      <div className="mb-4">
        <CitiesInput cities={cities} onChange={setCities} />
        {event.location && !filled.length && <p className="mt-1 text-xs text-muted">Event location: {event.location}</p>}
      </div>
      <p className="text-sm text-muted">New folder:</p>
      <p className="mb-1 break-words rounded-lg bg-surface-2 px-3 py-2 text-sm">{folderPath}</p>
      <p className="text-xs text-muted">With subfolders {JOB_SUBFOLDERS.join(', ')}.</p>
    </Sheet>
  )
}

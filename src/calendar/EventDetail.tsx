import { useState, type ReactNode } from 'react'
import { Icon, Sheet, type IconName } from '../components/Sheet'
import { describeWhen, SHOW_AS_LABEL } from './eventDisplay'
import { fmtDayLong, toDate } from './time'
import { isRepeating, type CalEvent } from './types'

export function EventDetail({
  event,
  onClose,
  onEdit,
  onDelete,
}: {
  event: CalEvent
  onClose: () => void
  onEdit: () => void
  onDelete: () => Promise<void>
}) {
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const editable = event.isOrganizer

  async function handleDelete() {
    setDeleting(true)
    setError(null)
    try {
      await onDelete()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setDeleting(false)
      setConfirming(false)
    }
  }

  const mapsUrl = event.location
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.location)}`
    : null

  return (
    <Sheet
      title={<span className={event.isCancelled ? 'line-through opacity-60' : ''}>{event.title}</span>}
      onClose={onClose}
      footer={
        editable ? (
          confirming ? (
            <div className="space-y-2">
              <p className="text-sm">
                Delete this event from Outlook?
                {isRepeating(event) && ' Only this occurrence will be deleted.'}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="flex-1 rounded-xl border border-line py-3 font-medium active:bg-surface-2"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete()}
                  disabled={deleting}
                  className="flex-1 rounded-xl bg-danger py-3 font-medium text-white disabled:opacity-60"
                >
                  {deleting ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="rounded-xl border border-line px-4 py-3 font-medium text-danger active:bg-surface-2"
              >
                Delete
              </button>
              <button
                type="button"
                onClick={onEdit}
                className="flex-1 rounded-xl bg-brand py-3 font-medium text-white active:opacity-90"
              >
                Edit
              </button>
            </div>
          )
        ) : undefined
      }
    >
      <dl className="space-y-4">
        <Row icon="clock">
          <p>{fmtDayLong(toDate(event.start))}</p>
          <p className="text-muted">{describeWhen(event)}</p>
          <p className="text-sm text-muted">Shows as {SHOW_AS_LABEL[event.showAs].toLowerCase()}</p>
        </Row>
        {event.location && (
          <Row icon="pin">
            {mapsUrl ? (
              <a href={mapsUrl} target="_blank" rel="noreferrer" className="text-brand underline-offset-2 active:underline">
                {event.location}
              </a>
            ) : (
              event.location
            )}
          </Row>
        )}
        {isRepeating(event) && (
          <Row icon="repeat">
            <p>Repeating event</p>
            <p className="text-sm text-muted">Changes here apply to this occurrence only.</p>
          </Row>
        )}
        {!event.isOrganizer && (
          <Row icon="person">
            <p>Organized by {event.organizerName || 'someone else'}</p>
            <p className="text-sm text-muted">You can't edit other people's meetings here.</p>
          </Row>
        )}
        {event.categories.length > 0 && (
          <Row icon="notes">
            <div className="flex flex-wrap gap-1.5">
              {event.categories.map((c) => (
                <span key={c} className="rounded-full bg-surface-2 px-2.5 py-0.5 text-sm">
                  {c}
                </span>
              ))}
            </div>
          </Row>
        )}
        {event.notes.trim() && (
          <Row icon="notes">
            <p className="whitespace-pre-wrap break-words text-sm">{event.notes}</p>
          </Row>
        )}
        {event.webLink && (
          <Row icon="external">
            <a href={event.webLink} target="_blank" rel="noreferrer" className="text-brand">
              Open in Outlook
            </a>
          </Row>
        )}
      </dl>
      {error && <p className="mt-4 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
    </Sheet>
  )
}

function Row({ icon, children }: { icon: IconName; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <dt className="pt-0.5 text-muted">
        <Icon name={icon} />
      </dt>
      <dd className="min-w-0 flex-1">{children}</dd>
    </div>
  )
}

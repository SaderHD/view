import { Sheet } from '../components/Sheet'
import { cancel, retry, retryAll, useUploadQueue } from './queue'
import { formatSize } from './format'

export function UploadQueueSheet({ onClose }: { onClose: () => void }) {
  const tasks = useUploadQueue()
  const failed = tasks.filter((t) => t.status === 'failed').length

  return (
    <Sheet
      title="Uploads"
      onClose={onClose}
      footer={
        failed > 0 ? (
          <button type="button" onClick={() => void retryAll()} className="w-full rounded-xl bg-brand py-3 font-medium text-white">
            Retry {failed} failed
          </button>
        ) : undefined
      }
    >
      {tasks.length === 0 ? (
        <p className="py-8 text-center text-muted">All uploads are done.</p>
      ) : (
        <>
          {!navigator.onLine && (
            <p className="mb-3 rounded-lg bg-surface-2 px-3 py-2 text-sm text-muted">
              You're offline. These will upload automatically when you reconnect (keep the app open).
            </p>
          )}
          <ul className="space-y-2">
            {tasks.map((t) => (
              <li key={t.id} className="rounded-xl border border-line p-3">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{t.name}</p>
                    <p className="truncate text-xs text-muted">
                      {formatSize(t.size)} → {t.label}
                    </p>
                  </div>
                  <span className={`shrink-0 text-sm ${t.status === 'failed' ? 'text-danger' : 'text-muted'}`}>
                    {t.status === 'uploading' ? `${Math.round(t.progress * 100)}%` : t.status === 'failed' ? 'Failed' : 'Waiting'}
                  </span>
                </div>
                {t.status === 'uploading' && (
                  <div className="mt-2 h-1 overflow-hidden rounded bg-line">
                    <div className="h-full bg-brand transition-[width]" style={{ width: `${t.progress * 100}%` }} />
                  </div>
                )}
                {t.error && <p className="mt-1 text-xs text-danger">{t.error}</p>}
                {t.status !== 'uploading' && (
                  <div className="mt-2 flex gap-4 text-sm">
                    {t.status === 'failed' && (
                      <button type="button" onClick={() => void retry(t.id)} className="font-medium text-brand">
                        Retry
                      </button>
                    )}
                    <button type="button" onClick={() => void cancel(t.id)} className="text-muted">
                      Remove
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </Sheet>
  )
}

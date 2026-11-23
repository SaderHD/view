import { useCallback, useEffect, useState } from 'react'
import { Icon, Sheet } from '../components/Sheet'
import { createFolder, listChildren, toRef, type DriveItem, type DriveRef } from '../graph/drive'
import { haptic } from '../lib/haptics'
import { enqueue, useOnUploaded, useUploadQueue } from '../uploads/queue'
import { formatSize } from '../uploads/format'
import { UploadButtons, type PickedFile } from '../uploads/UploadButtons'

/** Browse a job's OneDrive folder, open files, and upload into it. */
export function FilesSheet({ root, title, onClose }: { root: DriveRef; title: string; onClose: () => void }) {
  const [path, setPath] = useState<DriveRef[]>([root])
  const [items, setItems] = useState<DriveItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [newFolder, setNewFolder] = useState<string | null>(null)
  const current = path[path.length - 1]
  const queue = useUploadQueue().filter((t) => t.parentId === current.itemId)

  const load = useCallback(async () => {
    try {
      setItems(await listChildren(current.driveId, current.itemId))
      setError(null)
    } catch (err) {
      setError(
        !navigator.onLine
          ? "You're offline. Files will show when you reconnect. You can still add uploads; they'll send automatically."
          : err instanceof Error
            ? err.message
            : String(err),
      )
    }
  }, [current.driveId, current.itemId])

  useEffect(() => {
    const t = setTimeout(() => void load(), 0)
    return () => clearTimeout(t)
  }, [load])

  useOnUploaded(
    useCallback(
      (parentId: string) => {
        if (parentId === current.itemId) void load()
      },
      [current.itemId, load],
    ),
  )

  function open(item: DriveItem) {
    if (item.isFolder) {
      setItems(null)
      setPath((p) => [...p, toRef(item)])
    } else {
      window.open(item.webUrl, '_blank', 'noopener')
    }
  }

  function upload(files: PickedFile[]) {
    const label = path.length > 1 ? `${title} › ${path.slice(1).map((p) => p.name).join(' › ')}` : title
    void enqueue(files, { driveId: current.driveId, parentId: current.itemId, label })
    haptic()
  }

  async function addFolder() {
    const name = newFolder?.trim()
    if (!name) return
    try {
      await createFolder(current.driveId, current.itemId, name)
      setNewFolder(null)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <Sheet
      title={title}
      onClose={onClose}
      footer={<UploadButtons onFiles={upload} />}
    >
      <nav className="mb-3 flex flex-wrap items-center gap-1 text-sm" aria-label="Folder path">
        {path.map((p, i) => (
          <span key={p.itemId} className="flex items-center gap-1">
            {i > 0 && <span className="text-muted">›</span>}
            <button
              type="button"
              disabled={i === path.length - 1}
              onClick={() => {
                setItems(null)
                setPath((cur) => cur.slice(0, i + 1))
              }}
              className={`rounded px-1 py-0.5 ${i === path.length - 1 ? 'font-semibold' : 'text-brand active:bg-surface-2'}`}
            >
              {i === 0 ? 'Job folder' : p.name}
            </button>
          </span>
        ))}
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => setNewFolder('')}
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-brand active:bg-surface-2"
        >
          <Icon name="folderPlus" className="h-4 w-4" /> New folder
        </button>
      </nav>

      {newFolder !== null && (
        <form
          className="mb-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            void addFolder()
          }}
        >
          <input
            autoFocus
            value={newFolder}
            onChange={(e) => setNewFolder(e.target.value)}
            placeholder="Folder name"
            className="min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 py-2 outline-none focus:border-brand"
          />
          <button type="submit" className="rounded-lg bg-brand px-3 font-medium text-white">
            Create
          </button>
          <button type="button" onClick={() => setNewFolder(null)} className="rounded-lg px-2 text-muted">
            Cancel
          </button>
        </form>
      )}

      {queue.length > 0 && (
        <ul className="mb-3 space-y-1.5">
          {queue.map((t) => (
            <li key={t.id} className="rounded-lg bg-surface-2 px-3 py-2 text-sm">
              <div className="flex justify-between gap-2">
                <span className="truncate">{t.name}</span>
                <span className={t.status === 'failed' ? 'text-danger' : 'text-muted'}>
                  {t.status === 'uploading' ? `${Math.round(t.progress * 100)}%` : t.status === 'failed' ? 'Failed' : 'Waiting'}
                </span>
              </div>
              {t.status === 'uploading' && (
                <div className="mt-1 h-1 overflow-hidden rounded bg-line">
                  <div className="h-full bg-brand transition-[width]" style={{ width: `${t.progress * 100}%` }} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {error && <p className="mb-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}

      {items === null && !error && <p className="py-8 text-center text-muted">Loading…</p>}
      {items?.length === 0 && queue.length === 0 && (
        <p className="py-8 text-center text-muted">This folder is empty. Add photos or files below.</p>
      )}

      {items && items.length > 0 && <ItemList items={items} onOpen={open} />}

      <a
        href={current.webUrl}
        target="_blank"
        rel="noreferrer"
        className="mt-4 flex items-center justify-center gap-2 text-sm text-brand"
      >
        <Icon name="external" className="h-4 w-4" /> Open in OneDrive
      </a>
    </Sheet>
  )
}

export function ItemList({ items, onOpen }: { items: DriveItem[]; onOpen: (item: DriveItem) => void }) {
  return (
    <ul className="divide-y divide-line rounded-xl border border-line">
      {items.map((item) => (
        <li key={item.id}>
          <button type="button" onClick={() => onOpen(item)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left active:bg-surface-2">
            <Thumb item={item} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{item.name}</span>
              <span className="block text-xs text-muted">
                {item.isFolder
                  ? `${item.childCount} item${item.childCount === 1 ? '' : 's'}`
                  : [formatSize(item.size), item.modified && new Date(item.modified).toLocaleDateString()].filter(Boolean).join(' · ')}
              </span>
            </span>
            {item.isFolder && <Icon name="chevronRight" className="h-4 w-4 text-muted" />}
          </button>
        </li>
      ))}
    </ul>
  )
}

function Thumb({ item }: { item: DriveItem }) {
  if (item.thumbnailUrl) {
    return <img src={item.thumbnailUrl} alt="" loading="lazy" className="h-11 w-11 shrink-0 rounded-md bg-surface-2 object-cover" />
  }
  return (
    <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-md ${item.isFolder ? 'bg-brand/10 text-brand' : 'bg-surface-2 text-muted'}`}>
      <Icon name={item.isFolder ? 'folder' : 'file'} />
    </span>
  )
}

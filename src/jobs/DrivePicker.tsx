import { useEffect, useState } from 'react'
import { Icon, Sheet } from '../components/Sheet'
import { getMyDriveRoot, listChildren, searchDrive, toRef, type DriveItem, type DriveRef } from '../graph/drive'
import { ItemList } from './FilesSheet'

/** Browse or search your OneDrive to pick a folder or a file. */
export function DrivePicker({
  mode,
  title,
  onPick,
  onClose,
}: {
  mode: 'folder' | 'file'
  title: string
  onPick: (item: DriveRef) => Promise<void> | void
  onClose: () => void
}) {
  const [path, setPath] = useState<DriveRef[]>([])
  const [items, setItems] = useState<DriveItem[] | null>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<DriveItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const current = path[path.length - 1]

  useEffect(() => {
    getMyDriveRoot()
      .then((root) => setPath([{ ...toRef(root), name: 'My files' }]))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
  }, [])

  useEffect(() => {
    if (!current) return
    let stale = false
    listChildren(current.driveId, current.itemId)
      .then((list) => !stale && setItems(mode === 'folder' ? list.filter((i) => i.isFolder) : list))
      .catch((err: unknown) => !stale && setError(err instanceof Error ? err.message : String(err)))
    return () => {
      stale = true
    }
  }, [current, mode])

  // Search as you type (after a short pause).
  useEffect(() => {
    const q = query.trim()
    if (!q) return
    let stale = false
    const t = setTimeout(() => {
      searchDrive(q)
        .then((r) => !stale && setResults(mode === 'folder' ? r.filter((i) => i.isFolder) : r))
        .catch((err: unknown) => !stale && setError(err instanceof Error ? err.message : String(err)))
    }, 400)
    return () => {
      stale = true
      clearTimeout(t)
    }
  }, [query, mode])

  async function pick(ref: DriveRef) {
    setBusy(true)
    setError(null)
    try {
      await onPick(ref)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  function open(item: DriveItem) {
    if (item.isFolder) {
      setQuery('')
      setResults(null)
      setItems(null)
      setPath((p) => [...p, toRef(item)])
    } else if (mode === 'file') {
      void pick(toRef(item))
    }
  }

  const searching = query.trim() !== ''
  const shown = searching ? results : items

  return (
    <Sheet
      title={title}
      onClose={onClose}
      footer={
        mode === 'folder' && current ? (
          <button
            type="button"
            disabled={busy || path.length < 2}
            onClick={() => void pick(current)}
            className="w-full truncate rounded-xl bg-brand px-3 py-3 font-medium text-white disabled:opacity-50"
          >
            {busy ? 'Saving…' : path.length < 2 ? 'Open a folder to choose it' : `Use “${current.name}”`}
          </button>
        ) : undefined
      }
    >
      <label className="mb-3 flex items-center gap-2 rounded-lg border border-line bg-bg px-3 py-2 focus-within:border-brand">
        <Icon name="search" className="h-4 w-4 text-muted" />
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setResults(null)
          }}
          placeholder={mode === 'folder' ? 'Search folders' : 'Search files'}
          className="min-w-0 flex-1 bg-transparent outline-none"
          enterKeyHint="search"
        />
      </label>

      {!searching && path.length > 0 && (
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
                {p.name}
              </button>
            </span>
          ))}
        </nav>
      )}

      {error && <p className="mb-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
      {shown === null && !error && <p className="py-8 text-center text-muted">{searching ? 'Searching…' : 'Loading…'}</p>}
      {shown?.length === 0 && (
        <p className="py-8 text-center text-muted">{searching ? 'No matches.' : mode === 'folder' ? 'No folders here.' : 'Empty folder.'}</p>
      )}
      {shown && shown.length > 0 && <ItemList items={shown} onOpen={open} />}
    </Sheet>
  )
}

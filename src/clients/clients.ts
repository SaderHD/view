import { useEffect, useState } from 'react'
import { ensureFolderPath, findFolder, listChildren, type DriveItem } from '../graph/drive'
import { CLIENTS_ROOT } from '../jobs/types'
import { matchClient } from './names'

export { matchClient, normalizeClientName } from './names'

/**
 * Clients are the folders under View/Clients in your OneDrive. The list is
 * kept on the phone too, so the client picker works offline.
 */

export interface Client {
  name: string
  /** Number of items (job folders) inside; 0 if unknown. */
  jobCount: number
  folder: DriveItem | null
}

const LOCAL_KEY = 'view:clients'
type Listener = () => void
const listeners = new Set<Listener>()
let clients: Client[] = readLocal()
let loading: Promise<void> | null = null

function readLocal(): Client[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY)
    return raw ? (JSON.parse(raw) as Client[]) : []
  } catch {
    return []
  }
}

function set(next: Client[]) {
  clients = [...next].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(clients))
  } catch {
    /* storage unavailable */
  }
  listeners.forEach((l) => l())
}

/** Reload the client list from OneDrive (keeps the saved list if offline). */
export function refreshClients(): Promise<void> {
  loading ??= (async () => {
    try {
      const root = await findFolder(CLIENTS_ROOT)
      const items = root ? await listChildren(root.driveId, root.id) : []
      set(items.filter((i) => i.isFolder).map((f) => ({ name: f.name, jobCount: f.childCount, folder: f })))
    } catch {
      /* offline: keep the saved list */
    } finally {
      loading = null
    }
  })()
  return loading
}

/** The client's folder, created if it doesn't exist yet. */
export async function ensureClientFolder(name: string): Promise<DriveItem> {
  const clientName = matchClient(name, clients)
  const folder = await ensureFolderPath([...CLIENTS_ROOT, clientName])
  if (!clients.some((c) => c.name === folder.name)) set([...clients, { name: folder.name, jobCount: 0, folder }])
  return folder
}

export function getClients(): Client[] {
  return clients
}

/** Live client list; loads from OneDrive on first use. */
export function useClients(): { clients: Client[]; refresh: () => Promise<void> } {
  const [, force] = useState(0)
  useEffect(() => {
    const l = () => force((n) => n + 1)
    listeners.add(l)
    void refreshClients()
    return () => {
      listeners.delete(l)
    }
  }, [])
  return { clients, refresh: refreshClients }
}

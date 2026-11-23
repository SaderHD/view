import { safeName } from '../lib/names'
import { graph, GraphError } from './client'

/** A OneDrive file or folder, trimmed to what the app uses. */
export interface DriveItem {
  id: string
  driveId: string
  name: string
  isFolder: boolean
  childCount: number
  size: number
  mimeType: string
  webUrl: string
  modified: string
  /** Pre-signed, short-lived thumbnail URL (images, PDFs, Office docs). */
  thumbnailUrl: string | null
}

/** Pointer to a OneDrive item, stored on jobs. */
export interface DriveRef {
  driveId: string
  itemId: string
  name: string
  webUrl: string
  isFolder: boolean
}

interface GraphDriveItem {
  id: string
  name: string
  size?: number
  webUrl: string
  lastModifiedDateTime?: string
  folder?: { childCount: number }
  file?: { mimeType?: string }
  parentReference?: { driveId?: string }
  remoteItem?: { id: string; parentReference?: { driveId?: string }; folder?: { childCount: number } }
  thumbnails?: { medium?: { url: string }; large?: { url: string } }[]
}

const SELECT = 'id,name,size,webUrl,lastModifiedDateTime,folder,file,parentReference,remoteItem'

function toItem(g: GraphDriveItem, fallbackDriveId = ''): DriveItem {
  // Items shared with you and added to your OneDrive appear as "remote items".
  const remote = g.remoteItem
  return {
    id: remote?.id ?? g.id,
    driveId: remote?.parentReference?.driveId ?? g.parentReference?.driveId ?? fallbackDriveId,
    name: g.name,
    isFolder: Boolean(g.folder ?? remote?.folder),
    childCount: g.folder?.childCount ?? remote?.folder?.childCount ?? 0,
    size: g.size ?? 0,
    mimeType: g.file?.mimeType ?? '',
    webUrl: g.webUrl,
    modified: g.lastModifiedDateTime ?? '',
    thumbnailUrl: g.thumbnails?.[0]?.medium?.url ?? null,
  }
}

export const toRef = (i: DriveItem): DriveRef => ({
  driveId: i.driveId,
  itemId: i.id,
  name: i.name,
  webUrl: i.webUrl,
  isFolder: i.isFolder,
})

const itemPath = (driveId: string, itemId: string) =>
  `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}`

export async function getMyDriveRoot(): Promise<DriveItem> {
  return toItem(await graph<GraphDriveItem>(`/me/drive/root?$select=${SELECT}`))
}

export async function getItem(driveId: string, itemId: string): Promise<DriveItem> {
  return toItem(await graph<GraphDriveItem>(`${itemPath(driveId, itemId)}?$select=${SELECT}`), driveId)
}

/** Folder contents: folders first, then files, alphabetically. Includes thumbnails. */
export async function listChildren(driveId: string, itemId: string): Promise<DriveItem[]> {
  const out: DriveItem[] = []
  let url: string | undefined = `${itemPath(driveId, itemId)}/children?$select=${SELECT}&$expand=thumbnails&$top=200`
  while (url) {
    const page: { value: GraphDriveItem[]; '@odata.nextLink'?: string } = await graph(url)
    out.push(...page.value.map((g) => toItem(g, driveId)))
    url = page['@odata.nextLink']
  }
  return out.sort((a, b) => Number(b.isFolder) - Number(a.isFolder) || a.name.localeCompare(b.name))
}

/**
 * Search by name/content: your whole OneDrive, or only inside one folder
 * (e.g. View/Jobs).
 */
export async function searchDrive(query: string, within?: { driveId: string; itemId: string }): Promise<DriveItem[]> {
  const q = encodeURIComponent(query.replace(/'/g, "''"))
  const base = within ? itemPath(within.driveId, within.itemId) : '/me/drive/root'
  const res = await graph<{ value: GraphDriveItem[] }>(`${base}/search(q='${q}')?$select=${SELECT}&$top=50`)
  return res.value.map((g) => toItem(g, within?.driveId))
}

/** Find a folder by path under your OneDrive root without creating it (null if missing). */
export async function findFolder(segments: string[]): Promise<DriveItem | null> {
  try {
    const path = segments.map(encodeURIComponent).join('/')
    return toItem(await graph<GraphDriveItem>(`/me/drive/root:/${path}?$select=${SELECT}`))
  } catch (err) {
    if (err instanceof GraphError && err.status === 404) return null
    throw err
  }
}

/** Rename a file or folder. If the name is taken, adds " (2)", " (3)"… */
export async function renameItem(driveId: string, itemId: string, name: string): Promise<DriveItem> {
  const base = safeName(name)
  for (let n = 1; n <= 5; n++) {
    try {
      const res = await graph<GraphDriveItem>(itemPath(driveId, itemId), {
        method: 'PATCH',
        body: JSON.stringify({ name: n === 1 ? base : `${base} (${n})` }),
      })
      return toItem(res, driveId)
    } catch (err) {
      if (!(err instanceof GraphError) || err.status !== 409) throw err
    }
  }
  throw new GraphError(409, 'nameAlreadyExists', `A folder named "${base}" already exists`)
}

export { safeName } from '../lib/names'

export async function createFolder(
  driveId: string,
  parentId: string,
  name: string,
  onConflict: 'rename' | 'fail' = 'rename',
): Promise<DriveItem> {
  const created = await graph<GraphDriveItem>(`${itemPath(driveId, parentId)}/children`, {
    method: 'POST',
    body: JSON.stringify({ name: safeName(name), folder: {}, '@microsoft.graph.conflictBehavior': onConflict }),
  })
  return toItem(created, driveId)
}

/** Get (or create) a folder path under your OneDrive root, e.g. ["View", "Jobs"]. */
export async function ensureFolderPath(segments: string[]): Promise<DriveItem> {
  let current = await getMyDriveRoot()
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    const path = segments.slice(0, i + 1).map(encodeURIComponent).join('/')
    try {
      current = toItem(await graph<GraphDriveItem>(`/me/drive/root:/${path}?$select=${SELECT}`), current.driveId)
    } catch (err) {
      if (!(err instanceof GraphError) || err.status !== 404) throw err
      try {
        current = await createFolder(current.driveId, current.id, seg, 'fail')
      } catch (createErr) {
        // Created by another device in the meantime — fetch it.
        if (!(createErr instanceof GraphError) || createErr.status !== 409) throw createErr
        current = toItem(await graph<GraphDriveItem>(`/me/drive/root:/${path}?$select=${SELECT}`), current.driveId)
      }
    }
  }
  return current
}

// ── Uploads ────────────────────────────────────────────────────────────────

const SIMPLE_UPLOAD_LIMIT = 4 * 1024 * 1024
/** Upload-session chunks must be a multiple of 320 KiB. */
const CHUNK = 320 * 1024 * 16 // 5 MiB

/**
 * Upload a file into a folder. If a file with the same name exists, OneDrive
 * keeps both (renames the new one). Large files go up in resumable chunks.
 */
export async function uploadFile(
  driveId: string,
  parentId: string,
  name: string,
  blob: Blob,
  onProgress?: (fraction: number) => void,
): Promise<DriveItem> {
  const target = `${itemPath(driveId, parentId)}:/${encodeURIComponent(safeName(name))}:`

  if (blob.size <= SIMPLE_UPLOAD_LIMIT) {
    const item = await graph<GraphDriveItem>(`${target}/content?@microsoft.graph.conflictBehavior=rename`, {
      method: 'PUT',
      headers: { 'Content-Type': blob.type || 'application/octet-stream' },
      body: blob,
    })
    onProgress?.(1)
    return toItem(item, driveId)
  }

  const session = await graph<{ uploadUrl: string }>(`${target}/createUploadSession`, {
    method: 'POST',
    body: JSON.stringify({ item: { '@microsoft.graph.conflictBehavior': 'rename' } }),
  })

  let offset = 0
  while (offset < blob.size) {
    const end = Math.min(offset + CHUNK, blob.size)
    // The upload URL is pre-authorised: sending our token to it is not allowed.
    const res = await fetch(session.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Range': `bytes ${offset}-${end - 1}/${blob.size}` },
      body: blob.slice(offset, end),
    })
    if (!res.ok) {
      throw new GraphError(res.status, 'uploadFailed', `Upload failed at ${Math.round((offset / blob.size) * 100)}%`)
    }
    offset = end
    onProgress?.(offset / blob.size)
    if (res.status === 200 || res.status === 201) return toItem((await res.json()) as GraphDriveItem, driveId)
  }
  throw new GraphError(500, 'uploadIncomplete', 'Upload did not complete')
}

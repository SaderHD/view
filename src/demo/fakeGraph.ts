/**
 * Demo mode (VITE_DEMO=1): an in-memory stand-in for Microsoft Graph so the
 * app can be run and tested without a Microsoft 365 sign-in. Never used in
 * normal builds.
 */
import { addDays, dateKey, startOfDay, toGraphLocal } from '../calendar/time'
import { GraphError } from '../graph/client'

interface FakeEvent {
  id: string
  subject: string
  start: Date
  end: Date
  isAllDay: boolean
  location: string
  body: string
  showAs: string
  categories: string[]
  isOrganizer: boolean
  organizer: string
  type: string
  isCancelled: boolean
  /** Our job open-extension, if any */
  ext?: Record<string, unknown>
}

let seq = 0
const today = startOfDay(new Date())
const at = (dayOffset: number, h: number, m = 0) => {
  const d = addDays(today, dayOffset)
  d.setHours(h, m, 0, 0)
  return d
}
const ev = (p: Partial<FakeEvent> & Pick<FakeEvent, 'subject' | 'start' | 'end'>): FakeEvent => ({
  id: `demo-${++seq}`,
  isAllDay: false,
  location: '',
  body: '',
  showAs: 'busy',
  categories: [],
  isOrganizer: true,
  organizer: 'You',
  type: 'singleInstance',
  isCancelled: false,
  ...p,
})

const store: FakeEvent[] = [
  ev({ subject: 'Roof inspection – Smith', start: at(0, 8), end: at(0, 11), location: '412 Oak St, Springfield', categories: ['Job'], body: 'Check flashing around chimney.\nCustomer will be home after 9.' }),
  ev({ subject: 'Team stand-up', start: at(0, 12), end: at(0, 12, 30), isOrganizer: false, organizer: 'Dana Ortiz', location: 'Teams' }),
  ev({ subject: 'Gutter repair – Nguyen', start: at(0, 13, 30), end: at(0, 16), location: '88 Birch Ln', categories: ['Job'] }),
  ev({ subject: 'Materials pickup', start: at(1, 7, 30), end: at(1, 8, 15), location: 'Home Depot – Main St', showAs: 'tentative' }),
  ev({ subject: 'Deck estimate – Patel', start: at(1, 9), end: at(1, 10, 30), location: '1500 Lake Rd', categories: ['Job'] }),
  ev({ subject: 'Lunch', start: at(1, 12), end: at(1, 13), showAs: 'free' }),
  ev({ subject: 'Safety training', start: at(2, 0), end: at(3, 0), isAllDay: true, showAs: 'oof' }),
  ev({ subject: 'Siding replacement – Garcia', start: at(3, 8), end: at(3, 15), location: '22 Elm Ct', categories: ['Job'] }),
  ev({ subject: 'Weekly review', start: at(4, 15), end: at(4, 16), type: 'occurrence' }),
  ev({ subject: 'Weekly review', start: at(11, 15), end: at(11, 16), type: 'occurrence' }),
  ev({ subject: 'Window install – Brooks', start: at(-2, 9), end: at(-2, 14), location: '7 Cedar Way', categories: ['Job'] }),
  ev({ subject: 'Supplier call (cancelled)', start: at(-1, 10), end: at(-1, 10, 30), isCancelled: true }),
  ev({ subject: 'Vacation', start: at(9, 0), end: at(12, 0), isAllDay: true, showAs: 'oof' }),
  ev({ subject: 'Fence repair – Lee', start: at(6, 10), end: at(6, 13), location: '310 Pine St', categories: ['Job'] }),
  ev({ subject: 'Invoice follow-ups', start: at(5, 8), end: at(5, 9) }),
  ev({ subject: 'Kitchen walkthrough – Adams', start: at(8, 14), end: at(8, 15, 30), location: '45 Maple Ave', categories: ['Job'] }),
]

// ── Fake OneDrive ───────────────────────────────────────────────────────────
interface FakeItem {
  id: string
  name: string
  parentId: string | null
  isFolder: boolean
  size: number
  mime: string
  thumb: string | null
  modified: string
  text?: string
}
const DRIVE = 'demo-drive'
const items: FakeItem[] = []
let itemSeq = 0
function addItem(parentId: string | null, name: string, isFolder: boolean, extra: Partial<FakeItem> = {}): FakeItem {
  const it: FakeItem = {
    id: parentId === null ? 'root' : `item-${++itemSeq}`,
    name,
    parentId,
    isFolder,
    size: 0,
    mime: '',
    thumb: null,
    modified: new Date().toISOString(),
    ...extra,
  }
  items.push(it)
  return it
}
const swatch = (color: string, label: string) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" fill="${color}"/><text x="48" y="56" font-size="20" text-anchor="middle" fill="#fff" font-family="sans-serif">${label}</text></svg>`,
  )}`
const root = addItem(null, 'root', true)
addItem(root.id, 'Documents', true)
const viewF = addItem(root.id, 'View', true)
const jobsF = addItem(viewF.id, 'Jobs', true)
const smithF = addItem(jobsF.id, `${dateKey(today)} - Smith - Roof inspection`, true)
addItem(smithF.id, 'Reports', true)
const receipts = addItem(smithF.id, 'Receipts', true)
const photos = addItem(smithF.id, 'Photos', true)
addItem(receipts.id, 'Receipt_shingles.jpg', false, { size: 182_000, mime: 'image/jpeg', thumb: swatch('#a16207', '$') })
addItem(photos.id, 'Chimney_before.jpg', false, { size: 2_400_000, mime: 'image/jpeg', thumb: swatch('#0f766e', 'IMG') })
const oldJobs = addItem(root.id, 'Old jobs', true)
const brooks = addItem(oldJobs.id, 'Brooks windows', true)
addItem(brooks.id, 'Quote.pdf', false, { size: 96_000, mime: 'application/pdf' })
addItem(root.id, 'Price list 2026.xlsx', false, { size: 54_000, mime: 'application/vnd.ms-excel' })

const itemToGraph = (it: FakeItem) => ({
  id: it.id,
  name: it.name,
  size: it.size,
  webUrl: `https://example.invalid/onedrive/${it.id}`,
  lastModifiedDateTime: it.modified,
  ...(it.isFolder ? { folder: { childCount: items.filter((c) => c.parentId === it.id).length } } : { file: { mimeType: it.mime } }),
  parentReference: { driveId: DRIVE },
  thumbnails: it.thumb ? [{ medium: { url: it.thumb } }] : [],
  ...(it.text !== undefined ? { '@microsoft.graph.downloadUrl': `data:application/json,${encodeURIComponent(it.text)}` } : {}),
})
const byPath = (segments: string[]) => {
  let cur: FakeItem | undefined = root
  for (const seg of segments) {
    cur = items.find((c) => c.parentId === cur!.id && c.name.toLowerCase() === seg.toLowerCase())
    if (!cur) return undefined
  }
  return cur
}
function uniqueName(parentId: string, name: string, behavior: string): string {
  const taken = (n: string) => items.some((c) => c.parentId === parentId && c.name.toLowerCase() === n.toLowerCase())
  if (!taken(name)) return name
  if (behavior === 'fail') throw new GraphError(409, 'nameAlreadyExists', 'An item with that name already exists')
  const dot = name.lastIndexOf('.')
  const [stem, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, '']
  for (let i = 1; ; i++) if (!taken(`${stem} ${i}${ext}`)) return `${stem} ${i}${ext}`
}

async function driveRoute(p: string, method: string, url: URL, init: RequestInit): Promise<unknown> {
  if (p === '/me/drive/root') return itemToGraph(root)
  const putByPath = /^\/me\/drive\/root:\/(.+):\/content$/.exec(p)
  if (putByPath && method === 'PUT') {
    const segs = putByPath[1].split('/').map(decodeURIComponent)
    const parent = byPath(segs.slice(0, -1))
    if (!parent) throw new GraphError(404, 'itemNotFound', 'Parent folder not found')
    const name = segs[segs.length - 1]
    const existing = items.find((c) => c.parentId === parent.id && c.name === name)
    const it = existing ?? addItem(parent.id, name, false, { mime: 'application/json' })
    it.text = String(init.body)
    it.size = it.text.length
    it.modified = new Date().toISOString()
    return itemToGraph(it)
  }
  if (p.startsWith('/me/drive/root:/')) {
    const it = byPath(p.slice('/me/drive/root:/'.length).split('/').map(decodeURIComponent))
    if (!it) throw new GraphError(404, 'itemNotFound', 'The resource could not be found.')
    return itemToGraph(it)
  }
  const search = /^\/me\/drive\/root\/search\(q='(.*)'\)$/.exec(p)
  if (search) {
    const q = decodeURIComponent(search[1]).toLowerCase()
    return { value: items.filter((i) => i.parentId !== null && i.name.toLowerCase().includes(q)).map(itemToGraph) }
  }
  const upload = /^\/drives\/[^/]+\/items\/([^/:]+):\/(.+):\/(content|createUploadSession)$/.exec(p)
  if (upload) {
    if (upload[3] === 'createUploadSession') throw new GraphError(501, 'demo', 'Large uploads are not simulated in demo mode')
    const blob = init.body as Blob
    const name = uniqueName(upload[1], decodeURIComponent(upload[2]), 'rename')
    const it = addItem(upload[1], name, false, {
      size: blob.size,
      mime: blob.type,
      thumb: blob.type.startsWith('image/') ? URL.createObjectURL(blob) : null,
    })
    return itemToGraph(it)
  }
  const inFolder = /^\/drives\/[^/]+\/items\/([^/]+)\/search\(q='(.*)'\)$/.exec(p)
  if (inFolder) {
    const q = decodeURIComponent(inFolder[2]).toLowerCase()
    const under = (it: FakeItem): boolean => it.parentId === inFolder[1] || (!!it.parentId && under(items.find((x) => x.id === it.parentId)!))
    return { value: items.filter((i) => i.parentId !== null && under(i) && i.name.toLowerCase().includes(q)).map(itemToGraph) }
  }
  const m = /^\/drives\/[^/]+\/items\/([^/]+)(\/children)?$/.exec(p)
  if (m) {
    const it = items.find((i) => i.id === decodeURIComponent(m[1]))
    if (!it) throw new GraphError(404, 'itemNotFound', 'The resource could not be found.')
    if (!m[2] && method === 'PATCH') {
      const b = JSON.parse(String(init.body)) as { name: string }
      if (items.some((c) => c.parentId === it.parentId && c.id !== it.id && c.name.toLowerCase() === b.name.toLowerCase()))
        throw new GraphError(409, 'nameAlreadyExists', 'Name already exists')
      it.name = b.name
      return itemToGraph(it)
    }
    if (!m[2]) return itemToGraph(it)
    if (method === 'POST') {
      const b = JSON.parse(String(init.body)) as { name: string; '@microsoft.graph.conflictBehavior'?: string }
      return itemToGraph(addItem(it.id, uniqueName(it.id, b.name, b['@microsoft.graph.conflictBehavior'] ?? 'rename'), true))
    }
    return { value: items.filter((c) => c.parentId === it.id).map(itemToGraph) }
  }
  void url
  return undefined
}

// The first job comes pre-linked to its folder.
store[0].ext = {
  extensionName: 'com.saderhd.view.job',
  id: 'Microsoft.OutlookServices.OpenTypeExtension.com.saderhd.view.job',
  jobId: 'J-DEMO-SMT',
  customer: 'Smith',
  status: 'scheduled',
  folderJson: JSON.stringify({ driveId: DRIVE, itemId: smithF.id, name: smithF.name, webUrl: '', isFolder: true }),
  linksJson: JSON.stringify([]),
}

const toGraph = (e: FakeEvent, selectBody = false) => ({
  id: e.id,
  subject: e.subject,
  start: { dateTime: `${toGraphLocal(e.start)}.0000000`, timeZone: 'local' },
  end: { dateTime: `${toGraphLocal(e.end)}.0000000`, timeZone: 'local' },
  isAllDay: e.isAllDay,
  location: { displayName: e.location },
  bodyPreview: e.body.slice(0, 255),
  showAs: e.showAs,
  categories: e.categories,
  isOrganizer: e.isOrganizer,
  organizer: { emailAddress: { name: e.organizer } },
  isCancelled: e.isCancelled,
  type: e.type,
  webLink: '',
  extensions: e.ext ? [e.ext] : [],
  ...(selectBody ? { body: { contentType: 'text', content: e.body } } : {}),
})

interface GraphBody {
  subject?: string
  isAllDay?: boolean
  start?: { dateTime: string }
  end?: { dateTime: string }
  categories?: string[]
  location?: { displayName?: string }
  showAs?: string
  body?: { content: string }
}

const parseLocal = (s: string) => {
  const [d, t] = s.split('T')
  const [y, mo, da] = d.split('-').map(Number)
  const [h, mi] = t.split(':').map(Number)
  return new Date(y, mo - 1, da, h, mi)
}

function apply(e: FakeEvent, b: GraphBody) {
  if (b.subject !== undefined) e.subject = b.subject
  if (b.isAllDay !== undefined) e.isAllDay = b.isAllDay
  if (b.start) e.start = parseLocal(b.start.dateTime)
  if (b.end) e.end = parseLocal(b.end.dateTime)
  if (b.location) e.location = b.location.displayName ?? ''
  if (b.showAs) e.showAs = b.showAs
  if (b.categories) e.categories = b.categories
  if (b.body) e.body = b.body.content
}

const delay = () => new Promise((r) => setTimeout(r, 250))

export async function handle(path: string, init: RequestInit): Promise<unknown> {
  await delay()
  if (!navigator.onLine) throw new TypeError('Failed to fetch') // behave like real fetch offline
  const url = new URL(path, 'https://graph.microsoft.com/v1.0/')
  const p = url.pathname.replace(/^\/v1\.0/, '')
  const method = (init.method ?? 'GET').toUpperCase()

  if (p === '/me') return { displayName: 'Demo User', mail: 'demo@example.com', userPrincipalName: 'demo@example.com' }
  if (p === '/me/drive') return { driveType: 'business', quota: { used: 3.2 * 1024 ** 3, total: 1024 ** 4 } }

  if (p === '/me/calendarView') {
    const s = new Date(url.searchParams.get('startDateTime')!)
    const e = new Date(url.searchParams.get('endDateTime')!)
    const value = store
      .filter((x) => x.start < e && x.end > s)
      .sort((a, b) => a.start.getTime() - b.start.getTime())
      .map((x) => toGraph(x))
    return { value }
  }

  if (p === '/me/events' && method === 'POST') {
    const b = JSON.parse(String(init.body)) as GraphBody
    const created = ev({ subject: b.subject ?? '', start: new Date(), end: new Date() })
    apply(created, b)
    store.push(created)
    return toGraph(created)
  }

  const drive = await driveRoute(p, method, url, init)
  if (drive !== undefined) return drive

  const ext = /^\/me\/events\/([^/]+)\/extensions(?:\/(.+))?$/.exec(p)
  if (ext) {
    const e = store.find((x) => x.id === decodeURIComponent(ext[1]))
    if (!e) throw new GraphError(404, 'ErrorItemNotFound', 'Event not found')
    if (method === 'GET') {
      if (!e.ext) throw new GraphError(404, 'ErrorItemNotFound', 'Extension not found')
      return e.ext
    }
    if (method === 'DELETE') {
      e.ext = undefined
      return undefined
    }
    e.ext = { ...(JSON.parse(String(init.body)) as Record<string, unknown>), id: 'Microsoft.OutlookServices.OpenTypeExtension.com.saderhd.view.job' }
    return e.ext
  }

  const m = /^\/me\/events\/(.+)$/.exec(p)
  if (m) {
    const id = decodeURIComponent(m[1])
    const idx = store.findIndex((x) => x.id === id)
    if (idx < 0) throw new GraphError(404, 'ErrorItemNotFound', 'Event not found')
    if (method === 'DELETE') {
      store.splice(idx, 1)
      return undefined
    }
    if (method === 'PATCH') {
      apply(store[idx], JSON.parse(String(init.body)) as GraphBody)
      return toGraph(store[idx])
    }
    return toGraph(store[idx], true)
  }

  throw new Error(`Demo mode: ${method} ${p} not implemented`)
}
